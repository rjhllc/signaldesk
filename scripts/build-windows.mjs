import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch, Platform, build } from 'electron-builder';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const APP_VERSION = PACKAGE.version;
const BUILD_VERSION = APP_VERSION;
const PYTHON_VERSION = '3.13.7';
const PYTHON_ARCHIVE = `python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/${PYTHON_ARCHIVE}`;
const PYTHON_SHA256 = 'f6cca216a359be84797cabb54149ce5e062afb16cc7567eb7fc51cacb2d86b65';
const CACHE_ROOT = path.join(ROOT, '.build-cache');
const STAGE_ROOT = path.join(ROOT, '.build', 'windows');
const RESOURCE_STAGE = path.join(STAGE_ROOT, 'signaldesk');
const RELEASE_ROOT = path.join(ROOT, 'release');
const PUBLISH = process.argv.includes('--publish');

function githubRepository() {
  const value = String(
    process.env.SIGNALDESK_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY || '',
  ).trim();
  if (!value) return null;
  const match = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) throw new Error('GitHub repository must use owner/repository format');
  return { owner: match[1], repo: match[2] };
}

const repository = githubRepository();
if (PUBLISH && !repository) {
  throw new Error('Publishing requires GITHUB_REPOSITORY=owner/repository');
}
if (PUBLISH && !process.env.GH_TOKEN) {
  throw new Error('Publishing requires GH_TOKEN');
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}
async function extractArchiveSafely(archive, destination) {
  const root = path.resolve(destination);
  const rootPrefix = root + path.sep;
  const entries = unzipSync(new Uint8Array(await readFile(archive)));
  for (const [rawName, contents] of Object.entries(entries)) {
    const name = rawName.replaceAll('\\', '/');
    const parts = name.split('/').filter(Boolean);
    if (
      !parts.length
      || name.startsWith('/')
      || /^[A-Za-z]:/.test(name)
      || parts.some((part) => part === '..' || part.includes('\0'))
    ) {
      throw new Error(`Python archive contains an unsafe path: ${rawName}`);
    }
    const target = path.resolve(root, ...parts);
    if (target !== root && !target.startsWith(rootPrefix)) {
      throw new Error(`Python archive escapes its destination: ${rawName}`);
    }
    if (name.endsWith('/')) {
      await mkdir(target, { recursive: true });
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(contents));
    }
  }
}


async function downloadPythonRuntime() {
  await mkdir(CACHE_ROOT, { recursive: true });
  const archive = path.join(CACHE_ROOT, PYTHON_ARCHIVE);
  let validCache = false;
  try {
    validCache = await sha256(archive) === PYTHON_SHA256;
  } catch (_) {
    validCache = false;
  }
  if (!validCache) {
    await rm(archive, { force: true });
    console.log(`Downloading embedded Python ${PYTHON_VERSION} for Windows x64...`);
    const response = await fetch(PYTHON_URL);
    if (!response.ok) throw new Error(`Python download failed with HTTP ${response.status}`);
    await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    const digest = await sha256(archive);
    if (digest !== PYTHON_SHA256) {
      await rm(archive, { force: true });
      throw new Error(`Python runtime checksum mismatch: expected ${PYTHON_SHA256}, got ${digest}`);
    }
  }
  return archive;
}

async function walkFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute, relative));
    else files.push(relative);
  }
  return files;
}

function assertPrivacyBoundary(files, label) {
  const forbidden = /(^|\/)(credentials\.json|\.env[^/]*|[^/]+\.(?:pfx|p12|pem|key))$/i;
  const unexpected = files.filter((file) => {
    if (forbidden.test(file)) return true;
    const top = file.split('/')[0];
    return !['app.js', 'backend.py', 'BUILD-INFO.json', 'index.html', 'styles.css', 'runtime'].includes(top);
  });
  if (unexpected.length) {
    throw new Error(`${label} crossed the release privacy boundary: ${unexpected.join(', ')}`);
  }
}

async function stageApplication() {
  await rm(STAGE_ROOT, { recursive: true, force: true });
  await mkdir(path.join(RESOURCE_STAGE, 'runtime', 'python'), { recursive: true });
  const applicationFiles = ['backend.py', 'index.html', 'app.js', 'styles.css'];
  await Promise.all(applicationFiles.map((file) => (
    copyFile(path.join(ROOT, file), path.join(RESOURCE_STAGE, file))
  )));
  const pythonArchive = await downloadPythonRuntime();
  await extractArchiveSafely(pythonArchive, path.join(RESOURCE_STAGE, 'runtime', 'python'));
  await writeFile(path.join(RESOURCE_STAGE, 'BUILD-INFO.json'), `${JSON.stringify({
    signaldeskBuild: BUILD_VERSION,
    appVersion: APP_VERSION,
    platform: 'windows-x64',
    pythonVersion: PYTHON_VERSION,
    pythonRuntimeSha256: PYTHON_SHA256,
    updateProvider: repository ? `github:${repository.owner}/${repository.repo}` : null,
    privacyBoundary: 'Only application files and the embedded Python runtime are packaged. User credentials and configuration are never included.',
  }, null, 2)}\n`, 'utf8');
  assertPrivacyBoundary(await walkFiles(RESOURCE_STAGE), 'Staged application');
}

async function packageApplication() {
  await rm(RELEASE_ROOT, { recursive: true, force: true });
  await mkdir(RELEASE_ROOT, { recursive: true });
  const publish = repository ? [{
    provider: 'github',
    owner: repository.owner,
    repo: repository.repo,
    releaseType: 'release',
  }] : null;
  const artifacts = await build({
    targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
    publish: PUBLISH ? 'always' : 'never',
    config: {
      appId: 'com.signaldesk.desktop',
      productName: 'SignalDesk',
      copyright: `Copyright © ${new Date().getUTCFullYear()} RJH LLC`,
      asar: true,
      npmRebuild: false,
      removePackageScripts: true,
      directories: {
        output: RELEASE_ROOT,
      },
      toolsets: process.platform === 'linux' ? { wine: '1.0.1' } : undefined,
      files: [
        'desktop/main.cjs',
        'desktop/preload.cjs',
        'desktop/configuration.cjs',
        'package.json',
        'assets/signaldesk-icon-1024.png',
        '!desktop/*.test.cjs',
      ],
      extraResources: [{
        from: RESOURCE_STAGE,
        to: 'signaldesk',
        filter: ['**/*'],
      }],
      win: {
        icon: path.join(ROOT, 'assets', 'signaldesk.ico'),
        executableName: 'SignalDesk',
        artifactName: `SignalDesk-Setup-Windows-\${arch}.\${ext}`,
        requestedExecutionLevel: 'asInvoker',
      },
      nsis: {
        installerIcon: path.join(ROOT, 'assets', 'signaldesk.ico'),
        uninstallerIcon: path.join(ROOT, 'assets', 'signaldesk.ico'),
        installerHeaderIcon: path.join(ROOT, 'assets', 'signaldesk.ico'),
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: 'always',
        createStartMenuShortcut: true,
        shortcutName: 'SignalDesk',
        uninstallDisplayName: `SignalDesk ${APP_VERSION}`,
        deleteAppDataOnUninstall: false,
        differentialPackage: true,
        runAfterFinish: true,
      },
      publish,
    },
  });
  return artifacts;
}

async function verifyPackagedApplication() {
  const resources = path.join(RELEASE_ROOT, 'win-unpacked', 'resources');
  const packagedSignalDesk = path.join(resources, 'signaldesk');
  assertPrivacyBoundary(await walkFiles(packagedSignalDesk), 'Packaged application');
  const [frontend, backend, buildInfo] = await Promise.all([
    readFile(path.join(packagedSignalDesk, 'app.js'), 'utf8'),
    readFile(path.join(packagedSignalDesk, 'backend.py'), 'utf8'),
    readFile(path.join(packagedSignalDesk, 'BUILD-INFO.json'), 'utf8'),
  ]);
  if (!frontend.includes(`APP_BUILD = '${BUILD_VERSION}'`)) {
    throw new Error('Packaged frontend build does not match package.json version');
  }
  if (!backend.includes(`BUILD_VERSION = '${BUILD_VERSION}'`)) {
    throw new Error('Packaged backend build does not match package.json version');
  }
  if (JSON.parse(buildInfo).appVersion !== APP_VERSION) {
    throw new Error('Packaged BUILD-INFO.json version mismatch');
  }
  if ((await stat(path.join(resources, 'app.asar'))).size <= 0) {
    throw new Error('Packaged app.asar is empty');
  }
  const [windowsIcon, windowIcon] = await Promise.all([
    readFile(path.join(ROOT, 'assets', 'signaldesk.ico')),
    stat(path.join(ROOT, 'assets', 'signaldesk-icon-1024.png')),
  ]);
  if (windowsIcon.length < 6 || windowsIcon.readUInt16LE(4) < 7) {
    throw new Error('Windows ICO does not contain the required multi-resolution icon set');
  }
  if (windowIcon.size <= 0) throw new Error('Packaged window icon source is empty');
  if (repository) await readFile(path.join(resources, 'app-update.yml'));
}

async function writeReleaseInformation(artifacts) {
  await rm(path.join(RELEASE_ROOT, 'win-unpacked'), { recursive: true, force: true });
  await rm(path.join(RELEASE_ROOT, 'builder-debug.yml'), { force: true });
  await rm(path.join(RELEASE_ROOT, 'builder-effective-config.yaml'), { force: true });
  const signed = Boolean(process.env.CSC_LINK);
  const startHere = `SignalDesk for Windows x64\r\n${'='.repeat(30)}\r\n\r\n1. Run the SignalDesk .exe installer. No separate Python or Node.js installation is required.\r\n2. On first launch, paste your own X API Bearer Token.\r\n3. To filter or rank pulled posts with AI, add your own OpenAI API key under Credentials.\r\n4. SignalDesk checks GitHub Releases after launch. It asks before downloading an update and again before restarting to install it.\r\n\r\nUpdates replace old program files but preserve encrypted credentials and settings in your Windows user-data folder. Uninstalling also preserves that data unless you remove it manually.\r\n\r\nSignalDesk does not include developer credentials, collect analytics, or upload usage data. X and your selected LLM provider receive only requests you initiate with your own credentials. GitHub receives ordinary HTTPS request metadata when checking for or downloading releases.\r\n\r\n${signed ? 'This build is code-signed.' : 'This build is not code-signed. Windows SmartScreen may show an unrecognized-publisher warning.'}\r\n\r\nVersion: ${APP_VERSION}\r\n`;
  const artifactNames = artifacts
    .filter((file) => path.dirname(file) === RELEASE_ROOT)
    .map((file) => path.basename(file))
    .filter((file, index, values) => values.indexOf(file) === index)
    .sort();
  await writeFile(path.join(RELEASE_ROOT, 'START_HERE.txt'), startHere, 'utf8');
  await writeFile(path.join(RELEASE_ROOT, 'RELEASE-INFO.json'), `${JSON.stringify({
    signaldeskBuild: BUILD_VERSION,
    appVersion: APP_VERSION,
    platform: 'windows-x64',
    installer: 'Standard per-user installer',
    updateProvider: repository ? `github:${repository.owner}/${repository.repo}` : null,
    codeSigned: signed,
    credentialsBundled: false,
    telemetryCollected: false,
    artifacts: artifactNames,
    builtAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');

  const releaseFiles = (await readdir(RELEASE_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== 'SHA256SUMS.txt')
    .map((entry) => entry.name)
    .sort();
  const checksums = [];
  for (const file of releaseFiles) {
    checksums.push(`${await sha256(path.join(RELEASE_ROOT, file))}  ${file}`);
  }
  await writeFile(path.join(RELEASE_ROOT, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, 'utf8');
}

await stageApplication();
const artifacts = await packageApplication();
await verifyPackagedApplication();
await writeReleaseInformation(artifacts);
console.log(`Windows installer ready in ${RELEASE_ROOT}`);
if (repository) console.log(`Updater provider: github:${repository.owner}/${repository.repo}`);
else console.log('Updater provider not embedded in this local build; GitHub Actions supplies it automatically.');
