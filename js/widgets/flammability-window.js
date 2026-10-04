// Flammability window: for what fuel/air mixtures will a flame propagate at all? Plus how long a leak takes to fill a room.
import { h, shell, select, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { FUELS, AIR_MOLE } from '../chem-model.js';

/* published limits, % fuel by volume in air at about 25 °C, 1 atm (vapour for the liquids) */
const LIM = { hydrogen: [4.0, 75], methane: [5.0, 15], propane: [2.1, 9.5], butane: [1.8, 8.4], ethanol: [3.3, 19], methanol: [6.0, 36], octane: [1.0, 6.5], kerosene: [0.7, 5.0] };
const ORDER = ['hydrogen', 'methane', 'propane', 'butane', 'ethanol', 'methanol', 'octane', 'kerosene'];
const R = 8.314462;
const phiOf = (x, k) => { const xs = 1 / (1 + FUELS[k].nO2 / AIR_MOLE.O2); return (x / (1 - x)) / (xs / (1 - xs)); };       // volume fraction -> equivalence ratio
const xOfPhi = (phi, k) => { const xs = 1 / (1 + FUELS[k].nO2 / AIR_MOLE.O2), r = phi * xs / (1 - xs); return r / (1 + r); };

export default function init(el) {
  const { body } = shell(el, { title: 'Flammability window: which mixtures can burn, and how fast does a leak fill a room?', note: 'A flame only travels through a mixture that is neither too lean nor too rich. Limits are published values for a quiet mixture at room temperature (a hot, turbulent combustor widens them). The room estimate assumes the leak mixes perfectly with the room air; in real life a heavier-than-air gas pools near the floor and reaches the limit sooner.' });
  const fsel = select({ label: 'Fuel for the room calculation', options: ORDER.map(k => [k, FUELS[k].name]), value: 'propane', onChange: upd });
  const sV = slider({ label: 'Room volume (a garage is 40–60 m³)', min: 5, max: 400, step: 1, value: 50, unit: 'm³', fmt: v => v.toFixed(0), log: true, onInput: upd });
  const sQ = slider({ label: 'Leak rate (the CJ-1 burns 2.86 g/s of propane)', min: 0.1, max: 50, step: 0.01, value: 2.86, unit: 'g/s', fmt: v => v.toFixed(2), log: true, onInput: upd });
  const cv = h('canvas', { class: 'plot' });
  const ro = { lo: readout('Lean limit', '% vol'), hi: readout('Rich limit', '% vol'), pl: readout('Lean limit φ', ''), ph: readout('Rich limit φ', ''), t: readout('Time to reach the lean limit', 'min', 'bad'), m: readout('Fuel in the room then', 'kg') };
  body.append(h('div', { class: 'ctls' }, fsel.el, sV.el, sQ.el), h('div', { style: { height: '10px' } }), cv, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)));
  const p = new Plot(cv, { xmin: 0.05, xmax: 12, ymin: 0, ymax: ORDER.length, xlog: true, aspect: 2.2, minHeight: 300, grid: true, yticks: [], xlabel: 'equivalence ratio φ  (1 = exactly enough air for the fuel)', margin: { l: 110, r: 14, t: 40, b: 44 }, xtickFmt: v => (+v.toPrecision(2)).toString() });
  function upd() {
    const k = fsel.get(), [lo, hi] = LIM[k], F = FUELS[k], rho = 101325 * F.M / 1000 / (R * 293.15);          // kg/m³ of the pure vapour at 20 °C
    const mLo = lo / 100 * sV.get() * rho, t = mLo / (sQ.get() / 1000) / 60;
    ro.lo.set(lo.toFixed(1)); ro.hi.set(hi.toFixed(1)); ro.pl.set(phiOf(lo / 100, k).toFixed(2)); ro.ph.set(phiOf(hi / 100, k).toFixed(1)); ro.m.set(mLo.toFixed(2));
    ro.t.set(t < 120 ? t.toFixed(t < 10 ? 1 : 0) : (t / 60).toFixed(1) + ' h'); ro.t.el.querySelector('.u').textContent = t < 120 ? 'min' : '';
    const c = p.begin().col, ctx = p.ctx; p.axes();
    ORDER.forEach((q, i) => {
      const [a, b] = LIM[q], x0 = phiOf(a / 100, q), x1 = phiOf(b / 100, q), y0 = p.Y(ORDER.length - i), y1 = p.Y(ORDER.length - i - 1), on = q === k;
      ctx.fillStyle = on ? c.fire : c.fuel; ctx.globalAlpha = on ? 0.95 : 0.55; ctx.fillRect(p.X(x0), y0 + 4, p.X(x1) - p.X(x0), y1 - y0 - 8); ctx.globalAlpha = 1;
      p.ptext(p.m.l - 8, (y0 + y1) / 2, FUELS[q].name.replace(/ \(.*/, '').replace(' / Jet-A', ''), { align: 'right', base: 'middle', color: on ? c.strong : c.text, weight: on ? 800 : 600 });
    });
    p.vline(1, { color: c.muted, alpha: .8 });
    // the CJ-1 combustor: primary zone near phi 1.1, whole engine 0.30
    p.vline(0.30, { color: c.air, width: 2.2, dash: [] }); p.vline(1.1, { color: c.bad, width: 2.2, dash: [] });
    p.ptext(p.X(0.30) + 4, p.m.t - 6, 'whole CJ-1 flow: φ 0.30', { align: 'right', base: 'bottom', color: c.air, size: 11 }); p.ptext(p.X(1.1) + 4, p.m.t - 6, 'flame zone: φ 1.1', { align: 'left', base: 'bottom', color: c.bad, size: 11 });
  }
  p.onDraw(upd); upd();
}
