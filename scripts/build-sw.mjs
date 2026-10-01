// sw.js のプリキャッシュ一覧とバージョンを自動生成します。
// ファイルを変更したら `node scripts/build-sw.mjs` を実行してください（ユーザー端末に更新通知が出ます）。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const include = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons'];

function walk(p) {
  const st = statSync(p);
  if (st.isFile()) return [p];
  return readdirSync(p).flatMap((f) => walk(join(p, f)));
}

const files = include.flatMap((f) => walk(join(root, f))).filter((f) => !/\.DS_Store$/.test(f)).sort();
const hash = createHash('sha256');
files.forEach((f) => hash.update(readFileSync(f)));
const version = hash.digest('hex').slice(0, 10);
const assets = ['./', ...files.map((f) => './' + relative(root, f).split('\\').join('/'))];

const tpl = readFileSync(join(root, 'scripts/sw.template.js'), 'utf8');
const out = tpl
  .replace('__VERSION__', version)
  .replace('__ASSETS__', JSON.stringify(assets, null, 2));
writeFileSync(join(root, 'sw.js'), out);
console.log(`sw.js generated: version ${version}, ${assets.length} assets`);
