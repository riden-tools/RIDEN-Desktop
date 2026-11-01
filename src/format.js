// 显示精度跟随设备寄存器缩放：scale 100 → 2 位小数，1000 → 3 位。
export const digits = (scale) => Math.max(0, Math.round(Math.log10(scale || 1)));

export function fmt(value, decimals) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return value.toFixed(decimals);
}

export function powerDigits(p) {
  if (p >= 100) return 1;
  if (p >= 10) return 2;
  return 3;
}

export function duration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

export function clock(t, withMs = false) {
  const d = new Date(t);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const s = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return withMs ? `${s}.${pad(d.getMilliseconds(), 3)}` : s;
}

export const STATUS = {
  connecting: { text: '连接中', cls: 'warn' },
  online: { text: '在线', cls: 'ok' },
  stale: { text: '无响应', cls: 'warn' },
  error: { text: '离线', cls: 'err' },
};

export function deviceSubtitle(d) {
  const c = d.config;
  if (c.kind === 'remote') return `127.0.0.1:${c.port}`;
  return c.path.replace(/^\\\\\.\\/, '');
}
