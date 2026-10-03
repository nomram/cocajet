// Euler turbomachinery equation: energy given to the air by an impeller (exit velocity triangle + map of pressure ratio).
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { wiesnerSlip } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'The Euler equation: how much energy does the wheel give the air?', note: 'ΔH = U₂·Cθ₂ (air enters with no swirl). The faster the tip moves and the more the air is dragged around with it, the more energy it gets. Slip means the air lags behind the blades, so Cθ₂ is smaller than the ideal.' });
  const tri = h('canvas', { class: 'plot', style: { aspectRatio: '1.3', height: 'auto' } }), map = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Rotation speed', min: 30000, max: 150000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sD = slider({ label: 'Wheel diameter  D₂', min: 30, max: 100, step: 1, value: 56, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sB = slider({ label: 'Backsweep  β₂ (from radial)', min: 0, max: 60, step: 1, value: 30, unit: '°', fmt: v => v.toFixed(0), onInput: upd });
  const sZ = slider({ label: 'Blades at exit', min: 6, max: 40, step: 1, value: 14, fmt: v => v.toFixed(0), onInput: upd });
  const sF = slider({ label: 'Flow coefficient  φ = Cm₂/U₂', min: 0.05, max: 0.5, step: 0.01, value: 0.28, fmt: v => v.toFixed(2), onInput: upd });
  const sE = slider({ label: 'Efficiency  ηc', min: 0.5, max: 0.9, step: 0.01, value: 0.77, fmt: v => v.toFixed(2), onInput: upd });
  const ro = { U: readout('Tip speed U₂', 'm/s', 'cool'), sg: readout('Slip factor σ'), ct: readout('Swirl Cθ₂', 'm/s'), dh: readout('Energy ΔH', 'kJ/kg', 'fuel'), dT: readout('Temperature rise', 'K', 'hot'), pr: readout('Pressure ratio', '', 'good') };
  body.append(h('div', { class: 'wgrid even' }, tri, map), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sD.el, sB.el, sZ.el, sF.el, sE.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p = new Plot(map, { xmin: 40000, xmax: 140000, ymin: 30, ymax: 100, xlabel: 'rpm', ylabel: 'wheel diameter (mm)', aspect: 1.2, title: 'Pressure ratio for this blade design', margin: { l: 52, r: 10, t: 28, b: 42 } });
  const ctx = tri.getContext('2d'), cp = 1005;
  function calc(N, D, b, Z, phi, eta) {
    const U = Math.PI * D / 1000 * N / 60, sg = wiesnerSlip(b, Z * 0.85), Cm = phi * U, Ct = sg * U - Cm * Math.tan(b * Math.PI / 180);
    const dH = U * Ct, dTs = eta * dH / cp, pr = Math.pow(1 + dTs / 288.15, 3.5);
    return { U, sg, Cm, Ct, dH, dT: dH / cp, pr };
  }
  function upd() {
    const N = sN.get(), D = sD.get(), b = sB.get(), Z = sZ.get(), phi = sF.get(), eta = sE.get();
    const r = calc(N, D, b, Z, phi, eta);
    ro.U.set(r.U.toFixed(0)); ro.sg.set(r.sg.toFixed(3)); ro.ct.set(r.Ct.toFixed(0)); ro.dh.set((r.dH / 1000).toFixed(1)); ro.dT.set(r.dT.toFixed(0)); ro.pr.set(r.pr.toFixed(2));
    const c = p.begin().col;
    p.heat((x, y) => { const q = calc(x, y, b, Z, phi, eta); return (q.pr - 1) / 2.2; }, { nx: 70, ny: 50, pal: 'inferno' });
    p.axes();
    // iso tip-speed lines
    for (const u of [200, 300, 400, 500]) { const xs = [], ys = []; for (let x = 40000; x <= 140000; x += 2000) { xs.push(x); ys.push(u / (Math.PI * x / 60) * 1000); } p.line(xs, ys, { color: '#fff', width: 1, dash: [4, 4], alpha: .6 }); p.text(138000, u / (Math.PI * 138000 / 60) * 1000 + 2, u + ' m/s', { color: '#fff', size: 10, align: 'right', base: 'bottom' }); }
    p.dot(N, D, { color: '#fff', r: 7 }); p.dot(115000, 56, { color: c.air, r: 4.5, ring: false }); p.text(116000, 53, 'CJ-1', { color: c.air, size: 11, bg: true });
    p.colorbar('inferno', 1, 3.2, 'PR', true);
    // triangle
    const wd = tri.clientWidth, ht = tri.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (tri.width !== Math.round(wd * dpr)) { tri.width = Math.round(wd * dpr); tri.height = Math.round(ht * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = c.bg; ctx.fillRect(0, 0, wd, ht);
    const sc = Math.min(wd * 0.78, ht * 0.9) / Math.max(r.U, 150), ox = wd * 0.1, oy = ht * 0.88;
    const arrow = (x0, y0, x1, y1, col, lbl, dx = 6, dy = -6, dash = false) => { const a = Math.atan2(y1 - y0, x1 - x0); ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = 3; ctx.setLineDash(dash ? [6, 4] : []); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 10 * Math.cos(a - .4), y1 - 10 * Math.sin(a - .4)); ctx.lineTo(x1 - 10 * Math.cos(a + .4), y1 - 10 * Math.sin(a + .4)); ctx.closePath(); ctx.fill(); ctx.font = '700 12px sans-serif'; ctx.fillText(lbl, (x0 + x1) / 2 + dx, (y0 + y1) / 2 + dy); };
    const Ux = ox + r.U * sc;
    arrow(ox, oy, Ux, oy, c.fuel, 'U₂ blade tip speed', -50, 20);
    // absolute velocity C2 from origin: (Cθ, Cm)
    arrow(ox, oy, ox + r.Ct * sc, oy - r.Cm * sc, c.fire, 'C₂ (air, absolute)', -20, -10);
    // relative velocity W2: from tip of U back to tip of C2
    arrow(Ux, oy, ox + r.Ct * sc, oy - r.Cm * sc, c.air, 'W₂ (seen by blade)', 6, 0);
    // ideal (no slip) swirl marker
    const ctId = r.U - r.Cm * Math.tan(b * Math.PI / 180);
    ctx.strokeStyle = c.muted; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(ox + ctId * sc, oy - r.Cm * sc); ctx.lineTo(ox + ctId * sc, oy + 4); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c.muted; ctx.font = '11px sans-serif'; ctx.fillText('ideal swirl (no slip)', ox + ctId * sc - 40, oy - r.Cm * sc - 8);
    ctx.fillStyle = c.text; ctx.font = '600 12px sans-serif'; ctx.fillText(`Cθ₂ = σU₂ − Cm₂·tanβ₂ = ${r.Ct.toFixed(0)} m/s`, 12, 20); ctx.fillText(`ΔH = U₂·Cθ₂ = ${(r.dH / 1000).toFixed(1)} kJ/kg`, 12, 38);
  }
  p.onDraw(upd); upd();
}
