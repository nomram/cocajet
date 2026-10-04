// How hot does the flame-tube wall get, and what does film cooling do? (steady heat balance, thin wall)
import { h, shell, slider, select, readout, toggle } from '../ui.js';
import { Plot } from '../plot.js';

const SIG = 5.67e-8;
const MATS = [['Coke can aluminium (3004)', 933, 'melts at 660 °C'], ['Stainless 304', 1223, 'scales/creeps above ~950 °C'], ['Stainless 310S', 1423, 'to ~1150 °C'], ['Inconel 625', 1523, 'to ~1250 °C']];
export function wallTemp({ Tg, Tc, etaF, hg, hc, ew }) {
  const Taw = Tg - etaF * (Tg - Tc);
  const f = (Tw) => hg * (Taw - Tw) + 0.6 * ew * 0.2 * SIG * (Tg ** 4 - Tw ** 4) - hc * (Tw - Tc) - ew * SIG * (Tw ** 4 - Tc ** 4);
  let lo = Tc, hi = Tg; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export default function init(el) {
  const { body } = shell(el, { title: 'Why the Coke can survives at all: wall temperature and film cooling', note: 'The wall sits between a 2 000 K flame on one side and 366 K compressor air on the other. Without cooling air it would equalise near the mean: far above aluminium’s 660 °C melting point. The rows of holes feed a <em>film</em> of cool air along the wall, lowering the gas temperature the wall actually “feels” (the film effectiveness η).' });
  const c1 = h('canvas', { class: 'plot' }), c2 = h('canvas', { class: 'plot' });
  const sG = slider({ label: 'Flame gas temperature', min: 900, max: 2300, step: 10, value: 1900, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sE = slider({ label: 'Film-cooling effectiveness η', min: 0, max: 0.85, step: 0.01, value: 0.45, fmt: v => v.toFixed(2), onInput: upd });
  const sHg = slider({ label: 'Hot-side heat transfer  h (W/m²K)', min: 100, max: 700, step: 10, value: 260, fmt: v => v.toFixed(0), onInput: upd });
  const sHc = slider({ label: 'Cold-side cooling-air  h (W/m²K)', min: 50, max: 500, step: 10, value: 180, fmt: v => v.toFixed(0), onInput: upd });
  const sEm = slider({ label: 'Wall emissivity (shiny 0.1 … oxidised 0.8)', min: 0.1, max: 0.9, step: 0.05, value: 0.4, fmt: v => v.toFixed(2), onInput: upd });
  const sc = select({ label: 'Compare with', options: MATS.map((m, i) => [i, m[0]]), value: 0, onChange: upd });
  const ro = { Tw: readout('Wall temperature', '°C', 'hot'), lim: readout('Limit of the material', '°C', 'cool'), mg: readout('Margin', 'K', 'good'), Taw: readout('Gas the wall “feels”', '°C') };
  body.append(h('div', { class: 'wgrid even' }, c1, c2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sG.el, sE.el, sHg.el, sHc.el, sEm.el, sc.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(c1, { xmin: 0, xmax: 0.85, ymin: 300, ymax: 1700, xlabel: 'film-cooling effectiveness η', ylabel: 'wall temperature (K)', aspect: 1.4, title: 'More cooling air → cooler wall' });
  const p2 = new Plot(c2, { xmin: 72, xmax: 165, ymin: 300, ymax: 2300, xlabel: 'distance along the flame tube z (mm)', ylabel: 'temperature (K)', aspect: 1.4, title: 'Gas vs wall, along the tube' });
  function upd() {
    const Tg = sG.get(), Tc = 366, e = sE.get(), hg = sHg.get(), hc = sHc.get(), ew = sEm.get(), m = MATS[+sc.get()];
    const Tw = wallTemp({ Tg, Tc, etaF: e, hg, hc, ew });
    ro.Tw.set((Tw - 273.15).toFixed(0), Tw > m[1] ? 'bad' : 'hot'); ro.lim.set((m[1] - 273.15).toFixed(0)); ro.mg.set((m[1] - Tw).toFixed(0), m[1] - Tw > 0 ? 'good' : 'bad'); ro.Taw.set((Tg - e * (Tg - Tc) - 273.15).toFixed(0));
    let c = p1.begin().col; p1.axes();
    p1.hband(300, 933, { color: c.air, alpha: .05 });
    MATS.forEach((mm, i) => p1.hline(mm[1], { color: [c.bad, c.warn, c.ok, c.violet][i], label: mm[0].split(' (')[0] + ' limit', align: 'right', alpha: i === +sc.get() ? 1 : .45 }));
    const xs = [], ys = []; for (let q = 0; q <= 0.85; q += 0.01) { xs.push(q); ys.push(wallTemp({ Tg, Tc, etaF: q, hg, hc, ew })); }
    p1.line(xs, ys, { color: c.fire, width: 3.2 }); p1.dot(e, Tw, { color: c.fire });
    // along the tube: use the gas profile shape (peak in the primary zone, diluted downstream)
    c = p2.begin().col; p2.axes();
    const zs = [], tg = [], tw = []; for (let z = 72; z <= 165; z += 1.5) {
      const prof = z < 80 ? 366 + (Tg - 366) * (z - 72) / 8 * 0.6 : z < 92 ? 366 + (Tg - 366) * (0.6 + 0.4 * (z - 80) / 12) : 1070 + (Tg - 1070) * Math.exp(-(z - 92) / 24);
      zs.push(z); tg.push(prof); tw.push(wallTemp({ Tg: prof, Tc, etaF: e, hg, hc, ew }));
    }
    p2.band(78, 100, { color: c.fire, alpha: .08, label: 'primary' }); p2.band(100, 125, { color: c.fuel, alpha: .06, label: 'secondary' }); p2.band(125, 165, { color: c.air, alpha: .06, label: 'dilution' });
    p2.line(zs, tg, { color: c.fire, width: 2.2, dash: [6, 4] }); p2.line(zs, tw, { color: c.strong, width: 3.2 });
    p2.hline(m[1], { color: c.bad, label: m[0].split(' (')[0] + ' limit', align: 'right' });
    p2.legend([[c.fire, 'gas', [6, 4]], [c.strong, 'wall']], { pos: 'tr' });
  }
  [p1, p2].forEach(q => q.onDraw(upd)); upd();
}
