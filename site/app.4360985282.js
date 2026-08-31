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
const BRIGHTNESS_LEVELS = 8;
const FADE_SEGMENTS = 3;
let fieldWidth = 0;
let fieldHeight = 0;
let fieldScale = 1;
let fieldFrame = 0;
let pointerActive = !reducedMotion;
let pointerInitialized = false;
let pointerX = 0;
let pointerY = 0;
let targetX = 0;
let targetY = 0;
let particleData = new Float32Array(0);

function buildParticleData() {
  const spacing = fieldWidth < 640 ? 24 : 28;
  const columns = Math.max(0, Math.ceil((fieldWidth - spacing / 2) / spacing));
  const rows = Math.max(0, Math.ceil((fieldHeight - spacing / 2) / spacing));
  const data = new Float32Array(columns * rows * 3);
  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = spacing / 2 + row * spacing;
    for (let column = 0; column < columns; column += 1) {
      const x = spacing / 2 + column * spacing;
      data[index] = x;
      data[index + 1] = y;
      data[index + 2] = 0.82 + (Math.sin(x * 0.019 + y * 0.023) + 1) * 0.09;
      index += 3;
    }
  }
  particleData = data;
}

function drawRestingParticles() {
  fieldContext.beginPath();
  for (let index = 0; index < particleData.length; index += 3) {
    const x = particleData[index];
    const y = particleData[index + 1];
    fieldContext.moveTo(x, y);
    fieldContext.lineTo(x + 0.01, y);
  }
  fieldContext.lineWidth = 1.44;
  fieldContext.strokeStyle = 'rgba(255, 255, 255, 0.27)';
  fieldContext.stroke();
}

function drawActiveParticles() {
  const diagonal = Math.hypot(fieldWidth, fieldHeight) || 1;
  const waveRadius = fieldWidth < 640 ? 110 : 145;
  const paths = Array.from(
    { length: BRIGHTNESS_LEVELS * FADE_SEGMENTS },
    () => new Path2D(),
  );

  for (let index = 0; index < particleData.length; index += 3) {
    const x = particleData[index];
    const y = particleData[index + 1];
    const depth = particleData[index + 2];
    const dx = pointerX - x;
    const dy = pointerY - y;
    const distance = Math.hypot(dx, dy);
    const distanceRatio = Math.min(1, distance / diagonal);
    const angle = distance > 0.01 ? Math.atan2(dy, dx) : 0;
    const length = (1.45 + distanceRatio * 7) * depth * 1.125;
    const wavePosition = Math.max(0, 1 - distance / waveRadius);
    const wave = wavePosition * wavePosition * (3 - 2 * wavePosition);
    const centerY = y - wave * 16 * depth;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const tailX = x - directionX * length / 2;
    const tailY = centerY - directionY * length / 2;
    const lineX = directionX * length;
    const lineY = directionY * length;
    const opacity = 0.19 + depth * 0.09 + wave * 0.28;
    const brightness = Math.min(
      BRIGHTNESS_LEVELS - 1,
      Math.max(0, Math.round((opacity - 0.26) / 0.3 * (BRIGHTNESS_LEVELS - 1))),
    );
    const pathIndex = brightness * FADE_SEGMENTS;
    const firstX = tailX + lineX * 0.28;
    const firstY = tailY + lineY * 0.28;
    const secondX = tailX + lineX * 0.58;
    const secondY = tailY + lineY * 0.58;
    const thirdX = tailX + lineX * 0.8;
    const thirdY = tailY + lineY * 0.8;

    paths[pathIndex].moveTo(firstX, firstY);
    paths[pathIndex].lineTo(secondX, secondY);
    paths[pathIndex + 1].moveTo(secondX, secondY);
    paths[pathIndex + 1].lineTo(thirdX, thirdY);
    paths[pathIndex + 2].moveTo(thirdX, thirdY);
    paths[pathIndex + 2].lineTo(tailX + lineX, tailY + lineY);
  }

  for (let brightness = 0; brightness < BRIGHTNESS_LEVELS; brightness += 1) {
    const normalized = brightness / (BRIGHTNESS_LEVELS - 1);
    const opacity = 0.26 + normalized * 0.3;
    const pathIndex = brightness * FADE_SEGMENTS;
    fieldContext.lineWidth = 1.44 + normalized * 0.22;
    fieldContext.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
    fieldContext.stroke(paths[pathIndex]);
    fieldContext.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.58})`;
    fieldContext.stroke(paths[pathIndex + 1]);
    fieldContext.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
    fieldContext.stroke(paths[pathIndex + 2]);
  }
}

function drawMagneticField() {
  if (!magneticField || !fieldContext) return;
  fieldContext.clearRect(0, 0, fieldWidth, fieldHeight);
  fieldContext.lineCap = 'round';
  if (pointerActive) drawActiveParticles();
  else drawRestingParticles();
}

function renderMagneticFrame() {
  fieldFrame = 0;
  pointerX = targetX;
  pointerY = targetY;
  drawMagneticField();
}

function queueMagneticField() {
  if (!fieldFrame) fieldFrame = window.requestAnimationFrame(renderMagneticFrame);
}

function trackMagneticPointer(event) {
  if (event.isPrimary === false) return;
  targetX = event.clientX;
  targetY = event.clientY;
  pointerActive = true;
  queueMagneticField();
}

function resizeMagneticField() {
  if (!magneticField || !fieldContext) return;
  fieldWidth = window.innerWidth;
  fieldHeight = window.innerHeight;
  fieldScale = Math.min(window.devicePixelRatio || 1, 1.5);
  if (!pointerInitialized) {
    pointerX = fieldWidth / 2;
    pointerY = fieldHeight / 2;
    targetX = pointerX;
    targetY = pointerY;
    pointerInitialized = true;
  }
  magneticField.width = Math.round(fieldWidth * fieldScale);
  magneticField.height = Math.round(fieldHeight * fieldScale);
  fieldContext.setTransform(fieldScale, 0, 0, fieldScale, 0, 0);
  buildParticleData();
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
