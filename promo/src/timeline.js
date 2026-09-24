// The film's beat grid (120 BPM, one beat = 0.5s). Every scene keys off these.
export const T = {
  chaos: 4.0,     // AI starts dumping code
  slam: 8.0,      // the gate slams down (Phase 1, sketch)
  confirm1: 9.5,  // first "确认" tick, barrier lifts
  p2: 10.0,       // sketch snaps into vector (架构设计)
  p3: 12.0,       // iris wipe into flat colour (任务拆解)
  p4: 14.0,       // flat tilts into isometric clay (编码执行)
  p5: 16.0,       // vertigo into realistic 3D (审查收尾)
  black: 18.0,    // silence: "确认交付？"
  enter: 18.75,   // the human presses ↵
  drop: 19.0,     // the drop: fly through the gates
  reveal: 22.0,   // pull back to reveal the whole state machine
  words: 23.0,    // STOP. CONFIRM. SHIP.
  montage: 26.0,  // flash-cut recap of every era
  title: 27.0,    // title card
  end: 30.0,
};

/** Each phase closes with a confirm hit on its last beat. */
export const CONFIRMS = [9.5, 11.5, 13.5, 15.5, 17.5];
export const PHASES = [
  ['01', '需求分析', 'REQUIREMENTS'],
  ['02', '架构设计', 'ARCHITECTURE'],
  ['03', '任务拆解', 'BREAKDOWN'],
  ['04', '编码执行', 'EXECUTE'],
  ['05', '审查收尾', 'REVIEW'],
];

/** 26–27s: eight 1/16-note flash cuts back through every era of the film. */
export const MONTAGE = [2.6, 6.55, 9.2, 11.4, 13.4, 15.35, 17.2, 24.4];
export function sceneTime(t) {
  if (t >= T.montage && t < T.title) {
    const i = Math.min(7, Math.floor((t - T.montage) / 0.125));
    return MONTAGE[i] + ((t - T.montage) % 0.125);
  }
  return t;
}
