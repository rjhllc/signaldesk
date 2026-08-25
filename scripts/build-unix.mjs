import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Arch, Platform, build } from 'electron-builder';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const APP_VERSION = PACKAGE.version;
const BUILD_VERSION = APP_VERSION;
const PUBLISH = process.argv.includes('--publish');
const BACKEND_EXECUTABLE = path.resolve(process.env.SIGNALDESK_BACKEND_EXECUTABLE || '');
const PLATFORM = process.platform;
const BUILD_ARCH = process.env.SIGNALDESK_BUILD_ARCH || process.arch;

if (!['darwin', 'linux'].includes(PLATFORM)) {
  throw new Error('The Unix release builder supports only macOS and Linux');
}
if (!process.env.SIGNALDESK_BACKEND_EXECUTABLE) {
  throw new Error('SIGNALDESK_BACKEND_EXECUTABLE must point to the PyInstaller backend');
}
if (!(await stat(BACKEND_EXECUTABLE)).isFile()) {
  throw new Error(`Packaged backend does not exist: ${BACKEND_EXECUTABLE}`);
}

const STAGE_ROOT = path.join(ROOT, '.build', `${PLATFORM}-${BUILD_ARCH}`);
const RESOURCE_STAGE = path.join(STAGE_ROOT, 'signaldesk');
const RELEASE_ROOT = path.join(ROOT, 'release');

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
if (PUBLISH && !repository) throw new Error('Publishing requires GITHUB_REPOSITORY=owner/repository');
if (PUBLISH && !process.env.GH_TOKEN) throw new Error('Publishing requires GH_TOKEN');

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
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
  await mkdir(path.join(RESOURCE_STAGE, 'runtime'), { recursive: true });
  await Promise.all(['backend.py', 'index.html', 'app.js', 'styles.css'].map((file) => (
    copyFile(path.join(ROOT, file), path.join(RESOURCE_STAGE, file))
  )));
  const stagedBackend = path.join(RESOURCE_STAGE, 'runtime', 'signaldesk-backend');
  await copyFile(BACKEND_EXECUTABLE, stagedBackend);
  await chmod(stagedBackend, 0o755);
  await writeFile(path.join(RESOURCE_STAGE, 'BUILD-INFO.json'), `${JSON.stringify({
    signaldeskBuild: BUILD_VERSION,
    appVersion: APP_VERSION,
    platform: PLATFORM === 'darwin' ? 'macos' : 'linux',
    architecture: BUILD_ARCH,
    backendRuntime: 'PyInstaller standalone executable',
    updateProvider: repository ? `github:${repository.owner}/${repository.repo}` : null,
    privacyBoundary: 'Only application files and the standalone local backend are packaged. User credentials and configuration are never included.',
  }, null, 2)}\n`, 'utf8');
  assertPrivacyBoundary(await walkFiles(RESOURCE_STAGE), 'Staged application');
}

function publishConfiguration() {
  return repository ? [{
    provider: 'github',
    owner: repository.owner,
    repo: repository.repo,
    releaseType: 'release',
  }] : null;
}

function commonConfiguration() {
  return {
    appId: 'com.signaldesk.desktop',
    productName: 'SignalDesk',
    copyright: `Copyright © ${new Date().getUTCFullYear()} RJH LLC`,
    asar: true,
    npmRebuild: false,
    removePackageScripts: true,
    directories: { output: RELEASE_ROOT },
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
    publish: publishConfiguration(),
  };
}

function platformBuild() {
  const common = commonConfiguration();
  if (PLATFORM === 'darwin') {
    const arch = BUILD_ARCH === 'universal' ? Arch.universal : BUILD_ARCH === 'arm64' ? Arch.arm64 : Arch.x64;
    return {
      targets: Platform.MAC.createTarget(['dmg', 'zip'], arch),
      config: {
        ...common,
        mac: {
          icon: path.join(ROOT, 'assets', 'signaldesk.icns'),
          category: 'public.app-category.business',
          artifactName: `SignalDesk-macOS-\${arch}.\${ext}`,
          hardenedRuntime: Boolean(process.env.CSC_LINK),
        },
        dmg: {
          title: `SignalDesk ${APP_VERSION}`,
          iconSize: 128,
          window: { width: 560, height: 390 },
          contents: [
            { x: 165, y: 195, type: 'file' },
            { x: 395, y: 195, type: 'link', path: '/Applications' },
          ],
        },
      },
    };
  }
  const arch = BUILD_ARCH === 'arm64' ? Arch.arm64 : Arch.x64;
  return {
    targets: Platform.LINUX.createTarget(['AppImage', 'deb'], arch),
    config: {
      ...common,
      linux: {
        icon: path.join(ROOT, 'assets', 'icons'),
        category: 'Network',
        maintainer: 'RJH LLC <321146299+rjhllc@users.noreply.github.com>',
        syncDesktopName: true,
        executableName: 'signaldesk',
        artifactName: `SignalDesk-Linux-\${arch}.\${ext}`,
        synopsis: 'Focused X research with local control',
        description: 'Local-first desktop research using live X data with optional post-search AI filtering.',
      },
    },
  };
}

async function verifyArtifacts(artifacts) {
  const expected = PLATFORM === 'darwin' ? ['.dmg', '.zip'] : ['.AppImage', '.deb'];
  for (const extension of expected) {
    const artifact = artifacts.find((file) => file.endsWith(extension));
    if (!artifact || (await stat(artifact)).size <= 0) {
      throw new Error(`Release did not produce a non-empty ${extension} artifact`);
    }
  }
  const stagedInfo = JSON.parse(await readFile(path.join(RESOURCE_STAGE, 'BUILD-INFO.json'), 'utf8'));
  if (stagedInfo.appVersion !== APP_VERSION || stagedInfo.architecture !== BUILD_ARCH) {
    throw new Error('Staged build information does not match the requested release');
  }
  if (PLATFORM === 'darwin') {
    const packagedIcon = path.join(
      RELEASE_ROOT,
      'mac-universal',
      'SignalDesk.app',
      'Contents',
      'Resources',
      'icon.icns',
    );
    if ((await stat(packagedIcon)).size <= 0) throw new Error('Packaged macOS icon is missing');
  } else {
    for (const side of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
      const icon = path.join(ROOT, 'assets', 'icons', `${side}x${side}.png`);
      if ((await stat(icon)).size <= 0) throw new Error(`Linux ${side}px icon is missing`);
    }
  }
}

async function writeChecksums(artifacts) {
  const files = artifacts.filter((file) => path.dirname(file) === RELEASE_ROOT);
  const suffix = PLATFORM === 'darwin' ? `macOS-${BUILD_ARCH}` : `Linux-${BUILD_ARCH}`;
  const rows = [];
  for (const file of files) rows.push(`${await sha256(file)}  ${path.basename(file)}`);
  await writeFile(path.join(RELEASE_ROOT, `SHA256SUMS-${suffix}.txt`), `${rows.join('\n')}\n`, 'utf8');
}
async function removeUnpackedOutput() {
  const directories = PLATFORM === 'darwin'
    ? ['mac', 'mac-arm64', 'mac-universal']
    : ['linux-unpacked', 'linux-arm64-unpacked'];
  await Promise.all(directories.map((directory) => (
    rm(path.join(RELEASE_ROOT, directory), { recursive: true, force: true })
  )));
  await Promise.all([
    'builder-debug.yml',
    'builder-effective-config.yaml',
  ].map((file) => rm(path.join(RELEASE_ROOT, file), { force: true })));
}


await stageApplication();
await mkdir(RELEASE_ROOT, { recursive: true });
const request = platformBuild();
const artifacts = await build({
  targets: request.targets,
  publish: PUBLISH ? 'always' : 'never',
  config: request.config,
});
await verifyArtifacts(artifacts);
await writeChecksums(artifacts);
await removeUnpackedOutput();
console.log(`${PLATFORM === 'darwin' ? 'macOS' : 'Linux'} ${BUILD_ARCH} release ready in ${RELEASE_ROOT}`);
