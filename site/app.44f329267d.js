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

const magneticField = document.querySelector('[data-magnetic-field]');
const fieldContext = magneticField?.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let fieldWidth = 0;
let fieldHeight = 0;
let fieldScale = 1;
let fieldFrame = 0;
let pointerActive = false;
let pointerX = 0;
let pointerY = 0;
let targetX = 0;
let targetY = 0;

function drawMagneticField() {
  if (!magneticField || !fieldContext) return;
  const spacing = fieldWidth < 640 ? 22 : 25;
  const radius = fieldWidth < 640 ? 130 : 190;
  fieldContext.clearRect(0, 0, fieldWidth, fieldHeight);
  fieldContext.lineCap = 'round';
  fieldContext.lineWidth = 1;

  for (let y = spacing / 2; y < fieldHeight; y += spacing) {
    for (let x = spacing / 2; x < fieldWidth; x += spacing) {
      const dx = pointerX - x;
      const dy = pointerY - y;
      const distance = Math.hypot(dx, dy);
      const influence = pointerActive ? Math.max(0, 1 - distance / radius) ** 2 : 0;
      const restAngle = Math.sin(x * .021 + y * .017) * .45 - Math.PI / 2;
      const angle = influence > .001 ? Math.atan2(dy, dx) : restAngle;
      const length = 3 + influence * 18;
      const pull = influence * 6;
      const startX = x + Math.cos(angle) * pull;
      const startY = y + Math.sin(angle) * pull;
      fieldContext.strokeStyle = `rgba(255, 255, 255, ${(0.18 + influence * 0.62).toFixed(3)})`;
      fieldContext.beginPath();
      fieldContext.moveTo(startX, startY);
      fieldContext.lineTo(startX + Math.cos(angle) * length, startY + Math.sin(angle) * length);
      fieldContext.stroke();
    }
  }
}

function animateMagneticField() {
  fieldFrame = 0;
  const deltaX = targetX - pointerX;
  const deltaY = targetY - pointerY;
  pointerX += deltaX * .22;
  pointerY += deltaY * .22;
  drawMagneticField();
  if (Math.abs(deltaX) > .1 || Math.abs(deltaY) > .1) {
    fieldFrame = window.requestAnimationFrame(animateMagneticField);
  }
}

function queueMagneticField() {
  if (!fieldFrame) fieldFrame = window.requestAnimationFrame(animateMagneticField);
}

function resizeMagneticField() {
  if (!magneticField || !fieldContext) return;
  fieldWidth = window.innerWidth;
  fieldHeight = window.innerHeight;
  fieldScale = Math.min(window.devicePixelRatio || 1, 2);
  magneticField.width = Math.round(fieldWidth * fieldScale);
  magneticField.height = Math.round(fieldHeight * fieldScale);
  fieldContext.setTransform(fieldScale, 0, 0, fieldScale, 0, 0);
  drawMagneticField();
}

if (magneticField && fieldContext) {
  resizeMagneticField();
  window.addEventListener('resize', resizeMagneticField, { passive: true });
  if (!reducedMotion) {
    window.addEventListener('pointermove', (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!pointerActive) {
        pointerX = targetX;
        pointerY = targetY;
      }
      pointerActive = true;
      queueMagneticField();
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => {
      pointerActive = false;
      drawMagneticField();
    });
  }
}
