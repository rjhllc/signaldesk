'use strict';

const RELEASES = Object.freeze({
  windows: Object.freeze({
    name: 'Windows',
    url: 'https://github.com/rjhllc/signaldesk/releases/latest/download/SignalDesk-Setup-Windows-x64.exe',
  }),
  macos: Object.freeze({
    name: 'macOS',
    url: 'https://github.com/rjhllc/signaldesk/releases/latest/download/SignalDesk-macOS-universal.dmg',
  }),
  linux: Object.freeze({
    name: 'Linux',
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

function configureDownloads() {
  const platform = detectedPlatform();
  const primary = document.querySelector('[data-download-primary]');
  const label = document.querySelector('[data-download-label]');
  const note = document.querySelector('#platform-note');
  const cards = [...document.querySelectorAll('[data-platform]')];

  cards.forEach((card) => {
    const recommended = card.dataset.platform === platform;
    card.dataset.recommended = String(recommended);
    if (recommended) card.setAttribute('aria-label', `${card.querySelector('strong').textContent}, recommended for this device`);
  });

  if (!platform) {
    primary.href = '#download';
    label.textContent = 'Choose a desktop download';
    note.textContent = 'Choose Windows, macOS, or Linux below.';
    return;
  }

  const release = RELEASES[platform];
  primary.href = release.url;
  label.textContent = `Download for ${release.name}`;
  primary.setAttribute('aria-label', `Download the latest SignalDesk release for ${release.name}`);
  note.textContent = `${release.name} detected · latest release selected automatically.`;
}

configureDownloads();
