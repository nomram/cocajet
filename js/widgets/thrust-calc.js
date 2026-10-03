// The thrust equation as a calculator, with our engine marked.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Thrust calculator: F = ṁ (Vₑ − V₀) + (Pₑ − P₀) Aₑ', note: 'Static test stand: V₀ = 0. At speed the incoming air already carries momentum ṁV₀, so you subtract it: the faster you fly, the less thrust the same jet gives. The pressure term only matters when the nozzle is choked (exit pressure above ambient).' });
  const cv = h('canvas', { class: 'plot' });
  const sM = slider({ label: 'Mass flow of air  ṁ', min: 0.02, max: 1.0, step: 0.01, value: 0.152, unit: 'kg/s', fmt: v => v.toFixed(3), onInput: upd });
  const sV = slider({ label: 'Exhaust speed  Vₑ', min: 50, max: 1200, step: 5, value: 380, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sV0 = slider({ label: 'Flight speed  V₀', min: 0, max: 300, step: 5, value: 0, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sP = slider({ label: 'Nozzle over-pressure  Pₑ − P₀', min: 0, max: 80, step: 1, value: 0, unit: 'kPa', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { F: readout('Thrust', 'N', 'hot'), kgf: readout('= force of', 'kgf'), mom: readout('Momentum term', 'N', 'cool'), pr: readout('Pressure term', 'N', 'fuel'), jet: readout('Jet kinetic power', 'kW', 'fuel'), mach: readout('Exit Mach (at 900 K)', '') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sM.el, sV.el, sV0.el, sP.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 0, xmax: 1200, ymin: 0, ymax: 200, xlabel: 'exhaust speed Vₑ (m/s)', ylabel: 'thrust (N)', aspect: 1.5 });
  const Ae = 1.119e-3;
  function upd() {
    const m = sM.get(), Ve = sV.get(), V0 = sV0.get(), dP = sP.get() * 1000;
    const mom = m * (Ve - V0), pr = dP * Ae, F = mom + pr;
    ro.F.set(F.toFixed(1)); ro.kgf.set((F / 9.81).toFixed(2)); ro.mom.set(mom.toFixed(1)); ro.pr.set(pr.toFixed(1));
    ro.jet.set((0.5 * m * (Ve * Ve - V0 * V0) / 1000).toFixed(1)); ro.mach.set((Ve / Math.sqrt(1.33 * 287 * 900)).toFixed(2));
    const c = p.begin().col;
    p.set({ ymax: Math.max(60, Math.ceil(Math.max(F, 1.2 * m * 1200) / 50) * 50) });
    p.axes();
    for (const [mm, col] of [[0.05, c.muted], [0.152, c.air], [0.4, c.violet], [1.0, c.fuel]]) {
      p.fn(v => Math.max(0, mm * (v - V0)), 0, 1200, { color: col, width: 1.8, dash: [4, 4], alpha: .9 });
      p.text(1190, mm * (1190 - V0), `ṁ = ${mm}`, { align: 'right', color: col, size: 11, base: 'bottom' });
    }
    p.fn(v => Math.max(0, m * (v - V0)), 0, 1200, { color: c.fire, width: 3 });
    p.dot(Ve, F - pr, { color: c.fire });
    p.vline(V0, { color: c.muted, label: V0 ? 'flight speed V₀' : '' });
    p.text(380, 58, 'our engine (58 N)', { color: c.fire, size: 11, bg: true, align: 'left' });
    p.dot(380, 58, { color: c.fire, ring: false, r: 3 });
  }
  p.onDraw(upd); upd();
}
