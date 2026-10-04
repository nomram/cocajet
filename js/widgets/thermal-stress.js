// Thermal expansion and the stress that results when it is prevented.
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { MATERIALS, yieldAt } from './material-strength.js';

const E = { can: 69, al: 69, al2: 74, mild: 210, s304: 193, s310: 200, i625: 205, i718: 200, ti: 114 };
export default function init(el) {
  const { body } = shell(el, { title: 'Hot parts grow: leave room, or something yields', note: 'Free growth ΔL = α·L·ΔT. If the part is held rigidly it cannot grow and the stress is σ = E·α·ΔT (constrained), or about half that for a thermal-shock gradient across a wall. Aluminium grows twice as much as steel and has a tenth of the strength when hot: a good reason never to clamp it to a hot steel part without a floating joint.' });
  const cv = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Material', options: MATERIALS.map(m => [m.id, m.n]), value: 's310', onChange: upd });
  const sL = slider({ label: 'Part length', min: 10, max: 300, step: 1, value: 87, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Temperature rise ΔT', min: 20, max: 900, step: 10, value: 500, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { dL: readout('Free growth', 'mm', 'cool'), s: readout('Stress if fully held', 'MPa', 'hot'), sh: readout('Thermal-shock stress (gradient)', 'MPa', 'fuel'), y: readout('Yield at that temperature', 'MPa', 'good'), v: readout('Verdict', '') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sel.el, sL.el, sT.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'Examples in CJ-1: the Coke-can liner (87 mm, +500 K) grows 1 mm; the casing grows 0.7 mm over its length while the tunnel inside is hotter: the liner is allowed to <em>float</em> on its dome and the NGV slides into the casing for exactly this reason.'))));
  const p = new Plot(cv, { xmin: 0, xmax: 900, ymin: 0, ymax: 1000, xlabel: 'temperature rise ΔT (K)', ylabel: 'stress if held rigidly (MPa)', aspect: 1.3 });
  function upd() {
    const m = MATERIALS.find(q => q.id === sel.get()), L = sL.get(), dT = sT.get(), a = m.alpha * 1e-6, e = E[m.id] * 1e3;
    const dL = a * L * dT, s = e * a * dT, sh = s / 2, y = yieldAt(m, 20 + dT);
    ro.dL.set(dL.toFixed(2)); ro.s.set(s.toFixed(0)); ro.sh.set(sh.toFixed(0)); ro.y.set(y.toFixed(0)); ro.v.set(s > y ? 'yields if held' : 'elastic', s > y ? 'bad' : 'good');
    const c = p.begin().col; p.set({ ymax: Math.max(400, Math.ceil(Math.max(e * a * 900, 400) / 200) * 200) }); p.axes();
    const xs = [], ss = [], ys = []; for (let q = 0; q <= 900; q += 10) { xs.push(q); ss.push(e * a * q); ys.push(yieldAt(m, 20 + q)); }
    p.area(xs, ys, ss.map((v, i) => Math.max(v, ys[i])), { color: c.bad, alpha: .14 });
    p.line(xs, ss, { color: c.fire, width: 3 }); p.line(xs, ys, { color: c.ok, width: 3, dash: [6, 4] }); p.dot(dT, s, { color: c.fire });
    p.legend([[c.fire, 'thermal stress, fully held'], [c.ok, 'yield strength at that temperature', [6, 4]]], { pos: 'tr' }); p.text(840, p.o.ymax * 0.1, 'shaded: plastic flow, warping', { color: c.bad, align: 'right', size: 11 });
  }
  p.onDraw(upd); upd();
}
