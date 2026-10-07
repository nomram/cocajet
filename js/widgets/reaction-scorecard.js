// What makes a reaction a good propellant? Heat and expanding gas per kilogram, plus a seven-point checklist, for reactions that earn their living in rockets and for ones that earn it elsewhere.
import { h, shell, readout } from '../ui.js';
import { Plot } from '../plot.js';

/* heat: MJ per kg of reactants (typical, rounded); gas: moles of gas per kg of reactants; M: mean molar mass of the gas [g/mol]; Tc: reaction temperature [K]; rho: bulk density [kg/L]
   rate: 'steer' (a flow you can valve), 'fixed' (burns at a rate set by its geometry), 'runaway' (detonates or cannot be steered); sens: 1 (inert) to 5 (touchy); stop: can it be shut off? */
const R = [
  { id: 'h2', g: 'prop', name: 'Hydrogen + liquid oxygen', eq: '2 H₂ + O₂ → 2 H₂O  (run fuel-rich)', heat: 13, gas: 83, M: 12, Tc: 3250, rho: 0.32, rate: 'steer', sens: 2, stop: true,
    good: 'The lightest exhaust of any chemical pair (steam plus spare hydrogen), a valve-steered flame and nothing but water coming out.', bad: 'Hydrogen is 14 times less dense than water and boils at −253 °C: enormous insulated tanks, constant leaks.', use: 'Upper stages and some boosters (Saturn S-II, Centaur, the Shuttle’s main engines).' },
  { id: 'ch4', g: 'prop', name: 'Methane + liquid oxygen', eq: 'CH₄ + 2 O₂ → CO₂ + 2 H₂O', heat: 10, gas: 50, M: 20, Tc: 3550, rho: 0.83, rate: 'steer', sens: 2, stop: true,
    good: 'A good compromise: dense enough for compact tanks, clean enough (little soot) for reusable engines, and methane can be made on Mars.', bad: 'Cryogenic oxidiser and a fuel that still needs cold storage; a little heavier exhaust than hydrogen.', use: 'Raptor-class engines and several new launchers.' },
  { id: 'rp1', g: 'prop', name: 'Kerosene + liquid oxygen', eq: 'C₁₂H₂₃ + 17.75 O₂ → 12 CO₂ + 11.5 H₂O  (average kerosene)', heat: 9.6, gas: 43, M: 23, Tc: 3670, rho: 1.03, rate: 'steer', sens: 2, stop: true,
    good: 'A dense, cheap, easy-to-handle fuel: small tanks mean a light rocket; storable for years and valve-controlled.', bad: 'Soot and coking in the engine; a heavier exhaust, so a lower Isp than hydrogen.', use: 'First stages: Saturn F-1, Soyuz, Falcon 9.' },
  { id: 'comp', g: 'prop', name: 'Composite solid propellant (class)', eq: 'a rubbery block of oxidiser salt, metal powder and polymer binder', heat: 5.5, gas: 25, M: 28, Tc: 3400, rho: 1.8, rate: 'fixed', sens: 3, stop: false,
    good: 'Dense, simple, storable for years, no pumps or tanks; one command lights it. Roughly a third of the exhaust mass leaves as solid particles.', bad: 'It burns until it is gone: it cannot be throttled or shut off, and a single crack in the grain turns a calm burn into a failure.', use: 'Boosters, missiles, commercial hobby motors.' },
  { id: 'db', g: 'mid', name: 'Double-base propellant (class)', eq: 'nitrate-ester molecules gelled into a plastic-like grain', heat: 4.5, gas: 40, M: 24, Tc: 2500, rho: 1.6, rate: 'fixed', sens: 3, stop: false,
    good: 'Fuel and oxidiser sit in the same molecule, so it is smokeless and burns steadily without any metal.', bad: 'Lower energy than a composite, and the raw energetic material is shock- and heat-sensitive, so it needs licensed plants.', use: 'Small tactical rockets and gun propellants.' },
  { id: 'bp', g: 'mid', name: 'Black powder (class)', eq: 'a pressed mix of a solid fuel and a solid oxidiser', heat: 2.8, gas: 12, M: 40, Tc: 2000, rho: 1.7, rate: 'fixed', sens: 4, stop: false,
    good: 'Easy to ignite and the oldest rocket propellant there is.', bad: 'Weak (about half the mass leaves as solid smoke), brittle, absorbs moisture, and a spark or friction sets it off.', use: 'Fireworks lifting charges, fuses and historical rockets.' },
  { id: 'h2o2', g: 'mid', name: 'Concentrated hydrogen peroxide', eq: 'H₂O₂ → H₂O + ½ O₂  (over a catalyst)', heat: 1.5, gas: 44, M: 23, Tc: 1000, rho: 1.39, rate: 'steer', sens: 3, stop: true,
    good: 'One liquid, one tank, a catalyst bed instead of an igniter, and clean steam and oxygen out.', bad: 'Low energy; contamination (rust, dirt, organics) makes it decompose violently on its own.', use: 'Small thrusters and pump drives.' },
  { id: 'n2', g: 'mid', name: 'Cold nitrogen gas under pressure', eq: 'N₂ (no reaction at all)', heat: 0.2, gas: 36, M: 28, Tc: 300, rho: 0.3, rate: 'steer', sens: 1, stop: true,
    good: 'No flame, no chemistry, nothing to ignite: the safest thruster there is.', bad: 'The energy is only the stored pressure, so the Isp is about 70 s and the tank outweighs the gas.', use: 'Satellite attitude thrusters, toy and water rockets.' },
  { id: 'thermite', g: 'else', name: 'Thermite', eq: '2 Al + Fe₂O₃ → Al₂O₃ + 2 Fe', heat: 3.9, gas: 0, M: 0, Tc: 2800, rho: 3.0, rate: 'fixed', sens: 2, stop: false,
    good: 'About 2 800 K from a powder that needs no air and is hard to ignite by accident; it burns even under water.', bad: 'Nothing leaves as gas: the products are a puddle of molten iron and slag, so there is nothing to expand through a nozzle.', use: 'Welding rails, cutting thick steel; the powders are controlled because they are also incendiaries.' },
  { id: 'acet', g: 'else', name: 'Acetylene + oxygen', eq: '2 C₂H₂ + 5 O₂ → 4 CO₂ + 2 H₂O', heat: 11.8, gas: 28, M: 35, Tc: 3400, rho: 0.005, rate: 'steer', sens: 4, stop: true,
    good: 'The hottest common flame (about 3 400 K): it melts steel for welding and cutting.', bad: 'Acetylene can decompose violently by itself above about 1.5 bar, even with no oxygen, so it cannot be pressurised in a chamber; the exhaust is heavy CO₂.', use: 'Welding and cutting torches.' },
  { id: 'tnt', g: 'else', name: 'High explosive (TNT class)', eq: 'a molecule that carries its own fuel and oxidiser and decomposes by a shock wave', heat: 4.2, gas: 33, M: 30, Tc: 3000, rho: 1.65, rate: 'runaway', sens: 3, stop: false,
    good: 'It releases its energy in microseconds: the shock shatters rock and steel, which is exactly what mining and demolition want.', bad: 'The reaction front moves at about 7 km/s, 1 000 times faster than a flame: the pressure spike (tens of GPa) is more than any chamber can hold, and nothing can throttle or stop it.', use: 'Mining, quarrying, tunnelling, demolition (and, outside this guide, weapons).' },
];
const GROUPS = { prop: ['Good propellants', 'var(--ok)'], mid: ['Workable, with a catch', 'var(--warn)'], else: ['Powerful, but for other jobs', 'var(--bad)'] };
const CRIT = [
  ['energy', 'Energy per kg', 'Heat released per kilogram of everything you carry.'],
  ['gas', 'Plenty of gas', 'Only gas can expand through a nozzle and make thrust.'],
  ['light', 'Light exhaust', 'Exhaust speed goes as √(T/M): light molecules fly faster.'],
  ['rate', 'Steerable rate', 'A flame you can control with a valve, not a front that runs at its own speed.'],
  ['safe', 'Safe to store and handle', 'Not easily set off by shock, friction, static or contamination.'],
  ['stop', 'Can be stopped', 'You can shut it off, and throttle it.'],
  ['dense', 'Dense (small tanks)', 'Kilograms per litre: tank volume is dead weight.'],
];
function rate(r) {
  return {
    energy: r.heat >= 9 ? 2 : r.heat >= 3 ? 1 : 0, gas: r.gas >= 40 ? 2 : r.gas >= 20 ? 1 : 0, light: r.M === 0 ? 0 : r.M <= 22 ? 2 : r.M <= 32 ? 1 : 0,
    rate: r.rate === 'steer' ? 2 : r.rate === 'fixed' ? 1 : 0, safe: r.sens <= 2 ? 2 : r.sens === 3 ? 1 : 0, stop: r.stop ? 2 : 0, dense: r.rho >= 1 ? 2 : r.rho >= 0.6 ? 1 : 0,
  };
}
const SHORT = { h2: 'H₂ + O₂', ch4: 'CH₄ + O₂', rp1: 'kerosene + O₂', comp: 'composite solid', db: 'double-base', bp: 'black powder', h2o2: 'H₂O₂', n2: 'cold gas', thermite: 'thermite', acet: 'oxy-acetylene', tnt: 'explosive' };
const MARK = ['✗', '~', '✓'], COL = ['var(--bad)', 'var(--warn)', 'var(--ok)'];

export default function init(el) {
  const { body } = shell(el, { title: 'What makes a reaction a good propellant? Heat, gas, rate and safety', note: 'Typical published values, rounded; the “class” entries describe a family, not a recipe. The checklist is a teaching tool, not a verdict: real propellant choice also weighs cost, availability and the job. “Gas” is moles of gas made per kilogram of reactants: only gas makes thrust.' });
  const chips = h('div', { class: 'btn-row' });
  const cv = h('canvas', { class: 'plot' });
  const name = h('h4', { style: { margin: '10px 0 2px', textTransform: 'none', letterSpacing: 0, fontSize: '1.05rem', color: 'var(--text)' } });
  const eq = h('div', { style: { fontFamily: 'var(--mono)', fontSize: '.84rem', color: 'var(--muted)', margin: '0 0 8px' } });
  const ro = { heat: readout('Heat released', 'MJ/kg', 'hot'), gas: readout('Gas made', 'mol/kg', 'cool'), Tc: readout('Reaction temperature', 'K', 'hot'), ve: readout('Exhaust-speed index √(T/M)', '', 'good'), rate: readout('How fast it goes', '') };
  const crit = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '6px 14px', margin: '10px 0' } });
  const txt = h('div', { style: { fontSize: '.9rem', lineHeight: 1.55, color: 'var(--text-2)' } });
  const btns = {};
  for (const r of R) { const b = h('button', { class: 'btn small', type: 'button', onclick: () => { sel = r.id; draw(); } }, r.name.replace(/ \(class\)/, '').replace(' under pressure', '').replace('Concentrated h', 'H')); btns[r.id] = b; }
  for (const [k, [label, color]] of Object.entries(GROUPS)) chips.append(h('div', { style: { width: '100%', fontSize: '.72rem', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color, marginTop: '4px' } }, label), ...R.filter(r => r.g === k).map(r => btns[r.id]));
  body.append(chips, h('div', { style: { height: '10px' } }), cv, name, eq, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), crit, txt);
  const p = new Plot(cv, { xmin: 0, xmax: 95, ymin: 0, ymax: 15, aspect: 1.8, minHeight: 280, xlabel: 'gas made per kg of reactants (mol/kg)', ylabel: 'heat released per kg (MJ)', margin: { l: 52, r: 14, t: 14, b: 44 } });
  let sel = 'rp1';
  function draw() {
    const r = R.find(x => x.id === sel), c = p.begin().col, col = { prop: c.ok, mid: c.warn, else: c.bad }; p.axes();
    // exhaust-speed contours do not exist for products without gas; shade the "no gas" strip
    p.band(0, 5, { color: c.bad, alpha: 0.08, label: '' }); p.ptext(p.X(2.5), p.m.t + 4, 'no gas', { align: 'center', color: c.bad, size: 10.5, weight: 700 });
    R.forEach(q => { p.ctx.save(); p.ctx.fillStyle = col[q.g]; p.ctx.globalAlpha = q.id === sel ? 1 : 0.62; p.ctx.beginPath(); p.ctx.arc(p.X(q.gas), p.Y(q.heat), q.id === sel ? 9 : 6, 0, 7); p.ctx.fill(); if (q.id === sel) { p.ctx.strokeStyle = c.strong; p.ctx.lineWidth = 2; p.ctx.stroke(); } p.ctx.restore(); });
    const PL = { h2: [-10, 0, 'right'], ch4: [10, -7, 'left'], rp1: [-10, 5, 'right'], comp: [10, 0, 'left'], db: [10, 0, 'left'], tnt: [-10, 3, 'right'], bp: [10, 0, 'left'], h2o2: [10, 0, 'left'], n2: [10, 0, 'left'], thermite: [13, 0, 'left'], acet: [-10, 0, 'right'] };
    R.forEach(q => { const [dx, dy, al] = PL[q.id]; p.ptext(p.X(q.gas) + dx, p.Y(q.heat) + dy, SHORT[q.id], { align: al, base: 'middle', size: 10.5, color: q.id === sel ? c.strong : c.text, weight: q.id === sel ? 800 : 600 }); });
    for (const [id, b] of Object.entries(btns)) b.classList.toggle('on', id === sel);
    name.textContent = r.name; eq.textContent = r.eq;
    ro.heat.set(r.heat.toFixed(1)); ro.gas.set(String(r.gas)); ro.Tc.set(String(r.Tc)); ro.ve.set(r.M ? Math.sqrt(r.Tc / r.M).toFixed(1) : 'none', r.M ? 'good' : 'bad');
    ro.rate.set(r.rate === 'steer' ? 'steered flame' : r.rate === 'fixed' ? 'own rate' : '≈ 7 km/s', r.rate === 'runaway' ? 'bad' : '');
    const rt = rate(r); crit.innerHTML = '';
    for (const [k, label, tip] of CRIT) crit.append(h('div', { title: tip, style: { display: 'flex', gap: '8px', alignItems: 'baseline', fontSize: '.86rem', color: 'var(--text-2)' } }, h('b', { style: { color: COL[rt[k]], fontSize: '1.05rem', width: '1.1em', textAlign: 'center' } }, MARK[rt[k]]), label));
    txt.innerHTML = '';
    txt.append(h('p', { style: { margin: '4px 0' } }, h('b', {}, 'What it is good at: '), r.good), h('p', { style: { margin: '4px 0' } }, h('b', {}, 'What goes wrong: '), r.bad), h('p', { style: { margin: '4px 0' } }, h('b', {}, 'Where it earns its living: '), r.use));
  }
  p.interact((x, y, pt, kind) => { if (kind !== 'down' || x == null) return; let best = null, bd = 28 * 28; for (const q of R) { const dx = p.X(q.gas) - pt.px, dy = p.Y(q.heat) - pt.py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = q; } } if (best) { sel = best.id; draw(); } });
  cv.style.cursor = 'pointer'; p.onDraw(draw); draw();
}
