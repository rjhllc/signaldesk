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
  const spacing = fieldWidth < 640 ? 24 : 28;
  const diagonal = Math.hypot(fieldWidth, fieldHeight) || 1;
  const waveRadius = fieldWidth < 640 ? 92 : 124;
  fieldContext.clearRect(0, 0, fieldWidth, fieldHeight);
  fieldContext.lineCap = 'round';

  for (let y = spacing / 2; y < fieldHeight; y += spacing) {
    for (let x = spacing / 2; x < fieldWidth; x += spacing) {
      const dx = pointerX - x;
      const dy = pointerY - y;
      const distance = Math.hypot(dx, dy);
      const distanceRatio = Math.min(1, distance / diagonal);
      const depth = 0.82 + (Math.sin(x * 0.019 + y * 0.023) + 1) * 0.09;
      const angle = pointerActive && distance > 0.01 ? Math.atan2(dy, dx) : 0;
      const length = pointerActive ? (1.45 + distanceRatio * 7) * depth : 0.01;
      const wavePosition = pointerActive ? Math.max(0, 1 - distance / waveRadius) : 0;
      const wave = wavePosition * wavePosition * (3 - 2 * wavePosition);
      const centerY = y - wave * 10 * depth;
      const halfLength = length / 2;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);

      fieldContext.lineWidth = 1.22 + depth * 0.24 + wave * 0.12;
      fieldContext.strokeStyle = `rgba(255, 255, 255, ${(0.19 + depth * 0.09).toFixed(3)})`;
      fieldContext.beginPath();
      fieldContext.moveTo(x - directionX * halfLength, centerY - directionY * halfLength);
      fieldContext.lineTo(x + directionX * halfLength, centerY + directionY * halfLength);
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
function trackMagneticPointer(event) {
  if (event.isPrimary === false) return;
  targetX = event.clientX;
  targetY = event.clientY;
  if (!pointerActive) {
    pointerX = targetX;
    pointerY = targetY;
  }
  pointerActive = true;
  queueMagneticField();
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
    window.addEventListener('pointerdown', trackMagneticPointer, { passive: true });
    window.addEventListener('pointermove', trackMagneticPointer, { passive: true });
  }
}
