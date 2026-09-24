// Debug helper: render t, optionally run a snippet, save a PNG.  node render/probe.mjs 10.2 out.png "js"
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
import { startServer } from './serve.mjs';
const [t, out, code] = process.argv.slice(2);
const server = await startServer(); const port = server.address().port;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(process.env.FLAGS || '').split(' ').filter(Boolean)] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
p.on('console', (m) => { if (!m.text().includes('404')) console.log('[page]', m.text()); });
await p.goto(`http://127.0.0.1:${port}/src/index.html?render=1`);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
await p.evaluate(([t, code]) => { window.__render(+t); if (code) eval(code); }, [t, code]);
await p.waitForTimeout(300);
fs.writeFileSync(out, await p.screenshot({ type: 'jpeg', quality: 80 }));
await b.close(); server.close();
