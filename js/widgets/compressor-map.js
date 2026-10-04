// A real compressor map for the CJ-1 impeller, computed by the engine model.
import { h, shell, slider, readout, toggle } from '../ui.js';
import { Plot, palette } from '../plot.js';
import { CJ1, isa, compressorMap, steadyAt, compressor } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Compressor map: pressure ratio vs air flow', note: 'Each curve is one rotor speed. Colour = efficiency. To the left of the dashed red line the blades stall and the compressor <em>surges</em> (violent backflow). On the right the inducer chokes and pressure collapses. The white line is where this engine actually runs: it is the balance of turbine, nozzle and compressor.' });
  const cv = h('canvas', { class: 'plot' });
  const sN = slider({ label: 'Operating speed', min: 45000, max: 125000, step: 500, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sB = slider({ label: 'Backsweep β₂', min: 0, max: 50, step: 1, value: 30, unit: '°', fmt: v => v.toFixed(0), onInput: build });
  const sC = slider({ label: 'Tip clearance', min: 0.1, max: 1.2, step: 0.05, value: 0.4, unit: 'mm', fmt: v => v.toFixed(2), onInput: build });
  const ro = { m: readout('Air flow', 'kg/s', 'cool'), pr: readout('Pressure ratio', '', 'good'), eta: readout('Efficiency', '%', 'fuel'), sm: readout('Surge margin', '%', 'bad'), inc: readout('Blade incidence', '°') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sN.el, sB.el, sC.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'Try the backsweep: more sweep widens the stable range (a longer, flatter characteristic) but lowers the pressure at the same speed. Open the clearance: the whole map sags.'))));
  const p = new Plot(cv, { xmin: 0, xmax: 0.28, ymin: 1, ymax: 2.4, xlabel: 'air mass flow (kg/s)', ylabel: 'pressure ratio', aspect: 1.2 });
  const amb = isa(0); let lines = [], op = [];
  const speeds = [50000, 60000, 70000, 80000, 90000, 100000, 110000, 115000, 120000];
  function build() {
    const pp = { ...CJ1, beta2: sB.get(), clearance: sC.get() / 1000 };
    lines = compressorMap(pp, amb, speeds, 40).map(l => ({ ...l, pts: l.pts.filter(q => q.PR > 1.005 && q.MW1 < 1.0) }));
    op = []; for (let N = 45000; N <= 125000; N += 5000) { const g = steadyAt(pp, N, amb); op.push({ N, m: g.m, PR: g.PRc, eta: g.etaC, g }); }
    upd();
  }
  function upd() {
    const N = sN.get(), pp = { ...CJ1, beta2: sB.get(), clearance: sC.get() / 1000 };
    const c = p.begin().col; p.axes();
    lines.forEach(l => {
      const xs = l.pts.map(q => q.m), ys = l.pts.map(q => q.PR);
      for (let i = 1; i < l.pts.length; i++) { const e = (l.pts[i].eta + l.pts[i - 1].eta) / 2, [r, g, b] = palette('viridis', (e - 0.45) / 0.4); p.line([xs[i - 1], xs[i]], [ys[i - 1], ys[i]], { color: `rgb(${r | 0},${g | 0},${b | 0})`, width: 3 }); }
      if (l.pts.length) p.text(l.pts[l.pts.length - 1].m + 0.003, l.pts[l.pts.length - 1].PR, (l.N / 1000) + 'k', { color: c.text, size: 10.5, base: 'middle' });
    });
    p.line(lines.filter(l => l.pts.length).map(l => l.pts[0].m), lines.filter(l => l.pts.length).map(l => l.pts[0].PR), { color: c.bad, width: 2.2, dash: [6, 4] });
    p.text(0.012, 1.18, 'SURGE', { color: c.bad, size: 11, weight: 800 });
    p.line(op.map(o => o.m), op.map(o => o.PR), { color: '#fff', width: 2.6 }); p.text(op[op.length - 1].m - 0.01, op[op.length - 1].PR + 0.06, 'operating line', { color: c.text, size: 11, align: 'right' });
    const g = steadyAt(pp, N, amb), cm = g.comp;
    p.dot(g.m, g.PRc, { color: c.fire, r: 7 });
    // surge margin at this speed
    const l = compressorMap(pp, amb, [N], 40)[0].pts.filter(q => q.PR > 1.005 && q.MW1 < 1.0), s = l[0];
    const sm = s ? ((s.PR / g.PRc) * (g.m / s.m) - 1) * 100 : 0;
    ro.m.set(g.m.toFixed(3)); ro.pr.set(g.PRc.toFixed(2)); ro.eta.set((g.etaC * 100).toFixed(0)); ro.sm.set(sm.toFixed(0), sm < 12 ? 'bad' : 'good'); ro.inc.set((cm.incidence > 0 ? '+' : '') + cm.incidence.toFixed(1));
    p.colorbar('viridis', 0.45, 0.85, 'η', true);
  }
  p.onDraw(upd); build();
}
