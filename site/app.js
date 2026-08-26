'use strict';

const RELEASES = Object.freeze({
  windows: Object.freeze({
    name: 'Windows',
    filename: 'SignalDesk-Setup-Windows-x64.exe',
    url: 'https://github.com/rjhllc/signaldesk/releases/latest/download/SignalDesk-Setup-Windows-x64.exe',
  }),
  macos: Object.freeze({
    name: 'macOS',
    filename: 'SignalDesk-macOS-universal.dmg',
    url: 'https://github.com/rjhllc/signaldesk/releases/latest/download/SignalDesk-macOS-universal.dmg',
  }),
  linux: Object.freeze({
    name: 'Linux',
    filename: 'SignalDesk-Linux-amd64.deb',
    url: 'https://github.com/rjhllc/signaldesk/releases/latest/download/SignalDesk-Linux-amd64.deb',
  }),
});

function detectedPlatform() {
  const userAgentData = navigator.userAgentData;
  if (userAgentData?.mobile) return null;

  const platform = String(userAgentData?.platform || navigator.platform || '').toLowerCase();
  const userAgent = String(navigator.userAgent || '').toLowerCase();
  const touchMac = platform.includes('mac') && navigator.maxTouchPoints > 1;
  if (touchMac || /android|iphone|ipad|ipod|cros/.test(`${platform} ${userAgent}`)) return null;
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('linux') || userAgent.includes('linux')) return 'linux';
  return null;
}

const primaryDownload = document.querySelector('[data-download-primary]');
const downloadLabel = document.querySelector('[data-download-label]');
const downloadFilename = document.querySelector('[data-download-filename]');
const platformNote = document.querySelector('#platform-note');
const platformTabs = [...document.querySelectorAll('[data-platform-select]')];

function selectPlatform(platform, detected = false) {
  const release = RELEASES[platform];
  if (!release) return;

  platformTabs.forEach((tab) => {
    const selected = tab.dataset.platformSelect === platform;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  primaryDownload.href = release.url;
  primaryDownload.setAttribute('aria-label', `Download the latest SignalDesk release for ${release.name}`);
  downloadLabel.textContent = detected ? `Recommended for ${release.name}` : `${release.name} selected`;
  downloadFilename.textContent = release.filename;
  platformNote.textContent = detected
    ? `${release.name} detected · latest release selected automatically.`
    : `Latest ${release.name} release selected manually.`;
}

platformTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectPlatform(tab.dataset.platformSelect));
  tab.addEventListener('keydown', (event) => {
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % platformTabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + platformTabs.length) % platformTabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = platformTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = platformTabs[nextIndex];
    selectPlatform(nextTab.dataset.platformSelect);
    nextTab.focus();
  });
});

const platform = detectedPlatform();
if (platform) {
  selectPlatform(platform, true);
} else {
  platformTabs.forEach((tab) => { tab.tabIndex = 0; });
}

const supportMenu = document.querySelector('[data-support-menu]');
const supportTrigger = supportMenu?.querySelector('.support-trigger');
const supportPopover = supportMenu?.querySelector('.support-popover');

function syncSupportPopover() {
  if (!supportMenu || !supportTrigger || !supportPopover) return;
  const visible = supportTrigger.getAttribute('aria-expanded') === 'true' || supportMenu.matches(':hover');
  supportPopover.setAttribute('aria-hidden', String(!visible));
}

function setSupportMenuOpen(open) {
  if (!supportMenu || !supportTrigger) return;
  supportMenu.dataset.open = String(open);
  supportTrigger.setAttribute('aria-expanded', String(open));
  syncSupportPopover();
}

setSupportMenuOpen(false);

supportMenu?.addEventListener('mouseenter', syncSupportPopover);
supportMenu?.addEventListener('mouseleave', syncSupportPopover);

supportTrigger?.addEventListener('click', (event) => {
  event.stopPropagation();
  setSupportMenuOpen(supportTrigger.getAttribute('aria-expanded') !== 'true');
});

document.addEventListener('click', (event) => {
  if (supportMenu && !supportMenu.contains(event.target)) setSupportMenuOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || supportTrigger?.getAttribute('aria-expanded') !== 'true') return;
  setSupportMenuOpen(false);
  supportTrigger.focus();
});
