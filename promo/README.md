# Phase-Gate 宣传片 · Promo Film

30 秒 / 1920×1080 / 60fps。从手绘到写实的「升维」宣传片：一道 Gate 贯穿全片，每确认一次，画面就升一个维度。

制作方法、节奏与卡点的把控、踩过的坑，见 [MAKING-OF.md](MAKING-OF.md)。

## 分镜（120 BPM，1 拍 = 0.5s）

| 时间 | 段落 | 画面 | 声音 |
|---|---|---|---|
| 0–4s | 温馨 | 纸面铅笔一笔笔画出台灯、电脑、咖啡；水彩晕染；`> 帮我做一个登录页` | 毛毡钢琴 + 铅笔沙沙声 |
| 4–8s | 失控 | AI 狂吐代码飞满纸面，红笔批注，4 个卡点快切特写，乱涂淹没画面 | 断奏加速 + 故障音 + 升调 |
| 8–10s | Phase 1 · 手绘 | 手绘 GATE 砸下（反色冲击帧），混乱冻结坠落；握手问句；勾选「确认」抬杆 | 重击 → 留白 → 确认铃 |
| 10–12s | Phase 2 · 矢量 | 抖动线条「啪」地拉直成蓝图线稿，架构树按拍生长 | 底鼓 + 拨弦琶音 |
| 12–14s | Phase 3 · 扁平 | 圆形转场进入藏青色瑞士海报风，任务卡按拍滑入 | + 拍手 |
| 14–16s | Phase 4 · 等距黏土 | 扁平画面真的「倾斜」成 3D 等距，厚度长出来，令牌逐步执行 | + 踩镲 |
| 16–18s | Phase 5 · 写实 | 希区柯克变焦（正交 → 透视），金属 / 玻璃 / 霓虹 / 镜面地板，推进传送门 | 超级锯齿波 + 军鼓滚奏 |
| 18–19s | 静默 | 黑屏，终端里人类输入「确认 ↵」 | 只剩按键声 |
| 19–22s | DROP | 穿越 5 道 Gate，每拍一道 | 全编制，开场钢琴动机变成主旋律 |
| 22–26s | 揭示 | 拉远看见整条状态机；STOP. / CONFIRM. / SHIP. 砸字 | 三记重击 |
| 26–27s | 闪回 | 8 个 1/16 音符闪切回顾每个时代 | 切片卡顿 |
| 27–30s | 片尾 | 标题 + 手绘下划线（回到温暖）| 钢琴动机回归 |

## 使用

需要 Node 18+ 和 Python 3。

```bash
cd promo
npm install
npx playwright install chromium            # 下载渲染用的浏览器
pip install numpy scipy imageio-ffmpeg     # 配乐合成 + 带 libx264 的 ffmpeg

npm run music                              # 生成 audio/score.wav
npm run preview                            # 浏览器打开 http://127.0.0.1:8080/src/index.html，可拖动时间轴、播放
npm run render                             # 渲染成片 -> out/promo.mp4（软件渲染，任何机器都能跑，较慢）
npm run render:gpu                         # 用本机显卡渲染，快很多（推荐在自己电脑上用）
node render/render.mjs --from 10 --to 18   # 只渲染一段
node render/render.mjs --stills 3,9.5,17   # 导出静帧 -> out/stills/
```

渲染用 Playwright 驱动 Chromium，每一帧都是 `window.__render(t)` 的纯函数，所以卡点精确到帧。

## 换成你自己的音乐

配乐是 `audio/make_music.py` 按 120 BPM 合成的，所有音效都和画面事件对齐。换成真实曲目的话：选一首 120 BPM 的曲子，让 drop 落在第 19 秒，存为 `audio/score.wav` 后重新 `npm run render` 即可。如果曲子速度不同，改 `src/timeline.js` 里的时间点。

## 结构

```
src/timeline.js        节拍网格：所有场景都从这里取时间点
src/scenes/paper.js    2D 纸面世界（SVG）：手绘引擎、混乱、Gate、蓝图
src/scenes/world.js    3D 世界（Three.js）：扁平 → 黏土 → 写实，隧道与揭示
src/scenes/ui.js       文字层：每个时代换一套风格的 HUD、确认提示、砸字、标题
src/scenes/fx.js       颗粒、遮幅、冲击帧
src/lib/sketch.js      手绘笔触：压感轮廓、抖动、12fps「线条沸腾」
render/render.mjs      逐帧截图 → ffmpeg（x264）+ 混入配乐
audio/make_music.py    配乐与音效合成
```
