/**
 * PULSE — PENGUIN ICE ADVENTURE ENGINE (penguin.js)
 * Theme #7: Cute Plump Penguin on Ice
 *
 * ViewBox: 0 0 120 80 (Ice ground at y = 74)
 * Stages:
 *   stand  (~56%, 1.60s): Plump penguin standing on ice, flapping flippers gently
 *   walk   (57-63%, 1.20s): Cute side-to-side / bouncy waddle with orange webbed feet
 *   bike   (64-76%, 0.70s): Gliding smoothly on a red winter sled / ice skates with scarf fluttering
 *   run    (77-95%, 0.45s): Leaning forward, flippers spread wide behind, frantic waddle-dash!
 *   sprint (96%+, 0.32s): Iconic Belly-Slide (Tobogganing on tummy!) kicking up ice spray & speed lines!
 * CSP Compliant: Zero inline style attributes, zero <style> tags in SVG.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

export const PENGUIN_CONFIG = {
  stand:  { period: 1.60, label: 'Flipper Flap Stand', hrRange: '~56%' },
  walk:   { period: 1.20, label: 'Cute Ice Waddle',    hrRange: '57–63%' },
  bike:   { period: 0.70, label: 'Winter Sled Glide',  hrRange: '64–76%' },
  run:    { period: 0.45, label: 'Flippers-Back Dash', hrRange: '77–95%' },
  sprint: { period: 0.32, label: 'Supersonic Belly Slide!', hrRange: '96%+' }
};

const instanceMap = new WeakMap();
const fmt = (n) => Number(n).toFixed(2);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(node);
  return node;
}

export function drawPenguinFrame(svg, zone, phase) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const a = phase * TAU;

  // Ice sheet surface at y=74 (#4EA8B8 / #6FD4E6)
  el('line', { x1: '6', y1: '74', x2: '114', y2: '74', class: 'cm-stroke-sea cm-sw-2' }, svg);
  if (zone !== 'stand') {
    const speed = zone === 'sprint' ? 4 : zone === 'run' ? 3 : 2;
    for (let i = 0; i < 4; i++) {
      const ix = 110 - (((phase * speed + i * 0.25) % 1) * 100);
      el('line', { x1: fmt(ix), y1: '76.5', x2: fmt(ix - 7), y2: '76.5', class: 'cm-stroke-splash cm-sw-15' }, svg);
    }
  }

  const g = el('g', {}, svg);

  // =========================================================================
  // SPRINT (96%+): High-Speed Belly Slide (Tobogganing horizontally on ice!)
  // =========================================================================
  if (zone === 'sprint') {
    const bx = 62 + Math.sin(a * 2) * 1.8;
    const by = 64 + Math.cos(a * 2) * 0.8;

    // Speed lines (#C6F36B) & Ice Spray Crystals (#6FD4E6)
    for (let i = 0; i < 3; i++) {
      const lx = 8 + ((phase * 32 + i * 9) % 14);
      const ly = 36 + i * 11;
      el('line', { x1: fmt(lx), y1: fmt(ly), x2: fmt(lx + 14), y2: fmt(ly), class: 'cm-stroke-lime cm-sw-15' }, g);
    }
    for (let s = 0; s < 5; s++) {
      const sp = (phase * 2 + s / 5) % 1;
      const sx = bx - 14 - sp * 18;
      const sy = 72 - Math.sin(sp * Math.PI) * 10;
      el('circle', { cx: fmt(sx), cy: fmt(sy), r: fmt(1.8 * (1 - sp * 0.5)), class: 'cm-fill-splash' }, g);
    }

    // Kicking orange webbed feet behind (#F3D35A)
    const kick = Math.sin(a * 2) * 3.5;
    el('ellipse', { cx: fmt(bx - 19), cy: fmt(by + 3 + kick), rx: '4.5', ry: '2.0', class: 'cm-fill-yellow' }, g);
    el('ellipse', { cx: fmt(bx - 18), cy: fmt(by + 5 - kick), rx: '4.5', ry: '2.0', class: 'cm-fill-tan' }, g);

    // Streamlined Horizontal Torpedo Penguin Body
    // Slate-blue/silver upper back + bright white belly sliding on the ice
    el('ellipse', { cx: fmt(bx), cy: fmt(by), rx: '18.5', ry: '8.5', class: 'cm-fill-silver cm-stroke-white cm-sw-1' }, g);
    el('path', {
      d: `M ${fmt(bx - 16)} ${fmt(by + 1)} Q ${fmt(bx)} ${fmt(by + 10.5)} ${fmt(bx + 17)} ${fmt(by + 1)} Q ${fmt(bx)} ${fmt(by + 3)} ${fmt(bx - 16)} ${fmt(by + 1)} Z`,
      class: 'cm-fill-white'
    }, g);

    // Head forward, yellow pointed beak (#F3D35A), determined eye
    const hx = bx + 15.5;
    const hy = by - 2.0;
    el('circle', { cx: fmt(hx), cy: fmt(hy), r: '6.8', class: 'cm-fill-silver cm-stroke-white cm-sw-1' }, g);
    el('circle', { cx: fmt(hx + 2.0), cy: fmt(hy + 0.5), r: '4.2', class: 'cm-fill-white' }, g);
    el('circle', { cx: fmt(hx + 3.0), cy: fmt(hy - 0.5), r: '1.3', class: 'cm-fill-dark' }, g);
    el('circle', { cx: fmt(hx + 3.3), cy: fmt(hy - 0.8), r: '0.5', class: 'cm-fill-white' }, g);
    // Beak
    el('path', {
      d: `M ${fmt(hx + 6.0)} ${fmt(hy - 2.0)} L ${fmt(hx + 13.5)} ${fmt(hy + 0.2)} L ${fmt(hx + 6.0)} ${fmt(hy + 2.2)} Z`,
      class: 'cm-fill-yellow'
    }, g);

    // Red Winter Scarf (#E86F52) flying backward
    const scarfWave = Math.sin(a * 2) * 2.8;
    el('path', {
      d: `M ${fmt(hx - 3)} ${fmt(hy + 5)} L ${fmt(hx - 1)} ${fmt(hy - 4)}
          M ${fmt(hx - 2)} ${fmt(hy - 2)} Q ${fmt(hx - 12)} ${fmt(hy - 8 + scarfWave)} ${fmt(hx - 22)} ${fmt(hy - 5 - scarfWave)}`,
      class: 'cm-stroke-coral cm-sw-3'
    }, g);

    // Flipper swept back aerodynamically
    const flap = Math.sin(a * 2) * 2.2;
    el('path', {
      d: `M ${fmt(bx + 6)} ${fmt(by)} Q ${fmt(bx - 4)} ${fmt(by - 5 + flap)} ${fmt(bx - 11)} ${fmt(by - 1 + flap)} Q ${fmt(bx - 2)} ${fmt(by + 3)} ${fmt(bx + 6)} ${fmt(by)} Z`,
      class: 'cm-fill-silver cm-stroke-white cm-sw-1'
    }, g);
    return;
  }

  // =========================================================================
  // UPRIGHT PENGUIN (stand / walk / bike [Sled] / run)
  // =========================================================================
  const px = zone === 'run' ? 60 : 58;
  const bounce = zone === 'stand'
    ? Math.sin(a) * 0.7
    : zone === 'bike'
      ? Math.sin(a * 2) * 0.8
      : Math.abs(Math.sin(a * 2)) * (zone === 'run' ? -4.2 : -2.2);
  const py = (zone === 'bike' ? 53 : 55) + bounce;
  const tilt = zone === 'run' ? 16 : zone === 'walk' ? Math.sin(a) * 6 : 0;

  // Sled in `bike` mode
  if (zone === 'bike') {
    // Classic Red Runner Sled (#E86F52 + #F3D35A)
    el('path', { d: `M 40 72.5 L 76 72.5 Q 82 72.5 83 67`, class: 'cm-stroke-yellow cm-sw-2' }, g);
    el('line', { x1: '46', y1: '72.5', x2: '46', y2: '68.5', class: 'cm-stroke-yellow cm-sw-15' }, g);
    el('line', { x1: '70', y1: '72.5', x2: '70', y2: '68.5', class: 'cm-stroke-yellow cm-sw-15' }, g);
    el('line', { x1: '42', y1: '68.5', x2: '76', y2: '68.5', class: 'cm-stroke-coral cm-sw-3' }, g);
  }

  // Orange Webbed Feet (#F3D35A)
  for (let s = 0; s < 2; s++) {
    const la = a + s * Math.PI;
    let fx, fy;
    if (zone === 'stand' || zone === 'bike') {
      fx = px + (s === 0 ? -3.0 : 3.5);
      fy = zone === 'bike' ? 67.2 : 72.5;
    } else {
      const stride = zone === 'run' ? 9.5 : 5.5;
      const lift = zone === 'run' ? 5.5 : 2.8;
      fx = px + Math.sin(la) * stride;
      fy = 72.5 - Math.max(0, Math.cos(la)) * lift;
    }
    el('ellipse', {
      cx: fmt(fx + 1.5), cy: fmt(fy),
      rx: '4.4', ry: '1.8',
      class: s === 0 ? 'cm-fill-tan' : 'cm-fill-yellow'
    }, g);
  }

  // Plump Penguin Body (Silver-slate outer coat + bright white belly oval)
  const leanOff = Math.sin((tilt * Math.PI) / 180) * 4;
  el('ellipse', {
    cx: fmt(px + leanOff * 0.4), cy: fmt(py),
    rx: '11.2', ry: '14.5',
    class: 'cm-fill-silver cm-stroke-white cm-sw-15'
  }, g);
  el('ellipse', {
    cx: fmt(px + 2.8 + leanOff * 0.5), cy: fmt(py + 1.2),
    rx: '7.6', ry: '11.5',
    class: 'cm-fill-white'
  }, g);

  // Cute Tail Tuft
  el('path', {
    d: `M ${fmt(px - 10)} ${fmt(py + 8)} L ${fmt(px - 15)} ${fmt(py + 11)} L ${fmt(px - 8)} ${fmt(py + 12)} Z`,
    class: 'cm-fill-silver'
  }, g);

  // Head & Cheeks
  const hx = px + 1.0 + leanOff;
  const hy = py - 14.5;
  el('circle', { cx: fmt(hx), cy: fmt(hy), r: '8.2', class: 'cm-fill-silver cm-stroke-white cm-sw-1' }, g);
  el('circle', { cx: fmt(hx + 2.4), cy: fmt(hy + 0.8), r: '5.4', class: 'cm-fill-white' }, g);
  // Eye + rosy coral cheek
  el('circle', { cx: fmt(hx + 3.8), cy: fmt(hy - 0.8), r: '1.5', class: 'cm-fill-dark' }, g);
  el('circle', { cx: fmt(hx + 4.2), cy: fmt(hy - 1.2), r: '0.55', class: 'cm-fill-white' }, g);
  el('circle', { cx: fmt(hx + 2.8), cy: fmt(hy + 2.2), r: '1.6', class: 'cm-fill-coral' }, g);

  // Yellow Beak (#F3D35A)
  el('path', {
    d: `M ${fmt(hx + 7.2)} ${fmt(hy - 2.0)} L ${fmt(hx + 14.2)} ${fmt(hy + 0.4)} L ${fmt(hx + 7.2)} ${fmt(hy + 2.4)} Z`,
    class: 'cm-fill-yellow'
  }, g);

  // Cozy Coral Scarf around neck (#E86F52)
  const scarfFlutter = Math.sin(a * 2) * (zone === 'run' || zone === 'bike' ? 2.5 : 0.8);
  el('path', {
    d: `M ${fmt(hx - 6.5)} ${fmt(hy + 6.5)} Q ${fmt(hx)} ${fmt(hy + 8.5)} ${fmt(hx + 6.8)} ${fmt(hy + 6.5)}`,
    class: 'cm-stroke-coral cm-sw-35'
  }, g);
  if (zone === 'bike' || zone === 'run') {
    el('path', {
      d: `M ${fmt(hx - 5)} ${fmt(hy + 6.5)} Q ${fmt(hx - 14)} ${fmt(hy + 4 + scarfFlutter)} ${fmt(hx - 21)} ${fmt(hy + 7 - scarfFlutter)}`,
      class: 'cm-stroke-coral cm-sw-25'
    }, g);
  }

  // Flipper Wing (Flapping in stand/walk, swept back in bike/run)
  const wingFlap = zone === 'stand'
    ? Math.sin(a * 2) * 4.5
    : zone === 'walk'
      ? Math.cos(a) * 6.0
      : -7.5 + Math.sin(a * 2) * 3.0;
  el('path', {
    d: `M ${fmt(px + 1)} ${fmt(py - 5)}
        Q ${fmt(px - 5 + wingFlap)} ${fmt(py + 3)} ${fmt(px - 2 + wingFlap * 1.3)} ${fmt(py + 9)}
        Q ${fmt(px + 4)} ${fmt(py + 4)} ${fmt(px + 1)} ${fmt(py - 5)} Z`,
    class: 'cm-fill-silver cm-stroke-white cm-sw-1'
  }, g);
}

// 動きを減らす設定では代表的な一コマだけ描く。画面外・非表示タブでは止める（PULSE側で追加）
const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

function stopPenguin(state) {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = 0;
}

function destroyPenguin(svgEl) {
  const state = instanceMap.get(svgEl);
  if (!state) return;
  stopPenguin(state);
  if (state.io) state.io.disconnect();
  document.removeEventListener('visibilitychange', state.onVis);
  instanceMap.delete(svgEl);
}

export function renderPenguin(svgEl, key) {
  if (!svgEl || typeof svgEl.setAttribute !== 'function') return;
  const normalizedKey = typeof key === 'string' ? key.trim() : '';
  let state = instanceMap.get(svgEl);
  if (!normalizedKey || !PENGUIN_CONFIG[normalizedKey]) {
    destroyPenguin(svgEl);
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.classList.remove('pulse-cm-svg');
    svgEl.removeAttribute('data-gait');
    return;
  }
  svgEl.setAttribute('data-gait', normalizedKey);
  if (state && state.key === normalizedKey) return;

  if (!state) {
    svgEl.setAttribute('viewBox', '0 0 120 80');
    svgEl.classList.add('pulse-cm-svg');
    state = { key: normalizedKey, phase: 0.15, lastTime: 0, rafId: 0, visible: true };
    const tick = (now) => {
      state.rafId = 0;
      if (!svgEl.isConnected) { destroyPenguin(svgEl); return; }
      const dt = clamp((now - state.lastTime) / 1000, 0, 0.1);
      state.lastTime = now;
      state.phase = (state.phase + dt / PENGUIN_CONFIG[state.key].period) % 1;
      drawPenguinFrame(svgEl, state.key, state.phase);
      state.start();
    };
    state.start = () => {
      if (state.rafId || document.hidden || !state.visible || (reducedMotion && reducedMotion.matches)) return;
      if (!state.lastTime) state.lastTime = performance.now();
      state.rafId = requestAnimationFrame(tick);
    };
    state.onVis = () => {
      if (document.hidden) stopPenguin(state);
      else { state.lastTime = performance.now(); state.start(); }
    };
    document.addEventListener('visibilitychange', state.onVis);
    if (typeof IntersectionObserver === 'function') {
      state.io = new IntersectionObserver((entries) => {
        state.visible = entries.some((e) => e.isIntersecting);
        if (state.visible) { state.lastTime = performance.now(); state.start(); } else stopPenguin(state);
      });
      state.io.observe(svgEl);
    }
    instanceMap.set(svgEl, state);
  }
  state.key = normalizedKey;
  drawPenguinFrame(svgEl, state.key, reducedMotion && reducedMotion.matches ? 0.15 : state.phase);
  state.start();
}
