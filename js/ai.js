// AI 連携（OpenAI互換API: アプリ内蔵AI / OpenRouter / Modellix / 自前サーバー、Chrome内蔵AI）
// クレジット節約の仕組み:
//  1) アプリ内蔵AI（Modellix の無料モデルを Cloudflare Worker 経由で中継）が設定なしで使える
//  2) 結果はすべて IndexedDB にキャッシュ（同じ質問は二度と呼ばない）
//  3) 用途別に優先順位付きプロバイダ → 失敗時は次へ自動フォールバック（無料→有料の順に並べられる）
//  4) 1日の呼び出し上限
//  5) 会話は1ターン1回の呼び出しで「返答・和訳・添削・ヒント」をまとめて取得
import { state, save, cacheGet, cacheSet } from './store.js';
import { hash } from './content.js';
import { todayKey } from './ui.js';
import { bus } from './bus.js';
import { BUILTIN_AI } from './config.js';

export const PRESETS = [
  {
    key: 'openrouter', name: 'OpenRouter', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.5-flash-lite', audioModel: 'google/gemini-2.5-flash-lite', sttModel: 'openai/whisper-1',
    timeout: 40, desc: '低価格モデルを選べる。音声（発音診断・文字起こし）にも対応。末尾が :free のモデルは無料。',
  },
  {
    key: 'selfhost', name: '自前サーバー (Gemma)', type: 'openai', baseUrl: 'https://your-server.example.com/v1', model: 'gemma3:12b', timeout: 180,
    desc: 'Ollama / llama.cpp / vLLM 等のOpenAI互換API。HTTPS と CORS の許可が必要です。遅い場合は「解説」専用にするのがおすすめ。system ロール非対応のモデルは「system を使わない」をオンに。',
  },
  {
    key: 'chrome', name: 'Chrome内蔵AI (Gemini Nano)', type: 'chrome', baseUrl: '', model: 'gemini-nano', timeout: 90,
    desc: '対応Chrome（デスクトップ等）のみ。完全無料・オフライン。iPad Safari では使えません。',
  },
  {
    key: 'custom', name: 'カスタム (OpenAI互換)', type: 'openai', baseUrl: '', model: '', timeout: 60,
    desc: 'Modellix・Groq・Google AI Studio・LM Studio など任意のOpenAI互換API（ブラウザから呼べる＝CORS対応のもの）。',
  },
];

// ---- アプリ内蔵AI ----
export const BUILTIN_ID = 'builtin';
function builtinProvider(prev = {}) {
  return {
    id: BUILTIN_ID, builtin: true, preset: 'builtin', type: 'openai',
    name: BUILTIN_AI.name, baseUrl: BUILTIN_AI.baseUrl, model: BUILTIN_AI.model, apiKey: '',
    audioModel: '', sttModel: '', timeout: 90, mergeSystem: false,
    enabled: prev.enabled ?? true, useChat: prev.useChat ?? true, useExplain: prev.useExplain ?? true,
  };
}
/** 起動時: 内蔵AIをプロバイダ一覧に入れる（URL・モデルは常に config.js の値。オン/オフと並び順は利用者が決める） */
export function ensureBuiltin() {
  const list = state.settings.ai.providers || (state.settings.ai.providers = []);
  const i = list.findIndex((p) => p.id === BUILTIN_ID);
  if (i >= 0) list[i] = builtinProvider(list[i]);
  else list.unshift(builtinProvider());
  save('settings');
}

export function newProvider(presetKey) {
  const p = PRESETS.find((x) => x.key === presetKey) || PRESETS[0];
  return {
    id: 'pv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    preset: p.key, name: p.name, type: p.type, baseUrl: p.baseUrl, apiKey: '', model: p.model,
    audioModel: p.audioModel || '', sttModel: p.sttModel || '', timeout: p.timeout, mergeSystem: false,
    enabled: true, useChat: p.key !== 'selfhost', useExplain: true,
  };
}

export function providers() { return state.settings.ai.providers || []; }

function usable(p) {
  if (!p.enabled) return false;
  if (p.type === 'chrome') return 'LanguageModel' in self;
  return !!(p.baseUrl && p.model);
}

export function providersFor(task) {
  return providers().filter((p) => usable(p) && (task === 'chat' ? p.useChat : p.useExplain));
}
export function aiReady(task = 'explain') { return providersFor(task).length > 0; }
export function aiAudioProvider() { return providers().find((p) => p.enabled && p.type === 'openai' && p.baseUrl && p.audioModel); }
export function aiSttProvider() { return providers().find((p) => p.enabled && p.type === 'openai' && p.baseUrl && (p.sttModel || p.audioModel)); }
export const aiSttReady = () => !!aiSttProvider();
/** 「AIが考えています…」に添える待ち時間の目安（先頭が内蔵AIのとき） */
export function aiWaitHint(task = 'explain') {
  const p = providersFor(task)[0];
  return p?.builtin && BUILTIN_AI.waitHint ? `（${BUILTIN_AI.waitHint}）` : '';
}

// ---- 使用量 ----
function usageRec() {
  const k = todayKey();
  state.aiUsage[k] ||= { calls: 0, inTok: 0, outTok: 0, cost: 0, cached: 0, byProv: {} };
  return state.aiUsage[k];
}
export function todayUsage() { return state.aiUsage[todayKey()] || { calls: 0, inTok: 0, outTok: 0, cost: 0, cached: 0, byProv: {} }; }
export function monthUsage() {
  const prefix = todayKey().slice(0, 7);
  const out = { calls: 0, inTok: 0, outTok: 0, cost: 0, cached: 0 };
  for (const [k, v] of Object.entries(state.aiUsage)) {
    if (!k.startsWith(prefix)) continue;
    out.calls += v.calls; out.inTok += v.inTok; out.outTok += v.outTok; out.cost += v.cost || 0; out.cached += v.cached || 0;
  }
  return out;
}
function recordUsage(p, usage) {
  const u = usageRec();
  u.calls++;
  u.inTok += usage?.prompt_tokens || 0;
  u.outTok += usage?.completion_tokens || 0;
  u.cost += Number(usage?.cost) || 0;
  u.byProv[p.name] = (u.byProv[p.name] || 0) + 1;
  save('aiUsage');
  bus.emit('aiusage');
}
function checkLimit() {
  const lim = state.settings.ai.dailyLimit;
  if (lim > 0 && todayUsage().calls >= lim) throw new Error(`本日のAI呼び出し上限（${lim}回）に達しました。設定で変更できます。`);
}

// ---- 低レベル呼び出し ----
function withTimeout(ms, outer) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error('timeout')), ms);
  outer?.addEventListener('abort', () => ctl.abort(outer.reason));
  return { signal: ctl.signal, done: () => clearTimeout(t) };
}

function headersFor(p) {
  const h = { 'Content-Type': 'application/json' };
  if (p.apiKey) h.Authorization = 'Bearer ' + p.apiKey;
  if (/openrouter\.ai/.test(p.baseUrl)) { h['HTTP-Referer'] = location.origin; h['X-Title'] = 'TripTalk'; }
  return h;
}

/** system ロールに対応していないモデル（一部の Gemma サーバー等）向けに、最初の user にまとめる */
function mergeSystemRole(messages) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system');
  if (!sys) return rest;
  const i = rest.findIndex((m) => m.role === 'user');
  if (i < 0) return [{ role: 'user', content: sys }, ...rest];
  const merged = [...rest];
  const c = merged[i].content;
  merged[i] = { ...merged[i], content: typeof c === 'string' ? `${sys}\n\n---\n\n${c}` : [{ type: 'text', text: sys }, ...c] };
  return merged;
}

/** 推論モデルの「考える工程」を取り除く */
const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();

async function callOpenAI(p, { messages, maxTokens, temperature, model, signal }) {
  const url = p.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const body = { model: model || p.model, messages: p.mergeSystem ? mergeSystemRole(messages) : messages, max_tokens: maxTokens, temperature };
  if (/openrouter\.ai/.test(p.baseUrl)) body.usage = { include: true };
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: headersFor(p), body: JSON.stringify(body), signal });
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw e;
    if (!navigator.onLine) throw new Error('オフラインです。ネットにつながるとAIを使えます');
    // 中継サーバーは許可していないサイトに CORS ヘッダーを付けない（403）ので、ブラウザからは接続エラーに見える
    if (p.builtin) throw new Error(`内蔵AIの中継サーバーにつながりません。このサイト（${location.origin}）が中継サーバーの許可サイトに入っていない可能性があります（proxy/README.md 参照）`);
    throw new Error('サーバーに接続できません（URL・HTTPS・CORS の設定、またはネット接続を確認してください）');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || (data ? JSON.stringify(data).slice(0, 200) : res.statusText);
    if (res.status === 403 && p.builtin) throw new Error(`このサイトからは内蔵AIを使えません（中継サーバーの許可サイトに ${location.origin} を追加してください）`);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  let text = data?.choices?.[0]?.message?.content ?? '';
  if (Array.isArray(text)) text = text.map((c) => c.text || '').join('');
  text = stripThink(text);
  const finish = data?.choices?.[0]?.finish_reason;
  if (!text) throw Object.assign(new Error(finish === 'length' ? '出力が上限で途切れました' : '返答が空でした'), { code: finish === 'length' ? 'length' : 'empty' });
  return { text, usage: data.usage, finish };
}

async function callChrome(p, { messages }) {
  const LM = self.LanguageModel;
  if (!LM) throw new Error('このブラウザはChrome内蔵AIに対応していません');
  const avail = await LM.availability?.();
  if (avail === 'unavailable') throw new Error('Chrome内蔵AIが利用できません');
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const rest = messages.filter((m) => m.role !== 'system');
  const last = rest.pop();
  let session;
  const opts = { initialPrompts: [{ role: 'system', content: sys }, ...rest] };
  try {
    session = await LM.create({ ...opts, expectedInputs: [{ type: 'text', languages: ['en', 'ja'] }], expectedOutputs: [{ type: 'text', languages: ['ja'] }] });
  } catch {
    session = await LM.create(opts);
  }
  try { return { text: stripThink(await session.prompt(last.content)) }; } finally { session.destroy?.(); }
}

/** JSON を頑健に取り出す（```json や前後の文章があってもOK。配列にも対応） */
export function parseJSON(text) {
  if (!text) return null;
  let s = stripThink(text).replace(/```(?:json)?/gi, '').trim();
  const start = Math.min(...['{', '['].map((c) => { const i = s.indexOf(c); return i < 0 ? Infinity : i; }));
  if (start === Infinity) return null;
  const end = s.lastIndexOf(s[start] === '{' ? '}' : ']');
  if (end < start) return null;
  s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch {}
  try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); } catch {}
  return null;
}

/**
 * メインのAI呼び出し
 * task: 'chat'（会話・速さ重視）| 'explain'（解説・添削）
 * json: true なら JSON を必須に（validate で形式チェック）
 * textFallback: JSON が読めなくても文章があれば data:null で返す（解説など文章でも表示できるもの）
 */
export async function aiChat({ messages, task = 'explain', maxTokens = 600, temperature = 0.4, json = true, cacheKey = null, signal, validate, textFallback = false } = {}) {
  const ok = (d) => (!json || d) && (!validate || validate(d));
  if (cacheKey) {
    const hit = await cacheGet(cacheKey);
    if (hit && (ok(hit.data) || (textFallback && hit.text))) { const u = usageRec(); u.cached = (u.cached || 0) + 1; save('aiUsage'); return { ...hit, cached: true }; }
  }
  const list = providersFor(task);
  if (!list.length) throw new Error('AIが使えません。「設定 > AI」で内蔵AIをオンにするか、プロバイダを追加してください。');
  checkLimit();
  const errors = [];
  let textOnly = null;
  for (const p of list) {
    // 返答が空・途切れた・形式が崩れたときは、出力枠を広げて1回だけやり直す
    for (let attempt = 0; attempt < 2; attempt++) {
      const to = withTimeout((p.timeout || 60) * 1000, signal);
      try {
        const tokens = attempt ? Math.max(maxTokens * 3, 2000) : maxTokens;
        const r = p.type === 'chrome' ? await callChrome(p, { messages }) : await callOpenAI(p, { messages, maxTokens: tokens, temperature, signal: to.signal });
        to.done();
        recordUsage(p, r.usage);
        const data = json ? parseJSON(r.text) : null;
        if (!ok(data)) {
          if (textFallback && r.text && !textOnly) textOnly = { text: r.text, data: null, provider: p.name };
          // 無料モデルは呼ぶたびに中のAIが変わるので、形式が崩れたら同じ接続先で1回だけやり直す
          if (!attempt) { console.warn('AI: 形式が不正なのでやり直します', p.name, String(r.text).slice(0, 300)); continue; }
          throw new Error(json && !data ? 'AIの応答をJSONとして読めませんでした' : 'AIの応答形式が不正です');
        }
        const out = { text: r.text, data, provider: p.name, builtin: !!p.builtin };
        if (cacheKey) cacheSet(cacheKey, { text: r.text, data, provider: p.name, t: Date.now() });
        return out;
      } catch (e) {
        to.done();
        if (signal?.aborted) throw new Error('キャンセルしました');
        if ((e?.code === 'length' || e?.code === 'empty') && !attempt) continue;
        const msg = e?.name === 'AbortError' || /timeout|abort/i.test(String(e?.message || e)) ? 'タイムアウト' : e?.message || String(e);
        errors.push(`${p.name}: ${msg}`);
        break;
      }
    }
  }
  if (textOnly) {
    if (cacheKey) cacheSet(cacheKey, { ...textOnly, t: Date.now() });
    return textOnly;
  }
  throw new Error(errors.join('\n'));
}

export async function testProvider(p) {
  const t0 = performance.now();
  const to = withTimeout((p.timeout || 60) * 1000);
  try {
    const messages = [{ role: 'system', content: 'Reply with a single short English greeting.' }, { role: 'user', content: 'Hello!' }];
    const r = p.type === 'chrome' ? await callChrome(p, { messages }) : await callOpenAI(p, { messages, maxTokens: p.builtin ? 400 : 60, temperature: 0, signal: to.signal });
    recordUsage(p, r.usage);
    return { ok: true, ms: Math.round(performance.now() - t0), text: r.text.trim().slice(0, 80) };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), text: e?.name === 'AbortError' ? 'タイムアウト' : e?.message || String(e) };
  } finally { to.done(); }
}

export async function listModels(p) {
  const url = p.baseUrl.replace(/\/+$/, '') + '/models';
  const res = await fetch(url, { headers: headersFor(p) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const arr = j.data || j.models || [];
  return arr.map((m) => {
    const pr = m.pricing || {};
    const pin = parseFloat(pr.prompt || 0) * 1e6;
    const pout = parseFloat(pr.completion || 0) * 1e6;
    const audio = (m.architecture?.input_modalities || []).includes('audio');
    return { id: m.id || m.name, name: m.name || m.id, pin, pout, free: /:free$/.test(m.id || '') || (pr.prompt === '0' && pr.completion === '0'), ctx: m.context_length || 0, audio };
  });
}

// ================= プロンプト =================
// 無料モデルは中で複数のAIに振り分けられるため、中国語（簡体字）や英語の説明が混ざらないよう明示する
const JA_RULE = 'Write every Japanese field in natural, concise Japanese (never Simplified Chinese, and never write the explanations in English). Only English example sentences/phrases are written in English.';
const SYS = `You are an expert, warm English coach for Japanese travelers. Respond ONLY with valid minified JSON (no markdown, no code fences). ${JA_RULE}`;
const SYS_TEXT = `あなたは日本人旅行者に英語を教える、やさしくて的確な英会話コーチです。説明は必ず自然な日本語で書きます（中国語の簡体字や、英語だけの説明文を混ぜません）。英語の例文・語句だけは英語で書きます。`;

export async function explainItem(item) {
  const r = await aiChat({
    task: 'explain', maxTokens: 900, cacheKey: 'explain:' + item.id, textFallback: true,
    validate: (d) => d && d.meaning_ja,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: `Explain this English ${item.kind === 'word' ? 'word/expression' : 'phrase'} for a Japanese traveler.
Expression: "${item.en}"
Japanese meaning given: ${item.ja}
JSON keys: {"meaning_ja":"意味を1文で","nuance_ja":"ニュアンス・丁寧さ・使う場面（2文以内）","examples":[{"en":"travel example","ja":"和訳"}],"similar":[{"en":"similar expression","diff_ja":"違い"}],"pronunciation_ja":"発音のコツ（カタカナに頼りすぎない説明）","culture_ja":"旅行で役立つ豆知識（1文）"}
examples: 3 items. similar: 2 items.` },
    ],
  });
  return r;
}

export async function judgeAnswer({ ja, expected, answer }) {
  return aiChat({
    task: 'explain', maxTokens: 350, temperature: 0.2, cacheKey: 'judge:' + hash(ja + '|' + answer.toLowerCase()),
    validate: (d) => d && typeof d.ok === 'boolean',
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: `A Japanese learner was asked to say this in English: "${ja}"
Model answer: "${expected}"
Learner said: "${answer}"
Judge if the learner's English would be understood correctly and is appropriate in a travel situation (minor speech-recognition glitches are OK).
JSON: {"ok":true|false,"score":0-100,"better":"a natural English version close to the learner's","comment_ja":"短い講評（良い点＋改善点）"}` },
    ],
  });
}

export async function correctText({ situation, text, mode = 'writing' }) {
  return aiChat({
    task: 'explain', maxTokens: 1100, temperature: 0.3, cacheKey: 'correct:' + hash(situation + '|' + text),
    validate: (d) => d && d.scores && typeof d.total === 'number',
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: `Situation (Japanese): ${situation}
The learner ${mode === 'speaking' ? 'SAID (speech-recognition transcript, ignore punctuation/capitalization)' : 'WROTE'}: "${text}"
Evaluate as an English coach for travel communication.
JSON: {"total":0-100,"scores":{"grammar":0-100,"vocabulary":0-100,"naturalness":0-100,"task":0-100},"corrected":"minimal correction of the learner's sentence","natural":[{"en":"more natural native version","note_ja":"ポイント"}],"mistakes":[{"wrong":"...","right":"...","why_ja":"理由"}],"good_ja":"良かった点","advice_ja":"次へのアドバイス（1〜2文）"}
natural: 2 items (one polite, one casual). mistakes: up to 4 (empty array if none). task = how well it achieves the situation.` },
    ],
  });
}

const LEVEL = {
  easy: 'Use very simple words and short sentences (CEFR A2). Speak slowly and clearly.',
  normal: 'Use natural everyday English (CEFR B1).',
  hard: 'Speak like a real native at natural speed (B2-C1) with common idioms. Occasionally add a small realistic complication.',
};

export function chatSystemPrompt(sc, level) {
  return `You are role-playing as ${sc.role}. The learner is a Japanese traveler practicing English. ${LEVEL[level] || LEVEL.normal}
The learner's mission: ${sc.missionEn || sc.mission}
Rules: stay in character; keep each reply to 1-3 short sentences; move the conversation forward realistically; ask a question when natural; never use Japanese in "reply".
Respond ONLY with minified JSON:
{"reply":"your next line in English","reply_ja":"natural Japanese translation of reply","feedback":{"ok":true|false,"corrected":"a more natural English version of the learner's LAST message","tip_ja":"日本語の短いアドバイス(40字以内)"},"hints":[{"en":"something the LEARNER (the traveler) could say next","ja":"和訳"},{"en":"another thing the learner could say","ja":"和訳"}],"mission_done":true|false}
feedback.ok = the learner's last message was understandable and appropriate. hints are the traveler's possible next lines that answer your reply and help the mission (never your own staff lines). mission_done = the learner has fully achieved the mission.
${JA_RULE}`;
}

export async function chatTurn({ sc, level, history, signal }) {
  // history: [{role:'assistant'|'user', content}]
  const trimmed = history.slice(-14);
  const messages = [{ role: 'system', content: chatSystemPrompt(sc, level) }, ...trimmed];
  const last = messages[messages.length - 1];
  if (last?.role === 'user') messages[messages.length - 1] = { role: 'user', content: `${last.content}\n\n(Respond in the JSON format.)` };
  return aiChat({ task: 'chat', maxTokens: 450, temperature: 0.7, messages, signal, validate: (d) => d && d.reply, textFallback: true });
}

export async function chatStart({ sc, level }) {
  const messages = [
    { role: 'system', content: chatSystemPrompt(sc, level) },
    { role: 'user', content: '(The conversation starts now. Say your first line to the learner. feedback can be null.)' },
  ];
  return aiChat({ task: 'chat', maxTokens: 300, temperature: 0.8, messages, validate: (d) => d && d.reply, textFallback: true });
}

export async function chatReport({ sc, transcript }) {
  return aiChat({
    task: 'explain', maxTokens: 1300, temperature: 0.3,
    validate: (d) => d && d.scores,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: `Evaluate this role-play conversation of a Japanese learner (English practice for travel).
Partner role: ${sc.role}
Mission: ${sc.missionEn || sc.mission}
Transcript (Learner lines come from speech recognition; ignore punctuation):
${transcript}
JSON: {"overall":0-100,"scores":{"grammar":0-100,"vocabulary":0-100,"fluency":0-100,"politeness":0-100,"task":0-100},"mission_achieved":true|false,"summary_ja":"総評（2〜3文）","good_ja":"良かった点","corrections":[{"you":"learner's sentence","better":"improved","why_ja":"理由"}],"phrases":[{"en":"useful phrase for this situation","ja":"和訳"}],"next_ja":"次に練習すべきこと（1文）"}
corrections: up to 5 most useful. phrases: 4 items.` },
    ],
  });
}

export async function translate({ text, dir }) {
  const q = dir === 'ja2en'
    ? `Translate this Japanese into natural spoken English a traveler can say to local staff.
Japanese: "${text}"
JSON: {"en":"polite natural English","casual":"shorter casual version","note_ja":"使い方の一言メモ"}`
    : `The traveler heard this English (from speech recognition, may contain errors): "${text}"
JSON: {"ja":"自然な日本語訳","reply_en":"a natural short reply the traveler could say","reply_ja":"その和訳","note_ja":"聞き取りのポイントや注意（あれば）"}`;
  return aiChat({
    task: 'chat', maxTokens: 350, temperature: 0.2, cacheKey: 'tr:' + dir + ':' + hash(text), textFallback: true,
    validate: (d) => d && (dir === 'ja2en' ? d.en : d.ja),
    messages: [{ role: 'system', content: SYS }, { role: 'user', content: q }],
  });
}

/** 解説へのフォローアップ質問（AI先生に質問）。文章で答える */
export async function askFollowup({ item, context, question }) {
  return aiChat({
    task: 'explain', maxTokens: 500, temperature: 0.4, json: false, cacheKey: `fu:${item.id}:${hash(question.trim().toLowerCase())}`,
    messages: [
      { role: 'system', content: `${SYS_TEXT}\n回答は200字以内で簡潔に。必要なら英語の例文を1〜2個添えてください。マークダウンの見出しは使わず、短い段落か「・」の箇条書きで書きます。` },
      { role: 'user', content: `【旅行英語の表現】${item.en}（${item.ja}）\n${context ? `【これまでの解説】\n${context.slice(0, 1500)}\n` : ''}\n【学習者の質問】\n${question}` },
    ],
  });
}

/** 自分の旅の予定に合わせたフレーズを作る（マイ単語に追加用） */
export async function generatePhrases({ topic, count = 8, trip = '' }) {
  return aiChat({
    task: 'explain', maxTokens: 1500, temperature: 0.6, cacheKey: `gen:${hash(topic + '|' + count)}`,
    validate: (d) => Array.isArray(d) && d.length && d.every((x) => x && x.en && x.ja),
    messages: [
      { role: 'system', content: `You write practical, natural English phrases for Japanese travelers (CEFR A2-B1, polite but natural). ${JA_RULE}` },
      { role: 'user', content: `Create ${count} English phrases a Japanese traveler will actually need in this situation: "${topic}"${trip ? ` (trip: ${trip})` : ''}.
Mix requests, questions, and useful replies. Keep each phrase short (max 14 words). Avoid duplicates of very basic phrases like "Thank you".
Output ONLY a JSON array: [{"en":"English phrase","ja":"自然な日本語訳","note_ja":"使う場面・ポイント（20字程度）"}]` },
    ],
  });
}

export async function fillItem(text) {
  return aiChat({
    task: 'explain', maxTokens: 400, temperature: 0.3, cacheKey: 'fill:' + hash(text),
    validate: (d) => d && d.en && d.ja,
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: `The learner wants to add this to their travel English flashcards: "${text}" (it may be English or Japanese).
JSON: {"en":"English word/phrase (natural, travel-useful)","ja":"日本語訳","ex":"short travel example sentence in English","exJa":"例文の和訳","note_ja":"使い方のワンポイント"}` },
    ],
  });
}

/** 録音音声で発音を診断（音声入力対応モデルが必要） */
export async function assessPronunciation({ base64, target }) {
  const p = aiAudioProvider();
  if (!p) throw new Error('音声対応モデルが未設定です（設定 > AI > 音声モデル）');
  checkLimit();
  const to = withTimeout((p.timeout || 60) * 1000);
  try {
    const r = await callOpenAI(p, {
      model: p.audioModel, maxTokens: 700, temperature: 0.2, signal: to.signal,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: [
          { type: 'text', text: `A Japanese learner is reading aloud: "${target}". Listen carefully and evaluate their pronunciation, rhythm and intonation honestly (do not be overly generous).
JSON: {"transcript":"what you actually heard","score":0-100,"issues":[{"word":"...","problem_ja":"どう聞こえたか・何が違うか","tip_ja":"直し方"}],"good_ja":"良かった点","overall_ja":"総評（2文）"}
issues: up to 4.` },
          { type: 'input_audio', input_audio: { data: base64, format: 'wav' } },
        ] },
      ],
    });
    recordUsage(p, r.usage);
    const d = parseJSON(r.text);
    if (!d) throw new Error('AIの応答を読めませんでした');
    return d;
  } finally { to.done(); }
}

/** 音声 → テキスト（Whisper 等の文字起こしAPI、なければ音声対応チャットモデル） */
export async function aiTranscribe(base64, lang = 'en-US') {
  const p = aiSttProvider();
  if (!p) throw new Error('AI文字起こしが未設定です');
  checkLimit();
  const to = withTimeout((p.timeout || 60) * 1000);
  try {
    if (p.sttModel) {
      const url = p.baseUrl.replace(/\/+$/, '') + '/audio/transcriptions';
      const res = await fetch(url, {
        method: 'POST', headers: headersFor(p), signal: to.signal,
        body: JSON.stringify({ model: p.sttModel, input_audio: { data: base64, format: 'wav' }, language: lang.slice(0, 2) }),
      });
      if (res.ok) {
        const j = await res.json();
        recordUsage(p, { cost: j.usage?.cost || 0 });
        return (j.text || '').trim();
      }
      if (!p.audioModel) throw new Error(`文字起こし失敗 HTTP ${res.status}`);
    }
    const r = await callOpenAI(p, {
      model: p.audioModel, maxTokens: 200, temperature: 0, signal: to.signal,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Transcribe this audio verbatim, exactly as spoken (do not fix mistakes). Output only the transcript text.' },
        { type: 'input_audio', input_audio: { data: base64, format: 'wav' } },
      ] }],
    });
    recordUsage(p, r.usage);
    return r.text.trim().replace(/^"|"$/g, '');
  } finally { to.done(); }
}
