// Screen-space typography: the phase HUD (restyled for every era), progress
// dots, the "确认 ↵" moment, gate-pass tags, the STOP / CONFIRM / SHIP slams
// and the title card. Rebuilt as HTML each frame from t.
import { clamp, lerp, prog, ease, noise1, esc } from '../lib/util.js';
import { strokeD, ellipse, spline } from '../lib/sketch.js';
import { T, CONFIRMS, PHASES } from '../timeline.js';

let root;
export function initUI(el) { root = el; }

const HAND = `'LXGW WenKai', serif`, MONO = `'JetBrains Mono', monospace`, SANS = `'Space Grotesk', 'Noto Sans SC', sans-serif`, CN = `'Noto Sans SC', sans-serif`;
const div = (style, html = '') => `<div class="el" style="${style}">${html}</div>`;
const typed = (s, t, t0, cps) => [...s].slice(0, Math.max(0, Math.floor((t - t0) * cps))).join('');

function era(t) {
  if (t < T.p2) return 1;
  if (t < T.p3) return 2;
  if (t < T.p4) return 3;
  if (t < T.p5) return 4;
  return 5;
}

// --- phase HUD -------------------------------------------------------------------
function phaseLabel(t) {
  if (t < 8.25 || t >= T.black) return '';
  const e = era(t), [num, cn, en] = PHASES[e - 1];
  const t0 = [8.25, T.p2, T.p3, T.p4, T.p5][e - 1];
  const k = prog(t, t0, t0 + 0.28, ease.outExpo);
  const clip = `clip-path: inset(0 ${(1 - k) * 100}% 0 0);`;
  const boil = Math.floor(t * 12);
  if (e === 1) {
    const jx = noise1(boil, 1) * 0.8, jy = noise1(boil, 2) * 0.8;
    const d = strokeD(spline([[4, 10], [120, 4], [250, 12]], 8), { seed: 3, boil, amp: 1.2, width: 6, progress: prog(t, 8.5, 8.8) });
    return div(`left:${96 + jx}px;top:${64 + jy}px;${clip}font-family:${HAND};color:#37312B;`,
      `<div style="font-size:34px;letter-spacing:2px;opacity:.7">Phase 1</div><div style="font-size:64px;line-height:1.05">需求分析</div>` +
      `<svg width="280" height="24" style="display:block"><path d="${d}" fill="#F2A93B"/></svg>`);
  }
  if (e === 2) {
    return div(`left:96px;top:70px;${clip}color:#1F2A44;`,
      `<div style="font:500 22px ${MONO};letter-spacing:8px">PHASE 02 ─── ARCHITECTURE</div>` +
      `<div style="font:500 60px ${CN};letter-spacing:4px;margin-top:6px">架构设计</div>` +
      `<div style="height:1px;width:360px;background:#1F2A44;margin-top:14px;opacity:.5"></div>`);
  }
  if (e === 3 || e === 4) {
    const shadow = e === 4 ? 'text-shadow:0 10px 30px rgba(10,14,30,.35);' : '';
    return div(`left:90px;top:40px;${clip}color:#F4EFE6;${shadow}display:flex;align-items:flex-end;gap:22px;`,
      `<div style="font:700 150px/0.9 ${SANS};letter-spacing:-6px">${num}</div>` +
      `<div style="padding-bottom:12px"><div style="font:700 22px ${SANS};letter-spacing:6px;opacity:.75">${en}</div>` +
      `<div style="font:900 58px/1.1 ${CN}">${cn}${e === 4 ? ' <span style="font-weight:700;color:#FFB547">↻</span>' : ''}</div></div>`);
  }
  // e === 5: tech HUD
  const blink = Math.floor(t * 8) % 2 ? 1 : 0.55;
  return div(`left:96px;top:66px;${clip}`,
    `<div style="font:700 22px ${MONO};letter-spacing:6px;color:#FFB547">[ PHASE 05 ]<span style="color:#4FE3FF;opacity:${blink}"> ● LIVE</span></div>` +
    `<div style="font:700 60px ${CN};color:#F5F7FF;margin-top:8px;text-shadow:0 0 24px rgba(79,227,255,.45)">审查收尾</div>` +
    `<div style="font:500 20px ${MONO};letter-spacing:4px;color:#4FE3FF;margin-top:8px">REVIEW · ${typed('PASSED ✓', t, 16.6, 16)}</div>`);
}

function dots(t) {
  if (t < 8.3 || t >= T.black) return '';
  const e = era(t), filled = CONFIRMS.filter((c) => t >= c).length;
  const a = prog(t, 8.3, 8.6);
  const cx = 960, y = 1000, gap = 64;
  let svg = '';
  const boil = Math.floor(t * 12);
  for (let i = 0; i < 5; i++) {
    const x = cx + (i - 2) * gap, on = i < filled;
    const pop = on ? 1 + 0.5 * Math.exp(-(t - CONFIRMS[i]) * 10) : 1;
    if (i < 4) {
      const lc = e === 1 ? '#37312B' : e === 2 ? '#1F2A44' : e === 5 ? 'rgba(79,227,255,.5)' : 'rgba(244,239,230,.45)';
      svg += `<line x1="${x + 12}" y1="${y}" x2="${x + gap - 12}" y2="${y}" stroke="${lc}" stroke-width="${e === 1 ? 2 : 1.5}" ${e === 1 ? 'stroke-dasharray="4 5"' : ''}/>`;
    }
    const r = 9 * pop;
    if (e === 1) {
      svg += `<path d="${strokeD(ellipse(x, y, r, r, i + 3, 0, Math.PI * 2.1, 30), { seed: i + 9, boil, amp: 0.8, width: 2.4 })}" fill="#37312B"/>`;
      if (on) svg += `<circle cx="${x}" cy="${y}" r="${r - 3}" fill="#C8412E"/>`;
    } else if (e === 2) {
      svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${on ? '#1F2A44' : 'none'}" stroke="#1F2A44" stroke-width="2"/>`;
    } else if (e === 5) {
      svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${on ? '#FFB547' : 'none'}" stroke="${on ? '#FFB547' : '#4FE3FF'}" stroke-width="2" style="filter:drop-shadow(0 0 8px ${on ? '#FFB547' : '#4FE3FF'})"/>`;
    } else {
      svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${on ? '#FF5A36' : 'rgba(244,239,230,.25)'}" ${e === 4 ? 'style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))"' : ''}/>`;
    }
  }
  return `<svg class="el" width="1920" height="1080" style="left:0;top:0;opacity:${a}">${svg}</svg>`;
}

// --- Act V: the human confirms ---------------------------------------------------------
function confirmPrompt(t) {
  if (t < T.black || t >= T.drop) return '';
  const collapse = prog(t, 18.8, 18.98, ease.inExpo);
  const hit = t >= T.enter ? Math.exp(-(t - T.enter) * 14) : 0;
  const sy = 1 - collapse * 0.985, sx = 1 - prog(t, 18.9, 19.0, ease.inExpo) * 0.99;
  const cursor = Math.floor(t * 4) % 2 === 0 && t < T.enter ? '<span style="background:#E8ECF4;color:#E8ECF4">_</span>' : '';
  const l1 = typed('✓ Phase 5 · 审查收尾 已完成', t, 18.02, 70);
  const l2 = typed('是否确认交付？（确认 / 修改）', t, 18.12, 70);
  const l3 = typed('确认', t, 18.32, 9);
  return div(`left:0;top:0;width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;transform:scale(${sx},${sy});filter:brightness(${1 + hit * 2 + collapse * 3})`,
    `<div style="font:500 40px ${MONO};line-height:1.8;color:#8A93A6">` +
    `<div style="color:#5CE0A0">${esc(l1)}</div><div style="color:#C9D1E0">${esc(l2)}</div>` +
    `<div style="color:#FFFFFF;font-size:64px;margin-top:18px"><span style="color:#FFB547">❯</span> ${esc(l3)}${cursor}${t >= T.enter ? ' <span style="color:#FFB547">↵</span>' : ''}</div></div>`);
}

// --- Act VI: gate passes + slams ---------------------------------------------------------
function gateTags(t) {
  const pass = [19.5, 20.0, 20.5, 21.0, 21.5];
  let out = '';
  pass.forEach((p, i) => {
    if (t < p - 0.02 || t > p + 0.5) return;
    const k = prog(t, p - 0.02, p + 0.08, ease.outExpo), fade = 1 - prog(t, p + 0.36, p + 0.5);
    const [num, cn, en] = PHASES[i];
    out += div(`left:${140 - (1 - k) * 80}px;top:790px;opacity:${fade}`,
      `<div style="font:700 150px/0.9 ${SANS};color:#FFFFFF;letter-spacing:-4px;text-shadow:0 0 40px rgba(255,181,71,.6)">${num}</div>` +
      `<div style="font:700 44px ${CN};color:#FFB547;margin-top:8px">${cn} <span style="color:#3DFFB5">✓</span></div>` +
      `<div style="font:500 18px ${MONO};letter-spacing:6px;color:#8A93A6;margin-top:6px">GATE ${num} · ${en} · CONFIRMED</div>`);
  });
  return out;
}

const WORDS = [[T.words, 'STOP.', '停下'], [T.words + 1, 'CONFIRM.', '确认'], [T.words + 2, 'SHIP.', '交付']];
function slams(t) {
  if (t < T.words || t >= T.title) return '';
  if (t >= T.montage) {
    // during the flash-cut montage the whole line locks in
    const i = Math.floor((t - T.montage) / 0.125);
    return div(`left:0;top:0;width:1920px;height:1080px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(transparent 28%, rgba(4,6,12,.72) 38%, rgba(4,6,12,.72) 66%, transparent 76%)`,
      `<div style="font:700 150px/1 ${SANS};letter-spacing:-4px;color:#FFFFFF;text-shadow:0 6px 40px rgba(0,0,0,.6)${i % 2 ? ';-webkit-text-stroke:3px #FFFFFF;color:transparent' : ''}">STOP. CONFIRM. SHIP.</div>` +
      `<div style="font:700 44px ${CN};letter-spacing:22px;color:#FFB547;margin-top:22px;text-shadow:0 4px 20px rgba(0,0,0,.7)">停下 · 确认 · 交付</div>`);
  }
  const idx = WORDS.findLastIndex(([w]) => t >= w);
  const [w0, en, cn] = WORDS[idx];
  const dt = t - w0;
  const k = ease.outExpo(clamp(dt / 0.14));
  const sc = lerp(1.5, 1, k) + dt * 0.03;
  const blur = (1 - k) * 14;
  const split = Math.exp(-dt * 12) * 14;
  const exit = prog(t, w0 + 0.9, w0 + 1.0, ease.inCubic);
  return div(`left:0;top:0;width:1920px;height:1080px;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:${1 - exit}`,
    `<div style="font:700 300px/1 ${SANS};letter-spacing:-10px;color:#FFFFFF;transform:scale(${sc});filter:blur(${blur}px);` +
    `text-shadow:${split}px 0 0 rgba(255,60,80,.8), ${-split}px 0 0 rgba(60,220,255,.8), 0 10px 60px rgba(0,0,0,.55)">${en}</div>` +
    `<div style="font:900 60px ${CN};letter-spacing:40px;padding-left:40px;color:#FFB547;margin-top:10px;opacity:${prog(dt, 0.08, 0.25)};text-shadow:0 4px 24px rgba(0,0,0,.7)">${cn}</div>`);
}

// --- title ------------------------------------------------------------------------------------
function title(t) {
  if (t < T.title) return '';
  const title = 'AI Phased Development Protocol';
  let letters = '';
  [...title].forEach((ch, i) => {
    const k = ease.outExpo(prog(t, T.title + 0.05 + i * 0.012, T.title + 0.55 + i * 0.012));
    letters += `<span style="display:inline-block;transform:translateY(${(1 - k) * 40}px);opacity:${k};filter:blur(${(1 - k) * 8}px)">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`;
  });
  const boil = Math.floor(t * 12);
  const ul = strokeD(spline([[0, 16], [260, 8], [560, 14], [880, 6]], 12), { seed: 11, boil, amp: 1.4, width: 7, progress: prog(t, 27.45, 27.85, ease.inOutQuad), pressure: 0.5 });
  const gk = prog(t, T.title, T.title + 0.4, ease.outCubic);
  const gate = strokeD([[0, 70], [0, 0], [56, 0], [56, 70]], { seed: 4, boil, amp: 0.9, width: 5, progress: gk, taper: 0.05 });
  const gateIn = strokeD([[10, 70], [10, 10], [46, 10], [46, 70]], { seed: 5, boil, amp: 0.9, width: 3, progress: prog(t, T.title + 0.15, T.title + 0.5), taper: 0.05 });
  const fadeOut = prog(t, 29.45, 29.95, ease.inQuad);
  return div(`left:0;top:0;width:1920px;height:1080px;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:${1 - fadeOut}`,
    `<svg width="60" height="74" style="margin-bottom:26px;overflow:visible;filter:drop-shadow(0 0 12px rgba(255,181,71,.6))"><path d="${gate}" fill="#FFB547"/><path d="${gateIn}" fill="#FFB547" opacity=".7"/></svg>` +
    `<div style="font:700 104px/1 ${SANS};letter-spacing:-3px;color:#FFFFFF;white-space:nowrap">${letters}</div>` +
    `<svg width="900" height="30" style="margin-top:12px"><path d="${ul}" fill="#FFB547"/></svg>` +
    `<div style="font:500 46px ${CN};color:#E8ECF4;margin-top:30px;letter-spacing:4px;opacity:${prog(t, 27.7, 28.05)};transform:translateY(${(1 - prog(t, 27.7, 28.1, ease.outCubic)) * 14}px)">让 AI 每一步，都等你点头。</div>` +
    `<div style="font:500 24px ${MONO};color:#8A93A6;margin-top:34px;letter-spacing:2px;opacity:${prog(t, 28.1, 28.45)}">github.com/AIMFllys/ai-phased-development-protocol</div>` +
    `<div style="font:500 18px ${MONO};color:#5B6477;margin-top:14px;letter-spacing:6px;opacity:${prog(t, 28.3, 28.7)}">PHASE-GATE SKILL · CURSOR · WINDSURF · ANTIGRAVITY</div>`);
}

export function renderUI(st, t) {
  if (!root) return;
  // st = scene time (montage-mapped), t = real time
  const inMontage = t >= T.montage && t < T.title;
  root.innerHTML = (inMontage ? '' : phaseLabel(st) + dots(st)) + confirmPrompt(t) + (inMontage ? '' : gateTags(t)) + slams(t) + title(t);
}
