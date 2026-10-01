# AI 中継サーバー（Cloudflare Worker）

アプリの「アプリ内蔵AI」は、この Worker を通して Modellix の無料 LLM（`modellix-ai/free-llm`）を呼びます。
しくみは「英検3級パスポート」の `proxy/` と同じです。

- Modellix の API はブラウザから直接呼べない（CORS 非対応）ため、この Worker が中継して CORS をつけます
- **API キーは Cloudflare の Secret にだけ保存**し、アプリのコードや GitHub には入れません
- 使いすぎ・悪用の対策：許可したサイト（`ALLOWED_ORIGINS`）からだけ受け付ける／モデルと出力トークン数を固定／1回の文字数を制限／IP ごとに1分12回まで
- 文字だけを中継します（音声つきの呼び出しは通しません。AI発音診断・AI文字起こしは OpenRouter を使ってください）

## いまの構成：英検アプリの中継サーバーを共用

`js/config.js` の `baseUrl` は `https://eiken3-ai.sleipnir167.workers.dev/v1`（英検アプリと同じ Worker）です。
TripTalk を公開したサイトがその Worker の許可サイトに入っていれば、追加の作業なしで内蔵AIが動きます。

- TripTalk を `https://sleipnir167.github.io/…`（GitHub Pages）に置く → **そのまま動きます**（同じオリジンなので）
- それ以外の URL（Cloudflare Pages など）や、手元の `http://localhost:8765` で確認する → 英検アプリの `proxy/wrangler.toml` の `ALLOWED_ORIGINS` にその URL を足して `npx wrangler@latest deploy`

```toml
ALLOWED_ORIGINS = "https://sleipnir167.github.io,http://localhost:8766,http://localhost:8765"
```

許可されていないサイトから使うと、アプリに「このサイトからは内蔵AIを使えません」と表示されます。

## TripTalk 専用の中継サーバーにする（任意）

回数制限を英検アプリと分けたいときなどに。

```bash
cd proxy
npx wrangler@latest login
npx wrangler@latest deploy
npx wrangler@latest secret put MODELLIX_API_KEY --name triptalk-ai
```

最後に表示された `https://triptalk-ai.＜サブドメイン＞.workers.dev` の末尾に `/v1` をつけて、`js/config.js` の `baseUrl` に書きます。
設定項目（`ALLOWED_ORIGINS`・`ALLOWED_MODELS`・`RETRIES`・`MAX_TOKENS`）の意味は `wrangler.toml` のコメントを参照してください。
回数制限（`[[ratelimits]]`）で deploy がエラーになる場合は、その部分を削除してください（制限なしでも動きます）。
