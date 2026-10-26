// Web Bluetooth Heart Rate Service (0x180D) / Heart Rate Measurement (0x2A37)
import { parseHeartRate, validHr } from './core.js';

const HR_SERVICE = 0x180d;
const HR_MEASUREMENT = 0x2a37;

export const bleSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth && window.isSecureContext;

export class HeartRateSensor {
  constructor({ onHr, onState }) {
    this.onHr = onHr; this.onState = onState;
    this.device = null; this.char = null; this.userClosed = false; this.retries = 0;
    this._onValue = (e) => {
      const r = parseHeartRate(e.target.value);
      if (r && validHr(r.hr)) this.onHr(r.hr, r.contact);
    };
    this._onDisc = () => this._disconnected();
  }
  get connected() { return !!this.device?.gatt?.connected && !!this.char; }

  async connect() {
    if (!bleSupported()) throw Object.assign(Error('unsupported'), { code: 'unsupported' });
    this.userClosed = false;
    let device;
    try {
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: [HR_SERVICE] }] });
    } catch (e) {
      if (e.name === 'NotFoundError') throw Object.assign(Error('cancel'), { code: 'cancel' });
      throw e;
    }
    if (this.device && this.device !== device) this.device.removeEventListener('gattserverdisconnected', this._onDisc);
    this.device = device;
    device.addEventListener('gattserverdisconnected', this._onDisc);
    await this._attach();
  }

  async _attach() {
    this.onState('connecting', this.device?.name);
    const server = await this.device.gatt.connect();
    const service = await server.getPrimaryService(HR_SERVICE);
    const ch = await service.getCharacteristic(HR_MEASUREMENT);
    ch.removeEventListener('characteristicvaluechanged', this._onValue);
    ch.addEventListener('characteristicvaluechanged', this._onValue);
    await ch.startNotifications();
    this.char = ch; this.retries = 0;
    this.onState('connected', this.device?.name);
  }

  async _disconnected() {
    this.char = null;
    if (this.userClosed) { this.onState('disconnected'); return; }
    // 予期しない切断：数回だけ自動再接続を試みる
    while (!this.userClosed && this.retries < 3) {
      this.retries++;
      this.onState('reconnecting', this.device?.name, this.retries);
      await new Promise(r => setTimeout(r, 1000 * this.retries));
      if (this.userClosed) break;
      try { await this._attach(); return; } catch { /* retry */ }
    }
    if (!this.userClosed) this.onState('lost', this.device?.name);
  }

  async reconnect() {
    if (!this.device) return this.connect();
    this.userClosed = false; this.retries = 0;
    await this._attach();
  }

  disconnect() {
    this.userClosed = true;
    try { this.char?.stopNotifications?.(); } catch { /* ignore */ }
    this.char = null;
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    else this.onState('disconnected');
  }
}
