// TripTalk：AI 中継（Cloudflare Worker）※ 英検3級パスポートの proxy と同じしくみ
//  - ブラウザから直接呼べない Modellix の LLM API を中継する（CORS をつける）
//  - API キーは Cloudflare の Secret（MODELLIX_API_KEY）にだけ置き、アプリや GitHub には出さない
//  - 悪用・使いすぎ対策：許可したサイトからだけ受け付ける／モデルと出力トークン数を制限／IP ごとの回数制限
//
// 環境変数（wrangler.toml の [vars]）
//   ALLOWED_ORIGINS  受け付けるサイト（カンマ区切り）
//   ALLOWED_MODELS   使ってよいモデル（カンマ区切り。先頭が既定）
//   MAX_TOKENS       1回の出力トークンの上限
//   UPSTREAM         中継先（既定：Modellix の LLM ゲートウェイ）
// Secret
//   MODELLIX_API_KEY  Modellix の API キー（npx wrangler secret put MODELLIX_API_KEY）

const DEFAULT_UPSTREAM = 'https://llm.modellix.ai/v1';
const MAX_INPUT_CHARS = 24000; // 1回に送れる文字数の上限（長文＋答案でも十分）

const list = (s, fallback) => String(s || fallback).split(',').map((x) => x.trim()).filter(Boolean);

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(origin ? corsHeaders(origin) : {}) },
  });
}
// 中身のない返答（安全判定だけ・ほぼ空）かどうか
function junk(data) {
  const c = String(data?.choices?.[0]?.message?.content ?? '').trim();
  return !c || /^(user|agent|assistant)?\s*safety\s*:/i.test(c);
}

const fail = (message, status, origin) => json({ error: { message, type: 'proxy_error' } }, status, origin);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = list(env.ALLOWED_ORIGINS, 'https://sleipnir167.github.io');
    const okOrigin = allowed.includes(origin) ? origin : '';
    const models = list(env.ALLOWED_MODELS, 'deepseek/deepseek-v4-flash');
    const maxTokens = Number(env.MAX_TOKENS) || 4000;
    const retries = Math.max(0, Math.min(3, Number(env.RETRIES ?? 1)));

    // 許可していないサイトからは使わせない（ブラウザ以外からの直接アクセスも Origin がないので断る）
    if (!okOrigin) return fail('このサイトからは利用できません', 403, '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(okOrigin) });

    const path = url.pathname.replace(/\/+$/, '');
    const base = String(env.UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '');
    const auth = { Authorization: `Bearer ${env.MODELLIX_API_KEY}` };
    if (request.method === 'GET' && (path === '/v1/models' || path === '/models')) {
      // ?all=1 のときは Modellix で使えるモデルをすべて返す（設定するモデル名を調べる用）
      if (url.searchParams.get('all') === '1' && env.MODELLIX_API_KEY) {
        try {
          const r = await fetch(`${base}/models`, { headers: auth });
          const d = await r.json();
          return json({ object: 'list', allowed: models, data: (d.data || []).map((m) => ({ id: m.id, name: m.name, provider: m.provider_name, series: m.series_name })) }, r.status, okOrigin);
        } catch {
          return fail('モデル一覧を取得できませんでした', 502, okOrigin);
        }
      }
      return json({ object: 'list', data: models.map((id) => ({ id, object: 'model', name: id })) }, 200, okOrigin);
    }
    if (request.method !== 'POST' || !(path === '/v1/chat/completions' || path === '/chat/completions')) {
      return fail('not found', 404, okOrigin);
    }
    if (!env.MODELLIX_API_KEY) return fail('中継サーバーに API キーが設定されていません（wrangler secret put MODELLIX_API_KEY）', 500, okOrigin);

    // IP ごとの回数制限（Rate Limiting バインディングがあるときだけ）
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return fail('短時間にAIを使いすぎています。1分ほど待ってからもう一度どうぞ', 429, okOrigin);
    }

    let body;
    try { body = await request.json(); } catch { return fail('リクエストの形式が正しくありません', 400, okOrigin); }
    const messages = Array.isArray(body.messages) ? body.messages
      .filter((m) => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content })) : [];
    if (!messages.length) return fail('messages がありません', 400, okOrigin);
    if (messages.reduce((a, m) => a + m.content.length, 0) > MAX_INPUT_CHARS) return fail('送る文章が長すぎます', 413, okOrigin);

    // 必要な項目だけを中継（モデル・トークン数はサーバー側で決める）
    // 許可したモデルを順に試す：無料モデルが混雑・停止しているときは次のモデルへ
    // 同じモデルも RETRIES 回までやり直す（無料モデルは中で別の AI に振り分けられるため、やり直すと直ることが多い）
    const firstModels = models.includes(body.model) ? [body.model, ...models.filter((m) => m !== body.model)] : models;
    const order = firstModels.flatMap((m) => Array(1 + retries).fill(m));
    const common = {
      messages,
      // 推論（考える工程）にもトークンを使うモデルがあるので、上限はサーバー側で決める
      max_tokens: maxTokens,
      temperature: Math.max(0, Math.min(1, Number(body.temperature ?? 0.3))),
    };
    let res = null, data = null, used = order[0];
    for (const model of order) {
      used = model;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
          body: JSON.stringify({ model, ...common }),
        });
      } catch {
        res = null;
        continue;
      }
      const text = await res.text();
      try { data = JSON.parse(text); } catch { data = null; }
      const badModel = res.status === 400 && /model/i.test(data?.error?.message || '');
      const retriable = !data || badModel || res.status === 404 || res.status === 429 || res.status >= 500;
      if (res.ok && data && !junk(data)) break;
      if (res.ok && data) continue; // 中身のない返答はやり直す
      if (!retriable) break;
    }
    if (!res) return fail('AI サーバーに接続できませんでした', 502, okOrigin);
    if (!data) return fail(`AI サーバーの応答が読めません（HTTP ${res.status}）`, 502, okOrigin);
    if (!res.ok) {
      const msg = res.status === 402 ? 'AI の残高が足りません（Modellix のコンソールでチャージしてください）' : (data?.error?.message || `HTTP ${res.status}`);
      return fail(msg, res.status, okOrigin);
    }
    const payload = { model: used };
    // 返すのは本文と使用量だけ
    return json({
      id: data.id,
      model: data.model || payload.model,
      choices: (data.choices || []).slice(0, 1).map((c) => ({ index: 0, message: { role: 'assistant', content: c.message?.content ?? '' }, finish_reason: c.finish_reason })),
      usage: data.usage || {},
    }, 200, okOrigin);
  },
};
