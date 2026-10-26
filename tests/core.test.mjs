// Run: node tests/core.test.mjs   (Node 18+)
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// core.js is an ES module without package.json "type"; load it via a temp .mjs copy
const here = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'pulse-'));
writeFileSync(join(tmp, 'core.mjs'), readFileSync(join(here, '..', 'core.js')));
const C = await import(pathToFileURL(join(tmp, 'core.mjs')).href);

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const dv = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

t('8bit heart rate', () => assert.equal(C.parseHeartRate(dv([0x00, 72])).hr, 72));
t('8bit with contact bits', () => { const r = C.parseHeartRate(dv([0x06, 150])); assert.equal(r.hr, 150); assert.equal(r.contact, true); });
t('contact not detected', () => assert.equal(C.parseHeartRate(dv([0x04, 0])).contact, false));
t('16bit heart rate (LE)', () => assert.equal(C.parseHeartRate(dv([0x01, 0x2c, 0x01])).hr, 300));
t('16bit 180', () => assert.equal(C.parseHeartRate(dv([0x01, 180, 0])).hr, 180));
t('8bit with RR intervals ignored', () => assert.equal(C.parseHeartRate(dv([0x10, 88, 0x00, 0x04])).hr, 88));
t('short packet', () => { assert.equal(C.parseHeartRate(dv([0x01, 5])), null); assert.equal(C.parseHeartRate(dv([0])), null); });

t('estimated max HR', () => { assert.equal(C.estimateMaxHr(40), 180); assert.equal(C.estimateMaxHr(25), 191); });
t('measured max overrides', () => {
  assert.deepEqual(C.maxHrFor({ age: 40, measuredMaxHr: 190, useMeasuredMax: true }), { value: 190, kind: 'measured' });
  assert.deepEqual(C.maxHrFor({ age: 40, measuredMaxHr: 190, useMeasuredMax: false }), { value: 180, kind: 'estimated' });
});
t('intensity bands (ACSM %HRmax)', () => {
  assert.equal(C.intensityFor(56).key, 'vlight'); assert.equal(C.intensityFor(57).key, 'light');
  assert.equal(C.intensityFor(64).key, 'mod'); assert.equal(C.intensityFor(76).key, 'mod');
  assert.equal(C.intensityFor(77).key, 'vig'); assert.equal(C.intensityFor(96).key, 'max'); assert.equal(C.intensityFor(110).key, 'max');
});

t('stats + gaps', () => {
  const p = [{ t: 0, hr: 100 }, { t: 1000, hr: 110 }, { t: 9000, hr: 120 }];
  const s = C.stats(p);
  assert.equal(s.avg, 110); assert.equal(s.min, 100); assert.equal(s.max, 120); assert.equal(s.durationS, 9); assert.equal(s.gapS, 8);
  assert.equal(C.segments(p).length, 2);
});

const mk = (fn, n = 125) => Array.from({ length: n }, (_, i) => ({ s: i + 1, hr: fn(i + 1) }));
t('recovery 30/60/120', () => {
  const r = C.finalizeRecovery({ startHr: 150, samples: mk(s => 150 - Math.round(s / 2)) });
  assert.equal(r.drops[30].value, 15); assert.equal(r.drops[60].value, 30); assert.equal(r.drops[120].value, 60);
});
t('recovery: no sample within ±2s → missing', () => {
  const samples = mk(s => 140).filter(p => p.s < 57 || p.s > 63);
  const r = C.finalizeRecovery({ startHr: 150, samples });
  assert.equal(r.drops[60].status, 'missing');
  assert.equal(r.drops[120].status, 'gap'); // later marks see the 6s hole as a gap
});
t('recovery: tolerance picks nearest', () => {
  const samples = [...mk(s => 140, 57), { s: 58.5, hr: 120 }, { s: 61.8, hr: 119 }];
  const r = C.recoveryAt({ startHr: 150, samples, ended: true }, 60);
  assert.equal(r.status, 'ok'); assert.equal(r.hr, 120); assert.equal(r.value, 30);
});
t('recovery: gap before mark invalidates', () => {
  const samples = mk(s => 130).filter(p => p.s < 20 || p.s > 27);
  const r = C.finalizeRecovery({ startHr: 150, samples });
  assert.equal(r.drops[30].status, 'gap'); assert.equal(r.drops[60].status, 'gap');
});
t('recovery: ended early → short', () => {
  const r = C.finalizeRecovery({ startHr: 150, samples: mk(s => 130, 40) });
  assert.equal(r.drops[30].status, 'ok'); assert.equal(r.drops[60].status, 'short'); assert.equal(r.drops[120].status, 'short');
});
t('recovery: time reached but no data → missing', () => {
  const r = C.finalizeRecovery({ startHr: 150, samples: mk(s => 130, 100), durationS: 122 });
  assert.equal(r.drops[60].status, 'ok'); assert.equal(r.drops[120].status, 'missing');
});
t('recovery pending while running', () => assert.equal(C.recoveryAt({ startHr: 150, samples: mk(s => 130, 20) }, 60).status, 'pending'));

t('condition key / comparable', () => {
  const a = { customerId: 'c', method: '座位', source: 'sensor', exercise: 'スクワット ', load: '６０kg', reps: '10回' };
  const b = { customerId: 'c', method: '座位', source: 'sensor', exercise: 'スクワット', load: '60KG', reps: '10回' };
  assert.ok(C.comparable(a, b));
  assert.ok(!C.comparable(a, { ...b, method: '立位' }));
  assert.ok(!C.comparable(a, { ...b, source: 'demo' }));
  assert.ok(!C.comparable({ ...a, exercise: '' }, { ...b, exercise: '' }));
  assert.ok(!C.comparable(a, { ...b, customerId: 'x' }));
});

t('csv escaping + injection guard', () => {
  assert.equal(C.csvCell('a,b'), '"a,b"'); assert.equal(C.csvCell('=1+1'), "'=1+1"); assert.equal(C.csvCell('say "hi"'), '"say ""hi"""');
  assert.ok(C.toCsv([['a', 1]]).startsWith('﻿a,1'));
});

// legacy v2 backup (format observed on the old site)
const legacy = {
  version: 2,
  customers: [{ id: 'lc1', name: '<img src=x onerror=alert(1)>山田', age: 45, note: 'メモ' }],
  sessions: [{
    id: 'ls1', customer: 'lc1', date: '2026-10-01T10:00:00.000Z', age: 45, maxhr: 177, baseline: 70, source: 'sensor',
    points: Array.from({ length: 200 }, (_, i) => ({ t: Date.UTC(2026, 9, 1, 10) + i * 1000, hr: 120 + (i % 10), source: 'sensor' })),
    recoveries: [{ start: Date.UTC(2026, 9, 1, 10, 2), last: 0, hr: 150, samples: Array.from({ length: 62 }, (_, i) => ({ seconds: i + 1, hr: 150 - i })), done: true, invalid: false, source: 'sensor', customer: 'lc1', drop: 59, posture: '座位', condition: 'スクワット', saved: true }],
  }],
};
t('legacy v2 import', () => {
  const d = C.parseBackup(JSON.stringify(legacy), 1000);
  assert.equal(d.legacy, true);
  assert.equal(d.customers[0].name, '<img src=x onerror=alert(1)>山田'); // kept as text; UI renders via textContent
  const s = d.sessions[0];
  assert.equal(s.customerId, 'lc1'); assert.equal(s.maxHr, 177); assert.equal(s.preHr, 70); assert.equal(s.points.length, 200);
  const r = s.recoveries[0];
  assert.equal(r.method, '座位'); assert.equal(r.exercise, 'スクワット'); assert.equal(r.startHr, 150);
  assert.equal(r.drops[60].value, 59); assert.equal(r.drops[120].status, 'short');
});
t('legacy raw localStorage shape', () => {
  const { version, ...raw } = legacy;
  assert.equal(C.parseBackup(JSON.stringify({ ...raw, selected: 'lc1' }), 1000).legacy, true);
});
t('legacy invalid recovery stays invalid', () => {
  const l2 = structuredClone(legacy); l2.sessions[0].recoveries[0].invalid = true;
  assert.equal(C.parseBackup(JSON.stringify(l2), 1000).sessions[0].recoveries[0].drops[60].status, 'gap');
});
t('v3 roundtrip', () => {
  const d = C.parseBackup(JSON.stringify(legacy), 1000);
  const b = C.makeBackup(d.customers, d.sessions);
  const d2 = C.parseBackup(JSON.stringify(b), 1000);
  assert.equal(d2.legacy, false);
  assert.deepEqual(d2.sessions[0].points, d.sessions[0].points);
  assert.equal(d2.sessions[0].recoveries[0].drops[60].value, 59);
});
t('rejects bad files', () => {
  assert.throws(() => C.parseBackup('nope', 4), /JSON/);
  assert.throws(() => C.parseBackup('[]', 2), /形式/);
  assert.throws(() => C.parseBackup(JSON.stringify({ version: 9, customers: [], sessions: [] }), 10), /対応していない/);
  assert.throws(() => C.parseBackup('{}', 60 * 1024 * 1024), /大きすぎ/);
  const bad = structuredClone(legacy); bad.customers[0].id = '../../x y';
  assert.throws(() => C.parseBackup(JSON.stringify(bad), 1000), /ID/);
  const orphan = structuredClone(legacy); orphan.sessions[0].customer = 'nobody';
  assert.throws(() => C.parseBackup(JSON.stringify(orphan), 1000), /顧客が存在しない/);
  const badPts = structuredClone(legacy); badPts.sessions[0].points[3].hr = 'x';
  assert.throws(() => C.parseBackup(JSON.stringify(badPts), 1000), /型/);
});
t('demo flag survives import', () => {
  const l = structuredClone(legacy); l.sessions[0].points[0].source = 'demo'; l.sessions[0].source = 'demo';
  const d = C.parseBackup(JSON.stringify(l), 1000);
  assert.equal(d.sessions[0].source, 'demo'); assert.equal(d.sessions[0].recoveries[0].source, 'demo');
});

// Write a legacy sample file for browser restore testing
writeFileSync(join(tmp, 'legacy-sample.json'), JSON.stringify(legacy));
console.log(`\n${n} tests passed`);
