// Yield strength vs temperature for the metals in this guide (typical handbook-style values).
import { h, shell, slider, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';

export const MATERIALS = [
  { id: 'can',  n: 'Coke-can aluminium 3004-H19', c: '#d94b3d', rho: 2730, alpha: 23.9, melt: 650, pts: [[20, 250], [100, 235], [150, 170], [200, 100], [260, 50], [315, 28], [370, 17], [425, 10], [480, 6], [540, 3], [600, 2]] },
  { id: 'al',   n: 'Aluminium 6061-T6',           c: '#b0b8c0', rho: 2700, alpha: 23.6, melt: 582, pts: [[20, 276], [100, 262], [150, 235], [205, 130], [260, 62], [315, 28], [370, 17], [430, 10], [540, 4]] },
  { id: 'al2',  n: 'Aluminium 2618-T61 (turbo wheels)', c: '#8aa4c8', rho: 2760, alpha: 22.3, melt: 549, pts: [[20, 370], [100, 350], [150, 330], [200, 285], [260, 170], [315, 85], [370, 40], [430, 18]] },
  { id: 'mild', n: 'Mild steel (S235)',           c: '#8e99a3', rho: 7850, alpha: 12, melt: 1500, pts: [[20, 250], [300, 250], [400, 250], [500, 195], [600, 118], [700, 58], [800, 28], [900, 15], [1000, 10], [1100, 5]] },
  { id: 's304', n: 'Stainless 304 / 1.4301',      c: '#4cc9f0', rho: 7900, alpha: 17.3, melt: 1400, pts: [[20, 210], [100, 172], [200, 143], [300, 134], [400, 126], [500, 113], [600, 103], [700, 84], [800, 57], [900, 29], [1000, 13], [1100, 6]] },
  { id: 's310', n: 'Stainless 310S',              c: '#3ddc97', rho: 7900, alpha: 15.9, melt: 1400, pts: [[20, 280], [200, 210], [400, 175], [600, 150], [700, 135], [800, 105], [900, 70], [1000, 40], [1100, 20], [1200, 10]] },
  { id: 'i625', n: 'Inconel 625',                 c: '#b388ff', rho: 8440, alpha: 12.8, melt: 1290, pts: [[20, 460], [200, 400], [400, 350], [538, 330], [649, 320], [760, 300], [871, 185], [982, 93], [1093, 40]] },
  { id: 'i718', n: 'Inconel 718 (aged)',          c: '#ffb703', rho: 8190, alpha: 13, melt: 1260, pts: [[20, 1100], [200, 1030], [400, 990], [538, 960], [650, 915], [700, 850], [760, 690], [815, 420], [870, 230], [980, 60]] },
  { id: 'ti',   n: 'Titanium Ti-6Al-4V',          c: '#ff6b35', rho: 4430, alpha: 8.6, melt: 1600, pts: [[20, 880], [100, 780], [200, 650], [300, 570], [400, 520], [500, 470], [600, 320], [700, 150]] },
];
export const yieldAt = (m, T) => { const p = m.pts; if (T <= p[0][0]) return p[0][1]; for (let i = 1; i < p.length; i++) if (T <= p[i][0]) { const f = (T - p[i - 1][0]) / (p[i][0] - p[i - 1][0]); return p[i - 1][1] + f * (p[i][1] - p[i - 1][1]); } return Math.max(0, p[p.length - 1][1] * 0.5); };

const PLACES = [['Compressor wheel', 20, 150], ['Casing', 150, 350], ['Flame-tube wall', 450, 700], ['NGV / turbine casing', 650, 800], ['Turbine blades', 700, 800], ['Nozzle', 550, 720]];

export default function init(el) {
  const { body } = shell(el, { title: 'How strong is it hot? Yield strength vs temperature', note: 'Typical handbook-style values (steel and stainless from the Eurocode fire-design factors; the rest are typical datasheet figures). Treat them as ±15 %: always check a real datasheet for a real part. Strength is only half of the story: creep, oxidation and fatigue (below) limit hot parts at stresses well under yield.' });
  const cv = h('canvas', { class: 'plot' });
  const sS = slider({ label: 'Stress in the part (the red line)', min: 5, max: 600, step: 5, value: 190, unit: 'MPa', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Metal temperature', min: 20, max: 1100, step: 10, value: 750, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const checks = MATERIALS.map(m => ({ m, t: toggle({ label: m.n, checked: ['can', 's304', 's310', 'i625', 'i718'].includes(m.id), onChange: upd }) }));
  const out = h('div', { class: 'readouts' }); const list = h('div', { class: 'ctls', style: { gap: '4px' } }, ...checks.map(c => { const sw = h('span', { class: 'sw', style: { background: c.m.c } }); c.t.el.prepend(sw); return c.t.el; }));
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sS.el, sT.el, h('div', {}, list), out)));
  const p = new Plot(cv, { xmin: 20, xmax: 1100, ymin: 0, ymax: 600, xlabel: 'temperature (°C)', ylabel: 'yield strength (MPa)', aspect: 1.25 });
  function upd() {
    const S = sS.get(), T = sT.get(), c = p.begin().col;
    p.set({ ymax: checks.some(k => k.t.get() && ['i718', 'ti'].includes(k.m.id)) ? 1150 : 600 }); p.axes();
    PLACES.forEach(([n, a, b], i) => p.band(a, b, { color: i % 2 ? c.fuel : c.fire, alpha: .045 }));
    PLACES.forEach(([n, a, b], i) => p.text((a + b) / 2, p.o.ymax * (0.04 + 0.05 * (i % 3)), n, { color: c.muted, size: 10, align: 'center', base: 'bottom' }));
    out.innerHTML = '';
    for (const k of checks) if (k.t.get()) {
      const xs = [], ys = []; for (let q = 20; q <= Math.min(1100, k.m.melt); q += 10) { xs.push(q); ys.push(yieldAt(k.m, q)); }
      p.line(xs, ys, { color: k.m.c, width: 2.6 }); p.dot(T, yieldAt(k.m, T), { color: k.m.c, r: 4.5 });
      const y = yieldAt(k.m, T), sf = y / S;
      out.append(h('div', { class: 'ro ' + (sf < 1.5 ? 'bad' : sf < 2.5 ? 'fuel' : 'good') }, h('div', { class: 'k' }, k.m.n.split(' (')[0]), h('div', {}, h('span', { class: 'v' }, y.toFixed(0)), h('span', { class: 'u' }, ' MPa · SF ' + sf.toFixed(1)))));
    }
    p.hline(S, { color: c.bad, width: 2, label: 'stress in the part: ' + S + ' MPa', align: 'right' }); p.vline(T, { color: c.muted });
  }
  p.onDraw(upd); upd();
}
