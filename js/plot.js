/* ==========================================================================
   plot.js — a small, dependency-free 2D plotting library for the widgets.
   Theme-aware (reads CSS variables on every draw), HiDPI-aware, resize-aware.
   ========================================================================== */
import { cssVar } from './ui.js';

export const PALETTES = {
  inferno: ['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'],
  viridis: ['#440154', '#472d7b', '#3b528b', '#2c728e', '#21908d', '#27ad81', '#5cc863', '#aadc32', '#fde725'],
  cool:    ['#08306b', '#2171b5', '#6baed6', '#c6dbef', '#f7f7f7', '#fcbba1', '#fb6a4a', '#cb181d', '#67000d'],
  air:     ['#06202b', '#0b4a63', '#14799c', '#2fb0d6', '#7fe0f7', '#e8fbff'],
  fire:    ['#12070a', '#4a0f13', '#8c1d12', '#d2480f', '#ff8a1f', '#ffd23f', '#fff6c8'],
};
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function palette(name, t) {
  const p = PALETTES[name] || name;
  t = Math.min(1, Math.max(0, t));
  const f = t * (p.length - 1), i = Math.min(p.length - 2, Math.floor(f)), u = f - i;
  const a = hex2rgb(p[i]), b = hex2rgb(p[i + 1]);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

export function niceTicks(min, max, count = 6) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
function logTicks(min, max) {
  const out = [], dec = Math.log10(max / min), mults = dec > 3.2 ? [1] : [1, 2, 5], stepE = dec > 7 ? Math.ceil(dec / 6) : 1;
  const e0 = Math.floor(Math.log10(min)), e1 = Math.ceil(Math.log10(max));
  for (let e = e0; e <= e1; e++) { if (stepE > 1 && ((e - e0) % stepE)) continue; for (const m of mults) { const v = m * Math.pow(10, e); if (v >= min * 0.999 && v <= max * 1.001) out.push(v); } }
  return out;
}
const fmtTick = (v) => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e6 || a < 1e-3) return v.toExponential(0).replace('e+', 'e');
  if (a >= 1000) return (v / 1000).toFixed(a % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return (+v.toPrecision(4)).toString();
};

export class Plot {
  /**
   * @param canvas  <canvas class="plot">
   * @param opts    {xmin,xmax,ymin,ymax,xlabel,ylabel,xlog,ylog,aspect,margin,xtickFmt,ytickFmt,title}
   */
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = Object.assign({ xmin: 0, xmax: 1, ymin: 0, ymax: 1, xlabel: '', ylabel: '', aspect: 1.7, grid: true, margin: null, title: '' }, opts);
    this.draw = () => {};
    this.hover = null;
    this._ro = new ResizeObserver(() => { this._size(); this.draw(); });
    this._ro.observe(canvas.parentElement || canvas); if (canvas.parentElement) this._ro.observe(canvas);
    window.addEventListener('themechange', () => this.draw());
    this._size();
  }
  set(opts) { Object.assign(this.o, opts); return this; }
  onDraw(fn) { this.draw = fn; return this; }
  redraw() { this.draw(); }

  _size() {
    const c = this.c, w = Math.max(200, c.clientWidth || (c.parentElement ? c.parentElement.clientWidth : 0) || 400);
    const h = this.o.height || Math.max(this.o.minHeight || 0, Math.round(w / this.o.aspect));
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    this.dpr = dpr; this.W = w; this.H = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  get m() { const d = this.o.margin || {}; return { l: d.l ?? 56, r: d.r ?? 16, t: d.t ?? (this.o.title ? 30 : 14), b: d.b ?? 44 }; }
  get iw() { return this.W - this.m.l - this.m.r; }
  get ih() { return this.H - this.m.t - this.m.b; }

  X(x) {
    const o = this.o, t = o.xlog ? (Math.log(x) - Math.log(o.xmin)) / (Math.log(o.xmax) - Math.log(o.xmin)) : (x - o.xmin) / (o.xmax - o.xmin);
    return this.m.l + t * this.iw;
  }
  Y(y) {
    const o = this.o, t = o.ylog ? (Math.log(y) - Math.log(o.ymin)) / (Math.log(o.ymax) - Math.log(o.ymin)) : (y - o.ymin) / (o.ymax - o.ymin);
    return this.m.t + (1 - t) * this.ih;
  }
  invX(px) { const o = this.o, t = (px - this.m.l) / this.iw; return o.xlog ? Math.exp(Math.log(o.xmin) + t * (Math.log(o.xmax) - Math.log(o.xmin))) : o.xmin + t * (o.xmax - o.xmin); }
  invY(py) { const o = this.o, t = 1 - (py - this.m.t) / this.ih; return o.ylog ? Math.exp(Math.log(o.ymin) + t * (Math.log(o.ymax) - Math.log(o.ymin))) : o.ymin + t * (o.ymax - o.ymin); }

  colors() {
    return { text: cssVar('--text-2'), muted: cssVar('--muted'), grid: cssVar('--line'), grid2: cssVar('--line-2'), bg: cssVar('--bg-2'), strong: cssVar('--text'),
      air: cssVar('--air'), fire: cssVar('--fire'), fuel: cssVar('--fuel'), ok: cssVar('--ok'), bad: cssVar('--bad'), violet: cssVar('--violet'), warn: cssVar('--warn'), metal: cssVar('--metal') };
  }

  begin() {
    const ctx = this.ctx, col = this.col = this.colors();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, this.W, this.H);
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    return this;
  }

  axes() {
    const { ctx, o, col, m } = this;
    const xt = o.xlog ? logTicks(o.xmin, o.xmax) : (o.xticks || niceTicks(Math.min(o.xmin, o.xmax), Math.max(o.xmin, o.xmax), Math.max(3, Math.floor(this.iw / 90))));
    const yt = o.ylog ? logTicks(o.ymin, o.ymax) : (o.yticks || niceTicks(Math.min(o.ymin, o.ymax), Math.max(o.ymin, o.ymax), Math.max(3, Math.floor(this.ih / 50))));
    ctx.lineWidth = 1; ctx.textBaseline = 'middle';
    if (o.grid) {
      ctx.strokeStyle = col.grid; ctx.beginPath();
      for (const v of xt) { const x = Math.round(this.X(v)) + .5; ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + this.ih); }
      for (const v of yt) { const y = Math.round(this.Y(v)) + .5; ctx.moveTo(m.l, y); ctx.lineTo(m.l + this.iw, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = col.grid2; ctx.strokeRect(m.l + .5, m.t + .5, this.iw, this.ih);
    ctx.fillStyle = col.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const fx = o.xtickFmt || fmtTick, fy = o.ytickFmt || fmtTick;
    for (const v of xt) ctx.fillText(fx(v), this.X(v), m.t + this.ih + 6);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of yt) ctx.fillText(fy(v), m.l - 8, this.Y(v));
    ctx.fillStyle = col.text; ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    if (o.xlabel) ctx.fillText(o.xlabel, m.l + this.iw / 2, this.H - 4);
    if (o.ylabel) { ctx.save(); ctx.translate(13, m.t + this.ih / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.fillText(o.ylabel, 0, -6); ctx.restore(); }
    if (o.title) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = col.strong; ctx.fillText(o.title, m.l, 6); }
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    return this;
  }

  clip(on = true) {
    const { ctx, m } = this;
    if (on) { ctx.save(); ctx.beginPath(); ctx.rect(m.l, m.t, this.iw, this.ih); ctx.clip(); } else ctx.restore();
    return this;
  }

  line(xs, ys, { color, width = 2, dash = null, alpha = 1, join = 'round' } = {}) {
    const { ctx } = this;
    ctx.save(); ctx.strokeStyle = color || this.col.air; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.lineJoin = join; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < xs.length; i++) {
      if (!Number.isFinite(ys[i]) || !Number.isFinite(xs[i])) { pen = false; continue; }
      const x = this.X(xs[i]), y = this.Y(ys[i]);
      if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.restore();
    return this;
  }

  fn(f, x0, x1, opts = {}, n = 200) {
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) { const x = this.o.xlog ? Math.exp(Math.log(x0) + (Math.log(x1) - Math.log(x0)) * i / n) : x0 + (x1 - x0) * i / n; xs.push(x); ys.push(f(x)); }
    return this.line(xs, ys, opts);
  }

  area(xs, y0s, y1s, { color, alpha = 0.18 } = {}) {
    const { ctx } = this;
    ctx.save(); ctx.fillStyle = color || this.col.air; ctx.globalAlpha = alpha; ctx.beginPath();
    xs.forEach((x, i) => { const px = this.X(x), py = this.Y(y1s[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(this.X(xs[i]), this.Y(y0s[i]));
    ctx.closePath(); ctx.fill(); ctx.restore();
    return this;
  }

  points(xs, ys, { color, r = 3.5, stroke = null } = {}) {
    const { ctx } = this;
    ctx.save(); ctx.fillStyle = color || this.col.fire;
    xs.forEach((x, i) => { ctx.beginPath(); ctx.arc(this.X(x), this.Y(ys[i]), r, 0, 7); ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } });
    ctx.restore(); return this;
  }

  dot(x, y, { color, r = 5, ring = true } = {}) {
    const { ctx } = this, px = this.X(x), py = this.Y(y);
    ctx.save(); ctx.fillStyle = color || this.col.fire; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    if (ring) { ctx.strokeStyle = this.col.strong; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore(); return this;
  }

  hline(y, { color, dash = [5, 4], width = 1.2, label = '', align = 'left', alpha = 1 } = {}) {
    const { ctx, m } = this, py = this.Y(y);
    ctx.save(); ctx.strokeStyle = color || this.col.muted; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(m.l, py); ctx.lineTo(m.l + this.iw, py); ctx.stroke(); ctx.setLineDash([]);
    if (label) { ctx.fillStyle = color || this.col.muted; ctx.textAlign = align === 'left' ? 'left' : 'right'; ctx.textBaseline = 'bottom'; ctx.globalAlpha = 1; ctx.fillText(label, align === 'left' ? m.l + 6 : m.l + this.iw - 6, py - 3); }
    ctx.restore(); return this;
  }
  vline(x, { color, dash = [5, 4], width = 1.2, label = '', alpha = 1 } = {}) {
    const { ctx, m } = this, px = this.X(x);
    ctx.save(); ctx.strokeStyle = color || this.col.muted; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(px, m.t); ctx.lineTo(px, m.t + this.ih); ctx.stroke(); ctx.setLineDash([]);
    if (label) { ctx.fillStyle = color || this.col.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.globalAlpha = 1; ctx.fillText(label, px + 5, m.t + 4); }
    ctx.restore(); return this;
  }
  band(x0, x1, { color, alpha = 0.12, label = '' } = {}) {
    const { ctx, m } = this; const a = this.X(x0), b = this.X(x1);
    ctx.save(); ctx.fillStyle = color || this.col.fire; ctx.globalAlpha = alpha; ctx.fillRect(Math.min(a, b), m.t, Math.abs(b - a), this.ih); ctx.globalAlpha = 1;
    if (label) { ctx.fillStyle = color || this.col.fire; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(label, (a + b) / 2, m.t + 4); }
    ctx.restore(); return this;
  }
  hband(y0, y1, { color, alpha = 0.12, label = '' } = {}) {
    const { ctx, m } = this; const a = this.Y(y0), b = this.Y(y1);
    ctx.save(); ctx.fillStyle = color || this.col.fire; ctx.globalAlpha = alpha; ctx.fillRect(m.l, Math.min(a, b), this.iw, Math.abs(b - a)); ctx.globalAlpha = 1;
    if (label) { ctx.fillStyle = color || this.col.fire; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(label, m.l + this.iw - 6, (a + b) / 2); }
    ctx.restore(); return this;
  }

  /** text at data coords */
  text(x, y, str, { color, align = 'left', base = 'middle', size = 12, weight = 600, bg = false } = {}) {
    const { ctx } = this;
    ctx.save(); ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = base;
    const px = this.X(x), py = this.Y(y);
    if (bg) { const w = ctx.measureText(str).width + 8; ctx.fillStyle = this.col.bg; ctx.globalAlpha = .85; const bx = align === 'left' ? px - 4 : align === 'right' ? px - w + 4 : px - w / 2; ctx.fillRect(bx, py - size / 2 - 3, w, size + 6); ctx.globalAlpha = 1; }
    ctx.fillStyle = color || this.col.text; ctx.fillText(str, px, py);
    ctx.restore(); return this;
  }
  /** text at pixel coords */
  ptext(px, py, str, { color, align = 'left', base = 'top', size = 12, weight = 600 } = {}) {
    const { ctx } = this;
    ctx.save(); ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = color || this.col.text; ctx.fillText(str, px, py); ctx.restore(); return this;
  }

  arrow(x0, y0, x1, y1, { color, width = 2, head = 8, px = false } = {}) {
    const { ctx } = this;
    const a = px ? x0 : this.X(x0), b = px ? y0 : this.Y(y0), c = px ? x1 : this.X(x1), d = px ? y1 : this.Y(y1);
    const ang = Math.atan2(d - b, c - a);
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = color || this.col.air; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c - Math.cos(ang) * head * .6, d - Math.sin(ang) * head * .6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c, d); ctx.lineTo(c - head * Math.cos(ang - .38), d - head * Math.sin(ang - .38)); ctx.lineTo(c - head * Math.cos(ang + .38), d - head * Math.sin(ang + .38)); ctx.closePath(); ctx.fill();
    ctx.restore(); return this;
  }

  legend(items, { pos = 'tr' } = {}) {
    const { ctx, m } = this;
    ctx.save(); ctx.font = '600 11.5px ui-sans-serif, system-ui, sans-serif';
    const w = Math.max(...items.map(i => ctx.measureText(i[1]).width)) + 36, hh = items.length * 17 + 8;
    const x = pos.includes('r') ? m.l + this.iw - w - 6 : m.l + 8, y = pos.includes('t') ? m.t + 6 : m.t + this.ih - hh - 6;
    ctx.globalAlpha = .88; ctx.fillStyle = this.col.bg; ctx.fillRect(x, y, w, hh); ctx.globalAlpha = 1;
    ctx.strokeStyle = this.col.grid2; ctx.strokeRect(x + .5, y + .5, w, hh);
    items.forEach(([c, t, dash], i) => {
      const yy = y + 13 + i * 17;
      ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x + 7, yy); ctx.lineTo(x + 24, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = this.col.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 30, yy);
    });
    ctx.restore(); return this;
  }

  /** heat-map: value(x,y) -> 0..1 ; resolution nx*ny cells */
  heat(value, { nx = 80, ny = 60, pal = 'inferno' } = {}) {
    const { ctx, m } = this;
    const off = document.createElement('canvas'); off.width = nx; off.height = ny;
    const octx = off.getContext('2d'), img = octx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = this.o.xmin + (i + .5) / nx * (this.o.xmax - this.o.xmin);
      const y = this.o.ymax - (j + .5) / ny * (this.o.ymax - this.o.ymin);
      const v = value(x, y);
      const k = (j * nx + i) * 4;
      if (v == null || !Number.isFinite(v)) { img.data[k + 3] = 0; continue; }
      const [r, g, b] = palette(pal, v);
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, m.l, m.t, this.iw, this.ih); ctx.restore();
    return this;
  }

  colorbar(pal, vmin, vmax, label = '', left = false) {
    const { ctx, m } = this, w = 10, x = left ? m.l + 36 : m.l + this.iw - w - 8, y = m.t + 10, hh = Math.min(120, this.ih - 20);
    const g = ctx.createLinearGradient(0, y + hh, 0, y);
    for (let i = 0; i <= 10; i++) { const [r, gg, b] = palette(pal, i / 10); g.addColorStop(i / 10, `rgb(${r | 0},${gg | 0},${b | 0})`); }
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(x, y, w, hh); ctx.strokeStyle = this.col.grid2; ctx.strokeRect(x + .5, y + .5, w, hh);
    ctx.fillStyle = this.col.text; ctx.font = '11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(fmtTick(vmax), x - 4, y + 4); ctx.fillText(fmtTick(vmin), x - 4, y + hh - 4);
    if (label) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(label, x + w, y - 3); }
    ctx.restore(); return this;
  }

  /** pointer interaction in data coordinates. cb(x, y, ev, phase) phase: 'down'|'move'|'up'|'leave' */
  interact(cb, { dragOnly = false } = {}) {
    const c = this.c; let down = false;
    const pos = (ev) => { const r = c.getBoundingClientRect(); const px = (ev.clientX - r.left) * (this.W / r.width), py = (ev.clientY - r.top) * (this.H / r.height); return { px, py, x: this.invX(px), y: this.invY(py) }; };
    c.addEventListener('pointerdown', (e) => { down = true; c.setPointerCapture(e.pointerId); const p = pos(e); cb(p.x, p.y, p, 'down'); });
    c.addEventListener('pointermove', (e) => { if (dragOnly && !down) return; const p = pos(e); this.hover = p; cb(p.x, p.y, p, 'move'); });
    c.addEventListener('pointerup', (e) => { down = false; const p = pos(e); cb(p.x, p.y, p, 'up'); });
    c.addEventListener('pointerleave', () => { this.hover = null; cb(null, null, null, 'leave'); });
    return this;
  }
  inPlot(px, py) { return px >= this.m.l && px <= this.m.l + this.iw && py >= this.m.t && py <= this.m.t + this.ih; }
}

/** Make a canvas with the .plot class inside a host */
export function makeCanvas(host, aspect = 1.7) {
  const wrap = document.createElement('div');
  const c = document.createElement('canvas'); c.className = 'plot';
  wrap.appendChild(c); host.appendChild(wrap);
  return { canvas: c, wrap };
}
