// Home page: the headline numbers of the reference engine, straight from the physics model.
import { CJ1, isa, steadyAt } from '../engine-model.js';
import { h, C } from '../ui.js';

export default function init(el) {
  const g = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0));
  const items = [
    [(g.thrust).toFixed(0) + ' N', 'static thrust (≈ ' + (g.thrust / 9.81).toFixed(1) + ' kgf)'],
    [(CJ1.Ndesign / 1000).toFixed(0) + ' 000', 'rpm at full power'],
    [g.PRc.toFixed(2), 'compressor pressure ratio'],
    [C(g.T03).toFixed(0) + ' °C', 'turbine inlet temperature'],
    [(g.mf * 1000).toFixed(1) + ' g/s', 'propane at full power'],
    ['≈ 2.4 kg', 'engine mass (no stand)'],
  ];
  el.className = 'stat-row';
  el.append(...items.map(([b, s]) => h('div', { class: 'stat' }, h('b', {}, b), h('span', {}, s))));
}
