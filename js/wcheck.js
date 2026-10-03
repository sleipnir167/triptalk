// 英文の自動チェック（AIを使わない・端末内で完結・無料・一瞬）
//  よくある文法ミス / 和製英語 / 旅行で失礼に聞こえやすい言い方 を見つける
//  （英検3級パスポートの wcheck.js をもとに、旅行英語向けに作り直したもの）

const NOT_ING_VERB = '(?!(?:bring|sing|ring|swing|spring|sting|string|cling|fling|wring|thing|king)\\b)';

// [正規表現, メッセージ, 種類] 種類: grammar（文法）| wasei（和製英語）| polite（丁寧さ）
const RULES = [
  // ---- 文法 ----
  [/\bI am agree\b|\bI'm agree\b/gi, 'agree は動詞なので be動詞は不要（I agree）', 'grammar'],
  [/\b(am|is|are|was|were) (like|likes|want|wants|need|needs|have|has|know|knows|think|live|lives|enjoy|go|goes)\b/gi, 'be動詞と一般動詞をいっしょに使っていない？（I am want → I want）', 'grammar'],
  [/\benjoy(s|ed)? to \w+/gi, 'enjoy のあとは ～ing（enjoy swimming）', 'grammar'],
  [new RegExp(`\\b(want|wants|wanted|would like|'d like|need|needs|hope|decided) to ${NOT_ING_VERB}\\w+ing\\b`, 'gi'), 'to のあとは動詞の原形（want to go）', 'grammar'],
  [/\b(didn't|don't|doesn't|did not|does not|do not) (went|came|saw|ate|had|made|took|got|bought|lost|left|paid|found|goes|has)\b/gi, "don't / didn't のあとは動詞の原形（I didn't get ～）", 'grammar'],
  [/\b(can|will|must|should|could|would|may) (went|came|saw|ate|took|bought|lost|left|paid|goes|has|is|are|was)\b/gi, '助動詞（can / could など）のあとは動詞の原形（Could I have ～?）', 'grammar'],
  [/\bmore (better|cheaper|bigger|smaller|larger|faster|closer|nearer|easier)\b/gi, '比較級に more は不要（more cheaper → cheaper）', 'grammar'],
  [/\bgo(es)? to (shopping|swimming|sightseeing|hiking|skiing|diving|surfing|camping)\b/gi, 'go ～ing に to は不要（go shopping）', 'grammar'],
  [/\b(go|goes|went|come|came|get|got) to (home|there|here|abroad|downtown)\b/gi, 'home / there / downtown の前に to は不要（go home）', 'grammar'],
  [/\b(luggages|baggages|informations|advices|furnitures|moneys|homeworks)\b/gi, 'luggage / baggage / information などは数えない名詞なので s をつけない', 'grammar'],
  [/\bevery (days|nights|mornings|weeks)\b/gi, 'every のあとは単数（every day）', 'grammar'],
  [/\bvisit(s|ed)? to\b/gi, 'visit のあとに to は不要（visit Kyoto）', 'grammar'],
  [/\barrive(s|d)? to\b/gi, '「～に着く」は arrive at / arrive in（arrive at the airport）', 'grammar'],
  [/\blisten(s|ed)? (music|the radio|songs?)\b/gi, '「～を聞く」は listen to ～', 'grammar'],
  [/\bI (has|likes|wants|needs|goes|lives|is)\b/g, 'I のあとの動詞に s はつけない・be動詞は am（I want / I am）', 'grammar'],
  [/\b(he|she|it) (are|were|have)\b/gi, 'he / she / it なら is / was / has', 'grammar'],
  [/\ba (apple|egg|orange|hour|umbrella|airport|aisle|extra|ATM|e-?mail|exit|entrance|island|ocean|art|accident|address|appointment|allergy|adult|adapter|outlet|elevator|emergency|ambulance|embassy|idea|apartment|iced|upgrade|earlier|alarm)\b/gi, '母音（の音）で始まる語の前は an（an aisle seat / an hour）', 'grammar'],
  [/\b(im|dont|cant|didnt|doesnt|isnt|arent|ive|youre|theyre|thats|whats|wheres|hows)\b/gi, "アポストロフィ（'）を忘れていない？（I'm / don't / where's）", 'grammar'],
  [/\bi\b/g, '「私」は大文字の I', 'grammar'],
  [/\bhow much (is|are) (it|this|that|they|these|those) cost\b/gi, '「いくら？」は How much is it? か How much does it cost?', 'grammar'],
  [/\bwhere is (toilet|restroom|bathroom|station|exit|entrance|elevator|bus stop|taxi stand|front desk|lobby|gate|baggage claim)\b/gi, '場所をたずねるときは the をつける（Where is the restroom?）', 'grammar'],
  [/\blooking forward to (see|meet|go|visit|hear)\b/gi, 'look forward to のあとは ～ing（looking forward to seeing）', 'grammar'],
  [/\bteach me (the way|how to get|where)\b/gi, '道を教えては tell / show（Could you tell me the way to ～?）。teach は勉強を教えること', 'grammar'],
  [/\b(menu|guide|brochure|map|audio guide) of (Japanese|English)\b/gi, '「日本語の～」は in Japanese（a menu in Japanese）', 'grammar'],
  [/\bI('m| am) (boring|tiring|exciting|interesting|confusing)\b/gi, '自分の気持ちは -ed（I\'m bored / I\'m tired）。-ing だと「私は退屈な人」の意味に', 'grammar'],
  [/\bI('m| am) interesting in\b/gi, '「～に興味がある」は I\'m interested in ～', 'grammar'],
  [/\b(is|are|am|was|were|isn't|aren't|wasn't) (not )?(move|work|run|flush)\b/gi, '機械が「動かない」は isn\'t working / doesn\'t work（The AC isn\'t working.）', 'grammar'],
  [/\bI('m| am) room \d+/gi, '部屋番号は This is room 305. / I\'m in room 305.（I am room だと「私は部屋」）', 'grammar'],
  [/[.!?,](?=[A-Za-z])/g, '句読点（. , ! ?）のあとはスペースを空けよう', 'grammar'],

  // ---- 和製英語 ----
  [/\bmorning call\b/gi, '和製英語：モーニングコールは wake-up call', 'wasei'],
  [/\bconcent\b|\b(a|an|the|any|no) consent\b(?! form)/gi, '和製英語：コンセントは outlet（イギリスは socket / plug）', 'wasei'],
  [/\bviking\b/gi, '和製英語：バイキングは buffet', 'wasei'],
  [/\b(call|ask|tell|contact) the front\b(?! desk| door| of)|\bthe front (staff|clerk|counter|person)\b/gi, 'ホテルの「フロント」は front desk / reception', 'wasei'],
  [/\bpet ?bottles?\b/gi, '和製英語：ペットボトルは plastic bottle', 'wasei'],
  [/\bgas(oline)? stand\b/gi, '和製英語：ガソリンスタンドは gas station（イギリスは petrol station）', 'wasei'],
  [/\bbaby ?car\b/gi, '和製英語：ベビーカーは stroller（イギリスは pushchair）', 'wasei'],
  [/\bfree size\b/gi, '和製英語：フリーサイズは one size fits all', 'wasei'],
  [/\border[- ]made\b/gi, '和製英語：オーダーメイドは custom-made / made-to-order', 'wasei'],
  [/\bnote ?(pc|book pc)\b/gi, '和製英語：ノートパソコンは laptop', 'wasei'],
  [/\bmansion\b/gi, '和製英語：マンションは apartment / condo（mansion は大豪邸）', 'wasei'],
  [/\b(make|have|got) a claim\b/gi, '「クレームを言う」は make a complaint（claim は「請求・主張」）', 'wasei'],
  [/\b(your|my) sign\b(?!s| here| this)/gi, '有名人のサインは autograph、書類の署名は signature', 'wasei'],
  [/\b(is (it|this|that)|it's) (a )?service\b(?! charge| fee| area| desk| dog| counter)/gi, '「サービス（無料）」は free / on the house / complimentary', 'wasei'],
  [/\bfried potato(es)?\b/gi, 'フライドポテトは (French) fries（イギリスは chips）', 'wasei'],
  [/\bamerican coffee\b/gi, '「アメリカン」は通じにくい。regular coffee / weak coffee', 'wasei'],
  [/\bjet coaster\b/gi, '和製英語：ジェットコースターは roller coaster', 'wasei'],
  [/\bwet tissues?\b/gi, 'ウェットティッシュは wet wipes', 'wasei'],
  [/\brent-?a-?car\b/gi, 'レンタカーは rental car（a car rental）', 'wasei'],
  [/\bremo-?con\b/gi, '和製英語：リモコンは remote (control)', 'wasei'],
  [/\bkonbini\b/gi, 'コンビニは convenience store', 'wasei'],
  [/\b(y-?shirt|white shirt)\b/gi, 'ワイシャツは dress shirt', 'wasei'],
  [/\bone ?piece\b(?! of)/gi, 'ワンピースは dress', 'wasei'],
  [/\bpierces?\b/gi, 'ピアスは earrings（pierce は「穴を開ける」）', 'wasei'],
  [/\bsalary ?man\b/gi, 'サラリーマンは office worker / company employee', 'wasei'],
  [/\bcider\b/gi, '英語の cider はリンゴ酒（リンゴジュース）。サイダーは Sprite / lemon soda', 'wasei'],

  // ---- 丁寧さ ----
  [/(^|[.!?]\s+)(give me|bring me|show me|tell me)\b/gi, '命令に聞こえやすい。Could I have ～? / Could you show me ～? が丁寧', 'polite'],
  [/\bI want (a|an|the|some|one|two|to)\b/gi, 'I want ～ は子どもっぽく聞こえることも。I\'d like ～ が大人の言い方', 'polite'],
  [/(^|[.!?]\s+)hey\b/gi, 'お店の人を呼ぶときは Excuse me. が丁寧', 'polite'],
];

export const KIND_LABEL = { grammar: '文法', wasei: '和製英語', polite: '丁寧さ' };

/**
 * 英文をチェックする
 * @returns {{ issues: {text:string, msg:string, kind:string, index:number}[], notes: {state:'ok'|'warn'|'ng', label:string}[] }}
 */
export function checkEnglish(text, { writing = false } = {}) {
  const t = String(text || '');
  const issues = [];
  for (const [re, msg, kind] of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      if (!m[0]) { re.lastIndex++; continue; } // 空文字にマッチしても止まらないように
      issues.push({ text: m[0].replace(/^[.!?]\s+/, ''), msg, kind, index: m.index });
      if (!re.global) break;
    }
  }
  // 同じメッセージは1回だけ
  const seen = new Set();
  const uniq = issues.sort((a, b) => a.index - b.index).filter((x) => (seen.has(x.msg) ? false : seen.add(x.msg)));

  const notes = [];
  if (/[぀-ヿ㐀-鿿]/.test(t)) notes.push({ state: 'ng', label: '日本語が入っています（すべて英語で）' });
  if (writing && t.trim()) {
    const sentences = t.replace(/\s+/g, ' ').trim().replace(/([.!?])\s+/g, '$1\n').split('\n').filter(Boolean);
    const lower = sentences.filter((s) => /^[a-z]/.test(s)).length;
    if (lower) notes.push({ state: 'warn', label: `文の最初が小文字の文があります（${lower}か所）` });
    if (!/[.!?]["”']?\s*$/.test(t.trim())) notes.push({ state: 'warn', label: '最後の文に . か ? をつけよう' });
    const request = /\b(could|can|would|may) (you|i)\b/i.test(t);
    if (request && !/\bplease\b/i.test(t)) notes.push({ state: 'warn', label: 'お願いの文に please を足すと、さらに感じよく聞こえます' });
  }
  return { issues: uniq, notes };
}

/** チェック結果の HTML（esc は呼び出し側から渡す） */
export function checkHTML(res, esc, { title = '無料チェック（AIなし）', empty = '気になる点は見つかりませんでした 👍' } = {}) {
  const { issues, notes } = res;
  const rows = [
    ...notes.map((n) => `<li class="wc-${n.state}"><span class="wc-tag">${n.state === 'ng' ? '要確認' : 'ヒント'}</span>${esc(n.label)}</li>`),
    ...issues.map((x) => `<li class="wc-${x.kind}"><span class="wc-tag">${KIND_LABEL[x.kind]}</span><b>${esc(x.text)}</b> — ${esc(x.msg)}</li>`),
  ];
  return `<div class="wcheck"><div class="wc-head">🔎 ${title}</div>${rows.length ? `<ul>${rows.join('')}</ul>` : `<p class="small muted">${empty}</p>`}</div>`;
}
