// Energy per kilogram: with and without carrying the oxidiser. Why explosives are weak and why rockets need so much mass.
import { h, shell, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';

// name, MJ per kg of fuel alone (air supplies the oxygen), MJ per kg of fuel + oxygen (stoichiometric), group
const ITEMS = [
  ['Hydrogen', 120, 13.4, 'fuel'], ['Methane / natural gas', 50, 10.0, 'fuel'], ['Propane (our engine)', 46.4, 10.0, 'fuel'], ['Kerosene / Jet-A', 43.2, 9.8, 'fuel'],
  ['Petrol', 44.4, 9.9, 'fuel'], ['Ethanol', 26.8, 8.7, 'fuel'], ['Wood (dry)', 16, 6.5, 'fuel'], ['Aluminium powder (to Al₂O₃)', 31, 16.4, 'fuel'],
  ['Composite solid propellant', 6, 6, 'self'], ['TNT (detonates)', 4.6, 4.6, 'self'], ['Black powder', 3.0, 3.0, 'self'], ['H₂O₂ 90 % decomposing', 2.5, 2.5, 'self'],
  ['Lithium-ion battery', 0.8, 0.8, 'self'], ['Lead-acid battery', 0.14, 0.14, 'self'],
];
export default function init(el) {
  const { body } = shell(el, { title: 'Energy per kilogram: the oxygen you have to carry', note: 'Fuels such as petrol hold 10× more energy per kilogram than TNT <i>only because the air supplies the oxygen for free</i>. Count the oxygen you must carry (a rocket has no air) and every hydrocarbon falls to ~10 MJ/kg of propellant, within a factor of 1.5 of the best chemical energy that exists. Explosives and propellants are not strong because they have more energy than petrol: they release it quickly and carry their own oxygen. Rate, not quantity, is what makes a reaction dangerous: that is the whole subject of the next sections.' });
  const cv = h('canvas', { class: 'plot', style: { minHeight: '420px' } });
  const tg = toggle({ label: 'Count the oxidiser I have to carry (rocket mode)', onChange: upd });
  body.append(h('div', { class: 'ctls', style: { marginBottom: '8px' } }, tg.el), cv);
  const p = new Plot(cv, { xmin: 0.1, xmax: 200, ymin: 0, ymax: ITEMS.length, xlog: true, aspect: 1.35, xlabel: 'energy released (MJ per kg)', margin: { l: 232, r: 24, t: 12, b: 40 }, yticks: [] });
  let cur = ITEMS.map(i => i[1]), tgt = cur.slice(), raf = 0;
  function upd() { const on = tg.get(); tgt = ITEMS.map(i => on ? i[2] : i[1]); if (!raf) raf = requestAnimationFrame(step); draw(); }
  function step() { let moving = false; cur = cur.map((v, i) => { const d = tgt[i] - v; if (Math.abs(d) > tgt[i] * 0.004) { moving = true; return v + d * 0.18; } return tgt[i]; }); draw(); raf = moving ? requestAnimationFrame(step) : 0; }
  function draw() {
    const c = p.begin().col; p.axes(); const ctx = p.ctx, rowH = p.ih / ITEMS.length;
    ITEMS.forEach((it, i) => {
      const y = p.m.t + rowH * (i + 0.5), x0 = p.X(0.1), x1 = p.X(Math.max(0.1, cur[i])), col = it[3] === 'fuel' ? c.fire : c.air;
      ctx.fillStyle = col; ctx.globalAlpha = .86; ctx.fillRect(x0, y - rowH * 0.32, x1 - x0, rowH * 0.64); ctx.globalAlpha = 1;
      ctx.fillStyle = c.text; ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(it[0], p.m.l - 10, y);
      ctx.textAlign = 'left'; ctx.fillStyle = c.strong; ctx.fillText(cur[i] >= 10 ? cur[i].toFixed(0) : cur[i].toFixed(1), x1 + 6, y);
    });
    const lx = p.m.l + p.iw - 230, ly = p.m.t + p.ih - 62; ctx.fillStyle = c.fire; ctx.fillRect(lx, ly, 10, 10); ctx.fillStyle = c.air; ctx.fillRect(lx, ly + 18, 10, 10); ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.fillText('fuels that need air (or oxygen)', lx + 16, ly + 5); ctx.fillText('self-contained: oxygen included', lx + 16, ly + 23);
  }
  p.onDraw(draw); draw();
}
