// マスコット「ルミ」（船長帽をかぶった星の妖精）— このアプリのオリジナルキャラクター
//  mood: normal | happy | cheer | wow | sad | think

let uid = 0;

function starPath(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`;
  }
  return d + 'Z';
}

const EYES = {
  normal: `<g class="m-eyes"><ellipse cx="85" cy="108" rx="8.5" ry="11.5" fill="#1b1650"/><ellipse cx="117" cy="108" rx="8.5" ry="11.5" fill="#1b1650"/>
    <circle cx="88" cy="103" r="3.6" fill="#fff"/><circle cx="120" cy="103" r="3.6" fill="#fff"/><circle cx="82.5" cy="113" r="1.6" fill="#fff" opacity=".8"/><circle cx="114.5" cy="113" r="1.6" fill="#fff" opacity=".8"/></g>`,
  happy: `<path d="M77 110 q8 -11 16 0" stroke="#1b1650" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M109 110 q8 -11 16 0" stroke="#1b1650" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  wow: `<g class="m-eyes"><ellipse cx="85" cy="106" rx="10" ry="13.5" fill="#1b1650"/><ellipse cx="117" cy="106" rx="10" ry="13.5" fill="#1b1650"/>
    <circle cx="89" cy="100" r="4.5" fill="#fff"/><circle cx="121" cy="100" r="4.5" fill="#fff"/><path d="M84 112 l2 -3 2 3 -2 3z" fill="#ffe39a"/><path d="M116 112 l2 -3 2 3 -2 3z" fill="#ffe39a"/></g>`,
  sad: `<path d="M77 106 q8 7 16 2" stroke="#1b1650" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M109 108 q8 5 16 -2" stroke="#1b1650" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path class="m-tear" d="M80 116 q-5 9 0 12 q5 -3 0 -12z" fill="#8be9ff"/>`,
  think: `<g class="m-eyes"><ellipse cx="85" cy="108" rx="8" ry="11" fill="#1b1650"/><ellipse cx="117" cy="108" rx="8" ry="11" fill="#1b1650"/>
    <circle cx="88" cy="101" r="3.4" fill="#fff"/><circle cx="120" cy="101" r="3.4" fill="#fff"/></g>`,
};
EYES.cheer = EYES.happy;

const MOUTH = {
  normal: '<path d="M93 124 q8 8 16 0" stroke="#1b1650" stroke-width="3.6" fill="none" stroke-linecap="round"/>',
  happy: '<path d="M90 121 q11 16 22 0z" fill="#1b1650"/><path d="M95 127 q6 4 12 0" fill="#ff7aa8"/>',
  cheer: '<path d="M89 120 q12 19 24 0z" fill="#1b1650"/><path d="M95 128 q6 5 12 0" fill="#ff7aa8"/>',
  wow: '<ellipse cx="101" cy="127" rx="6" ry="7.5" fill="#1b1650"/>',
  sad: '<path d="M93 129 q8 -7 16 0" stroke="#1b1650" stroke-width="3.6" fill="none" stroke-linecap="round"/>',
  think: '<path d="M95 126 h12" stroke="#1b1650" stroke-width="3.6" stroke-linecap="round"/>',
};

export function mascot(mood = 'normal', cls = '') {
  const id = 'lm' + ++uid;
  const m = EYES[mood] ? mood : 'normal';
  const raised = mood === 'cheer' || mood === 'wow';
  return `<svg class="mascot mood-${m} ${cls}" viewBox="0 0 200 200" role="img" aria-label="ルミ">
    <defs>
      <radialGradient id="${id}b" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#fff6c9"/><stop offset="0.6" stop-color="#ffd76a"/><stop offset="1" stop-color="#f3ad2d"/></radialGradient>
      <linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6f7ff" stop-opacity=".95"/><stop offset="1" stop-color="#a8d8ff" stop-opacity=".55"/></linearGradient>
    </defs>
    <g class="m-wings">
      <ellipse cx="46" cy="92" rx="30" ry="17" transform="rotate(-28 46 92)" fill="url(#${id}w)" stroke="#fff" stroke-width="2"/>
      <ellipse cx="154" cy="92" rx="30" ry="17" transform="rotate(28 154 92)" fill="url(#${id}w)" stroke="#fff" stroke-width="2"/>
    </g>
    <path d="${starPath(100, 112, 78, 44)}" fill="url(#${id}b)" stroke="url(#${id}b)" stroke-width="20" stroke-linejoin="round"/>
    <ellipse cx="70" cy="122" rx="8.5" ry="5.5" fill="#ff8fb7" opacity=".55"/><ellipse cx="132" cy="122" rx="8.5" ry="5.5" fill="#ff8fb7" opacity=".55"/>
    ${EYES[m]}${MOUTH[m] || MOUTH.normal}
    <g class="m-hat" transform="rotate(-10 100 44)">
      <path d="M72 50 q28 -34 56 0z" fill="#ffffff" stroke="#d9dcf5" stroke-width="2"/>
      <rect x="72" y="46" width="56" height="10" rx="3" fill="#1d2470"/>
      <path d="M100 47.5 v7 M97 50.5 h6 M96.5 53 q3.5 3 7 0" stroke="#ffd36e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M68 57 q32 9 64 0 l-2 4 q-30 8 -60 0z" fill="#121652"/>
    </g>
    <g class="m-wand" transform="rotate(${raised ? -38 : 0} 150 150)">
      <line x1="150" y1="150" x2="178" y2="112" stroke="#c98a1a" stroke-width="4.5" stroke-linecap="round"/>
      <path d="${starPath(180, 108, 12, 5.5)}" fill="#ffe39a" stroke="#f2a922" stroke-width="1.5" stroke-linejoin="round"/>
      <circle class="m-twinkle" cx="192" cy="94" r="2.4" fill="#fff"/><circle class="m-twinkle t2" cx="168" cy="96" r="1.8" fill="#fff"/>
    </g>
    ${mood === 'think' ? '<g class="m-think"><circle cx="150" cy="56" r="4" fill="#fff" opacity=".9"/><circle cx="162" cy="44" r="6" fill="#fff" opacity=".9"/><text x="170" y="34" font-size="20" fill="#ffe39a" font-family="Fredoka, sans-serif" font-weight="700">?</text></g>' : ''}
  </svg>`;
}

/** 状況に合わせたルミのひとこと */
export function lumiSays({ due = 0, newLeft = 0, today = 0, goal = 120, streak = 0, trip = null, cruise = false } = {}) {
  const h = new Date().getHours();
  if (trip && trip.days === 0) return cruise ? 'いよいよ出航の日！Bon Voyage！旅行モードでフレーズを見せてね✨' : 'いよいよ出発の日！旅行モードでいつでも助けるよ✨';
  if (trip && trip.days > 0 && trip.days <= 7) return `${trip.name}まであと${trip.days}日！ラストスパート、いっしょにがんばろう！`;
  if (today >= goal) return '今日の目標は達成！すごいね✨ 余裕があればスピード周回で魔法をみがこう';
  if (due > 0) return `忘れかけた魔法の言葉が${due}個あるよ。いまが覚えなおすベストタイミング！`;
  if (streak >= 3) return `${streak}日連続だね！その調子で毎日すこしずつ魔法をかけよう`;
  if (newLeft > 0) return h < 11 ? 'おはよう！今日は新しいフレーズを覚えにいこう☀️' : '新しいフレーズを覚えにいこう！ぼくがナビするよ';
  if (cruise) return '船の上でも困らないように、クルーズのフレーズを練習しよう🚢';
  return 'どこへでも行ける英語の魔法、いっしょにみがこう✨';
}
