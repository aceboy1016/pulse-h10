// PULSE app (UI). User-provided text is always rendered with textContent, never as HTML.
import {
  STALE_MS, GAP_MS, RECOVERY_MARKS, RECOVERY_STATUS_TEXT, validHr, maxHrFor, estimateMaxHr, intensityFor,
  stats, recoveryAt, finalizeRecovery, conditionKey, conditionText, comparable, makeId, fmtDur, toCsv,
  parseBackup, makeBackup, MAX_BACKUP_BYTES,
} from './core.js';
import { db } from './db.js';
import { HeartRateSensor, bleSupported } from './ble.js';
import { drawChart } from './charts.js';

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const dtf = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' });
const tf = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const S = {
  customers: [], customerId: '', sessions: [],
  live: null,          // {hr, t, source}
  buffer: [],          // 直近10分の実測（顧客未選択でもグラフ表示用）
  session: null,       // 記録中のセッション
  preHr: null,         // 今日の運動前心拍（セッション作成前の入力も保持）
  dirty: false, saving: null, lastSavedAt: 0, saveError: false,
  recovery: null,      // 計測中／計測後未記録の回復
  viewSessionId: null,
  mode: 'prep',
  demo: null,
  conn: 'idle',
  noContact: false,
};

// ---------- helpers ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const customer = () => S.customers.find(c => c.id === S.customerId) || null;
const fresh = () => !!S.live && Date.now() - S.live.t < STALE_MS;

function message(text, kind = '', action) {
  const m = $('message');
  m.replaceChildren(document.createTextNode(text));
  if (action) m.append(' ', h('button', { type: 'button', class: 'ghost sm', onclick: action.fn }, action.label));
  m.className = 'notice ' + kind; m.hidden = !text;
}
let toastTimer;
function toast(text) {
  const t = $('toast'); $('toastText').textContent = text;
  t.hidden = true; void t.offsetWidth; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}
function tick(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  if (reduceMotion.matches) return;
  el.classList.add('tick'); void el.offsetWidth; el.classList.remove('tick');
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };

// Confirm dialog with arbitrary buttons → resolves with button value (or null)
function ask(title, body, buttons) {
  return new Promise((resolve) => {
    const d = $('confirmDialog');
    $('cfTitle').textContent = title; $('cfBody').textContent = body;
    const row = $('cfButtons'); row.replaceChildren(h('span', { class: 'spacer' }));
    const done = (v) => { d.close(); resolve(v); };
    for (const b of buttons) row.append(h('button', { type: 'button', class: b.kind || 'ghost', onclick: () => done(b.value) }, b.label));
    d.oncancel = (e) => { e.preventDefault(); done(null); };
    d.showModal();
  });
}
const confirmAsk = (title, body, okLabel = 'OK', kind = 'primary') =>
  ask(title, body, [{ label: 'キャンセル', value: false }, { label: okLabel, value: true, kind }]).then(v => v === true);

// ---------- save state ----------
function renderSaveState() {
  const el = $('saveState');
  if (S.saveError) { el.dataset.s = 'error'; el.textContent = '保存に失敗しました'; return; }
  if (S.session && S.dirty) { el.dataset.s = 'dirty'; el.textContent = '未保存の記録あり'; return; }
  if (S.lastSavedAt) { el.dataset.s = 'ok'; el.textContent = '保存済み ' + tf.format(S.lastSavedAt); return; }
  el.dataset.s = 'none'; el.textContent = '';
}
function markDirty() { if (!S.dirty) { S.dirty = true; renderSaveState(); } }

async function saveSession({ silent = false } = {}) {
  const s = S.session;
  if (!s) return true;
  if (S.saving) { await S.saving.catch(() => {}); if (!S.dirty) return true; }
  const c = customer();
  const snapshotPoints = s.points.length;
  const snapshotRec = s.recoveries.length;
  const mx = maxHrFor(c);
  const rec = {
    ...s, points: s.points.slice(), recoveries: s.recoveries.slice(),
    endedAt: s.points.at(-1)?.t ?? s.startedAt,
    age: c?.age ?? null, maxHr: mx.value, maxHrKind: mx.kind, preHr: S.preHr, restingHr: c?.restingHr ?? null,
  };
  const p = db.putSession(rec);
  S.saving = p;
  try {
    await p;
    S.saveError = false; S.lastSavedAt = Date.now();
    if (s.points.length === snapshotPoints && s.recoveries.length === snapshotRec) S.dirty = false;
    const i = S.sessions.findIndex(x => x.id === rec.id);
    if (i < 0) S.sessions.push(rec); else S.sessions[i] = rec;
    requestPersist();
    renderSaveState();
    if (!silent) toast('保存しました');
    return true;
  } catch (e) {
    S.saveError = true; renderSaveState();
    message('保存できませんでした：' + (e?.message || e) + '　バックアップの書き出しを試してください。', 'err');
    return false;
  } finally { S.saving = null; }
}
let persistAsked = false;
function requestPersist() { if (persistAsked) return; persistAsked = true; navigator.storage?.persist?.().catch(() => {}); }

// ---------- session ----------
function newSession(source) {
  S.session = { id: makeId(), customerId: S.customerId, startedAt: Date.now(), source, points: [], recoveries: [], legacy: false };
  S.viewSessionId = null;
}
async function endSession({ ask: shouldAsk = true } = {}) {
  if (!S.session) return true;
  if (S.recovery && !S.recovery.ended) { message('回復計測中です。先に「記録して終了」か「中止」を押してください。', 'warn'); return false; }
  if (S.recovery?.ended) { message('記録していない回復計測があります。「記録して終了」を押してください。', 'warn'); setMode('recovery'); return false; }
  if (shouldAsk && !(await confirmAsk('セッションを終了', 'このセッションを保存して終了します。次の心拍受信から新しいセッションになります。', '保存して終了'))) return false;
  const ok = await saveSession({ silent: true });
  if (!ok) return false;
  const id = S.session.id;
  S.session = null; S.preHr = null; S.dirty = false;
  S.viewSessionId = id;
  toast('セッションを保存しました');
  renderAll();
  return true;
}
// demo / sensor switch must not mix sources in one session
async function ensureSource(src) {
  if (!S.session || S.session.source === src) return true;
  if (S.recovery) { message('回復計測中は切り替えできません。', 'warn'); return false; }
  const label = S.session.source === 'demo' ? 'デモ' : '実測';
  const ok = await confirmAsk('セッションを分けます', `現在の${label}セッションを保存して終了し、新しいセッションを開始します。デモと実測は同じセッションに混在させません。`, '保存して続ける');
  if (!ok) return false;
  return endSession({ ask: false });
}

// ---------- samples ----------
function onSample(hr, source, contact) {
  if (contact === false) { S.noContact = true; return; } // 接触なしの値は記録しない
  S.noContact = false;
  if (!validHr(hr)) return;
  const t = Date.now();
  S.live = { hr, t, source };
  S.buffer.push({ t, hr });
  while (S.buffer.length && t - S.buffer[0].t > 600000) S.buffer.shift();
  if (S.customerId) {
    if (S.session && S.session.source !== source) return; // ensureSource が先に処理する
    if (!S.session) newSession(source);
    S.session.points.push({ t, hr });
    markDirty();
  }
  const r = S.recovery;
  if (r && !r.ended) {
    const s = (t - r.startedAt) / 1000;
    if (s <= 125) r.samples.push({ s: Math.round(s * 10) / 10, hr });
    if (s >= 120) stopRecoveryClock();
  }
  renderLive();
  if (reduceMotion.matches || document.hidden) drawCharts();
}

// ---------- connection ----------
const sensor = new HeartRateSensor({
  onHr: (hr, contact) => onSample(hr, 'sensor', contact),
  onState: (st, name, n) => {
    S.conn = st;
    const txt = { connecting: '接続中…', connected: (name || 'H10') + ' 接続中', reconnecting: `再接続中…（${n}/3）`, lost: '接続が切れました', disconnected: '未接続' }[st] || '未接続';
    setConn(st, txt);
    if (st === 'lost') message('H10との接続が切れました。H10の装着を確認して「再接続」を押してください。途切れた区間は欠測として扱います。', 'warn');
    if (st === 'connected') message('');
  },
});
function setConn(st, txt) {
  $('connState').dataset.state = st; $('connText').textContent = txt;
  const b = $('connectBtn');
  b.textContent = st === 'connected' || st === 'connecting' || st === 'reconnecting' ? '切断' : st === 'lost' ? '再接続' : 'H10に接続';
  $('demoBtn').textContent = S.demo ? 'デモ停止' : 'デモ';
  $('demoBadge').hidden = !(S.demo || S.session?.source === 'demo');
}
async function onConnectClick() {
  if (!bleSupported()) { $('unsupported').hidden = false; return; }
  if (['connected', 'connecting', 'reconnecting'].includes(S.conn)) { sensor.disconnect(); return; }
  if (S.demo) stopDemo();
  if (!(await ensureSource('sensor'))) return;
  try {
    if (S.conn === 'lost') await sensor.reconnect(); else await sensor.connect();
  } catch (e) {
    S.conn = 'idle';
    setConn('idle', '未接続');
    if (e.code === 'cancel') message('接続をキャンセルしました。');
    else message('接続できませんでした。H10の電極を湿らせて装着し、他のアプリ（Polar Beatなど）と接続中でないか確認してください。（' + (e.message || e.name) + '）', 'err');
  }
}

// ---------- demo ----------
async function startDemo() {
  if (sensor.connected) { message('H10と接続中はデモを使えません。先に切断してください。', 'warn'); return; }
  if (!(await ensureSource('demo'))) return;
  let hr = S.live?.hr || 72;
  let n = 0;
  S.demo = setInterval(() => {
    n++;
    const target = S.mode === 'recovery' && S.recovery ? 92 : S.mode === 'exercise' ? 150 + 8 * Math.sin(n / 25) : 70;
    const k = S.mode === 'recovery' ? 0.035 : 0.06;
    hr += (target - hr) * k + (Math.random() - 0.5) * 2.2;
    onSample(Math.round(hr), 'demo', true);
  }, 1000);
  setConn('demo', 'デモ表示中（実測ではありません）');
  message('デモ表示中です。デモの記録は「デモ」として保存され、実測とは比較しません。');
}
function stopDemo() {
  clearInterval(S.demo); S.demo = null;
  setConn('idle', '未接続');
  message('');
}

// ---------- customers ----------
async function loadCustomers() {
  S.customers = (await db.allCustomers()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  renderCustomerSelect();
}
function renderCustomerSelect() {
  const sel = $('customerSelect');
  sel.replaceChildren(h('option', { value: '' }, '顧客を選択'), ...S.customers.map(c => h('option', { value: c.id }, c.name)));
  sel.value = S.customerId;
  $('editCustomer').disabled = !S.customerId;
}
async function selectCustomer(id) {
  if (id === S.customerId) return true;
  if (S.recovery) { message('回復計測中は顧客を切り替えできません。', 'warn'); renderCustomerSelect(); return false; }
  if (S.session && S.session.points.length) {
    const c = customer();
    const v = await ask('顧客を切り替えます', `${c ? c.name + 'さんの' : ''}記録中のセッションを保存して終了してから切り替えます。`, [{ label: 'キャンセル', value: 'cancel' }, { label: '保存して切り替え', value: 'save', kind: 'primary' }]);
    if (v !== 'save' || !(await endSession({ ask: false }))) { renderCustomerSelect(); return false; }
  }
  S.session = null; S.preHr = null; S.dirty = false; S.viewSessionId = null;
  S.customerId = id;
  try { await db.setMeta('selectedCustomer', id); } catch { /* not critical */ }
  S.sessions = id ? await db.sessionsFor(id) : [];
  renderCustomerSelect(); renderAll();
  return true;
}
function openCustomerDialog(edit) {
  const c = edit ? customer() : null;
  $('customerDialogTitle').textContent = c ? '顧客を編集' : '顧客を登録';
  $('fName').value = c?.name || ''; $('fAge').value = c?.age ?? ''; $('fNote').value = c?.note || '';
  $('deleteCustomer').hidden = !c;
  $('customerForm').dataset.edit = c ? c.id : '';
  $('customerDialog').showModal();
  $('fName').focus();
}
async function submitCustomer(e) {
  e.preventDefault();
  const name = $('fName').value.trim(), age = Number($('fAge').value), note = $('fNote').value.trim();
  if (!name) return $('fName').focus();
  if (!Number.isInteger(age) || age < 10 || age > 100) { $('fAge').focus(); return; }
  const editId = $('customerForm').dataset.edit;
  const old = S.customers.find(c => c.id === editId);
  const c = old ? { ...old, name, age, note, updatedAt: Date.now() }
    : { id: makeId(), name, age, note, restingHr: null, measuredMaxHr: null, useMeasuredMax: false, createdAt: Date.now(), updatedAt: Date.now() };
  try {
    await db.putCustomer(c);
  } catch (err) { message('顧客を保存できませんでした：' + (err?.message || err), 'err'); return; }
  $('customerDialog').close();
  await loadCustomers();
  toast(old ? '顧客情報を更新しました' : '顧客を登録しました');
  if (!old) await selectCustomer(c.id); else renderAll();
}
async function deleteCustomer() {
  const c = customer(); if (!c) return;
  if (S.session || S.recovery) { message('記録中のセッションがあるため削除できません。先にセッションを終了してください。', 'warn'); return; }
  const n = S.sessions.length;
  $('customerDialog').close();
  const ok = await confirmAsk('顧客を削除', `${c.name}さんと、保存済みのセッション ${n}件・回復記録をすべて削除します。元に戻せません。\n必要なら先にバックアップを書き出してください。`, '削除する', 'danger');
  if (!ok) return;
  try { await db.deleteCustomer(c.id); } catch (e) { message('削除できませんでした：' + (e?.message || e), 'err'); return; }
  S.customerId = ''; S.sessions = [];
  await loadCustomers(); renderAll(); toast('削除しました');
}
async function updateCustomerField(patch) {
  const c = customer(); if (!c) return;
  const next = { ...c, ...patch, updatedAt: Date.now() };
  try {
    await db.putCustomer(next);
    Object.assign(c, next);
    if (S.session) markDirty();
    toast('設定を保存しました');
  } catch (e) { message('設定を保存できませんでした：' + (e?.message || e), 'err'); }
  renderPrep(); renderLive();
}

// ---------- mode ----------
function setMode(m) {
  S.mode = m;
  document.body.dataset.mode = m;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.mode === m));
  for (const v of document.querySelectorAll('.view')) v.classList.toggle('active', v.dataset.view === m);
  renderAll();
}

// ---------- render: prep ----------
function renderPrep() {
  const c = customer();
  $('prepCustomer').textContent = c ? c.name : '顧客を選択してください';
  $('prepNote').textContent = c?.note || '';
  for (const id of ['ageInput', 'useMeasured', 'measuredMax', 'restingInput', 'preHrInput']) $(id).disabled = !c;
  if (c) {
    if (document.activeElement !== $('ageInput')) $('ageInput').value = c.age ?? '';
    $('useMeasured').checked = !!c.useMeasuredMax;
    if (document.activeElement !== $('measuredMax')) $('measuredMax').value = c.measuredMaxHr ?? '';
    if (document.activeElement !== $('restingInput')) $('restingInput').value = c.restingHr ?? '';
  }
  $('estMax').textContent = Number.isFinite(c?.age) ? estimateMaxHr(c.age) + ' bpm' : '—';
  const mx = maxHrFor(c);
  $('usedMax').textContent = mx.value ? `${mx.value} bpm（${mx.kind === 'measured' ? '測定値' : '推定値'}）` : '—';
  $('preHrVal').textContent = S.preHr ? S.preHr + ' bpm' : '未登録';
  if (document.activeElement !== $('preHrInput')) $('preHrInput').value = S.preHr ?? '';
  const f = fresh();
  $('prepHr').textContent = f ? String(S.live.hr) : '—';
  $('prepHrState').textContent = f ? (S.live.source === 'demo' ? 'デモ値' : '受信中') : S.live ? '受信が途絶えています' : '受信待ち';
  $('setPreHr').disabled = !c || recentAvg() == null;
}
function recentAvg() {
  if (!fresh()) return null;
  const now = Date.now();
  const v = S.buffer.filter(p => now - p.t <= 10000);
  if (v.length < 5) return null;
  for (let i = 1; i < v.length; i++) if (v[i].t - v[i - 1].t > GAP_MS) return null;
  return Math.round(v.reduce((a, p) => a + p.hr, 0) / v.length);
}

// ---------- render: live ----------
const ICONS = {
  stand: ['C60,13,6', 'M60 21 V46', 'M60 27 L51 41', 'M60 27 L69 41', 'M60 46 L55 72', 'M60 46 L65 72'],
  walk: ['C58,12,6', 'M58 20 L60 45', 'M59 26 L50 39', 'M59 26 L68 37', 'M60 45 L50 72', 'M60 45 L67 59 L72 72'],
  bike: ['O32,58,13', 'O88,58,13', 'M32 58 L50 40 L76 40 L88 58', 'M50 40 L58 58 L32 58', 'M58 58 L76 40', 'M74 40 L72 33 L80 33', 'C60,13,6', 'M58 20 L52 38', 'M57 25 L72 34', 'M52 38 L64 47 L58 58'],
  run: ['C64,11,6', 'M62 19 L55 42', 'M60 25 L70 33 L76 27', 'M60 25 L49 31 L45 40', 'M55 42 L66 55 L62 72', 'M55 42 L44 55 L34 57'],
  sprint: ['C74,15,6', 'M69 22 L54 41', 'M65 27 L79 34', 'M65 27 L50 22', 'M54 41 L70 51 L72 72', 'M54 41 L40 53 L28 49'],
};
const SVGNS = 'http://www.w3.org/2000/svg';
let figKey = '';
function drawFigure(key) {
  if (figKey === key) return; figKey = key;
  const svg = $('zoneFig'); svg.replaceChildren();
  if (!key) return;
  const ground = document.createElementNS(SVGNS, 'path'); ground.setAttribute('d', 'M8 74 H112'); ground.setAttribute('class', 'ground'); svg.append(ground);
  for (const d of ICONS[key]) {
    let el;
    if (d[0] === 'C' || d[0] === 'O') {
      const [x, y, r] = d.slice(1).split(',').map(Number);
      el = document.createElementNS(SVGNS, 'circle'); el.setAttribute('cx', x); el.setAttribute('cy', y); el.setAttribute('r', r);
      if (d[0] === 'C') el.setAttribute('class', 'head');
    } else { el = document.createElementNS(SVGNS, 'path'); el.setAttribute('d', d); }
    svg.append(el);
  }
}

function renderLive() {
  const c = customer();
  const f = fresh();
  const mx = maxHrFor(c);
  const maxV = mx.value || (S.session?.maxHr ?? null);
  // big number
  const hrEl = $('hr');
  tick(hrEl, f ? String(S.live.hr) : '—');
  hrEl.parentElement.parentElement.classList.toggle('stale', !f);
  let sub;
  if (S.noContact) sub = 'センサーの接触を確認してください（電極を湿らせて装着）';
  else if (f) sub = S.live.source === 'demo' ? 'デモ値（実測ではありません）' : '受信 ' + tf.format(S.live.t);
  else if (S.live) sub = `5秒以上受信がありません（最終受信 ${tf.format(S.live.t)}）`;
  else sub = bleSupported() ? 'H10を装着して「H10に接続」を押してください' : 'MacのGoogle Chromeで開くとH10に接続できます';
  if (f && !S.customerId) sub += '｜顧客を選択すると記録されます';
  $('hrSub').textContent = sub;
  $('hrLabel').textContent = f ? '現在の心拍数' : '現在の心拍数（受信なし）';

  // ring & intensity
  const pct = f && maxV ? Math.round((S.live.hr / maxV) * 100) : null;
  $('ringBar').style.setProperty('stroke-dashoffset', String(100 - Math.max(0, Math.min(100, pct ?? 0))));
  $('ring').classList.toggle('stale', !f);
  tick($('pct'), pct != null ? pct + '%' : '—');
  $('pctLabel').textContent = mx.kind === 'measured' ? '設定最大心拍に対して' : '推定最大心拍に対して';
  $('profileLine').textContent = maxV ? (mx.kind === 'measured' ? `設定最大心拍 ${maxV} bpm` : `${c?.age ?? '—'}歳 · 推定最大心拍 ${maxV} bpm`) : '顧客を選ぶと最大心拍を設定します';
  const z = intensityFor(pct);
  $('zoneLabel').textContent = z ? z.label : '—';
  $('zoneDesc').textContent = z ? z.desc : (maxV ? '受信すると強度の目安を表示します' : '最大心拍が未設定です');
  $('zoneTalk').textContent = z ? z.talk : '';
  $('zoneExample').textContent = z ? `参考イメージ：${z.example}（息の上がり方の例。運動量や消費カロリーの換算ではありません）` : '';
  drawFigure(z?.icon || '');
  $('zoneOver').hidden = !(pct > 100);
  $('zoneOver').textContent = '推定最大心拍を上回っています。推定値には個人差があり、これだけで異常とは判断しません。体調の変化に注意してください。';

  // stats (current session, real samples only)
  const st = stats(S.session?.points || []);
  $('sAvg').textContent = st.avg ?? '—'; $('sMax').textContent = st.max ?? '—'; $('sMin').textContent = st.min ?? '—';
  $('sTime').textContent = fmtDur(st.durationS);
  $('sGap').textContent = st.gapS ? `うち欠測 ${fmtDur(st.gapS)}` : '';
  $('startRecovery').disabled = !(f && S.session && !S.recovery);
  $('demoBadge').hidden = !(S.demo || S.session?.source === 'demo');

  if (S.mode === 'prep') renderPrep();
  if (S.mode === 'recovery') renderRecovery();
}

// ---------- recovery ----------
let recClock = null;
function startRecovery() {
  if (!fresh() || !S.session) { message('心拍を受信中で、顧客が選択されているときに開始できます。', 'warn'); return; }
  if (S.recovery) { setMode('recovery'); return; }
  if (Date.now() - S.live.t > 2500) { message('直前の心拍が古いため開始できません。受信を確認してください。', 'warn'); return; }
  S.recovery = {
    id: makeId(), customerId: S.customerId, sessionId: S.session.id,
    startedAt: Date.now(), startHr: S.live.hr, startSampleAgeMs: Date.now() - S.live.t,
    samples: [], source: S.session.source, ended: false, interrupted: false, legacy: false,
  };
  for (const id of ['cExercise', 'cLoad', 'cReps', 'cNote']) $(id).value = $(id).dataset.last || '';
  recClock = setInterval(() => {
    const r = S.recovery;
    if (r && !r.ended && Date.now() - r.startedAt > 122000) { stopRecoveryClock(); return; } // 受信がなくても120秒で打ち切り
    if (!document.hidden && S.mode === 'recovery') renderRecovery();
  }, 250);
  setMode('recovery');
  message('回復計測を開始しました。60秒で確定し、そのまま120秒まで記録します。');
}
function stopRecoveryClock() {
  if (S.recovery) S.recovery.ended = true;
  clearInterval(recClock); recClock = null;
  renderRecovery();
}
function recForm() {
  return {
    method: document.querySelector('input[name=method]:checked')?.value || '座位',
    exercise: $('cExercise').value.trim(), load: $('cLoad').value.trim(), reps: $('cReps').value.trim(), note: $('cNote').value.trim(),
  };
}
function allRecoveries() {
  const list = [];
  for (const s of S.sessions) for (const r of s.recoveries || []) list.push({ ...r, sessionStartedAt: s.startedAt });
  if (S.session && !S.sessions.some(s => s.id === S.session.id)) for (const r of S.session.recoveries) list.push({ ...r, sessionStartedAt: S.session.startedAt });
  // de-dup (current session may also be saved)
  const seen = new Set(); return list.filter(r => (seen.has(r.id) ? false : seen.add(r.id))).sort((a, b) => a.startedAt - b.startedAt);
}
function dropText(d) { return d?.status === 'ok' ? `${d.value} bpm低下` : (RECOVERY_STATUS_TEXT[d?.status] || '—'); }

function renderRecovery() {
  const r = S.recovery;
  const btn = $('finishRecovery');
  $('cancelRecovery').hidden = !r;
  if (!r) {
    $('recSec').textContent = '0';
    $('recRing').style.setProperty('stroke-dashoffset', '100');
    $('recDrop').textContent = '—';
    $('dropLabel').textContent = '回復開始からの低下';
    $('recDetail').textContent = 'セット終了時に「セット終了・回復を測る」を押すと開始します';
    $('recPre').textContent = '';
    $('recHr').textContent = fresh() ? String(S.live.hr) : '—';
    for (const T of RECOVERY_MARKS) $('m' + T).textContent = '—';
    $('compare').textContent = '—';
    btn.textContent = '回復計測を開始'; btn.disabled = !(fresh() && S.session);
    drawCharts();
    return;
  }
  btn.textContent = '記録して終了'; btn.disabled = false;
  const el = Math.min(120, (Date.now() - r.startedAt) / 1000);
  const shown = r.ended ? Math.min(120, r.samples.at(-1)?.s ?? el) : el;
  $('recSec').textContent = String(Math.min(60, Math.floor(shown)));
  $('recRing').style.setProperty('stroke-dashoffset', String(100 - Math.min(100, (shown / 60) * 100)));
  const last = r.samples.at(-1);
  const f = fresh();
  const cur = f ? S.live.hr : null;
  const d60 = recoveryAt(r, 60);
  if (d60.status === 'ok') {
    $('dropLabel').textContent = '60秒間の心拍低下（確定）';
    $('recDrop').textContent = String(d60.value);
    $('recDetail').textContent = `回復開始 ${r.startHr} bpm → 60秒後 ${d60.hr} bpm`;
  } else if (d60.status === 'pending') {
    $('dropLabel').textContent = `${Math.floor(el)}秒間の心拍低下`;
    tick($('recDrop'), last && f ? String(r.startHr - last.hr) : '—');
    $('recDetail').textContent = `回復開始 ${r.startHr} bpm → 現在 ${cur ?? '—'} bpm`;
  } else {
    $('dropLabel').textContent = '60秒間の心拍低下';
    $('recDrop').textContent = '—';
    $('recDetail').textContent = '60秒値：' + RECOVERY_STATUS_TEXT[d60.status];
  }
  $('recHr').textContent = cur ?? '—';
  $('recPre').textContent = S.preHr && cur ? `運動前の基準（${S.preHr} bpm）より ${cur - S.preHr >= 0 ? '＋' : '−'}${Math.abs(cur - S.preHr)} bpm` : (S.preHr ? '' : '今日の運動前心拍が未登録です');
  for (const T of RECOVERY_MARKS) {
    const d = recoveryAt(r, T);
    $('m' + T).textContent = d.status === 'ok' ? `${d.value} bpm低下（${d.hr} bpm）` : (d.status === 'pending' ? (el >= T - 2 ? '確定待ち' : '計測中') : RECOVERY_STATUS_TEXT[d.status]);
  }
  // comparison
  const form = recForm();
  const probe = { ...form, customerId: S.customerId, source: r.source };
  let cmp;
  if (!conditionKey(probe)) cmp = '種目が未入力のため、同条件の比較は行いません。';
  else {
    const prev = allRecoveries().filter(x => x.id !== r.id && comparable(x, probe) && x.drops?.[60]?.status === 'ok').at(-1);
    cmp = prev ? `同条件（${form.method}・${conditionText(form)}）の前回 ${df.format(prev.startedAt)}：60秒で ${prev.drops[60].value} bpm低下` + (d60.status === 'ok' ? `／今回 ${d60.value} bpm低下` : '')
      : `同条件（${form.method}・${conditionText(form)}${r.source === 'demo' ? '・デモ' : ''}）の過去記録はまだありません。`;
  }
  $('compare').textContent = cmp;
  drawCharts();
}
async function finishRecovery() {
  const r = S.recovery;
  if (!r) return startRecovery();
  const el = (Date.now() - r.startedAt) / 1000;
  if (!r.ended && el < 60) {
    if (!(await confirmAsk('60秒未満です', '60秒に達していないため、60秒値は「測定不足」として記録されます。記録しますか？', '記録する'))) return;
  }
  stopRecoveryClock();
  const form = recForm();
  const rec = finalizeRecovery({ ...r, ...form, preHr: S.preHr });
  delete rec.startSampleAgeMs;
  S.session.recoveries.push(rec);
  for (const id of ['cExercise', 'cLoad', 'cReps']) $(id).dataset.last = $(id).value.trim();
  S.recovery = null;
  markDirty();
  const ok = await saveSession({ silent: true });
  if (ok) toast('回復記録を保存しました');
  setMode('result');
}
async function cancelRecovery() {
  if (!S.recovery) return;
  if (!(await confirmAsk('回復計測を中止', 'この回復計測は保存されません。中止しますか？', '中止する', 'danger'))) return;
  clearInterval(recClock); recClock = null; S.recovery = null;
  setMode('exercise');
}

// ---------- result ----------
function viewedSession() {
  if (S.viewSessionId) return S.sessions.find(s => s.id === S.viewSessionId) || null;
  if (S.session) return S.session;
  return [...S.sessions].sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}
function sourceTag(s) { return s.source === 'demo' ? h('span', { class: 'tag demo' }, 'デモ') : s.legacy ? h('span', { class: 'tag' }, '旧データ') : h('span', { class: 'tag' }, '実測'); }

function renderResult() {
  const s = viewedSession();
  const isCurrent = !!S.session && s?.id === S.session.id;
  $('resTitle').replaceChildren(s ? `${dtf.format(s.startedAt)} のセッション` : 'セッションはまだありません', s ? sourceTag(s) : '', isCurrent ? h('span', { class: 'tag' }, '記録中') : '');
  $('resCsv').disabled = !s?.points?.length;
  $('endSession').disabled = !S.session;
  $('backToLive').hidden = !(S.session && !isCurrent);
  const st = stats(s?.points || []);
  $('rAvg').textContent = st.avg ?? '—'; $('rMax').textContent = st.max ?? '—'; $('rMin').textContent = st.min ?? '—';
  $('rTime').textContent = s ? fmtDur(st.durationS) : '—';
  $('rGap').textContent = st.gapS ? `うち欠測 ${fmtDur(st.gapS)}` : '';

  // recoveries of this session
  const t = $('resRecoveries');
  const recs = s?.recoveries || [];
  t.replaceChildren(
    h('thead', {}, h('tr', {}, ...['#', '開始時刻', '回復方法', '条件', '開始心拍', '30秒', '60秒', '120秒', '運動前比'].map(x => h('th', {}, x)))),
    h('tbody', {}, recs.length ? recs.map((r, i) => h('tr', {},
      h('td', {}, String(i + 1)), h('td', {}, tf.format(r.startedAt)), h('td', {}, r.method || '—'),
      h('td', {}, conditionText(r), r.note ? h('div', { class: 'sub' }, r.note) : ''),
      h('td', {}, r.startHr + ' bpm'),
      ...RECOVERY_MARKS.map(T => h('td', {}, dropText(r.drops?.[T]))),
      h('td', {}, r.preHr ? `${r.startHr - r.preHr >= 0 ? '＋' : '−'}${Math.abs(r.startHr - r.preHr)} bpm` : '—'),
    )) : h('tr', {}, h('td', { colspan: '9', class: 'empty' }, '回復記録はありません'))),
  );

  // comparison groups (customer-wide)
  const all = allRecoveries();
  const groups = new Map(); let noCond = 0;
  for (const r of all) {
    const k = conditionKey(r);
    if (!k) { noCond++; continue; }
    const gk = [r.source, r.method, k].join('§');
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(r);
  }
  const box = $('compareGroups'); box.replaceChildren();
  for (const list of groups.values()) {
    const r0 = list[0];
    box.append(h('div', { class: 'cgroup' },
      h('h4', {}, `${conditionText(r0)}・${r0.method || '方法未選択'}`, r0.source === 'demo' ? h('span', { class: 'tag demo' }, 'デモ') : ''),
      h('div', { class: 'tablewrap' }, h('table', { class: 'list' },
        h('thead', {}, h('tr', {}, ...['日付', '開始心拍', '30秒', '60秒', '120秒'].map(x => h('th', {}, x)))),
        h('tbody', {}, list.map(r => h('tr', { class: s && r.sessionId === s.id ? 'sel' : '' },
          h('td', {}, dtf.format(r.startedAt)), h('td', {}, r.startHr + ' bpm'),
          ...RECOVERY_MARKS.map(T => h('td', {}, dropText(r.drops?.[T])))))),
      )),
    ));
  }
  if (!groups.size) box.append(h('p', { class: 'sub' }, S.customerId ? '比較できる回復記録はまだありません。' : '顧客を選択してください。'));
  if (noCond) box.append(h('p', { class: 'sub' }, `種目が未入力のため比較対象外：${noCond}件`));
  $('recCsv').disabled = !all.length;

  // history
  const hist = [...S.sessions].sort((a, b) => b.startedAt - a.startedAt);
  const ht = $('history');
  ht.replaceChildren(
    h('thead', {}, h('tr', {}, ...['日時', '種別', '計測時間', '平均', '最大', '回復記録', ''].map(x => h('th', {}, x)))),
    h('tbody', {}, hist.length ? hist.map(x => {
      const st2 = stats(x.points);
      return h('tr', { class: s?.id === x.id ? 'sel' : '' },
        h('td', {}, dtf.format(x.startedAt)), h('td', {}, sourceTag(x)), h('td', {}, fmtDur(st2.durationS)),
        h('td', {}, st2.avg ?? '—'), h('td', {}, st2.max ?? '—'), h('td', {}, String(x.recoveries?.length || 0)),
        h('td', {}, h('div', { class: 'btnrow tight' },
          h('button', { type: 'button', class: 'ghost sm', onclick: () => { S.viewSessionId = x.id; renderResult(); drawCharts(); } }, '表示'),
          h('button', { type: 'button', class: 'ghost sm', onclick: () => exportSessionCsv(x) }, 'CSV'),
          S.session?.id === x.id ? '' : h('button', { type: 'button', class: 'danger sm', onclick: () => deleteSession(x) }, '削除'))));
    }) : h('tr', {}, h('td', { colspan: '7', class: 'empty' }, S.customerId ? '保存済みのセッションはありません' : '顧客を選択してください'))),
  );
}
async function deleteSession(x) {
  if (!(await confirmAsk('セッションを削除', `${dtf.format(x.startedAt)} のセッション（回復記録 ${x.recoveries?.length || 0}件を含む）を削除します。元に戻せません。`, '削除する', 'danger'))) return;
  try { await db.deleteSession(x.id); } catch (e) { message('削除できませんでした：' + (e?.message || e), 'err'); return; }
  S.sessions = S.sessions.filter(s => s.id !== x.id);
  if (S.viewSessionId === x.id) S.viewSessionId = null;
  renderResult(); drawCharts(); toast('削除しました');
}

// ---------- CSV ----------
function exportSessionCsv(s) {
  const c = S.customers.find(x => x.id === s.customerId);
  const rows = [['顧客', 'セッションID', '種別', '日時', '経過秒', '心拍(bpm)']];
  for (const p of s.points) rows.push([c?.name || '', s.id, s.source === 'demo' ? 'デモ' : '実測', new Date(p.t).toISOString(), ((p.t - s.startedAt) / 1000).toFixed(1), p.hr]);
  download(`pulse-session-${stamp()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
}
function exportRecoveryCsv() {
  const c = customer();
  const rows = [['顧客', '日時', '種別', '回復方法', '種目', '重量・負荷', '回数・時間', 'メモ', '開始心拍', '運動前心拍', '30秒低下', '60秒低下', '120秒低下', '60秒の状態']];
  for (const r of allRecoveries()) rows.push([c?.name || '', new Date(r.startedAt).toISOString(), r.source === 'demo' ? 'デモ' : '実測', r.method, r.exercise, r.load, r.reps, r.note, r.startHr, r.preHr ?? '',
    ...RECOVERY_MARKS.map(T => r.drops?.[T]?.status === 'ok' ? r.drops[T].value : ''), RECOVERY_STATUS_TEXT[r.drops?.[60]?.status] || 'OK']);
  download(`pulse-recoveries-${stamp()}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
}

// ---------- backup / restore ----------
async function backup() {
  if (S.session && S.dirty && !(await saveSession({ silent: true }))) return;
  try {
    const [customers, sessions] = await Promise.all([db.allCustomers(), db.allSessions()]);
    download(`pulse-backup-${stamp()}.json`, JSON.stringify(makeBackup(customers, sessions)), 'application/json');
    await db.setMeta('lastBackupAt', Date.now()).catch(() => {});
    toast(`バックアップを書き出しました（顧客${customers.length}・セッション${sessions.length}）`);
  } catch (e) { message('バックアップを作成できませんでした：' + (e?.message || e), 'err'); }
}
async function restore(file) {
  if (!file) return;
  try {
    if (file.size > MAX_BACKUP_BYTES) throw Error('ファイルが大きすぎます（上限50MB）');
    const data = parseBackup(await file.text(), file.size);
    await importData(data, file.name);
  } catch (e) { message('復元できませんでした：' + (e?.message || e) + '（データは変更していません）', 'err'); }
}
async function importData(data, label) {
  const [cs, ss] = await Promise.all([db.allCustomers(), db.allSessions()]);
  const cIds = new Set(cs.map(c => c.id)), sIds = new Set(ss.map(s => s.id));
  const dupC = data.customers.filter(c => cIds.has(c.id)).length, dupS = data.sessions.filter(s => sIds.has(s.id)).length;
  const demo = data.sessions.filter(s => s.source === 'demo').length;
  const recN = data.sessions.reduce((a, s) => a + s.recoveries.length, 0);
  const body = `${label}\n${data.legacy ? '旧PULSE（pulse-v2）形式' : 'PULSE バックアップ'}\n\n顧客 ${data.customers.length}件（同じIDの既存 ${dupC}件は上書き）\nセッション ${data.sessions.length}件（うちデモ ${demo}件、同じIDの既存 ${dupS}件は上書き）\n回復記録 ${recN}件\n\nこのファイルに含まれない既存データは削除しません。`;
  if (!(await confirmAsk('バックアップを復元', body, '復元する'))) return;
  await db.importAll(data.customers, data.sessions);
  await loadCustomers();
  if (S.customerId) S.sessions = await db.sessionsFor(S.customerId);
  renderAll();
  toast('復元しました');
  message(`復元しました：顧客 ${data.customers.length}件・セッション ${data.sessions.length}件`);
}
// 同一オリジンに旧localStorage（pulse-v2）がある場合だけ読み込みを提案（削除はしない）
async function checkLegacyLocal() {
  let raw = null;
  try { raw = localStorage.getItem('pulse-v2'); } catch { return; }
  if (!raw) return;
  if (await db.getMeta('legacyLocalImported').catch(() => false)) return;
  message('このブラウザに旧形式（pulse-v2）の保存データがあります。', 'warn', {
    label: '読み込む', fn: async () => {
      try {
        const data = parseBackup(raw, raw.length);
        await importData(data, 'ブラウザ内の旧データ（pulse-v2）');
        await db.setMeta('legacyLocalImported', Date.now());
      } catch (e) { message('旧データを読み込めませんでした：' + (e?.message || e), 'err'); }
    },
  });
}

// ---------- charts / animation loop ----------
function drawCharts() {
  const now = Date.now();
  if (S.mode === 'exercise') {
    const src = S.session?.points?.length ? S.session.points : S.buffer;
    const win = 300000;
    const xMax = fresh() || !src.length ? now : Math.max(now, src.at(-1).t);
    const pts = src.filter(p => p.t >= xMax - win - 10000).map(p => ({ x: p.t, y: p.hr }));
    const base = S.session?.startedAt ?? (src[0]?.t || now);
    const ticks = [];
    for (let x = base; x <= xMax; x += 60000) if (x >= xMax - win) ticks.push({ x, label: fmtDur((x - base) / 1000) });
    const mx = maxHrFor(customer()).value;
    drawChart($('liveChart'), { points: pts, xMin: xMax - win, xMax, gap: GAP_MS, xTicks: ticks, trailingGapFrom: now,
      refLines: [S.preHr ? { y: S.preHr, label: '運動前 ' + S.preHr } : null, mx ? { y: mx, label: '最大 ' + mx } : null].filter(Boolean),
      empty: '心拍を受信するとここに推移を表示します' });
  }
  if (S.mode === 'recovery') {
    const r = S.recovery;
    const pts = r ? r.samples.map(p => ({ x: p.s, y: p.hr })) : [];
    const el = r ? Math.min(120, (now - r.startedAt) / 1000) : 0;
    drawChart($('recChart'), { points: pts, xMin: 0, xMax: 120, gap: GAP_MS / 1000, trailingGapFrom: r && !r.ended ? el : null,
      xTicks: [0, 30, 60, 90, 120].map(x => ({ x, label: x + '秒' })),
      refLines: [r ? { y: r.startHr, label: '開始 ' + r.startHr } : null, S.preHr ? { y: S.preHr, label: '運動前 ' + S.preHr } : null].filter(Boolean),
      marks: r && !r.ended ? [{ x: el, color: 'rgba(130,227,198,.5)' }] : [],
      color: getComputedStyle(document.documentElement).getPropertyValue('--mint').trim(),
      empty: r ? '受信待ち' : '回復計測を開始するとここに表示します' });
  }
  if (S.mode === 'result') {
    const s = viewedSession();
    const pts = (s?.points || []).map(p => ({ x: p.t, y: p.hr }));
    const x0 = s?.startedAt ?? now, x1 = Math.max(x0 + 60000, s?.points?.at(-1)?.t ?? x0);
    const span = x1 - x0, step = span > 3600000 ? 600000 : span > 900000 ? 300000 : 60000;
    const ticks = []; for (let x = x0; x <= x1; x += step) ticks.push({ x, label: fmtDur((x - x0) / 1000) });
    drawChart($('resChart'), { points: pts, xMin: x0, xMax: x1, gap: GAP_MS, xTicks: ticks,
      marks: (s?.recoveries || []).map((r, i) => ({ x: r.startedAt, label: '回復' + (i + 1), color: 'rgba(130,227,198,.7)' })),
      refLines: (() => { const pre = s && s === S.session ? S.preHr : s?.preHr; return pre ? [{ y: pre, label: '運動前 ' + pre }] : []; })(),
      empty: 'セッションのデータがありません' });
  }
}
let lastFrame = 0, rafId = 0;
function loop(ts) {
  rafId = 0;
  if (document.hidden || reduceMotion.matches) return;
  const active = (S.live && Date.now() - S.live.t < 60000) || (S.recovery && !S.recovery.ended);
  if (ts - lastFrame > 50 && (S.mode === 'exercise' || S.mode === 'recovery')) { drawCharts(); lastFrame = ts; }
  if (active) rafId = requestAnimationFrame(loop);
}
function kick() { if (!rafId && !document.hidden && !reduceMotion.matches) rafId = requestAnimationFrame(loop); }

// 1秒ごとの状態確認（受信途絶の判定・自動保存）。非表示中は止める
let lastAuto = 0;
setInterval(() => {
  if (document.hidden) return;
  renderLive();
  kick();
  if (S.session && S.dirty && Date.now() - lastAuto > 15000 && !S.saving) { lastAuto = Date.now(); saveSession({ silent: true }); }
}, 1000);

function renderAll() {
  renderSaveState();
  renderLive();
  if (S.mode === 'prep') renderPrep();
  if (S.mode === 'recovery') renderRecovery();
  if (S.mode === 'result') renderResult();
  drawCharts(); kick();
}

// ---------- events ----------
function num(v) { const n = Number(v); return v === '' || !Number.isFinite(n) ? null : Math.round(n); }
function bind() {
  $('connectBtn').onclick = onConnectClick;
  $('demoBtn').onclick = () => (S.demo ? stopDemo() : startDemo());
  $('customerSelect').onchange = (e) => selectCustomer(e.target.value);
  $('newCustomer').onclick = async () => {
    if (S.recovery) { message('回復計測中は顧客を登録できません。', 'warn'); return; }
    openCustomerDialog(false);
  };
  $('editCustomer').onclick = () => openCustomerDialog(true);
  $('customerForm').onsubmit = submitCustomer;
  $('fCancel').onclick = () => $('customerDialog').close();
  $('deleteCustomer').onclick = deleteCustomer;
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => setMode(b.dataset.mode);
  $('goExercise').onclick = () => setMode('exercise');

  $('ageInput').onchange = (e) => { const a = num(e.target.value); if (a == null || a < 10 || a > 100) { message('年齢は10〜100で入力してください。', 'warn'); renderPrep(); return; } updateCustomerField({ age: a }); };
  $('useMeasured').onchange = (e) => {
    const c = customer(); if (!c) return;
    if (e.target.checked && !validHr(c.measuredMaxHr)) { message('先に測定済み最大心拍を入力してください。', 'warn'); e.target.checked = false; return; }
    updateCustomerField({ useMeasuredMax: e.target.checked });
  };
  $('measuredMax').onchange = (e) => {
    const v = num(e.target.value);
    if (v != null && !validHr(v)) { message('最大心拍は25〜250で入力してください。', 'warn'); renderPrep(); return; }
    updateCustomerField(v == null ? { measuredMaxHr: null, useMeasuredMax: false } : { measuredMaxHr: v });
  };
  $('restingInput').onchange = (e) => {
    const v = num(e.target.value);
    if (v != null && !validHr(v)) { message('安静時心拍は25〜250で入力してください。', 'warn'); renderPrep(); return; }
    updateCustomerField({ restingHr: v });
  };
  $('setPreHr').onclick = () => { const v = recentAvg(); if (v == null) return; S.preHr = v; if (S.session) markDirty(); toast(`今日の運動前心拍を ${v} bpm で登録しました`); renderPrep(); };
  $('preHrInput').onchange = (e) => {
    const v = num(e.target.value);
    if (v != null && !validHr(v)) { message('心拍は25〜250で入力してください。', 'warn'); renderPrep(); return; }
    S.preHr = v; if (S.session) markDirty(); renderPrep();
  };

  $('startRecovery').onclick = startRecovery;
  $('finishRecovery').onclick = finishRecovery;
  $('cancelRecovery').onclick = cancelRecovery;
  for (const id of ['cExercise', 'cLoad', 'cReps']) $(id).oninput = () => renderRecovery();
  $('methodSeg').onchange = () => renderRecovery();

  $('endSession').onclick = () => endSession();
  $('backToLive').onclick = () => { S.viewSessionId = null; renderResult(); drawCharts(); };
  $('resCsv').onclick = () => { const s = viewedSession(); if (s) exportSessionCsv(s); };
  $('recCsv').onclick = exportRecoveryCsv;
  $('backupBtn').onclick = backup;
  $('restoreInput').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; await restore(f); };
  for (const id of ['infoBtn', 'infoBtn2']) $(id).onclick = () => $('infoDialog').showModal();

  addEventListener('beforeunload', (e) => { if ((S.session && S.dirty) || S.recovery) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.session && S.dirty) saveSession({ silent: true });
    if (!document.hidden) renderAll();
  });
  addEventListener('resize', () => drawCharts());
  reduceMotion.addEventListener?.('change', () => renderAll());
}

// ---------- init ----------
async function init() {
  bind();
  if (!bleSupported()) { $('unsupported').hidden = false; $('connectBtn').disabled = true; }
  setConn('idle', '未接続');
  try {
    await loadCustomers();
    const last = await db.getMeta('selectedCustomer');
    if (last && S.customers.some(c => c.id === last)) { S.customerId = last; S.sessions = await db.sessionsFor(last); renderCustomerSelect(); }
    await checkLegacyLocal();
  } catch (e) {
    message('保存領域を開けませんでした：' + (e?.message || e) + '　記録は保存されません。', 'err');
  }
  setMode(S.customerId ? 'exercise' : 'prep');
}
init();

// テスト用フック（URLに ?debug があるときのみ）。データは外部へ送信しない
if (new URLSearchParams(location.search).has('debug')) window.__pulse = { S, db, onSample };
