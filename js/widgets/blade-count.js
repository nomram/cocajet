// How many blades, and how much backsweep? Uses the same compressor model as the engine.
import { h, shell, slider, readout, button } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, compressor, wiesnerSlip } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Number of blades × backsweep: what does the air get?', note: 'Few blades: the air slips between them (low Wiesner slip factor) and the blades are heavily loaded so the flow separates. Many blades: better guidance but more friction and blockage. There is a sweet spot, and it is not the highest count. Same model as the engine simulator, at fixed mass flow.' });
  const heat = h('canvas', { class: 'plot' }), line = h('canvas', { class: 'plot' }), slip = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Rotation speed', min: 60000, max: 140000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sD = slider({ label: 'Wheel diameter', min: 40, max: 80, step: 1, value: 56, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sB = slider({ label: 'Backsweep to look at (right plot)', min: 0, max: 60, step: 1, value: 30, unit: '°', fmt: v => v.toFixed(0), onInput: upd });
  let showEff = false;
  const bPR = button('Colour map: pressure ratio', () => { showEff = false; bPR.classList.add('on'); bEF.classList.remove('on'); upd(); }, 'small on'), bEF = button('Colour map: efficiency', () => { showEff = true; bEF.classList.add('on'); bPR.classList.remove('on'); upd(); }, 'small');
  const ro = { best: readout('Best (max pressure ratio)', '', 'good'), pr: readout('PR at CJ-1 (14 blades, 30°)', '', 'cool'), eff: readout('Efficiency there', '%', 'fuel') };
  body.append(h('div', { class: 'wgrid even' }, heat, line), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sD.el, sB.el, h('div', { class: 'btn-row' }, bPR, bEF), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))), slip));
  const ph = new Plot(heat, { xmin: 6, xmax: 40, ymin: 0, ymax: 60, xlabel: 'blades at the exit', ylabel: 'backsweep β₂ (°)', aspect: 1.25, title: 'Colour map of the compressor wheel (CJ-1 = white dot)', margin: { l: 50, r: 10, t: 28, b: 42 } });
  const pl = new Plot(line, { xmin: 6, xmax: 40, ymin: 1, ymax: 2.6, xlabel: 'blades at the exit', ylabel: 'pressure ratio  /  efficiency×2.5', aspect: 1.25, title: 'Cut at the chosen backsweep', margin: { l: 50, r: 10, t: 28, b: 42 } });
  const ps = new Plot(slip, { xmin: 6, xmax: 40, ymin: 0.5, ymax: 1, xlabel: 'blades at the exit', ylabel: 'slip factor σ', aspect: 2.4, title: 'Wiesner slip factor: more blades, tighter guidance' });
  const res = (D, N, Z, b) => compressor({ ...CJ1, D2: D / 1000, Zfull: Z / 2, Zsplit: Z / 2, beta2: b }, N, 0.15, 288.15, 101325);
  function upd() {
    const N = sN.get(), D = sD.get(), b = sB.get();
    let c = ph.begin().col, best = [0, 0, 0];
    for (let Z = 6; Z <= 40; Z += 2) for (let bb = 0; bb <= 60; bb += 5) { const r = res(D, N, Z, bb); if (r.PR > best[2]) best = [Z, bb, r.PR]; }
    ph.heat((Z, bb) => { const r = res(D, N, Z, bb); return showEff ? (r.eta - 0.55) / 0.3 : (r.PR - 1.2) / 1.5; }, { nx: 36, ny: 24, pal: 'inferno' }); ph.axes();
    ph.dot(14, 30, { color: '#fff', r: 6 }); ph.text(14.8, 33.5, 'CJ-1', { color: '#fff', size: 11 });
    ph.dot(best[0], best[1], { color: c.ok, r: 6 }); ph.hline(b, { color: '#fff', dash: [3, 3], alpha: .8 });
    ph.colorbar('inferno', showEff ? 0.55 : 1.2, showEff ? 0.85 : 2.7, showEff ? 'η' : 'PR', true);
    ro.best.set(`${best[2].toFixed(2)} at ${best[0]} blades, ${best[1]}°`); const rc = res(D, N, 14, 30); ro.pr.set(rc.PR.toFixed(2)); ro.eff.set((rc.eta * 100).toFixed(0));
    c = pl.begin().col; pl.axes();
    const zs = [], prs = [], effs = []; for (let Z = 6; Z <= 40; Z += 1) { const r = res(D, N, Z, b); zs.push(Z); prs.push(r.PR); effs.push(r.eta * 2.5); }
    pl.line(zs, prs, { color: c.fire, width: 2.8 }); pl.line(zs, effs, { color: c.air, width: 2.2, dash: [5, 4] });
    pl.vline(14, { color: c.muted, label: 'CJ-1: 14' });
    pl.legend([[c.fire, 'pressure ratio'], [c.air, 'efficiency (×2.5 for scale)', [5, 4]]], { pos: 'br' });
    c = ps.begin().col; ps.axes();
    const items = [];
    for (const [bb, col] of [[0, c.air], [30, c.fire], [50, c.violet]]) { const xs = [], ys = []; for (let Z = 6; Z <= 40; Z += 1) { xs.push(Z); ys.push(wiesnerSlip(bb, Z * 0.85)); } ps.line(xs, ys, { color: col, width: 2.4 }); items.push([col, `β₂ = ${bb}°`]); }
    ps.legend(items, { pos: 'br' });
  }
  [ph, pl, ps].forEach(q => q.onDraw(upd)); upd();
}
