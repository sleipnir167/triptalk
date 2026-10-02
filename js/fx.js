// 演出: 紙吹雪、+XP フロート、きらめき
let canvas, cx, parts = [], running = false, lastT = 0;
const COLORS = ['#ffd36e', '#ff8ad8', '#8be9ff', '#c4a5ff', '#ffffff', '#ffb347', '#7cf5c4'];
const GOLD = ['#fff3c4', '#ffd36e', '#ffe9a8', '#ffffff', '#ffc1ec'];

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
    cx.globalAlpha = Math.min(1, p.life / (p.fade || 40));
    if (p.glow) { cx.shadowColor = p.c; cx.shadowBlur = p.glow; }
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

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** タップした所に舞う小さな金色のきらきら（妖精の粉のイメージ） */
let lastDust = 0;
export function pixieDust(x, y) {
  const now = performance.now();
  if (now - lastDust < 70 || reduced()) return;
  lastDust = now;
  ensure();
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.6 + Math.random() * 1.8;
    parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, g: 0.035, s: 5 + Math.random() * 7, c: GOLD[i % GOLD.length], rot: Math.random() * 3, vr: 0.12, life: 26 + Math.random() * 22, fade: 22, shape: i % 3 === 0 ? 1 : 2, glow: 8 });
  }
  start();
}

/** 夜空に打ち上がる花火（レベルアップ・お祝いに） */
export function fireworks({ bursts = 4, gap = 380 } = {}) {
  if (reduced()) return;
  ensure();
  const palettes = [['#ffd36e', '#fff3c4', '#ffb347'], ['#ff8ad8', '#ffc1ec', '#ffffff'], ['#8be9ff', '#c4f3ff', '#ffffff'], ['#c4a5ff', '#e9ddff', '#ffd36e'], ['#7cf5c4', '#ffffff', '#8be9ff']];
  for (let b = 0; b < bursts; b++) {
    setTimeout(() => {
      const x = innerWidth * (0.18 + Math.random() * 0.64);
      const y = innerHeight * (0.14 + Math.random() * 0.3);
      const pal = palettes[(b + Math.floor(Math.random() * 5)) % palettes.length];
      const n = 46;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.08;
        const sp = 3.2 + Math.random() * 2.6;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.05, s: 4 + Math.random() * 3, c: pal[i % pal.length], rot: 0, vr: 0, life: 70 + Math.random() * 30, fade: 45, shape: 1, glow: 12 });
      }
      for (let i = 0; i < 10; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, g: 0.02, s: 10, c: '#ffffff', rot: 0, vr: 0.2, life: 50, fade: 30, shape: 2, glow: 14 });
      start();
    }, b * gap);
  }
}

/** 風船がふわっと上がる（全問正解・レベルアップのお祝いに） */
export function balloons(count = 9) {
  if (reduced()) return;
  const colors = ['#ff5d8f', '#ffd36e', '#6b6cf6', '#3ddba8', '#c056e8', '#8be9ff', '#ff8a3d'];
  const wrap = document.createElement('div');
  wrap.className = 'balloons';
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const c = colors[i % colors.length];
    const b = document.createElement('div');
    b.className = 'balloon';
    b.style.cssText = `--c:${c};left:${4 + Math.random() * 88}%;animation-delay:${(Math.random() * 0.9).toFixed(2)}s;animation-duration:${(4.2 + Math.random() * 2).toFixed(2)}s;--sway:${(Math.random() * 40 - 20).toFixed(0)}px;--s:${(0.75 + Math.random() * 0.5).toFixed(2)}`;
    b.innerHTML = '<svg viewBox="0 0 60 110"><path d="M30 4 C48 4 56 20 56 36 C56 56 40 70 32 74 L35 79 L25 79 L28 74 C20 70 4 56 4 36 C4 20 12 4 30 4Z" fill="var(--c)"/><ellipse cx="20" cy="24" rx="6" ry="10" fill="#fff" opacity=".35" transform="rotate(-20 20 24)"/><path d="M30 79 q-6 10 2 18 q6 8 -2 13" stroke="rgba(255,255,255,.7)" stroke-width="1.4" fill="none"/></svg>';
    wrap.append(b);
  }
  document.body.append(wrap);
  setTimeout(() => wrap.remove(), 8000);
}
