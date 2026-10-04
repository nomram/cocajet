// Gridded ion thruster: ions fall through a voltage, v = sqrt(2qV/m); thrust is tiny, Isp enormous. Animated cut-away plus a mission calculator.
import { h, shell, slider, select, readout, whenVisible } from '../ui.js';
import { Plot } from '../plot.js';
import { IONS, ionThruster, G0 } from '../electric-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Ion thruster: accelerate atoms with voltage', note: 'A discharge turns a fraction of the propellant gas into ions. Two grids with a high voltage between them pull the ions out and fire them away at v = √(2qV/m): tens of km/s, 10× faster than any chemical exhaust. A neutraliser sprays electrons into the beam so the spacecraft does not charge up. The catch is the <b>space-charge (Child–Langmuir) limit</b>: only so many ions fit through the gap per second, so the thrust is tiny (the weight of a coin or two) and every newton needs kilowatts. In the animation the speeds are exaggerated but in correct proportion.' });
  const cvM = h('canvas', { class: 'plot' }), cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sp = select({ label: 'Propellant', options: Object.entries(IONS).map(([k, v]) => [k, v.n + ': ' + v.note]), value: 'xenon', onChange: upd });
  const sV = slider({ label: 'Grid (beam) voltage', min: 300, max: 5000, step: 10, value: 1100, unit: 'V', fmt: v => v.toFixed(0), onInput: upd });
  const sG = slider({ label: 'Grid gap', min: 0.4, max: 3, step: 0.05, value: 1.0, unit: 'mm', fmt: v => v.toFixed(2), onInput: upd });
  const sD = slider({ label: 'Beam diameter', min: 3, max: 40, step: 0.5, value: 30, unit: 'cm', fmt: v => v.toFixed(1), onInput: upd });
  const sL = slider({ label: 'Current as a share of the space-charge limit', min: 5, max: 60, step: 1, value: 25, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const sPa = slider({ label: 'Available electrical power (solar array)', min: 0.2, max: 15, step: 0.1, value: 5, unit: 'kW', fmt: v => v.toFixed(1), onInput: upd });
  const sMd = slider({ label: 'Spacecraft mass without propellant', min: 100, max: 3000, step: 10, value: 400, unit: 'kg', fmt: v => v.toFixed(0), onInput: upd });
  const sMp = slider({ label: 'Propellant carried', min: 10, max: 600, step: 5, value: 70, unit: 'kg', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { v: readout('Exhaust speed', 'km/s', 'cool'), F: readout('Thrust', 'mN', 'fuel'), P: readout('Electrical power', 'kW', 'hot'), isp: readout('Specific impulse', 's', 'good'), k: readout('Thrust per kilowatt', 'mN/kW', 'cool'), dv: readout('Δv with the propellant carried', 'km/s', 'hot'), t: readout('Time to burn it all', 'days', 'cool'), chem: readout('Chemical rocket (Isp 320 s) for the same Δv: propellant', 'kg', 'bad') };
  body.append(h('div', {}, cvM), h('div', { class: 'wgrid even', style: { marginTop: '10px' } }, cvA, cvB), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sp.el, sV.el, sG.el, sD.el, sL.el, sPa.el, sMd.el, sMp.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pM = new Plot(cvM, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 4.2, minHeight: 200, margin: { l: 4, r: 4, t: 4, b: 4 }, grid: false });
  const pA = new Plot(cvA, { xmin: 300, xmax: 5000, ymin: 0, ymax: 10000, aspect: 1.5, xlabel: 'grid voltage (V)', ylabel: 'specific impulse (s)', title: 'Isp rises with √V', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const pB = new Plot(cvB, { xmin: 0, xmax: 10, ymin: 0, ymax: 400, aspect: 1.5, xlabel: 'electrical power (kW)', ylabel: 'thrust (mN)', title: 'Thrust vs power: the price of speed', margin: { l: 52, r: 12, t: 28, b: 40 } });
  let cur = null, parts = [], last = 0; const rnd = Math.random;
  const prm = () => ({ Vb: sV.get(), d: sG.get() / 1000, D: sD.get() / 100, loading: sL.get() / 100, M: IONS[sp.get()].M, Pavail: sPa.get() * 1000 });
  function upd() {
    const p = prm(), r = cur = ionThruster(p), md = sMd.get(), mp = sMp.get(), dv = r.Isp * G0 * Math.log((md + mp) / md), days = r.mdot > 0 ? mp / r.mdot / 86400 : Infinity;
    ro.v.set((r.v / 1000).toFixed(1)); ro.F.set((r.F * 1000).toFixed(0)); ro.P.set((r.P / 1000).toFixed(2), r.throttled ? 'bad' : 'hot'); ro.isp.set(r.Isp.toFixed(0)); ro.k.set((r.FperP * 1e6).toFixed(1));
    ro.dv.set((dv / 1000).toFixed(1)); ro.t.set(days > 1e4 ? '∞' : days.toFixed(0)); ro.chem.set((md * (Math.exp(dv / (320 * G0)) - 1)).toFixed(0));
    let c = pA.begin().col; pA.axes(); const xs = [], ys = []; for (let V = 300; V <= 5000; V += 50) { xs.push(V); ys.push(ionThruster({ ...p, Vb: V, Pavail: Infinity }).Isp); }
    pA.set({ ymax: Math.ceil(Math.max(...ys) * 1.08 / 1000) * 1000 }); c = pA.begin().col; pA.axes(); pA.line(xs, ys, { color: c.violet, width: 3 }); pA.dot(p.Vb, r.Isp, { color: c.fire, r: 7 }); pA.hband(0, 460 / 1, { color: c.air, alpha: .0 });
    pA.hline(450, { color: c.air, label: 'best chemical rocket ≈ 450 s', align: 'right' }); pA.text(p.Vb, r.Isp + pA.o.ymax * 0.06, 'now', { color: c.fire, align: 'center', weight: 800 });
    const px = [], py = []; for (let P = 0.1; P <= 10; P += 0.1) { px.push(P); py.push(ionThruster({ ...p, Pavail: P * 1000 }).F * 1000); }
    pB.set({ ymax: Math.ceil(Math.max(...py, r.F * 1000) * 1.1 / 50) * 50 }); c = pB.begin().col; pB.axes(); pB.line(px, py, { color: c.fuel, width: 3 }); pB.dot(r.P / 1000, r.F * 1000, { color: c.fire, r: 7 });
    pB.text(9.8, pB.o.ymax * 0.1, 'a piece of paper weighs about 50 mN', { color: c.muted, align: 'right', size: 11 });
  }
  // --- animation: neutral atoms (grey) -> ions (blue) -> grids -> fast beam; electrons (yellow) from the neutraliser ---
  const vis = whenVisible(el, () => {});
  function draw(now) {
    if (!vis()) { last = now; requestAnimationFrame(draw); return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; const p = pM, ctx = p.ctx, W = p.W, H = p.H, c = p.begin().col;
    if (!cur) { requestAnimationFrame(draw); return; }
    const vs = Math.sqrt(sV.get() / 1100), grid1 = W * 0.36, grid2 = W * 0.395, x0 = W * 0.04, cy = H / 2, hh = H * 0.34;
    // body
    ctx.fillStyle = c.metal; ctx.globalAlpha = .75; ctx.fillRect(x0, cy - hh - 6, grid1 - x0, 6); ctx.fillRect(x0, cy + hh, grid1 - x0, 6); ctx.fillRect(x0, cy - hh - 6, 6, 2 * hh + 12); ctx.globalAlpha = 1;
    const gl = ctx.createLinearGradient(x0, 0, grid1, 0); gl.addColorStop(0, 'rgba(120,170,255,0.05)'); gl.addColorStop(1, 'rgba(120,170,255,0.30)'); ctx.fillStyle = gl; ctx.fillRect(x0 + 6, cy - hh, grid1 - x0 - 6, 2 * hh);
    for (const gx of [grid1, grid2]) { ctx.strokeStyle = c.strong; ctx.lineWidth = 3; ctx.setLineDash([2, 7]); ctx.beginPath(); ctx.moveTo(gx, cy - hh - 6); ctx.lineTo(gx, cy + hh + 6); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = c.muted; ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('discharge chamber (plasma)', (x0 + grid1) / 2, cy + hh + 12); ctx.textAlign = 'right'; ctx.fillText('screen grid  +' + sV.get().toFixed(0) + ' V', grid1 - 6, cy - hh - 24); ctx.textAlign = 'left'; ctx.fillText('accelerator grid  (−)', grid2 + 6, cy + hh + 12);
    { const bg = ctx.createLinearGradient(grid2, 0, W, 0); bg.addColorStop(0, 'rgba(70,150,255,0.18)'); bg.addColorStop(1, 'rgba(70,150,255,0)'); ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(grid2, cy - hh); ctx.lineTo(W, cy - hh * 1.5); ctx.lineTo(W, cy + hh * 1.5); ctx.lineTo(grid2, cy + hh); ctx.closePath(); ctx.fill(); }
    // spawn
    const rate = 26 * (0.4 + 1.2 * cur.I / Math.max(cur.I, 0.5));
    if (rnd() < rate * dt) parts.push({ k: 'a', x: x0 + 12, y: cy + (rnd() * 2 - 1) * hh * 0.9, vx: 90 + rnd() * 60, vy: (rnd() - .5) * 60 });
    const vend = (W * 0.5) * vs * 1.1;
    for (const q of parts) {
      if (q.k === 'a') { q.x += q.vx * dt; q.y += q.vy * dt; if (q.y < cy - hh + 3 || q.y > cy + hh - 3) q.vy *= -1; if (q.x > grid1 - 120 && (rnd() < 4 * dt || q.x > grid1 - 14)) { q.k = 'i'; q.vx = 120; q.vy = 0; q.y = Math.max(cy - hh * 0.9, Math.min(cy + hh * 0.9, q.y)); } if (q.x > grid1) q.vx = 0; }
      if (q.k === 'i') { q.x += q.vx * dt; if (q.x > grid1) q.vx = Math.min(vend, q.vx + vend * 5.5 * dt * vs); if (q.x > grid2 + 8) q.vx = Math.min(vend, q.vx * 1 + 0); }
      if (q.k === 'e') { q.x += q.vx * dt; q.y += q.vy * dt; if (q.x > W * 0.95) q.dead = true; }
    }
    parts = parts.filter(q => !q.dead && q.x < W * 1.02 && !(q.k === 'a' && q.x > grid1 + 1));
    // neutraliser electrons near the beam
    if (rnd() < 8 * dt) parts.push({ k: 'e', x: grid2 + 20, y: cy - hh * 1.15, vx: vend * 0.55, vy: 40 + rnd() * 20 });
    for (const q of parts) { if (q.k === 'a') { ctx.fillStyle = 'rgba(130,140,150,0.9)'; ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 7); ctx.fill(); } else if (q.k === 'i') { const len = Math.min(40, q.vx * 0.02); ctx.strokeStyle = 'rgba(70,150,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x - len, q.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.fillStyle = '#1f6fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, 3.6, 0, 7); ctx.fill(); ctx.stroke(); } else { ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, 7); ctx.fill(); } }
    // neutraliser and labels
    ctx.fillStyle = c.metal; ctx.fillRect(grid2 + 10, cy - hh * 1.35, 26, 12); ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('neutraliser', grid2 + 42, cy - hh * 1.35 + 6); ctx.textBaseline = 'top';
    { const items = [['#1f6fff', '● ions'], ['rgb(130,140,150)', '● atoms'], ['#d9a900', '● electrons']]; ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; const ws = items.map(it => ctx.measureText(it[1]).width + 12); let lx = W - 8 - ws.reduce((x, y) => x + y, 0); items.forEach((it, i) => { ctx.fillStyle = it[0]; ctx.fillText(it[1], lx, cy + hh + 12); lx += ws[i]; }); }
    ctx.fillStyle = c.strong; ctx.textAlign = 'right'; ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(`v = ${(cur.v / 1000).toFixed(1)} km/s    F = ${(cur.F * 1000).toFixed(0)} mN    Isp = ${cur.Isp.toFixed(0)} s`, W - 8, 8);
    requestAnimationFrame(draw);
  }
  [pA, pB].forEach(p => p.onDraw(upd)); upd(); requestAnimationFrame(draw);
}
