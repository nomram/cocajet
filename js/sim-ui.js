/* sim-ui.js — dial gauges for the simulator page */
import { cssVar } from './ui.js';

export function drawGauge(cv, { value, min, max, zones = [], label = '', unit = '', fmt = (v) => v.toFixed(0), ticks = 6 }) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.56, r = Math.min(w / 2, h * 0.56) - 10, a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const ang = (v) => a0 + (a1 - a0) * Math.min(1, Math.max(0, (v - min) / (max - min)));
  const text = cssVar('--text'), muted = cssVar('--muted'), line = cssVar('--line-2');
  ctx.lineWidth = 11; ctx.lineCap = 'butt';
  ctx.strokeStyle = line; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  for (const [z0, z1, c] of zones) { ctx.strokeStyle = cssVar(c); ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(cx, cy, r, ang(z0), ang(z1)); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.lineWidth = 1.5; ctx.strokeStyle = muted; ctx.fillStyle = muted; ctx.font = '600 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= ticks; i++) {
    const v = min + (max - min) * i / ticks, a = ang(v), c = Math.cos(a), s = Math.sin(a);
    ctx.beginPath(); ctx.moveTo(cx + c * (r - 9), cy + s * (r - 9)); ctx.lineTo(cx + c * (r - 15), cy + s * (r - 15)); ctx.stroke();
    ctx.fillText(fmt(v), cx + c * (r - 27), cy + s * (r - 27));
  }
  const a = ang(value);
  ctx.strokeStyle = cssVar('--fire'); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); ctx.stroke();
  ctx.fillStyle = text; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill();
  ctx.fillStyle = text; ctx.font = '700 17px ui-monospace, monospace'; ctx.fillText(fmt(value), cx, cy + r * 0.42);
  ctx.font = '600 10.5px sans-serif'; ctx.fillStyle = muted; ctx.fillText((label + (unit ? ' · ' + unit : '')).toUpperCase(), cx, cy + r * 0.42 + 17);
}
