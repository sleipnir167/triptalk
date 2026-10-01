// 魔法の夜のデコレーション（オリジナルのSVG。特定の作品のロゴやキャラクターは使わない）
//  お城・クルーズ船・花火・星空・きらきら

let uid = 0;

/** おとぎ話のお城のシルエット（窓に金色の灯り） */
export function castleSVG(cls = '') {
  const id = 'cs' + ++uid;
  const tower = (x, w, top, roofH) => `
    <rect x="${x}" y="${top}" width="${w}" height="${200 - top}" fill="url(#${id}w)"/>
    <path d="M${x - 5} ${top} L${x + w / 2} ${top - roofH} L${x + w + 5} ${top} Z" fill="url(#${id}r)"/>
    <line x1="${x + w / 2}" y1="${top - roofH}" x2="${x + w / 2}" y2="${top - roofH - 14}" stroke="var(--castle-gold)" stroke-width="1.6"/>
    <path d="M${x + w / 2} ${top - roofH - 14} l10 3.5 -10 3.5z" fill="var(--castle-flag)"/>`;
  const win = (x, y, w = 5, h = 9) => `<path d="M${x} ${y + h} v-${h - w / 2} a${w / 2} ${w / 2} 0 0 1 ${w} 0 v${h - w / 2}z" class="cw"/>`;
  const merlons = (x1, x2, y) => { let s = ''; for (let x = x1; x < x2; x += 9) s += `<rect x="${x}" y="${y - 6}" width="5" height="6" fill="url(#${id}w)"/>`; return s; };
  return `<svg class="castle ${cls}" viewBox="0 0 300 200" aria-hidden="true">
    <defs>
      <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--castle-wall-top)"/><stop offset="1" stop-color="var(--castle-wall-bottom)"/></linearGradient>
      <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--castle-roof-a)"/><stop offset="1" stop-color="var(--castle-roof-b)"/></linearGradient>
    </defs>
    ${tower(36, 22, 120, 34)}${tower(242, 22, 120, 34)}
    <rect x="44" y="140" width="212" height="60" fill="url(#${id}w)"/>${merlons(46, 254, 140)}
    ${tower(72, 30, 92, 46)}${tower(198, 30, 92, 46)}
    ${tower(120, 60, 66, 58)}
    ${tower(141, 18, 40, 30)}
    <path d="M136 200 v-26 a14 14 0 0 1 28 0 v26z" fill="var(--castle-gate)"/>
    ${win(147, 78)}${win(132, 96)}${win(162, 96)}${win(147, 112)}${win(84, 108)}${win(210, 108)}${win(84, 130)}${win(210, 130)}${win(44, 136)}${win(250, 136)}${win(147, 52, 4, 7)}
    ${win(64, 160)}${win(104, 160)}${win(190, 160)}${win(230, 160)}
  </svg>`;
}

/** クルーズ船（汎用のデザイン） */
export function shipSVG(cls = '') {
  return `<svg class="ship ${cls}" viewBox="0 0 220 90" aria-hidden="true">
    <path d="M8 52 L212 52 L196 78 Q194 82 188 82 L30 82 Q24 82 21 78 Z" fill="var(--ship-hull)"/>
    <path d="M14 61 L206 61 L203 66 L17 66 Z" fill="var(--ship-stripe)"/>
    <rect x="38" y="36" width="140" height="16" rx="3" fill="var(--ship-deck)"/>
    <rect x="56" y="24" width="104" height="13" rx="3" fill="var(--ship-deck)"/>
    <path d="M88 24 l4 -16 h16 l-3 16z" fill="var(--ship-funnel)"/><path d="M90.5 14 h16" stroke="var(--ship-hull)" stroke-width="4"/>
    <path d="M118 24 l4 -16 h16 l-3 16z" fill="var(--ship-funnel)"/><path d="M120.5 14 h16" stroke="var(--ship-hull)" stroke-width="4"/>
    ${Array.from({ length: 12 }, (_, i) => `<circle cx="${46 + i * 11}" cy="44" r="2" fill="var(--castle-gold)"/>`).join('')}
    ${Array.from({ length: 8 }, (_, i) => `<circle cx="${66 + i * 12}" cy="30.5" r="1.8" fill="var(--castle-gold)"/>`).join('')}
    <path d="M196 52 L204 40 L208 40 L204 52z" fill="var(--ship-deck)"/>
  </svg>`;
}

/** 花火（CSSアニメーション。動きを減らす設定では止まる） */
export function fireworksSVG(cls = '') {
  const burst = (cx, cy, r, color, delay, n = 12) => `
    <g class="fw" style="--d:${delay}s;transform-origin:${cx}px ${cy}px">
      ${Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * r * 0.35, y1 = cy + Math.sin(a) * r * 0.35;
        const x2 = cx + Math.cos(a) * r, y2 = cy + Math.sin(a) * r;
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/><circle cx="${(cx + Math.cos(a) * r * 1.12).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 1.12).toFixed(1)}" r="1.6" fill="${color}"/>`;
      }).join('')}
    </g>`;
  return `<svg class="fireworks ${cls}" viewBox="0 0 300 160" aria-hidden="true">
    ${burst(70, 60, 34, '#ffd36e', 0)}${burst(190, 45, 42, '#ff8ad8', 1.1, 14)}${burst(250, 95, 26, '#8be9ff', 2.1)}${burst(130, 105, 22, '#c4a5ff', 2.8, 10)}
  </svg>`;
}

/** 4方向に光るきらきら */
export const sparkleSVG = (size = 16, cls = '') =>
  `<svg class="sparkle ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill="currentColor"/></svg>`;

/** 画面全体の星空（またたく星・流れ星） */
export function initSky() {
  const sky = document.querySelector('.sky');
  if (!sky || sky.childElementCount) return;
  let html = '';
  for (let i = 0; i < 70; i++) {
    const s = Math.random() < 0.15 ? 3 : Math.random() < 0.5 ? 2 : 1.2;
    html += `<i style="left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 100).toFixed(2)}%;width:${s}px;height:${s}px;animation-delay:${(Math.random() * 5).toFixed(2)}s;animation-duration:${(2.5 + Math.random() * 3).toFixed(2)}s"></i>`;
  }
  for (let i = 0; i < 6; i++) {
    html += `<b style="left:${(5 + Math.random() * 90).toFixed(1)}%;top:${(4 + Math.random() * 70).toFixed(1)}%;animation-delay:${(Math.random() * 6).toFixed(2)}s">${sparkleSVG(8 + Math.round(Math.random() * 8))}</b>`;
  }
  html += '<em class="shooting s1"></em><em class="shooting s2"></em>';
  sky.innerHTML = html;
}
