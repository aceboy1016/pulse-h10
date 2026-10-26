// PULSE storage: IndexedDB (browser-local only; nothing is sent anywhere)
const DB_NAME = 'pulse-h10';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(Error('このブラウザでは保存機能を使えません'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('customerId', 'customerId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error || Error('データベースを開けません')); };
    req.onblocked = () => reject(Error('別のタブがデータベースを使用中です。他のPULSEタブを閉じてください'));
  });
  return dbp;
}

function tx(stores, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || Error('保存に失敗しました'));
    t.onabort = () => reject(t.error || Error('保存が中断されました'));
    result = fn(t);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const db = {
  async allCustomers() { return tx(['customers'], 'readonly', t => reqP(t.objectStore('customers').getAll())).then(p => p); },
  async putCustomer(c) { await tx(['customers'], 'readwrite', t => { t.objectStore('customers').put(c); }); return true; },
  async deleteCustomer(id) {
    await tx(['customers', 'sessions'], 'readwrite', t => {
      t.objectStore('customers').delete(id);
      const idx = t.objectStore('sessions').index('customerId');
      idx.openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const cur = e.target.result; if (!cur) return;
        t.objectStore('sessions').delete(cur.primaryKey); cur.continue();
      };
    });
    return true;
  },
  async sessionsFor(customerId) { return tx(['sessions'], 'readonly', t => reqP(t.objectStore('sessions').index('customerId').getAll(customerId))).then(p => p); },
  async allSessions() { return tx(['sessions'], 'readonly', t => reqP(t.objectStore('sessions').getAll())).then(p => p); },
  async putSession(s) { await tx(['sessions'], 'readwrite', t => { t.objectStore('sessions').put(s); }); return true; },
  async deleteSession(id) { await tx(['sessions'], 'readwrite', t => { t.objectStore('sessions').delete(id); }); return true; },
  async getMeta(key) { return tx(['meta'], 'readonly', t => reqP(t.objectStore('meta').get(key))).then(p => p?.value); },
  async setMeta(key, value) { await tx(['meta'], 'readwrite', t => { t.objectStore('meta').put({ key, value }); }); return true; },
  async importAll(customers, sessions) {
    await tx(['customers', 'sessions'], 'readwrite', t => {
      for (const c of customers) t.objectStore('customers').put(c);
      for (const s of sessions) t.objectStore('sessions').put(s);
    });
    return true;
  },
};

// tx() resolves with the value returned by fn — for reads that is a promise, so unwrap it
for (const k of ['allCustomers', 'sessionsFor', 'allSessions', 'getMeta']) {
  const f = db[k];
  db[k] = async (...a) => await (await f(...a));
}
