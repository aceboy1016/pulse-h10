// PULSE — 強度の参考イメージ「浜辺のおいかけっこ」
// オリジナルのキャラクター（キャップの男の子が、麦わら帽子の女の子を追いかける）。
// renderBeach(svgEl, key) は dogs.js の renderDog と同じ呼び方：key = 'stand' | 'walk' | 'bike' | 'run' | 'sprint' | ''
// 図形はすべて固定の座標から作り、外部から受け取った文字列は使わない。インラインstyleも使わない（CSP対応）。

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;
const GROUND = 72;

// 強度ごとの動き：周期(秒)・脚の振り(度)・前傾(度)・上下動・景色の流れる速さ
const GAITS = {
  stand:  { period: 1.6,  leg: 0,  arm: 0,  lean: 0,  bounce: 0,   scroll: 0,  gap: 40 },
  walk:   { period: 1.0,  leg: 24, arm: 22, lean: 3,  bounce: 0.6, scroll: 7,  gap: 42 },
  bike:   { period: 0.68, leg: 36, arm: 34, lean: 7,  bounce: 1.3, scroll: 14, gap: 41 },
  run:    { period: 0.48, leg: 50, arm: 48, lean: 11, bounce: 2.0, scroll: 24, gap: 40 },
  sprint: { period: 0.34, leg: 64, arm: 60, lean: 16, bounce: 2.6, scroll: 38, gap: 38 }
};
const NUM_KEYS = ['period', 'leg', 'arm', 'lean', 'bounce', 'scroll', 'gap'];

const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const instances = new WeakMap();

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// 横に繰り返す波線（周期24）
function wavePath(y, amp) {
  let d = `M-48 ${y} Q-42 ${y - amp} -36 ${y}`;
  for (let x = -24; x <= 168; x += 12) d += ` T${x} ${y}`;
  return d;
}

// 手足：付け根で回転する線
function limb(parent, x, y, len, cls) {
  const g = el('g', { transform: `translate(${x} ${y})` }, parent);
  const r = el('g', {}, g);
  el('line', { x1: 0, y1: 0, x2: 0, y2: len, class: cls }, r);
  return r;
}

function buildBoy(parent) {
  const root = el('g', { class: 'bc-boy' }, parent);
  const body = el('g', {}, root);
  const parts = {};
  parts.farArm = limb(body, 0, -17, 7, 'bc-skin-far');
  parts.farLeg = limb(body, 0, -9, 9, 'bc-skin-far');
  parts.nearLeg = limb(body, 0, -9, 9, 'bc-skin');
  el('rect', { x: -5, y: -13.5, width: 10, height: 5.5, rx: 2, class: 'bc-trunks' }, body);
  el('rect', { x: -4.5, y: -19.5, width: 9, height: 7.5, rx: 2.2, class: 'bc-shirt' }, body);
  el('path', { d: 'M-4.2 -17 H4.2 M-4.2 -14.6 H4.2', class: 'bc-stripe' }, body);
  const head = el('g', { transform: 'translate(1 -25)' }, body);
  el('circle', { cx: 0, cy: 0, r: 6.5, class: 'bc-skin-fill' }, head);
  el('path', { d: 'M-6.6 -0.8 A6.6 6.6 0 0 1 6.4 -1.6 L6.6 -0.6 L-6.6 0.2 Z', class: 'bc-cap' }, head);
  el('path', { d: 'M4.5 -1.4 L11.2 -0.6 Q11.4 0.6 10 0.6 L4.6 0.2 Z', class: 'bc-cap' }, head);
  el('ellipse', { cx: 3.4, cy: 1.6, rx: 0.9, ry: 1.2, class: 'bc-ink' }, head);
  el('path', { d: 'M2.2 4 Q4.3 6.2 6 3.8', class: 'bc-mouth' }, head);
  el('circle', { cx: 0.6, cy: 3.6, r: 1.3, class: 'bc-blush' }, head);
  parts.nearArm = limb(body, 0, -17, 7, 'bc-skin');
  parts.speed = el('path', { d: 'M-12 -22 H-7 M-14 -16 H-8 M-12 -10 H-7', class: 'bc-speed' }, root);
  return { root, body, parts };
}

function buildGirl(parent) {
  const root = el('g', { class: 'bc-girl' }, parent);
  const body = el('g', {}, root);
  const parts = {};
  parts.hair = el('g', { transform: 'translate(-3.5 -27)' }, body);
  parts.hairInner = el('path', { d: 'M0 0 Q-7 1 -9 7 Q-6 6 -4.5 8 Q-3 4 1 3 Z', class: 'bc-hair' }, parts.hair);
  parts.farArm = limb(body, 0, -17, 6.8, 'bc-skin-far');
  parts.farLeg = limb(body, 0, -9.5, 9.5, 'bc-skin-far');
  parts.nearLeg = limb(body, 0, -9.5, 9.5, 'bc-skin');
  el('path', { d: 'M-3.6 -19.5 Q0 -20.5 3.6 -19.5 L6.4 -8.5 Q0 -6.8 -6.4 -8.5 Z', class: 'bc-dress' }, body);
  el('path', { d: 'M-4.2 -15.2 Q0 -14.4 4.2 -15.2', class: 'bc-sash' }, body);
  const head = el('g', { transform: 'translate(1 -25)' }, body);
  el('circle', { cx: 0, cy: 0, r: 6.2, class: 'bc-skin-fill' }, head);
  el('path', { d: 'M-6.3 0.6 Q-6.6 -6.4 0 -6.4 Q5.6 -6.2 6.2 -1 Q2 -3.4 -2.4 -2 Q-4.4 -1 -6.3 0.6 Z', class: 'bc-hair' }, head);
  el('ellipse', { cx: 3.2, cy: 1.2, rx: 0.85, ry: 1.15, class: 'bc-ink' }, head);
  el('path', { d: 'M2.4 3.8 Q3.8 5 5 3.6', class: 'bc-mouth' }, head);
  el('circle', { cx: 0.8, cy: 3.2, r: 1.2, class: 'bc-blush' }, head);
  parts.hat = el('g', { transform: 'translate(0.5 -4.6)' }, head);
  el('ellipse', { cx: 0, cy: 0, rx: 9.8, ry: 2.1, class: 'bc-straw' }, parts.hat);
  el('path', { d: 'M-5 0 Q-5 -5.6 0 -5.8 Q5 -5.6 5 0 Z', class: 'bc-straw' }, parts.hat);
  el('path', { d: 'M-5 -1.2 Q0 -0.2 5 -1.2', class: 'bc-ribbon' }, parts.hat);
  parts.nearArm = limb(body, 0, -17, 6.8, 'bc-skin');
  parts.speed = el('path', { d: 'M-13 -21 H-8 M-15 -15 H-9 M-13 -9 H-8', class: 'bc-speed' }, root);
  return { root, body, parts };
}

function build(svg) {
  svg.setAttribute('viewBox', '0 0 120 80');
  svg.classList.add('beach-svg');
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const n = {};
  el('circle', { cx: 104, cy: 15, r: 5, class: 'bc-sun' }, svg);
  el('line', { x1: 0, y1: 44, x2: 120, y2: 44, class: 'bc-horizon' }, svg);
  n.farWave = el('path', { d: wavePath(50, 1.2), class: 'bc-wave-far' }, svg);
  n.nearWave = el('path', { d: wavePath(59, 1.8), class: 'bc-wave-near' }, svg);
  el('line', { x1: 0, y1: GROUND + 0.6, x2: 120, y2: GROUND + 0.6, class: 'bc-sand' }, svg);
  n.dots = el('path', { d: 'M-48 76.5 h0.01' + Array.from({ length: 18 }, (_, i) => ` M${-36 + i * 12} ${i % 2 ? 77.5 : 76.2} h0.01`).join(''), class: 'bc-sand-dots' }, svg);
  n.girl = buildGirl(svg);
  n.boy = buildBoy(svg);
  return n;
}

const rot = (g, deg) => g.setAttribute('transform', `rotate(${deg.toFixed(2)})`);

function drawRunner(c, p, phase, t, opts) {
  const s = Math.sin(phase * TAU);
  const still = p.leg < 1;
  rot(c.parts.nearLeg, -p.leg * s);
  rot(c.parts.farLeg, p.leg * s);
  if (opts.reach && !still) rot(c.parts.nearArm, -95 + 10 * Math.sin(phase * TAU * 2)); // 男の子は前へ手を伸ばす
  else if (opts.holdHat && p.leg > 55) rot(c.parts.nearArm, -158);                       // 女の子は全力のとき帽子をおさえる
  else if (opts.wave && still) rot(c.parts.nearArm, -118 + 14 * Math.sin(t * TAU / 0.9)); // 立ち止まって手をふる
  else rot(c.parts.nearArm, p.arm * s);
  rot(c.parts.farArm, still ? 8 : -p.arm * s);
  const bob = still ? 0.4 * Math.sin(t * TAU / p.period) : -p.bounce * Math.abs(Math.sin(phase * TAU));
  c.body.setAttribute('transform', `translate(0 ${bob.toFixed(2)}) rotate(${p.lean.toFixed(2)})`);
  c.root.setAttribute('transform', `translate(${opts.x.toFixed(2)} ${GROUND}) scale(1.25)`);
  c.parts.speed.setAttribute('class', p.leg > 55 ? 'bc-speed on' : 'bc-speed');
  if (c.parts.hair) rot(c.parts.hairInner, -6 - p.lean * 1.2 + (still ? 0 : 6 * Math.sin(phase * TAU * 2)));
}

function drawFrame(inst, t) {
  const p = inst.p, n = inst.nodes;
  const farX = -((inst.scroll * 0.35) % 24), nearX = -((inst.scroll * 0.7) % 24), sandX = -(inst.scroll % 24);
  n.farWave.setAttribute('transform', `translate(${farX.toFixed(2)} 0)`);
  n.nearWave.setAttribute('transform', `translate(${nearX.toFixed(2)} ${(0.6 * Math.sin(t * TAU / 3)).toFixed(2)})`);
  n.dots.setAttribute('transform', `translate(${sandX.toFixed(2)} 0)`);
  // 追いつきそうで追いつかない距離の揺れ
  const sway = p.leg < 1 ? 0 : 3 * Math.sin(t * 0.9);
  const girlX = 84 + (p.leg < 1 ? -2 : 1.5 * Math.sin(t * 0.7));
  drawRunner(n.girl, p, inst.phase, t, { x: girlX, holdHat: true });
  drawRunner(n.boy, p, (inst.phase + 0.5) % 1, t, { x: girlX - p.gap + sway, reach: p.leg > 30, wave: true });
}

function stop(inst) {
  if (inst.raf) cancelAnimationFrame(inst.raf);
  inst.raf = 0;
}

function loop(inst) {
  if (inst.raf || (reduced && reduced.matches) || document.hidden || !inst.visible) return;
  inst.last = performance.now();
  const tick = (now) => {
    inst.raf = 0;
    if (!inst.svg.isConnected) { destroy(inst.svg); return; }
    const dt = Math.min(0.1, (now - inst.last) / 1000);
    inst.last = now;
    inst.t += dt;
    const target = GAITS[inst.key];
    const k = 1 - Math.exp(-dt / 0.25); // 強度が変わったら0.25秒ほどでなめらかに移る
    for (const key of NUM_KEYS) inst.p[key] += (target[key] - inst.p[key]) * k;
    inst.phase = (inst.phase + dt / inst.p.period) % 1;
    inst.scroll += inst.p.scroll * dt;
    drawFrame(inst, inst.t);
    if (!document.hidden && inst.visible && !(reduced && reduced.matches)) inst.raf = requestAnimationFrame(tick);
  };
  inst.raf = requestAnimationFrame(tick);
}

function destroy(svg) {
  const inst = instances.get(svg);
  if (!inst) return;
  stop(inst);
  if (inst.io) inst.io.disconnect();
  document.removeEventListener('visibilitychange', inst.onVis);
  if (reduced) reduced.removeEventListener('change', inst.onMotion);
  instances.delete(svg);
}

export function renderBeach(svg, key) {
  if (!(svg instanceof SVGElement)) return;
  key = typeof key === 'string' && GAITS[key] ? key : '';
  if (!key) {
    destroy(svg);
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.classList.remove('beach-svg');
    svg.removeAttribute('data-gait');
    return;
  }
  let inst = instances.get(svg);
  if (!inst) {
    inst = { svg, nodes: build(svg), key, p: { ...GAITS[key] }, phase: 0.2, t: 0, scroll: 0, raf: 0, last: 0, visible: true };
    inst.onVis = () => (document.hidden ? stop(inst) : loop(inst));
    inst.onMotion = () => { if (reduced.matches) { stop(inst); drawStatic(inst); } else loop(inst); };
    document.addEventListener('visibilitychange', inst.onVis);
    if (reduced) reduced.addEventListener('change', inst.onMotion);
    if (typeof IntersectionObserver === 'function') {
      inst.io = new IntersectionObserver((es) => {
        inst.visible = es.some((e) => e.isIntersecting);
        inst.visible ? loop(inst) : stop(inst);
      });
      inst.io.observe(svg);
    }
    instances.set(svg, inst);
  }
  inst.key = key;
  svg.setAttribute('data-gait', key);
  if (reduced && reduced.matches) { stop(inst); drawStatic(inst); return; }
  if (!inst.raf) drawFrame(inst, inst.t);
  loop(inst);
}

// 動きを減らす設定：その強度の代表的な一コマだけを描く
function drawStatic(inst) {
  inst.p = { ...GAITS[inst.key] };
  inst.phase = 0.25;
  drawFrame(inst, 0);
}
