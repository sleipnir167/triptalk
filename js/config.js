// アプリに組み込んだ AI（利用者は設定しなくても使える）
//  API キーはここには書かない。Cloudflare Worker（proxy/）が Modellix のキーを持って中継する
//  baseUrl：Worker の URL ＋ /v1（空にすると内蔵AIは使われない）
//  いまは「英検3級パスポート」と同じ中継サーバーを共用している。
//  中継サーバーは許可したサイト（ALLOWED_ORIGINS）からの呼び出しだけを受け付けるので、
//  TripTalk を公開したサイトの URL をその一覧に入れておくこと（proxy/README.md 参照）
export const BUILTIN_AI = {
  name: 'アプリ内蔵AI（Modellix 無料）',
  baseUrl: 'https://eiken3-ai.sleipnir167.workers.dev/v1',
  model: 'modellix-ai/free-llm',
  // 無料モデルは中で考える工程があるため、返答までの目安を画面に出す
  waitHint: '10〜20秒ほど',
};
