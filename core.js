// PULSE core: pure functions (no DOM). Imported by app.js and by tests.

export const STALE_MS = 5000;          // 受信がこれ以上途絶えたら現在値として扱わない
export const GAP_MS = 5000;            // サンプル間隔がこれを超えたら欠測区間
export const RECOVERY_TOLERANCE_S = 2; // 30/60/120秒値は ±2秒以内の実測値のみ採用
export const RECOVERY_MARKS = [30, 60, 120];
export const HR_MIN = 25, HR_MAX = 250;
export const METHODS = ['座位', '立位', 'ゆっくり歩く'];

// ---- Heart Rate Measurement (0x2A37) ----
// Flags bit0: 0 = UINT8, 1 = UINT16 (little endian)
export function parseHeartRate(dataView) {
  if (!dataView || dataView.byteLength < 2) return null;
  const flags = dataView.getUint8(0);
  const is16 = (flags & 0x01) === 0x01;
  if (is16 && dataView.byteLength < 3) return null;
  const hr = is16 ? dataView.getUint16(1, true) : dataView.getUint8(1);
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : null;
  return { hr, contact, is16 };
}
export const validHr = (hr) => Number.isFinite(hr) && hr >= HR_MIN && hr <= HR_MAX;

// ---- Max HR / intensity ----
export const estimateMaxHr = (age) => Math.round(208 - 0.7 * age); // Tanaka et al. 2001

export function maxHrFor(customer) {
  if (!customer) return { value: null, kind: null };
  if (customer.useMeasuredMax && validHr(customer.measuredMaxHr)) return { value: customer.measuredMaxHr, kind: 'measured' };
  if (Number.isFinite(customer.age) && customer.age >= 10 && customer.age <= 100) return { value: estimateMaxHr(customer.age), kind: 'estimated' };
  return { value: null, kind: null };
}

// ACSM's Guidelines for Exercise Testing and Prescription (Garber et al. 2011) — %HRmax
// 強度の「目安」。乳酸閾値・換気閾値などの生理学的閾値ではない。
export const INTENSITY = [
  { key: 'vlight', min: 0,  label: 'とても軽い', desc: 'ごく軽い動きの強度の目安', talk: '楽に会話でき、歌うこともできるくらい', example: 'ゆっくり歩く', icon: 'stand' },
  { key: 'light',  min: 57, label: '軽い', desc: '体が温まってくる強度の目安', talk: '普通に会話できるくらい', example: '散歩', icon: 'walk' },
  { key: 'mod',    min: 64, label: '中くらい', desc: '呼吸が弾む強度の目安', talk: '会話はできるが、歌うのは難しいくらい', example: '速歩き・平地の自転車', icon: 'bike' },
  { key: 'vig',    min: 77, label: 'きつい', desc: '息が上がる強度の目安', talk: '数語ごとに息継ぎが必要なくらい', example: 'ジョギング・坂道を上る', icon: 'run' },
  { key: 'max',    min: 96, label: '最大に近い', desc: '全力に近い強度の目安', talk: 'ほとんど話せないくらい', example: '短いダッシュ', icon: 'sprint' },
];
export function intensityFor(pct) {
  if (!Number.isFinite(pct)) return null;
  let r = INTENSITY[0];
  for (const z of INTENSITY) if (pct >= z.min) r = z;
  return r;
}

// ---- Stats over real samples only ----
export function stats(points) {
  const v = (points || []).map(p => p.hr).filter(Number.isFinite);
  if (!v.length) return { avg: null, min: null, max: null, count: 0, durationS: 0, gapS: 0 };
  let gap = 0;
  for (let i = 1; i < points.length; i++) { const d = points[i].t - points[i - 1].t; if (d > GAP_MS) gap += d; }
  return {
    avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    min: Math.min(...v), max: Math.max(...v), count: v.length,
    durationS: Math.round((points.at(-1).t - points[0].t) / 1000),
    gapS: Math.round(gap / 1000),
  };
}

// Split points into continuous segments (gap > GAP_MS breaks the line)
export function segments(points, gapMs = GAP_MS) {
  const out = []; let cur = [];
  for (const p of points) {
    if (cur.length && p.t - cur.at(-1).t > gapMs) { out.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---- Recovery ----
// samples: [{s: seconds since recovery start, hr}] — real measurements only.
// Value at mark T: the real sample closest to T within ±RECOVERY_TOLERANCE_S,
// and no gap > GAP_MS between start and that sample. Otherwise status explains why.
export function recoveryAt(rec, T) {
  const samples = rec.samples || [];
  const lastS = samples.length ? samples.at(-1).s : 0;
  if (lastS < T - RECOVERY_TOLERANCE_S && !rec.ended) return { status: 'pending', value: null };
  const cand = samples.filter(p => Math.abs(p.s - T) <= RECOVERY_TOLERANCE_S);
  // durationS: 計測を終えた時点の経過秒（無い場合は最後の実測時刻で判断）
  const reached = Number.isFinite(rec.durationS) ? rec.durationS >= T : lastS >= T;
  if (!cand.length) return { status: reached ? 'missing' : 'short', value: null };
  const pick = cand.reduce((a, b) => (Math.abs(b.s - T) < Math.abs(a.s - T) ? b : a));
  let prev = 0;
  for (const p of samples) {
    if (p.s > pick.s) break;
    if ((p.s - prev) * 1000 > GAP_MS) return { status: 'gap', value: null };
    prev = p.s;
  }
  return { status: 'ok', value: Math.round(rec.startHr - pick.hr), hr: pick.hr, at: Math.round(pick.s * 10) / 10 };
}
export const RECOVERY_STATUS_TEXT = { ok: '', pending: '計測中', short: '測定不足（時間未到達）', missing: '測定不足（該当時刻の実測なし）', gap: '無効（欠測・切断あり）' };

export function finalizeRecovery(rec) {
  const drops = {};
  for (const T of RECOVERY_MARKS) drops[T] = recoveryAt({ ...rec, ended: true }, T);
  return { ...rec, ended: true, drops };
}

// Normalize text for condition comparison
export const norm = (s) => String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export function conditionKey(r) {
  const ex = norm(r.exercise);
  if (!ex) return null; // 種目未入力なら「同条件」とは判定しない
  return [ex, norm(r.load), norm(r.reps)].join('|');
}
export function conditionText(r) {
  const parts = [r.exercise, r.load, r.reps].map(s => String(s ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(' / ') : '条件未入力';
}
// Same customer, same method, same exercise/load/reps, same source (demo vs sensor), valid 60s value
export function comparable(a, b) {
  const ka = conditionKey(a), kb = conditionKey(b);
  return !!ka && ka === kb && a.method === b.method && a.source === b.source && a.customerId === b.customerId;
}

// ---- IDs / time ----
export function makeId() {
  const b = new Uint8Array(8); (globalThis.crypto).getRandomValues(b);
  return Date.now().toString(36) + '-' + [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const fmtDur = (s) => { s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(ss).padStart(2, '0'); };

// ---- CSV ----
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // CSV/formula injection 対策
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const toCsv = (rows) => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

// ---- Backup format / validation ----
export const BACKUP_FORMAT = 'pulse-backup';
export const BACKUP_VERSION = 3;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_\-.:]{1,80}$/;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const T_MIN = Date.UTC(2015, 0, 1), T_MAX = Date.UTC(2100, 0, 1);

function cleanCustomer(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !ID_RE.test(c.id)) throw Error('顧客IDが不正です');
  const name = str(c.name, 80).trim();
  if (!name) throw Error('顧客名が空です');
  return {
    id: c.id, name, note: str(c.note, 2000),
    age: num(c.age, 10, 100),
    restingHr: num(c.restingHr, HR_MIN, HR_MAX),
    measuredMaxHr: num(c.measuredMaxHr, HR_MIN, HR_MAX),
    useMeasuredMax: c.useMeasuredMax === true,
    createdAt: num(c.createdAt, T_MIN, T_MAX) ?? Date.now(),
    updatedAt: num(c.updatedAt, T_MIN, T_MAX) ?? Date.now(),
  };
}
function cleanPoints(arr) {
  if (!Array.isArray(arr)) throw Error('心拍データが配列ではありません');
  if (arr.length > 200000) throw Error('心拍データが多すぎます');
  const pts = [];
  for (const p of arr) {
    if (!p || !Number.isFinite(p.t) || !Number.isFinite(p.hr)) throw Error('心拍データの型が不正です');
    if (p.t < T_MIN || p.t > T_MAX || !validHr(p.hr)) continue;
    pts.push({ t: p.t, hr: Math.round(p.hr) });
  }
  pts.sort((a, b) => a.t - b.t);
  return pts;
}
function cleanRecovery(r, session, legacy, i) {
  if (!r || typeof r !== 'object') throw Error('回復記録が不正です');
  const samplesIn = legacy ? (r.samples || []).map(p => ({ s: p?.seconds, hr: p?.hr })) : (r.samples || []);
  if (!Array.isArray(samplesIn) || samplesIn.length > 5000) throw Error('回復データが不正です');
  const samples = [];
  for (const p of samplesIn) {
    if (!p || !Number.isFinite(p.s) || !Number.isFinite(p.hr)) throw Error('回復データの型が不正です');
    if (p.s < 0 || p.s > 600 || !validHr(p.hr)) continue;
    samples.push({ s: Math.round(p.s * 10) / 10, hr: Math.round(p.hr) });
  }
  samples.sort((a, b) => a.s - b.s);
  const startHr = num(legacy ? r.hr : r.startHr, HR_MIN, HR_MAX);
  if (startHr == null) throw Error('回復開始心拍が不正です');
  const method = METHODS.includes(legacy ? r.posture : r.method) ? (legacy ? r.posture : r.method) : '';
  const source = (legacy ? r.source : r.source) === 'demo' || session.source === 'demo' ? 'demo' : 'sensor';
  const rec = {
    id: legacy ? session.id + '-r' + i : (typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : session.id + '-r' + i),
    customerId: session.customerId, sessionId: session.id,
    startedAt: num(legacy ? r.start : r.startedAt, T_MIN, T_MAX) ?? session.startedAt,
    startHr, method,
    exercise: str(legacy ? r.condition : r.exercise, 120),
    load: legacy ? '' : str(r.load, 60), reps: legacy ? '' : str(r.reps, 60),
    note: legacy ? '' : str(r.note, 500),
    preHr: num(r.preHr, HR_MIN, HR_MAX) ?? session.preHr ?? null,
    source, samples,
    interrupted: legacy ? r.invalid === true : r.interrupted === true,
    durationS: legacy ? undefined : (num(r.durationS, 0, 600) ?? undefined),
    legacy: legacy || r.legacy === true,
  };
  const fin = finalizeRecovery(rec);
  if (rec.interrupted) for (const T of RECOVERY_MARKS) if (fin.drops[T].status === 'ok') fin.drops[T] = { status: 'gap', value: null };
  return fin;
}
function cleanSession(s, legacy) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !ID_RE.test(s.id)) throw Error('セッションIDが不正です');
  const customerId = legacy ? s.customer : s.customerId;
  if (typeof customerId !== 'string' || !ID_RE.test(customerId)) throw Error('セッションの顧客IDが不正です');
  const points = cleanPoints(s.points);
  const startedAt = legacy ? (Date.parse(s.date) || points[0]?.t) : (num(s.startedAt, T_MIN, T_MAX) ?? points[0]?.t);
  if (!Number.isFinite(startedAt)) throw Error('セッション日時が不正です');
  const isDemo = s.source === 'demo' || (legacy && Array.isArray(s.points) && s.points.some(p => p?.source === 'demo'));
  const out = {
    id: s.id, customerId, startedAt,
    endedAt: legacy ? (points.at(-1)?.t ?? startedAt) : (num(s.endedAt, T_MIN, T_MAX) ?? points.at(-1)?.t ?? startedAt),
    source: isDemo ? 'demo' : 'sensor',
    age: num(s.age, 10, 100),
    maxHr: num(legacy ? s.maxhr : s.maxHr, HR_MIN, HR_MAX),
    maxHrKind: legacy ? 'legacy' : (['measured', 'estimated'].includes(s.maxHrKind) ? s.maxHrKind : null),
    preHr: num(legacy ? s.baseline : s.preHr, HR_MIN, HR_MAX),
    restingHr: legacy ? null : num(s.restingHr, HR_MIN, HR_MAX),
    points, legacy: legacy || s.legacy === true,
  };
  const recs = legacy ? s.recoveries : s.recoveries;
  if (recs != null && !Array.isArray(recs)) throw Error('回復記録が配列ではありません');
  out.recoveries = (recs || []).map((r, i) => cleanRecovery(r, out, legacy, i));
  return out;
}

// Accepts: PULSE v3 backup, legacy v2 backup {version:2,...}, raw legacy localStorage {customers,sessions,selected}
export function parseBackup(text, byteSize) {
  if (byteSize > MAX_BACKUP_BYTES) throw Error('ファイルが大きすぎます（上限50MB）');
  let d;
  try { d = JSON.parse(text); } catch { throw Error('JSONとして読み込めません'); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw Error('形式が正しくありません');
  let legacy;
  if (d.format === BACKUP_FORMAT && d.version === BACKUP_VERSION) legacy = false;
  else if (d.version === 2 || (d.version === undefined && Array.isArray(d.customers) && Array.isArray(d.sessions))) legacy = true;
  else throw Error('対応していないバックアップ形式です');
  if (!Array.isArray(d.customers) || !Array.isArray(d.sessions)) throw Error('customers / sessions がありません');
  if (d.customers.length > 5000 || d.sessions.length > 20000) throw Error('件数が多すぎます');
  const customers = d.customers.map(cleanCustomer);
  const ids = new Set(customers.map(c => c.id));
  const sessions = d.sessions.map(s => cleanSession(s, legacy));
  for (const s of sessions) if (!ids.has(s.customerId)) throw Error('顧客が存在しないセッションがあります');
  return { legacy, customers, sessions };
}

export function makeBackup(customers, sessions) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: 'PULSE', exportedAt: new Date().toISOString(), customers, sessions };
}
