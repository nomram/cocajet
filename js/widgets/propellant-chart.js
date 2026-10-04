// Chemical rocket propellant combinations: specific impulse against how much they weigh per litre (hover or tap a point for the story).
import { h, shell, toggle, legend } from '../ui.js';
import { Plot } from '../plot.js';

/* typical published vacuum values (rounded): name, Isp vac [s], bulk density [kg/L], class, story */
const DATA = [
  ['Liquid hydrogen + oxygen', 450, 0.32, 'cryo', 'The highest specific impulse of any chemical rocket, because the exhaust is light (chapter 12). But hydrogen is 14× less dense than water and boils at −253 °C: huge insulated tanks. Used where Isp matters most: upper stages and large cores.'],
  ['Methane + oxygen', 370, 0.83, 'cryo', 'A good compromise: dense enough for compact tanks, burns cleanly (little soot, so reusable engines), and methane could be made on Mars.'],
  ['Kerosene + oxygen', 350, 1.03, 'cryo', 'The first-stage workhorse: a dense, cheap, easy-to-handle fuel with a cryogenic oxidiser. Dense propellant means small tanks, which means a light rocket.'],
  ['Storable liquids (hypergolic pair)', 340, 1.20, 'storable', 'Ignite on contact, so there is no igniter to fail and they can restart at will; they sit in tanks for years. Toxic and corrosive: used on spacecraft and upper stages where reliability beats everything.'],
  ['Composite solid', 265, 1.80, 'solid', 'The densest, simplest and most ready of all: no tanks, no pumps. But it cannot be throttled or switched off (chapter 13).'],
  ['Hybrid: polymer fuel + oxygen', 290, 1.06, 'hybrid', 'Between solid and liquid: the fuel is inert and solid, the oxidiser flows. It can be throttled and stopped by closing a valve (chapter 14).'],
  ['Hybrid: polymer fuel + nitrous oxide', 250, 0.80, 'hybrid', 'A self-pressurising oxidiser makes the plumbing simple, at a performance cost. Popular with universities and hobby groups; note that nitrous oxide can decompose violently if mishandled, so it is also a hazard.'],
  ['Hydrazine (single liquid, catalyst bed)', 235, 1.00, 'mono', 'Decomposes by itself over a catalyst: one tank, one valve, no ignition system. Spacecraft thrusters. Highly toxic.'],
  ['Concentrated hydrogen peroxide (single liquid)', 160, 1.39, 'mono', 'A “green” monopropellant: decomposes over a catalyst into steam and oxygen. Lower performance, but far less toxic.'],
  ['Black powder (historical)', 80, 1.70, 'solid', 'The original rocket propellant (and still the firework one): a weak, brittle, moisture-sensitive solid, Isp one third of a modern composite.'],
  ['Cold nitrogen gas (300 bar)', 70, 0.30, 'cold', 'No combustion at all: gas at room temperature escapes through a nozzle. Tiny, simple, safe thrusters for attitude control.'],
  ['Water + compressed air', 5, 1.00, 'cold', 'Chapter 12’s water rocket: the exhaust is cold water, and the whole energy comes from the pressure.'],
];
/* short names and label placement [dx, dy (in data units), align] */
const SHORT = ['H₂ + O₂', 'CH₄ + O₂', 'kerosene + O₂', 'storable', 'composite solid', 'hybrid + O₂', 'hybrid + N₂O', 'hydrazine', 'H₂O₂', 'black powder', 'cold gas', 'water rocket'];
const PLACE = [[0.05, 0, 'left'], [-0.05, 0, 'right'], [-0.03, 24, 'left'], [0.05, 0, 'left'], [-0.05, 0, 'right'], [0.05, 0, 'left'], [-0.05, 0, 'right'], [0.05, -12, 'left'], [0.05, 0, 'left'], [-0.05, 0, 'right'], [0.05, 0, 'left'], [0.05, 0, 'left']];
const COLOR = { cryo: 'air', storable: 'warn', solid: 'fuel', hybrid: 'fire', mono: 'violet', cold: 'muted' };
const NAMES = { cryo: 'cryogenic liquid', storable: 'storable liquid', solid: 'solid', hybrid: 'hybrid', mono: 'single liquid', cold: 'cold / no combustion' };

export default function init(el) {
  const { body } = shell(el, { title: 'Choosing a propellant: specific impulse vs how dense it is', note: 'A high Isp means less propellant per newton-second, but <i>volume</i> matters too: a low-density propellant needs bigger, heavier tanks. The dotted curves show constant <b>volumetric impulse</b> ρ·I<sub>sp</sub> (how much impulse you get from a litre of propellant). Hydrogen wins on Isp and loses on volume; solid and dense liquids win on volume; that is why first stages use dense propellant and upper stages use hydrogen. Hover or tap a point for the story. Values are typical rounded vacuum figures from the open literature. (For comparison, the CJ-1 turbojet reaches 2 070 s, off this chart, because its oxidiser is the free air.)' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const info = h('div', { class: 'widget-note', style: { minHeight: '4.2em', marginTop: '8px' } }, 'Hover or tap a point.');
  const iso = toggle({ label: 'Show lines of constant ρ·Isp', checked: true, onChange: draw });
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), legend([...new Set(DATA.map(d => d[3]))].map(k => ['var(--' + COLOR[k] + ')', NAMES[k]])), info, h('div', { style: { marginTop: '8px' } }, iso.el));
  const p = new Plot(cv, { xmin: 0, xmax: 2.0, ymin: 0, ymax: 500, aspect: 1.35, xlabel: 'bulk density of the propellant combination (kg/L)', ylabel: 'specific impulse, vacuum (s)', title: 'Isp vs density', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const q = new Plot(cv2, { xmin: 0, xmax: 520, ymin: 0, ymax: 1, aspect: 1.35, xlabel: 'volumetric impulse ρ·Isp (s·kg/L)', title: 'Impulse per litre of tank', margin: { l: 150, r: 14, t: 28, b: 40 }, grid: false, yticks: [] });
  let sel = 0;
  function draw() {
    let c = p.begin().col; p.axes();
    if (iso.get()) for (const k of [100, 200, 300, 400, 500]) { const xs = [], ys = []; for (let x = k / 500; x <= 2; x += 0.02) { xs.push(x); ys.push(k / x); } p.clip(true); p.line(xs, ys, { color: c.muted, width: 1, alpha: .5, dash: [2, 4] }); p.clip(false); p.text(k / 470 + 0.012, 478, String(k), { color: c.muted, size: 10, align: 'left' }); }
    DATA.forEach((d, i) => { p.points([d[2]], [d[1]], { color: c[COLOR[d[3]]], r: i === sel ? 9 : 6, stroke: i === sel ? c.strong : null }); });
    DATA.forEach((d, i) => { const [dx, dy, al] = PLACE[i]; p.text(d[2] + dx, d[1] + dy, SHORT[i], { color: c.text, size: 10.5, align: al, weight: i === sel ? 800 : 600 }); });
    if (iso.get()) p.text(1.99, 22, 'dotted lines: ρ·Isp (s·kg/L)', { color: c.muted, size: 10, align: 'right' });
    const order = DATA.map((d, i) => i).sort((a, b) => DATA[b][1] * DATA[b][2] - DATA[a][1] * DATA[a][2]);
    q.set({ ymax: order.length }); c = q.begin().col; q.axes(); const ctx = q.ctx;
    order.forEach((i, r) => { const d = DATA[i], v = d[1] * d[2], y0 = q.Y(order.length - r), y1 = q.Y(order.length - r - 1); ctx.fillStyle = c[COLOR[d[3]]]; ctx.globalAlpha = i === sel ? 1 : .75; ctx.fillRect(q.X(0), y0 + 3, q.X(v) - q.X(0), y1 - y0 - 6); ctx.globalAlpha = 1; ctx.fillStyle = c.text; ctx.font = (i === sel ? '800' : '600') + ' 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(SHORT[i], q.X(0) - 8, (y0 + y1) / 2); ctx.textAlign = 'left'; ctx.fillStyle = c.muted; ctx.fillText(v.toFixed(0), q.X(v) + 5, (y0 + y1) / 2); });
    const d = DATA[sel]; info.innerHTML = '<b>' + d[0] + '</b>: Isp ≈ ' + d[1] + ' s, density ' + d[2].toFixed(2) + ' kg/L, ρ·Isp ≈ ' + (d[1] * d[2]).toFixed(0) + '. ' + d[4];
  }
  // tap or hover on either chart picks a propellant
  q.interact((x, y, pt, kind) => { if (kind === 'leave' || x == null) return; const order = DATA.map((d, i) => i).sort((a, b) => DATA[b][1] * DATA[b][2] - DATA[a][1] * DATA[a][2]), r = Math.min(order.length - 1, Math.max(0, Math.floor((pt.py - q.m.t) / q.ih * order.length))); if (order[r] !== sel) { sel = order[r]; draw(); } });
  p.interact((x, y, pt, kind) => { if (kind === 'leave' || x == null) return; let best = -1, bd = 1e9; DATA.forEach((d, i) => { const dd = (p.X(d[2]) - pt.px) ** 2 + (p.Y(d[1]) - pt.py) ** 2; if (dd < bd) { bd = dd; best = i; } }); if (bd < 40 * 40 && best !== sel && (kind !== 'move' || true)) { sel = best; draw(); } });
  p.onDraw(draw); q.onDraw(draw); draw();
}
