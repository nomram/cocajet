// Where the efficiency goes: which imperfection costs the most fuel? (model sensitivity / tornado chart)
import { h, shell, readout, button } from '../ui.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

const TESTS = [
  ['Tip clearance 0.40 → 0.15 mm', { clearance: 0.00015 }],
  ['Diffuser recovery 70 % → 82 %', { etaDiff: 0.82 }],
  ['Turbine efficiency 0.80 → 0.87', { etaTpk: 0.87 }],
  ['Combustor pressure loss 5 % → 3 %', { dpB: 0.03 }],
  ['Combustion efficiency 94 % → 98 %', { etaB: 0.98 }],
  ['Bellmouth loss 1 % → 0.2 %', { dpIn: 0.002 }],
  ['Bearings & windage 97 % → 99 %', { etaM: 0.99 }],
  ['Impeller 9 + 9 blades, 25° sweep', { Zfull: 9, Zsplit: 9, beta2: 25 }],
];
export default function init(el) {
  const { body } = shell(el, { title: 'The loss budget: which imperfection costs the most fuel?', note: 'Each bar re-solves the whole engine at 115 000 rpm with ONE improvement (everything else as built) and reports the change in fuel burnt per newton of thrust. The biggest bars are where a cheap fix pays most. Diffuser and turbine losses top the list because the turbine’s work goes entirely back into the compressor: every point lost has to be paid for with a hotter, thirstier cycle.' });
  const box = h('div'), tot = h('div', { class: 'readouts' });
  body.append(box, tot);
  const amb = isa(0), base = steadyAt({ ...CJ1 }, CJ1.Ndesign, amb), tsfc0 = base.mf / base.thrust;
  const rows = TESTS.map(([n, p]) => { const g = steadyAt({ ...CJ1, ...p }, CJ1.Ndesign, amb); return { n, dF: g.thrust - base.thrust, dS: ((g.mf / g.thrust) / tsfc0 - 1) * 100, dT: g.T03 - base.T03 }; }).sort((a, b) => a.dS - b.dS);
  const all = steadyAt({ ...CJ1, ...Object.assign({}, ...TESTS.map(t => t[1])) }, CJ1.Ndesign, amb);
  const maxv = Math.max(...rows.map(r => -r.dS), 1);
  rows.forEach(r => {
    const w = Math.max(1, -r.dS / maxv * 100);
    box.append(h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(180px, 1.1fr) 2fr 150px', gap: '10px', alignItems: 'center', margin: '8px 0' } },
      h('div', { style: { fontWeight: 600, fontSize: '.88rem' } }, r.n),
      h('div', { style: { height: '20px', background: 'var(--panel-3)', borderRadius: '6px', overflow: 'hidden' } }, h('div', { style: { width: w + '%', height: '100%', background: 'linear-gradient(90deg, var(--ok), var(--air))' } })),
      h('div', { style: { fontFamily: 'var(--mono)', fontSize: '.8rem', color: 'var(--text-2)' } }, `${r.dS.toFixed(1)} % fuel/N · ${r.dF >= 0 ? '+' : ''}${r.dF.toFixed(1)} N · ${r.dT >= 0 ? '+' : ''}${r.dT.toFixed(0)} K TIT`)));
  });
  const mk = (l, v, u, c) => { const r = readout(l, u, c); r.set(v); tot.append(r.el); };
  mk('Baseline fuel per thrust', (tsfc0 * 3600).toFixed(3), 'kg/(N·h)', 'cool'); mk('All improvements together', (all.mf / all.thrust * 3600).toFixed(3), 'kg/(N·h)', 'good'); mk('Saving', ((1 - (all.mf / all.thrust) / tsfc0) * 100).toFixed(0), '% fuel', 'good'); mk('Thrust, same rpm', all.thrust.toFixed(1), 'N', 'hot'); mk('Turbine inlet, same rpm', (all.T03 - 273.15).toFixed(0), '°C', 'fuel');
}
