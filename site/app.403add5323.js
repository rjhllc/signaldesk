'use strict';


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

const glassPanel = document.querySelector('[data-liquid-glass]');
let glassStyleRule = null;
let glassFrame = 0;
let pendingGlassX = 22;
let pendingGlassY = 8;

for (const styleSheet of document.styleSheets) {
  if (styleSheet.href && !styleSheet.href.startsWith(window.location.origin)) continue;
  try {
    glassStyleRule = Array.from(styleSheet.cssRules).find((rule) => rule.selectorText === '.hero-copy') ?? glassStyleRule;
  } catch {
    // Cross-origin stylesheets are not readable through CSSOM.
  }
}

function queueGlassLight(event) {
  if (!glassPanel || !glassStyleRule) return;
  const bounds = glassPanel.getBoundingClientRect();
  pendingGlassX = Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100));
  pendingGlassY = Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100));
  if (glassFrame) return;
  glassFrame = window.requestAnimationFrame(() => {
    glassStyleRule.style.setProperty('--glass-x', `${pendingGlassX.toFixed(2)}%`);
    glassStyleRule.style.setProperty('--glass-y', `${pendingGlassY.toFixed(2)}%`);
    glassFrame = 0;
  });
}

if (glassPanel) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function trackGlassPointer(event) {
    if (reducedMotion || event.pointerType === 'touch') return;
    glassPanel.dataset.glassActive = 'true';
    queueGlassLight(event);
  }

  glassPanel.addEventListener('pointerdown', (event) => {
    glassPanel.dataset.glassActive = 'true';
    glassPanel.dataset.glassPressed = 'true';
    queueGlassLight(event);
  }, { passive: true });

  window.addEventListener('pointerup', (event) => {
    glassPanel.dataset.glassPressed = 'false';
    if (event.pointerType === 'touch') glassPanel.dataset.glassActive = 'false';
  }, { passive: true });

  glassPanel.addEventListener('pointercancel', () => {
    glassPanel.dataset.glassActive = 'false';
    glassPanel.dataset.glassPressed = 'false';
  }, { passive: true });

  glassPanel.addEventListener('pointerenter', trackGlassPointer, { passive: true });
  glassPanel.addEventListener('pointermove', trackGlassPointer, { passive: true });
  glassPanel.addEventListener('pointerleave', () => {
    glassPanel.dataset.glassActive = 'false';
    glassPanel.dataset.glassPressed = 'false';
  }, { passive: true });
}
