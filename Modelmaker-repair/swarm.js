// Autonomous browser runtime: no LLM calls. Local interaction history only.
const DIMENSIONS = ['Movement', 'Evolution', 'Being', 'Design'];
const initial = JSON.parse(document.getElementById('initial-state').textContent);
const canvas = document.getElementById('space');
const ctx = canvas.getContext('2d');
const field = document.createElement('canvas');
const ink = field.getContext('2d', {willReadFrequently: true});
const input = document.getElementById('expression');
const bitsInput = document.getElementById('bits');
const status = document.getElementById('status');
const pointer = {x: -1000, y: -1000};
let primitives = initial;
let particles = [];
let width = 0;
let height = 0;
let previous = 0;
let frame = 0;
const storageKey = 'stellar-six-line-seed:' + document.getElementById('initial-state').dataset.id;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(saved) && saved.length <= 64 && saved.every(p =>
      /^[01]{6}$/.test(p.bits) && typeof p.text === 'string' && p.text.length <= 4000)) {
    if (saved.reduce((sum, p) => sum + p.text.length, 0) <= 8000) primitives = saved;
  }
} catch (_) { /* The page also works when local storage is unavailable. */ }

function save() {
  try {localStorage.setItem(storageKey, JSON.stringify(primitives));}
  catch (_) {status.textContent = 'Composition updated; local saving is unavailable.';}
}

function wrap(text, maxWidth) {
  const lines = [];
  let line = '';
  for (const char of text) {
    if (char === '\n' || ink.measureText(line + char).width > maxWidth) {
      lines.push(line); line = char === '\n' ? '' : char;
    } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}

function rebuild() {
  width = Math.max(240, document.documentElement.clientWidth);
  const cols = Math.max(1, Math.floor((width - 32) / 300));
  const cardWidth = (width - 32) / cols;
  ink.font = '16px system-ui';
  const wrapped = primitives.map(p => wrap(p.text, cardWidth - 36));
  const rows = [];
  for (let i = 0; i < primitives.length; i += cols) {
    rows.push(Math.max(200, ...wrapped.slice(i, i + cols).map(l => 156 + l.length * 22)));
  }
  height = Math.max(innerHeight - 180, 112 + rows.reduce((a, b) => a + b, 0));
  canvas.width = field.width = width;
  canvas.height = field.height = height;
  canvas.style.height = height + 'px';
  ink.fillStyle = '#fff';
  ink.font = 'bold 24px system-ui';
  ink.fillText('SPACE / SIX-LINE SEED', 24, 40);
  ink.font = '13px system-ui';
  ink.fillText(DIMENSIONS.join(' · '), 24, 68);
  let rowY = 92;
  primitives.forEach((p, index) => {
    if (index && index % cols === 0) rowY += rows[Math.floor(index / cols) - 1];
    const x = 24 + (index % cols) * cardWidth;
    for (let line = 0; line < 6; line++) {
      const y = rowY + 94 - line * 16;
      if (p.bits[line] === '1') ink.fillRect(x, y, 112, 5);
      else {ink.fillRect(x, y, 48, 5); ink.fillRect(x + 64, y, 48, 5);}
    }
    ink.font = '16px system-ui';
    wrapped[index].forEach((line, i) => ink.fillText(line, x, rowY + 135 + i * 22));
  });
  const pixels = ink.getImageData(0, 0, width, height).data;
  const next = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (pixels[(y * width + x) * 4 + 3] > 80) {
        const old = particles[next.length];
        next.push({x: old ? old.x : Math.random() * width,
                   y: old ? old.y : Math.random() * height,
                   vx: 0, vy: 0, tx: x, ty: y});
      }
    }
  }
  particles = next;
  // Equivalent readable content remains available to assistive technology.
  document.getElementById('semantic').textContent = primitives.map(p =>
    `Heart: ${p.bits.slice(0,2)} ${p.bits.slice(2,4)} ${p.bits.slice(4)}. ` +
    `Mind: ${p.bits.slice(0,3)} ${p.bits.slice(3)}. Body: ${p.bits}. ${p.text}`).join('\n');
}

function tick(time) {
  const dt = Math.min(2, Math.max(0.1, (time - previous) / 16.667));
  previous = time;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#61e7cf';
  for (const p of particles) {
    let ax = (p.tx - p.x) * 0.016;
    let ay = (p.ty - p.y) * 0.016;
    const dx = p.x - pointer.x, dy = p.y - pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 70 && distance > 0.01) {
      ax += dx / distance * (70 - distance) * 0.07;
      ay += dy / distance * (70 - distance) * 0.07;
    }
    p.vx = (p.vx + ax * dt) * Math.pow(0.86, dt);
    p.vy = (p.vy + ay * dt) * Math.pow(0.86, dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
    ctx.fillRect(p.x, p.y, 2, 2);
  }
  frame = requestAnimationFrame(tick);
}

canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
});
canvas.addEventListener('pointerleave', () => {pointer.x = pointer.y = -1000;});
document.getElementById('compose').addEventListener('submit', event => {
  event.preventDefault();
  if (!/^[01]{6}$/.test(bitsInput.value)) {status.textContent = 'Enter exactly six binary lines.'; return;}
  if (primitives.length >= 64) {status.textContent = '64 primitives reached. Reset to start another composition.'; return;}
  if (primitives.reduce((sum, p) => sum + p.text.length, input.value.length) > 8000) {
    status.textContent = 'This composition supports up to 8000 text characters.'; return;
  }
  primitives = [...primitives, {bits: bitsInput.value, text: input.value}];
  status.textContent = `Composed ${primitives.length} primitives; the swarm is rebuilding.`;
  save(); rebuild();
});
document.getElementById('reset').addEventListener('click', () => {
  primitives = initial.map(p => ({...p})); save(); rebuild();
  status.textContent = 'Restored the exported composition.';
});
window.addEventListener('resize', rebuild);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(frame);
  else {previous = performance.now(); frame = requestAnimationFrame(tick);}
});
rebuild();
frame = requestAnimationFrame(tick);
