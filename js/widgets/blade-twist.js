// Why a fan / compressor blade is twisted: the relative wind angle changes with radius.
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'A blade is a wing that moves in a circle: why it must be twisted', note: 'The air arrives straight along the axis at speed Cₐ. Near the hub the blade moves slowly; near the tip it moves fast. The relative wind therefore comes in at a steeper angle farther out, so a flat blade would be at the wrong angle of attack almost everywhere. Twist fixes that.' });
  const tri = h('canvas', { class: 'plot', style: { aspectRatio: '1.2', height: 'auto' } }), cv = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Rotation speed', min: 10000, max: 140000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sCa = slider({ label: 'Air speed along the axis  Cₐ', min: 30, max: 220, step: 1, value: 115, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sH = slider({ label: 'Blade angle at the hub  β_hub', min: 5, max: 60, step: 0.5, value: 33, unit: '°', fmt: v => v.toFixed(1), onInput: upd });
  const sT = slider({ label: 'Blade angle at the tip  β_tip', min: 20, max: 80, step: 0.5, value: 66, unit: '°', fmt: v => v.toFixed(1), onInput: upd });
  const sP = slider({ label: 'Look at this radius (hub → tip)', min: 0, max: 1, step: 0.01, value: 1, fmt: v => (6 + v * 15).toFixed(1) + ' mm', onInput: upd });
  const ro = { U: readout('Blade speed U', 'm/s', 'cool'), W: readout('Relative wind W', 'm/s', 'hot'), bf: readout('Wind angle', '°'), inc: readout('Angle of attack', '°', 'fuel'), M: readout('Relative Mach', '', 'bad') };
  body.append(h('div', { class: 'wgrid' }, tri, cv), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sCa.el, sH.el, sT.el, sP.el, h('div', { class: 'btn-row' }, button('Our impeller (33° → 66°)', () => { sH.set(33); sT.set(66); upd(); }, 'small fire'), button('Flat, untwisted blade', () => { sH.set(50); sT.set(50); upd(); }, 'small'))), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p = new Plot(cv, { xmin: 6, xmax: 21, ymin: 0, ymax: 90, xlabel: 'radius (mm), hub → tip', ylabel: 'angle from the axis (°)', aspect: 1.2, title: 'Wind angle vs blade angle' });
  const ctx = tri.getContext('2d');
  function upd() {
    const N = sN.get(), Ca = sCa.get(), bH = sH.get(), bT = sT.get(), f = sP.get();
    const w = 2 * Math.PI * N / 60, r = (6 + f * 15) / 1000, U = w * r, W = Math.hypot(U, Ca), bf = Math.atan2(U, Ca) * 57.2958, bb = bH + (bT - bH) * f, inc = bf - bb;
    ro.U.set(U.toFixed(0)); ro.W.set(W.toFixed(0)); ro.bf.set(bf.toFixed(1)); ro.inc.set((inc > 0 ? '+' : '') + inc.toFixed(1), Math.abs(inc) < 4 ? 'good' : 'bad'); ro.M.set((W / Math.sqrt(1.4 * 287 * 285)).toFixed(2), W / 338 > 0.95 ? 'bad' : 'cool');
    // plot
    const c = p.begin().col; p.axes();
    p.band(6, 21, { color: c.ok, alpha: 0 });
    const rs = [], bfs = [], bbs = [], lo = [], hi = [];
    for (let q = 6; q <= 21.001; q += 0.25) { const ff = (q - 6) / 15; rs.push(q); const fl = Math.atan2(w * q / 1000, Ca) * 57.2958; bfs.push(fl); bbs.push(bH + (bT - bH) * ff); lo.push(fl - 4); hi.push(fl + 4); }
    p.area(rs, lo, hi, { color: c.ok, alpha: .16 });
    p.line(rs, bfs, { color: c.air, width: 2.8 }); p.line(rs, bbs, { color: c.fire, width: 2.8 });
    p.vline(6 + f * 15, { color: c.muted, dash: [3, 3] });
    p.legend([[c.air, 'relative wind angle'], [c.fire, 'blade angle'], [c.ok, 'good angle-of-attack band (±4°)']], { pos: 'tl' });
    // triangle
    const wd = tri.clientWidth, ht = tri.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (tri.width !== Math.round(wd * dpr)) { tri.width = Math.round(wd * dpr); tri.height = Math.round(ht * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = c.bg; ctx.fillRect(0, 0, wd, ht);
    const sc = Math.min(wd, ht) * 0.62 / Math.max(U, Ca, 120), ox = wd * 0.5 - U * sc / 2, oy = ht * 0.82;
    const arrow = (x0, y0, x1, y1, col, lbl, dx = 6, dy = -6) => { const a = Math.atan2(y1 - y0, x1 - x0); ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 10 * Math.cos(a - .4), y1 - 10 * Math.sin(a - .4)); ctx.lineTo(x1 - 10 * Math.cos(a + .4), y1 - 10 * Math.sin(a + .4)); ctx.closePath(); ctx.fill(); ctx.font = '700 12px sans-serif'; ctx.fillText(lbl, (x0 + x1) / 2 + dx, (y0 + y1) / 2 + dy); };
    // triangle: start at O; U to the right (blade motion), Ca up (axial flow) ; W = from start of Ca-tail... draw as in the blade frame
    arrow(ox, oy, ox + U * sc, oy, c.fuel, 'U (blade motion)', -20, 18);
    arrow(ox + U * sc, oy, ox + U * sc, oy - Ca * sc, c.air, 'Cₐ (axial air)', 8, 4);
    arrow(ox, oy, ox + U * sc, oy - Ca * sc, c.fire, 'W (wind seen by the blade)', -80, -10);
    // blade as a short line at blade angle from the axis, through the tip of W
    const bx = ox + U * sc, by = oy - Ca * sc, L = 70, ang = bb * Math.PI / 180;
    ctx.strokeStyle = c.strong; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - Math.sin(ang) * L * .0 + 0, by); ctx.lineTo(bx - Math.sin(ang) * L, by + Math.cos(ang) * L * 1.0); ctx.stroke();
    ctx.lineWidth = 1; ctx.fillStyle = c.text; ctx.font = '600 12px sans-serif'; ctx.fillText('blade', bx + 8, by + 30);
    ctx.fillStyle = c.muted; ctx.fillText(`wind ${bf.toFixed(0)}° · blade ${bb.toFixed(0)}° · attack ${(inc > 0 ? '+' : '') + inc.toFixed(1)}°`, 12, 22);
  }
  p.onDraw(upd); upd();
}
