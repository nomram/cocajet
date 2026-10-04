// Shaft critical speed (Dunkerley estimate for two overhung wheels) and the resonance curve.
import { h, shell, slider, readout, button } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Will the shaft shake itself apart? Critical speed', note: 'Every shaft has natural bending frequencies. If it spins at one of them any tiny imbalance is amplified into violent whirl. Small gas turbines either run <em>below</em> the first critical (stiff, short shaft) or pass <em>through</em> it quickly and run far above with damped bearings (flexible shaft). Estimate: Dunkerley sum for the two overhung wheels on a two-bearing shaft.' });
  const cv = h('canvas', { class: 'plot' });
  const sD = slider({ label: 'Shaft diameter', min: 5, max: 14, step: 0.5, value: 8, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sL = slider({ label: 'Distance between bearings', min: 60, max: 180, step: 1, value: 107, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sA1 = slider({ label: 'Impeller overhang beyond front bearing', min: 8, max: 50, step: 1, value: 20, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sA2 = slider({ label: 'Turbine overhang beyond rear bearing', min: 8, max: 50, step: 1, value: 22, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sZ = slider({ label: 'Bearing damping ratio ζ', min: 0.02, max: 0.5, step: 0.01, value: 0.12, fmt: v => v.toFixed(2), onInput: upd });
  const ro = { Nc: readout('First critical speed', 'rpm', 'hot'), ratio: readout('Running speed ÷ critical'), mode: readout('Type of rotor', ''), pk: readout('Peak amplification', '×') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sD.el, sL.el, sA1.el, sA2.el, sZ.el, h('div', { class: 'btn-row' }, button('CJ-1 default (Ø8)', () => { sD.set(8); sL.set(107); sA1.set(20); sA2.set(22); upd(); }, 'small fire'), button('Stiff Ø12 shaft', () => { sD.set(12); upd(); }, 'small')), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 0, xmax: 130, ymin: 0, ymax: 8, xlabel: 'rotor speed (1000 rpm)', ylabel: 'whirl amplitude (× the static unbalance offset)', aspect: 1.35 });
  const E = 210e9, g = 9.81, m1 = 0.054, m2 = 0.073;
  function upd() {
    const d = sD.get() / 1000, L = sL.get() / 1000, a1 = sA1.get() / 1000, a2 = sA2.get() / 1000, I = Math.PI * d ** 4 / 64, z = sZ.get();
    const dl = (m, a) => m * g * a * a * (L + a) / (3 * E * I);
    const w2 = 1 / (dl(m1, a1) / g + dl(m2, a2) / g);                       // Dunkerley: 1/w² = Σ δ_i / g
    const wc = Math.sqrt(w2), Nc = wc * 30 / Math.PI;
    const ratio = 115000 / Nc;
    ro.Nc.set(Nc.toFixed(0)); ro.ratio.set(ratio.toFixed(2)); ro.mode.set(ratio < 0.7 ? 'rigid (sub-critical)' : ratio > 1.4 ? 'flexible (super-critical)' : 'DANGER: near critical', ratio > 0.7 && ratio < 1.4 ? 'bad' : 'good');
    const amp = (r) => r * r / Math.sqrt((1 - r * r) ** 2 + (2 * z * r) ** 2);
    ro.pk.set((1 / (2 * z)).toFixed(1));
    const c = p.begin().col; p.set({ ymax: Math.min(12, Math.max(3, 1 / (2 * z) * 1.15)) }); p.axes();
    const xs = [], ys = []; for (let N = 500; N <= 130000; N += 500) { xs.push(N / 1000); ys.push(amp(N / Nc)); }
    p.band(105, 125, { color: c.fire, alpha: .12, label: 'full-power band' }); p.band(48, 62, { color: c.ok, alpha: .1, label: 'idle' });
    p.line(xs, ys, { color: c.air, width: 3 });
    p.vline(Nc / 1000, { color: c.bad, label: 'critical ' + (Nc / 1000).toFixed(0) + 'k' });
    p.hline(1, { color: c.muted, label: 'self-centred: spins about its centre of mass', align: 'right' });
    p.dot(115, amp(ratio), { color: c.fire });
  }
  p.onDraw(upd); upd();
}
