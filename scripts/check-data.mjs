// データの検証：npm run check
//  - 単語・フレーズの ID 重複（英語の先頭表現から作るので、同じ英語が2つあると学習記録がまざる）
//  - 必須項目（英語・日本語・単語の例文）
//  - 台本ロールプレイ・AI会話シナリオ・添削お題の形式
//  - 採点（正規化・アラインメント）の簡単な動作確認
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener() {}, visibilityState: 'visible', querySelector() { return null; } };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };

const { SCENES } = await import('../js/data/scenes.js');
const { DIALOGUES, AI_SCENARIOS, WRITE_PROMPTS } = await import('../js/data/dialogues.js');
const content = await import('../js/content.js');
const { scoreAgainst } = await import('../js/scoring.js');

let errors = 0, warns = 0;
const err = (m) => { errors++; console.log('✗', m); };
const warn = (m) => { warns++; console.log('△', m); };

content.buildContent();
const all = content.allItems();
const ids = new Map();
for (const it of all) {
  if (ids.has(it.id)) err(`ID が重複: "${it.en}"（${ids.get(it.id).scene} と ${it.scene}）`);
  ids.set(it.id, it);
  if (!it.en || !it.ja) err(`英語か日本語がない: ${it.scene} ${it.en}`);
  if (it.kind === 'word' && (!it.ex || !it.exJa)) err(`単語に例文がない: ${it.en}`);
}
for (const sc of SCENES) if (!sc.words.length || !sc.phrases.length) warn(`シーンが空: ${sc.id}`);

const sceneIds = new Set(SCENES.map((s) => s.id));
for (const d of DIALOGUES) {
  if (!sceneIds.has(d.scene)) err(`台本のシーンが不明: ${d.id} (${d.scene})`);
  if (!['M', 'F'].includes(d.g)) err(`台本の声（g）が不正: ${d.id}`);
  if (!d.lines.some((l) => l[0] === 'you')) err(`台本にあなたのセリフがない: ${d.id}`);
  d.lines.forEach((l, i) => { if (!['staff', 'you'].includes(l[0]) || !l[1] || !l[2]) err(`台本の行が不正: ${d.id} #${i + 1}`); });
}
for (const s of AI_SCENARIOS) {
  if (!sceneIds.has(s.scene)) err(`AI会話のシーンが不明: ${s.id}`);
  if (!s.role || !s.mission || !s.opener) err(`AI会話の項目が足りない: ${s.id}`);
}
for (const p of WRITE_PROMPTS) if (!p.ja || !p.model) err(`添削お題の項目が足りない: ${p.ja?.slice(0, 20)}`);

// 採点の動作確認
const cases = [
  ["I'd like to check in, please.", 'I would like to check in please', 100],
  ['For five days.', 'for 5 days', 100],
  ["What's the Wi-Fi password?", 'what is the wifi password', 100],
];
for (const [t, h, want] of cases) {
  const s = scoreAgainst([t], [h]).score;
  if (s !== want) err(`採点: "${h}" → ${s}点（期待 ${want}）`);
}

const words = all.filter((i) => i.kind === 'word').length;
console.log(`\n項目 ${all.length}（単語 ${words}・フレーズ ${all.length - words}）／台本 ${DIALOGUES.length}／AI会話 ${AI_SCENARIOS.length}／添削お題 ${WRITE_PROMPTS.length}`);
console.log(errors ? `✗ エラー ${errors} 件` : '✓ エラーなし', warns ? `（注意 ${warns} 件）` : '');
process.exit(errors ? 1 : 0);
