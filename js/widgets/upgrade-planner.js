// Pick upgrades, see thrust / fuel / temperature from the engine model, and thrust per dollar.
import { h, shell, toggle, readout, button } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

const UP = [
  { id: 'bear', n: 'Hybrid ceramic bearings + oil mist', usd: 60, p: { etaM: 0.985 }, note: 'Less friction, longer life. The first thing to buy.' },
  { id: 'clr', n: 'Abradable shroud, 0.2 mm tip clearance', usd: 40, p: { clearance: 0.0002 }, note: 'Machining skill, not money.' },
  { id: 'bell', n: 'Properly shaped bellmouth', usd: 20, p: { dpIn: 0.003 }, note: 'Cheap and free thrust.' },
  { id: 'dif', n: 'Vaned diffuser, 82 % recovery', usd: 90, p: { etaDiff: 0.82 }, note: 'Sheet vanes brazed to a plate.' },
  { id: 'imp', n: 'Better impeller: 9 + 9 blades, 25° sweep', usd: 150, p: { Zfull: 9, Zsplit: 9, beta2: 25 }, note: 'A CNC job or a good casting.' },
  { id: 'liner', n: 'Swirl-cooled liner, better hole pattern', usd: 60, p: { etaB: 0.97, dpB: 0.035 }, note: 'Stainless sheet and a drilling template.' },
  { id: 'turb', n: 'Profiled turbine blades (+4 pts efficiency)', usd: 120, p: { etaTpk: 0.84 }, note: 'Waterjet + a forming jig.' },
  { id: 'tclr', n: 'Tighter turbine tip gap (+1.5 pts)', usd: 30, p: { etaTpk: 0.815 }, note: 'Grind the shroud in place.' },
  { id: 'spd', n: 'Raise full-power speed to 125 000 rpm', usd: 0, p: {}, N: 125000, note: 'Free but risky: Inconel only, balance G1, containment ring.', risk: true },
  { id: 'noz', n: 'Close the nozzle by 8 %', usd: 0, p: { A5: CJ1.A5 * 0.92 }, note: 'Free: more thrust but hotter.', risk: true },
];
export default function init(el) {
  const { body } = shell(el, { title: 'Upgrade planner: thrust per dollar', note: 'Tick the upgrades you can afford (US dollars, rough 2020s hobby prices). The model re-solves the engine at full power. Combined effects are not simply additive. The red tag means more risk: check the turbine inlet temperature stays under ~1 150 K (877 °C).' });
  const cv = h('canvas', { class: 'plot' }), tbl = h('tbody');
  const T = UP.map(u => ({ u, t: toggle({ label: `${u.n}  ·  USD ${u.usd}`, onChange: upd }) }));
  T.forEach(({ u, t }) => { t.el.title = u.note; if (u.risk) t.el.style.color = 'var(--fuel)'; });
  const ro = { F: readout('Thrust', 'N', 'hot'), dF: readout('vs baseline', 'N', 'good'), sf: readout('Fuel per thrust', 'kg/(N·h)', 'cool'), T3: readout('TIT', '°C', 'fuel'), usd: readout('Cost', 'USD', 'cool'), eff: readout('Thrust gained per USD 100', 'N') };
  body.append(h('div', { class: 'wgrid' }, h('div', { class: 'ctls' }, ...T.map(x => x.t.el), h('div', { class: 'btn-row' }, button('Cheap & safe set', () => { T.forEach(({ u, t }) => t.set(['bear', 'clr', 'bell', 'liner', 'dif'].includes(u.id))); upd(); }, 'small fire'), button('Everything', () => { T.forEach(({ t }) => t.set(true)); upd(); }, 'small'), button('Clear', () => { T.forEach(({ t }) => t.set(false)); upd(); }, 'small'))),
    h('div', {}, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), cv)));
  const p = new Plot(cv, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 2.3, grid: false, margin: { l: 6, r: 6, t: 6, b: 6 } });
  const amb = isa(0), base = steadyAt({ ...CJ1 }, CJ1.Ndesign, amb);
  function upd() {
    let prm = { ...CJ1 }, usd = 0, N = CJ1.Ndesign, etaT = CJ1.etaTpk;
    for (const { u, t } of T) if (t.get()) { const q = { ...u.p }; if (q.etaTpk) { etaT += q.etaTpk - CJ1.etaTpk; delete q.etaTpk; } Object.assign(prm, q); usd += u.usd; if (u.N) N = u.N; }
    prm.etaTpk = etaT;
    const g = steadyAt(prm, N, amb), dF = g.thrust - base.thrust, tsfc = g.mf / g.thrust * 3600, t3 = g.T03 - 273.15;
    ro.F.set(g.thrust.toFixed(1)); ro.dF.set((dF >= 0 ? '+' : '') + dF.toFixed(1), dF >= 0 ? 'good' : 'bad'); ro.sf.set(tsfc.toFixed(3)); ro.T3.set(t3.toFixed(0), t3 > 877 ? 'bad' : 'fuel'); ro.usd.set(usd); ro.eff.set(usd ? (dF / usd * 100).toFixed(2) : '–');
    const c = p.begin().col, ctx = p.ctx, W = p.W, H = p.H;
    const bar = (y, label, v, ref, color, unit, max) => { const x0 = 150, w = (W - x0 - 20); ctx.fillStyle = c.text; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, 8, y + 14); ctx.fillStyle = c.grid; ctx.fillRect(x0, y, w, 20); ctx.fillStyle = color; ctx.fillRect(x0, y, w * Math.min(1, v / max), 20); ctx.fillStyle = c.muted; ctx.fillRect(x0 + w * Math.min(1, ref / max) - 1.5, y - 3, 3, 26); ctx.fillStyle = c.strong; ctx.fillText(v.toFixed(unit === 'kg/Nh' ? 3 : 1) + ' ' + unit, x0 + 8, y + 15); };
    bar(14, 'Thrust (N)', g.thrust, base.thrust, c.fire, 'N', 85); bar(54, 'Fuel per thrust', tsfc, base.mf / base.thrust * 3600, c.fuel, 'kg/Nh', 0.25); bar(94, 'Turbine inlet (°C)', t3, base.T03 - 273.15, t3 > 877 ? c.bad : c.air, '°C', 1000);
    ctx.fillStyle = c.muted; ctx.font = '11px sans-serif'; ctx.fillText('grey tick = baseline CJ-1', 150, H - 4);
  }
  p.onDraw(upd); upd();
}
