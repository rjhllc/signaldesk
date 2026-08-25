'use strict';

const { spawn } = require('node:child_process');
const { mkdir, readFile, rename, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
  shell,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDERS,
  backendEnvironment,
  emptyConfiguration,
  normalizeCredentialInput,
  normalizeSavedSearches,
  publicConfiguration,
} = require('./configuration.cjs');

const BUILD_VERSION = app.getVersion();
const CONFIG_VERSION = 1;
const CONFIG_FILE = 'credentials.json';
const SAVED_SEARCHES_FILE = 'saved-searches.json';
const IPC_GET_CONFIGURATION = 'signaldesk:get-configuration';
const IPC_SAVE_CONFIGURATION = 'signaldesk:save-configuration';
const IPC_OPEN_DATA_LOCATION = 'signaldesk:open-data-location';
const IPC_GET_SAVED_SEARCHES = 'signaldesk:get-saved-searches';
const IPC_SAVE_SAVED_SEARCHES = 'signaldesk:save-saved-searches';
const IPC_GET_UPDATE_STATE = 'signaldesk:get-update-state';
const IPC_DOWNLOAD_UPDATE = 'signaldesk:download-update';
const IPC_INSTALL_UPDATE = 'signaldesk:install-update';
const IPC_UPDATE_STATE = 'signaldesk:update-state';
const BACKEND_START_TIMEOUT_MS = 15000;
const UPDATE_CHECK_DELAY_MS = 4000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let mainWindow = null;
let backendProcess = null;
let backendOrigin = '';
let currentConfiguration = emptyConfiguration();
let savedSearches = [];
let savedSearchesError = '';
let configurationError = '';
let quitting = false;
let updaterReady = false;
let updaterTimer = null;
let updaterState = Object.freeze({
  status: 'idle',
  currentVersion: BUILD_VERSION,
});

app.setName('SignalDesk');
if (process.platform === 'win32') app.setAppUserModelId('com.signaldesk.desktop');

function applicationRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'signaldesk')
    : path.resolve(__dirname, '..');
}

function pythonExecutable() {
  if (app.isPackaged) {
    return path.join(applicationRoot(), 'runtime', 'python', 'python.exe');
  }
  return process.env.SIGNALDESK_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
}
function backendCommand(root) {
  if (app.isPackaged && process.platform !== 'win32') {
    return {
      executable: path.join(root, 'runtime', 'signaldesk-backend'),
      args: [],
    };
  }
  return {
    executable: pythonExecutable(),
    args: ['-I', path.join(root, 'backend.py')],
  };
}

function configurationPath() {
  return path.join(app.getPath('userData'), CONFIG_FILE);
}
function savedSearchesPath() {
  return path.join(app.getPath('userData'), SAVED_SEARCHES_FILE);
}

async function decryptSecret(encoded) {
  if (!encoded) return '';
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encoded, 'base64'));
  return decrypted.result;
}

async function readStoredConfiguration() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(configurationPath(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyConfiguration();
    throw new Error('Saved credentials are unreadable. Re-enter them to replace the damaged file.');
  }
  if (!parsed || parsed.version !== CONFIG_VERSION) {
    throw new Error('Saved credentials use an unsupported format. Re-enter them to continue.');
  }
  if (typeof parsed.xBearerToken !== 'string' || typeof parsed.llmApiKey !== 'string') {
    throw new Error('Saved credential fields are invalid. Re-enter them to continue.');
  }
  if (typeof parsed.llmBaseUrl !== 'string' || typeof parsed.llmModel !== 'string') {
    throw new Error('Saved AI settings are invalid. Re-enter them to continue.');
  }
  const provider = LLM_PROVIDERS[parsed.llmProvider]
    ? parsed.llmProvider
    : parsed.llmBaseUrl.includes('anthropic')
      ? 'anthropic'
      : DEFAULT_LLM_PROVIDER;
  return {
    xBearerToken: await decryptSecret(parsed.xBearerToken),
    llmApiKey: await decryptSecret(parsed.llmApiKey),
    llmProvider: provider,
    llmBaseUrl: LLM_PROVIDERS[provider].baseUrl,
    llmModel: provider === 'openai' && parsed.llmModel === 'gpt-5-mini'
      ? DEFAULT_LLM_MODEL
      : parsed.llmModel || LLM_PROVIDERS[provider].defaultModel,
  };
}

async function writeStoredConfiguration(configuration) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('Operating-system credential encryption is unavailable');
  }
  const stored = {
    version: CONFIG_VERSION,
    xBearerToken: (await safeStorage.encryptStringAsync(configuration.xBearerToken)).toString('base64'),
    llmApiKey: configuration.llmApiKey
      ? (await safeStorage.encryptStringAsync(configuration.llmApiKey)).toString('base64')
      : '',
    llmProvider: configuration.llmProvider,
    llmBaseUrl: configuration.llmBaseUrl,
    llmModel: configuration.llmModel,
  };
  const file = configurationPath();
  const temporaryFile = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(temporaryFile, `${JSON.stringify(stored, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    try {
      await rename(temporaryFile, file);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      await rm(file, { force: true });
      await rename(temporaryFile, file);
    }
  } finally {
    await rm(temporaryFile, { force: true });
  }
}
async function readStoredSavedSearches() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(savedSearchesPath(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error('Saved searches are unreadable');
  }
  if (!parsed || parsed.version !== 1 || typeof parsed.encrypted !== 'string') {
    throw new Error('Saved searches use an unsupported format');
  }
  try {
    return normalizeSavedSearches(JSON.parse(await decryptSecret(parsed.encrypted)));
  } catch (_) {
    throw new Error('Saved searches could not be decrypted or validated');
  }
}

async function writeStoredSavedSearches(searches) {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('Operating-system credential encryption is unavailable');
  }
  const normalized = normalizeSavedSearches(searches);
  const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(normalized));
  const file = savedSearchesPath();
  const temporaryFile = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(temporaryFile, `${JSON.stringify({
      version: 1,
      encrypted: encrypted.toString('base64'),
    }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    try {
      await rename(temporaryFile, file);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      await rm(file, { force: true });
      await rename(temporaryFile, file);
    }
  } finally {
    await rm(temporaryFile, { force: true });
  }
  return normalized;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForBackend(origin) {
  const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/health`, { cache: 'no-store' });
      const health = await response.json();
      if (response.ok && health.ok && health.build === BUILD_VERSION) return;
      lastError = new Error(`Unexpected backend build ${health.build || 'unknown'}`);
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw new Error(`Backend health check timed out: ${lastError?.message || 'no response'}`);
}

function launchBackend(configuration) {
  return new Promise((resolve, reject) => {
    const root = applicationRoot();
    const command = backendCommand(root);
    const child = spawn(command.executable, command.args, {
      cwd: root,
      env: backendEnvironment(configuration),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    let stdout = '';
    let settled = false;
    let healthStarted = false;
    const timeout = setTimeout(() => fail(new Error('Backend did not report a listening port')), BACKEND_START_TIMEOUT_MS);

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill();
      const detail = stderr.trim().slice(-2000);
      reject(new Error(detail ? `${error.message}\n${detail}` : error.message));
    }

    child.once('error', fail);
    child.on('exit', (code, signal) => {
      if (!settled) {
        fail(new Error(`Backend exited before startup (${signal || `code ${code}`})`));
        return;
      }
      if (!quitting && child === backendProcess) {
        backendProcess = null;
        dialog.showErrorBox('SignalDesk stopped', `The local backend exited (${signal || `code ${code}`}).`);
        app.quit();
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4000);
    });
    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${chunk.toString('utf8')}`.slice(-4000);
      const match = stdout.match(/SignalDesk\s+\S+\s+listening on\s+[^:]+:(\d+)/);
      if (!match || healthStarted) return;
      healthStarted = true;
      const origin = `http://127.0.0.1:${Number(match[1])}`;
      waitForBackend(origin).then(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ child, origin });
      }, fail);
    });
  });
}

function trustedSender(event) {
  try {
    return Boolean(backendOrigin) && new URL(event.senderFrame.url).origin === backendOrigin;
  } catch (_) {
    return false;
  }
}

function requireTrustedSender(event) {
  if (!trustedSender(event)) throw new Error('Credential access was blocked for an untrusted page');
}

async function replaceBackend(configuration) {
  const replacement = await launchBackend(configuration);
  const previous = backendProcess;
  backendProcess = replacement.child;
  backendOrigin = replacement.origin;
  if (previous) previous.kill();
  return `${replacement.origin}/`;
}

function registerCredentialIpc() {
  ipcMain.handle(IPC_GET_CONFIGURATION, async (event) => {
    requireTrustedSender(event);
    return {
      ...publicConfiguration(currentConfiguration, configurationError),
      dataLocation: app.getPath('userData'),
    };
  });
  ipcMain.handle(IPC_SAVE_CONFIGURATION, async (event, input) => {
    requireTrustedSender(event);
    const next = normalizeCredentialInput(input, currentConfiguration);
    await writeStoredConfiguration(next);
    currentConfiguration = next;
    configurationError = '';
    const url = await replaceBackend(next);
    return { ok: true, url };
  });
  ipcMain.handle(IPC_GET_SAVED_SEARCHES, async (event) => {
    requireTrustedSender(event);
    return { items: savedSearches, error: savedSearchesError };
  });
  ipcMain.handle(IPC_SAVE_SAVED_SEARCHES, async (event, input) => {
    requireTrustedSender(event);
    savedSearches = await writeStoredSavedSearches(input);
    savedSearchesError = '';
    return { ok: true, items: savedSearches };
  });
  ipcMain.handle(IPC_OPEN_DATA_LOCATION, async (event) => {
    requireTrustedSender(event);
    const error = await shell.openPath(app.getPath('userData'));
    return error ? { ok: false, error } : { ok: true };
  });
}

function setUpdaterState(status, details = {}) {
  updaterState = Object.freeze({
    status,
    currentVersion: BUILD_VERSION,
    ...details,
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_UPDATE_STATE, updaterState);
  }
  return updaterState;
}

async function checkForSignalDeskUpdate() {
  if (!updaterReady || ['downloading', 'downloaded'].includes(updaterState.status)) {
    return updaterState;
  }
  setUpdaterState('checking');
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdaterState('error', {
      message: String(error?.message || error || 'Update check failed').slice(0, 500),
    });
  }
  return updaterState;
}

function registerUpdaterIpc() {
  ipcMain.handle(IPC_GET_UPDATE_STATE, async (event) => {
    requireTrustedSender(event);
    return updaterState;
  });
  ipcMain.handle(IPC_DOWNLOAD_UPDATE, async (event) => {
    requireTrustedSender(event);
    if (!updaterReady || updaterState.status !== 'available') {
      return { ok: false, error: 'No update is ready to download' };
    }
    setUpdaterState('downloading', {
      version: updaterState.version,
      percent: 0,
    });
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      const message = String(error?.message || error || 'Update download failed').slice(0, 500);
      setUpdaterState('error', { message });
      return { ok: false, error: message };
    }
  });
  ipcMain.handle(IPC_INSTALL_UPDATE, async (event) => {
    requireTrustedSender(event);
    if (!updaterReady || updaterState.status !== 'downloaded') {
      return { ok: false, error: 'No downloaded update is ready to install' };
    }
    quitting = true;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}

function initializeUpdater() {
  if (!app.isPackaged) {
    setUpdaterState('unavailable', {
      message: 'Automatic updates are available in packaged releases',
    });
    return;
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    setUpdaterState('unavailable', {
      message: 'Use the SignalDesk AppImage for in-app automatic updates',
    });
    return;
  }

  autoUpdater.logger = null;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = BUILD_VERSION.includes('-');
  autoUpdater.disableWebInstaller = process.platform === 'win32';
  updaterReady = true;
  setUpdaterState('idle');

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState('checking');
  });
  autoUpdater.on('update-not-available', (info) => {
    setUpdaterState('up-to-date', {
      version: String(info?.version || BUILD_VERSION),
    });
  });
  autoUpdater.on('update-available', (info) => {
    setUpdaterState('available', {
      version: String(info.version),
      releaseDate: info.releaseDate ? String(info.releaseDate) : '',
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    setUpdaterState('downloading', {
      version: updaterState.version,
      percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
      transferred: Math.max(0, Number(progress.transferred) || 0),
      total: Math.max(0, Number(progress.total) || 0),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterState('downloaded', {
      version: String(info.version),
    });
  });
  autoUpdater.on('update-cancelled', (info) => {
    setUpdaterState('available', {
      version: String(info.version),
      message: 'Update download was cancelled',
    });
  });
  autoUpdater.on('error', (error) => {
    setUpdaterState('error', {
      message: String(error?.message || error || 'Automatic update failed').slice(0, 500),
    });
  });

  const initialCheck = setTimeout(() => {
    void checkForSignalDeskUpdate();
  }, UPDATE_CHECK_DELAY_MS);
  initialCheck.unref?.();
  updaterTimer = setInterval(() => {
    void checkForSignalDeskUpdate();
  }, UPDATE_CHECK_INTERVAL_MS);
  updaterTimer.unref?.();
}

function openExternalUrl(candidate) {
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:') void shell.openExternal(url.toString());
  } catch (_) {
    // Ignore malformed links rather than handing them to the operating system.
  }
}

function configureWindowNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === backendOrigin) return;
    } catch (_) {
      // Invalid navigation is blocked below.
    }
    event.preventDefault();
    openExternalUrl(url);
  });
}

async function createMainWindow() {
  const started = await launchBackend(currentConfiguration);
  backendProcess = started.child;
  backendOrigin = started.origin;

  mainWindow = new BrowserWindow({
    title: 'SignalDesk',
    icon: path.join(__dirname, '..', 'assets', 'signaldesk-icon-1024.png'),
    width: 1280,
    height: 900,
    minWidth: 760,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.removeMenu();
  configureWindowNavigation(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  await mainWindow.loadURL(`${started.origin}/`);
}

async function startApplication() {
  try {
    try {
      currentConfiguration = await readStoredConfiguration();
    } catch (error) {
      currentConfiguration = emptyConfiguration();
      configurationError = error.message;
    }
    try {
      savedSearches = await readStoredSavedSearches();
    } catch (error) {
      savedSearches = [];
      savedSearchesError = error.message;
    }
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    registerCredentialIpc();
    registerUpdaterIpc();
    await createMainWindow();
    initializeUpdater();
  } catch (error) {
    dialog.showErrorBox('SignalDesk could not start', error.message || String(error));
    app.quit();
  }
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(startApplication);
}

app.on('before-quit', () => {
  quitting = true;
  if (updaterTimer) {
    clearInterval(updaterTimer);
    updaterTimer = null;
  }
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});
app.on('window-all-closed', () => app.quit());
