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

const inputField = document.querySelector('[data-magnetic-field]');
const inputContext = inputField?.getContext('2d');
const outputField = document.querySelector('[data-filtered-output]');
const outputContext = outputField?.getContext('2d');
const ringClearance = document.querySelector('.ring-clearance');
const ringSvg = ringClearance?.ownerSVGElement;
const gradientRing = document.querySelector('.gradient-ring circle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FLOW_SPEED = 10;
const PARTICLE_OPACITY = 0.42;
const OUTPUT_COUNT = 5;
let fieldWidth = 0;
let fieldHeight = 0;
let fieldScale = 1;
let particleSpacing = 32;
let inputLayer = null;
let animationStart = null;
let ringCenterX = 0;
let ringCenterY = 0;
let ringPaintedRadius = 0;
let outputStartX = 0;

function updateRingGeometry() {
  const viewBox = ringSvg?.viewBox?.baseVal;
  if (!ringClearance || !ringSvg || !viewBox?.width) {
    ringPaintedRadius = 0;
    outputStartX = fieldWidth;
    return;
  }
  const bounds = ringSvg.getBoundingClientRect();
  const scale = bounds.width / viewBox.width;
  const ringRadius = Number(ringClearance.getAttribute('r'));
  const clearanceWidth = Number(ringClearance.getAttribute('stroke-width'));
  const gradientWidth = Number(gradientRing?.getAttribute('stroke-width') || 0);
  ringCenterX = bounds.left + (Number(ringClearance.getAttribute('cx')) - viewBox.x) * scale;
  ringCenterY = bounds.top + (Number(ringClearance.getAttribute('cy')) - viewBox.y) * scale;
  ringPaintedRadius = (ringRadius + clearanceWidth / 2) * scale;
  outputStartX = ringCenterX - (ringRadius - gradientWidth / 2) * scale + 18;
}

function buildInputLayer() {
  inputLayer = document.createElement('canvas');
  inputLayer.width = Math.ceil((fieldWidth + particleSpacing * 2) * fieldScale);
  inputLayer.height = Math.ceil(fieldHeight * fieldScale);
  const context = inputLayer.getContext('2d');
  context.setTransform(fieldScale, 0, 0, fieldScale, 0, 0);
  context.beginPath();
  for (let y = particleSpacing / 2; y < fieldHeight; y += particleSpacing) {
    for (let x = particleSpacing / 2; x < fieldWidth + particleSpacing * 2; x += particleSpacing) {
      context.moveTo(x, y);
      context.lineTo(x + 0.01, y);
    }
  }
  context.lineCap = 'round';
  context.lineWidth = 1.44;
  context.strokeStyle = `rgba(255, 255, 255, ${PARTICLE_OPACITY})`;
  context.stroke();
}

function drawInputFlow(elapsed) {
  const drift = reducedMotion ? 0 : (elapsed * FLOW_SPEED / 1000) % particleSpacing;
  inputContext.setTransform(1, 0, 0, 1, 0, 0);
  inputContext.clearRect(0, 0, inputField.width, inputField.height);
  inputContext.drawImage(inputLayer, (drift - particleSpacing) * fieldScale, 0);
  if (!ringPaintedRadius) return;
  inputContext.globalCompositeOperation = 'destination-out';
  inputContext.beginPath();
  inputContext.arc(
    ringCenterX * fieldScale,
    ringCenterY * fieldScale,
    (ringPaintedRadius + 2) * fieldScale,
    0,
    Math.PI * 2,
  );
  inputContext.fill();
  inputContext.globalCompositeOperation = 'source-over';
}

function drawOutputFlow(elapsed) {
  outputContext.setTransform(fieldScale, 0, 0, fieldScale, 0, 0);
  outputContext.clearRect(0, 0, fieldWidth, fieldHeight);
  const outputEndX = fieldWidth - 20;
  const trackLength = outputEndX - outputStartX;
  if (trackLength <= 0) return;
  const phase = reducedMotion ? 0 : (elapsed * FLOW_SPEED / 1000) % trackLength;
  const spacing = trackLength / OUTPUT_COUNT;
  outputContext.lineCap = 'round';
  outputContext.lineWidth = 1.44;
  outputContext.strokeStyle = `rgba(255, 255, 255, ${PARTICLE_OPACITY})`;
  outputContext.beginPath();
  for (let index = 0; index < OUTPUT_COUNT; index += 1) {
    const x = outputStartX + (phase + index * spacing) % trackLength;
    outputContext.moveTo(x, fieldHeight / 2);
    outputContext.lineTo(x + 0.01, fieldHeight / 2);
  }
  outputContext.stroke();
}

function drawFilterFlow(elapsed) {
  if (!inputLayer) return;
  drawInputFlow(elapsed);
  drawOutputFlow(elapsed);
}

function renderFilterFrame(timestamp) {
  if (animationStart === null) animationStart = timestamp;
  drawFilterFlow(timestamp - animationStart);
  window.requestAnimationFrame(renderFilterFrame);
}

function resizeFilterFlow() {
  if (!inputField || !inputContext || !outputField || !outputContext) return;
  fieldWidth = window.innerWidth;
  fieldHeight = window.innerHeight;
  fieldScale = Math.min(window.devicePixelRatio || 1, 1.5);
  particleSpacing = fieldWidth < 640 ? 28 : 32;
  inputField.width = Math.round(fieldWidth * fieldScale);
  inputField.height = Math.round(fieldHeight * fieldScale);
  outputField.width = Math.round(fieldWidth * fieldScale);
  outputField.height = Math.round(fieldHeight * fieldScale);
  updateRingGeometry();
  buildInputLayer();
  drawFilterFlow(animationStart === null ? 0 : performance.now() - animationStart);
}

if (inputField && inputContext && outputField && outputContext) {
  resizeFilterFlow();
  window.addEventListener('resize', resizeFilterFlow, { passive: true });
  if (!reducedMotion) window.requestAnimationFrame(renderFilterFrame);
}
