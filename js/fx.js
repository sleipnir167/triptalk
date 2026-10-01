// 演出: 紙吹雪、+XP フロート、きらめき
let canvas, cx, parts = [], running = false, lastT = 0;
const COLORS = ['#5b8cff', '#a855f7', '#ff7a59', '#ffc24b', '#2ed3a1', '#ff5d8f', '#22d3ee'];

function ensure() {
  if (canvas) return;
  canvas = document.getElementById('fx');
  cx = canvas.getContext('2d');
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);
}

function loop(t) {
  // 画面のリフレッシュレートに依存しないよう経過時間で動かす
  const dt = lastT ? Math.min(3, (t - lastT) / 16.67) : 1;
  lastT = t;
  cx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
  for (const p of parts) {
    p.vy += p.g * dt; p.vx *= Math.pow(0.992, dt); p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt;
    cx.save();
    cx.globalAlpha = Math.min(1, p.life / 40);
    cx.translate(p.x, p.y); cx.rotate(p.rot);
    cx.fillStyle = p.c;
    if (p.shape === 0) cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    else if (p.shape === 1) { cx.beginPath(); cx.arc(0, 0, p.s / 3, 0, Math.PI * 2); cx.fill(); }
    else { // star sparkle
      cx.beginPath();
      for (let i = 0; i < 4; i++) { cx.rotate(Math.PI / 2); cx.lineTo(0, p.s / 2); cx.lineTo(p.s / 8, p.s / 8); }
      cx.fill();
    }
    cx.restore();
  }
  if (parts.length) requestAnimationFrame(loop); else { running = false; lastT = 0; cx.clearRect(0, 0, innerWidth, innerHeight); }
}

function start() { if (!running) { running = true; requestAnimationFrame(loop); } }

export function confetti({ count = 140, x = innerWidth / 2, y = innerHeight * 0.35, spread = 1 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ensure();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (4 + Math.random() * 9) * spread;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, g: 0.22, s: 7 + Math.random() * 8, c: COLORS[i % COLORS.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, life: 140 + Math.random() * 60, shape: i % 3 });
  }
  start();
}

export function sparkle(el, n = 14) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ensure();
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sp = 2 + Math.random() * 3;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.05, s: 8 + Math.random() * 6, c: COLORS[(i * 3) % COLORS.length], rot: 0, vr: 0.2, life: 40 + Math.random() * 20, shape: 2 });
  }
  start();
}

export function floatText(text, anchor, cls = '') {
  const el = document.createElement('div');
  el.className = 'float-text ' + cls;
  el.textContent = text;
  let x = innerWidth / 2, y = innerHeight / 2;
  if (anchor?.getBoundingClientRect) { const r = anchor.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; }
  else if (anchor && 'x' in anchor) { x = anchor.x; y = anchor.y; }
  el.style.left = x + 'px'; el.style.top = y + 'px';
  document.body.append(el);
  setTimeout(() => el.remove(), 1200);
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
}
