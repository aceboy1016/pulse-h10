// Minimal canvas line chart. Gaps are drawn as breaks, never as interpolated lines.
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function drawChart(canvas, o) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const padL = 36, padR = 10, padT = 10, padB = 22;
  const pw = w - padL - padR, ph = h - padT - padB;
  const line = css('--line'), dim = css('--dim'), font = '11px ' + css('--font');

  const ys = o.points.map(p => p.y);
  for (const r of o.refLines || []) ys.push(r.y);
  let yMin = o.yMin ?? (ys.length ? Math.min(...ys) - 8 : 60);
  let yMax = o.yMax ?? (ys.length ? Math.max(...ys) + 8 : 180);
  yMin = Math.floor(yMin / 10) * 10; yMax = Math.ceil(yMax / 10) * 10;
  if (yMax - yMin < 40) yMax = yMin + 40;
  const X = (x) => padL + ((x - o.xMin) / (o.xMax - o.xMin)) * pw;
  const Y = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * ph;

  g.font = font; g.textBaseline = 'middle'; g.lineWidth = 1;
  // horizontal grid
  const step = (yMax - yMin) > 100 ? 40 : 20;
  for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) {
    g.strokeStyle = line; g.beginPath(); g.moveTo(padL, Y(y) + .5); g.lineTo(w - padR, Y(y) + .5); g.stroke();
    g.fillStyle = dim; g.textAlign = 'right'; g.fillText(String(y), padL - 6, Y(y));
  }
  // x ticks
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const t of o.xTicks || []) {
    if (t.x < o.xMin || t.x > o.xMax) continue;
    g.strokeStyle = line; g.beginPath(); g.moveTo(X(t.x) + .5, padT); g.lineTo(X(t.x) + .5, padT + ph); g.stroke();
    g.fillStyle = dim; g.fillText(t.label, X(t.x), padT + ph + 6);
  }
  // reference lines
  g.setLineDash([3, 4]);
  for (const r of o.refLines || []) {
    if (r.y < yMin || r.y > yMax) continue;
    g.strokeStyle = r.color || dim; g.beginPath(); g.moveTo(padL, Y(r.y) + .5); g.lineTo(w - padR, Y(r.y) + .5); g.stroke();
    g.fillStyle = r.color || dim; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText(r.label, padL + 4, Y(r.y) - 2);
  }
  g.setLineDash([]);
  // markers
  for (const m of o.marks || []) {
    if (m.x < o.xMin || m.x > o.xMax) continue;
    g.strokeStyle = m.color || dim; g.beginPath(); g.moveTo(X(m.x) + .5, padT); g.lineTo(X(m.x) + .5, padT + ph); g.stroke();
    if (m.label) { g.fillStyle = m.color || dim; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(m.label, X(m.x) + 4, padT + 2); }
  }
  // data with breaks
  g.save(); g.beginPath(); g.rect(padL, padT - 2, pw, ph + 4); g.clip();
  g.strokeStyle = o.color || css('--accent'); g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
  let prev = null;
  g.beginPath();
  for (const p of o.points) {
    if (!prev || p.x - prev.x > o.gap) g.moveTo(X(p.x), Y(p.y)); else g.lineTo(X(p.x), Y(p.y));
    prev = p;
  }
  g.stroke();
  // isolated points / segment ends as dots so single samples remain visible
  g.fillStyle = o.color || css('--accent');
  for (let i = 0; i < o.points.length; i++) {
    const p = o.points[i], a = o.points[i - 1], b = o.points[i + 1];
    const isoL = !a || p.x - a.x > o.gap, isoR = !b || b.x - p.x > o.gap;
    if (isoL && isoR) { g.beginPath(); g.arc(X(p.x), Y(p.y), 2, 0, Math.PI * 2); g.fill(); }
  }
  // gap shading
  g.fillStyle = css('--gap');
  for (let i = 1; i < o.points.length; i++) {
    const a = o.points[i - 1], b = o.points[i];
    if (b.x - a.x > o.gap) g.fillRect(X(a.x), padT, X(b.x) - X(a.x), ph);
  }
  if (o.trailingGapFrom != null && o.points.length) {
    const a = o.points.at(-1);
    if (o.trailingGapFrom - a.x > o.gap) g.fillRect(X(a.x), padT, X(o.trailingGapFrom) - X(a.x), ph);
  }
  g.restore();
  if (!o.points.length && o.empty) {
    g.fillStyle = dim; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '13px ' + css('--font');
    g.fillText(o.empty, padL + pw / 2, padT + ph / 2);
  }
}
