// Frame-exact renderer: drives window.__render(t) in headless Chromium, captures
// every frame, encodes with ffmpeg (libx264), then muxes the score.
//
//   node render/render.mjs                      full film -> out/promo.mp4
//   node render/render.mjs --from 10 --to 18    a slice
//   node render/render.mjs --stills 0,4.2,8.1   PNG stills -> out/stills/
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
// Prefer the project's playwright; fall back to a global install (cloud container).
const { chromium } = (() => { try { return require('playwright'); } catch { return require('/opt/node22/lib/node_modules/playwright'); } })();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
// ffmpeg with libx264: $FFMPEG, else the one bundled by `pip install imageio-ffmpeg`, else ffmpeg on PATH.
const FFMPEG = process.env.FFMPEG || (() => {
  for (const py of ['python3', 'python']) {
    try { return execFileSync(py, ['-c', 'import imageio_ffmpeg as f;print(f.get_ffmpeg_exe())']).toString().trim(); } catch { /* next */ }
  }
  return 'ffmpeg';
})();

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const FPS = Number(args.fps || 60);
const DURATION = 30;
const W = 1920, H = 1080;
const WORKERS = Number(args.workers || 2);
const DSF = Number(args.scale || 1); // 0.5 = fast 960x540 preview

async function openPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/src/index.html?render=1&scale=${DSF}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  page.cdp = await page.context().newCDPSession(page);
  return page;
}

async function shot(page, t, opts = {}) {
  // Render, let two frames pass, then re-capture until two captures agree so a
  // frame whose raster tiles were still in flight never reaches the video.
  await page.evaluate((tt) => { window.__render(tt); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
  const grab = async () => (await page.cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, ...opts })).data;
  let prev = await grab();
  for (let i = 0; i < 6; i++) {
    const cur = await grab();
    if (cur === prev) break;
    prev = cur;
  }
  return Buffer.from(prev, 'base64');
}

// --gpu: use the local graphics card (much faster). Default: SwiftShader, works anywhere.
const GL_FLAGS = args.gpu ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const launch = () => chromium.launch({
  headless: true,
  args: [...GL_FLAGS,
    '--disable-web-security', '--run-all-compositor-stages-before-draw', '--disable-checker-imaging', '--font-render-hinting=none', '--force-color-profile=srgb'],
});

async function renderStills(port, times) {
  fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true });
  const browser = await launch();
  const page = await openPage(browser, port);
  for (const t of times) {
    const t0 = Date.now();
    const file = path.join(OUT, 'stills', `t${t.toFixed(2).padStart(5, '0')}.png`);
    fs.writeFileSync(file, await shot(page, t));
    console.log(`still ${t}s -> ${path.relative(ROOT, file)} (${Date.now() - t0}ms)`);
  }
  await browser.close();
}

async function renderSegment(port, f0, f1, file, tag) {
  const browser = await launch();
  const page = await openPage(browser, port);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    const buf = await shot(page, f / FPS);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - f0) % 60 === 0) {
      const done = f - f0 + 1, rate = (Date.now() - t0) / done;
      console.log(`[${tag}] frame ${f}/${f1 - 1}  ${(rate).toFixed(0)}ms/f  eta ${((f1 - f) * rate / 1000).toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
}

const server = await startServer();
const port = server.address().port;

if (args.stills) {
  await renderStills(port, String(args.stills).split(',').map(Number));
} else {
  const from = Number(args.from || 0), to = Number(args.to || DURATION);
  const F0 = Math.round(from * FPS), F1 = Math.round(to * FPS);
  const segDir = path.join(OUT, 'segments');
  fs.rmSync(segDir, { recursive: true, force: true });
  fs.mkdirSync(segDir, { recursive: true });
  const per = Math.ceil((F1 - F0) / WORKERS);
  const jobs = [];
  for (let i = 0; i < WORKERS; i++) {
    const a = F0 + i * per, b = Math.min(F1, a + per);
    if (a < b) jobs.push({ a, b, file: path.join(segDir, `seg${i}.mp4`), tag: `w${i}` });
  }
  console.log(`rendering ${F1 - F0} frames with ${jobs.length} workers`);
  await Promise.all(jobs.map((j) => renderSegment(port, j.a, j.b, j.file, j.tag)));
  const list = path.join(segDir, 'list.txt');
  fs.writeFileSync(list, jobs.map((j) => `file '${j.file}'`).join('\n'));
  const name = args.out || (from === 0 && to === DURATION ? 'promo.mp4' : `slice_${from}-${to}.mp4`);
  const final = path.join(OUT, name);
  const music = path.join(ROOT, 'audio', 'score.wav');
  const audioArgs = fs.existsSync(music) && !args.mute
    ? ['-ss', String(from), '-t', String(to - from), '-i', music, '-c:a', 'aac', '-b:a', '256k', '-shortest'] : [];
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...audioArgs,
    '-c:v', 'copy', '-movflags', '+faststart', final], { stdio: 'inherit' });
  console.log('wrote', path.relative(ROOT, final));
}
server.close();
