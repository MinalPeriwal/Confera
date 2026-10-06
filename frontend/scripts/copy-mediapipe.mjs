// Copies the MediaPipe WASM runtime into /public so background blur is served from our own origin
// (no third-party CDN at runtime). Runs after `npm install`; the files are git-ignored.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const dest = path.join(root, 'public', 'mediapipe', 'wasm');

if (!fs.existsSync(src)) {
  console.warn('[copy-mediapipe] @mediapipe/tasks-vision not installed yet; skipping');
  process.exit(0);
}
fs.mkdirSync(dest, { recursive: true });
// the *_module_* variants are only for module workers, which we do not use
for (const file of fs.readdirSync(src)) {
  if (file.includes('_module_')) continue;
  fs.copyFileSync(path.join(src, file), path.join(dest, file));
}
console.log('[copy-mediapipe] wasm runtime copied to public/mediapipe/wasm');
