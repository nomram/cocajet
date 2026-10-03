// Heat engines in power plants and jets: Carnot limit vs what real machines achieve.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

const PLANTS = [
  { n: 'Geothermal (steam, 150 °C)', th: 150, real: 12 },
  { n: 'Pressurised-water nuclear (steam 285 °C)', th: 285, real: 33 },
  { n: 'Coal / gas steam plant (supercritical, 600 °C)', th: 600, real: 43 },
  { n: 'Our CJ-1 (turbine inlet ≈ 800 °C)', th: 800, real: 9, me: true },
  { n: 'Big gas turbine, simple cycle (1 300 °C)', th: 1300, real: 40 },
  { n: 'Gas + steam combined cycle (1 450 °C)', th: 1450, real: 62 },
];

export default function init(el) {
  const { body } = shell(el, { title: 'Heat engines everywhere: the Carnot ceiling', note: 'No heat engine can beat η = 1 − T_cold/T_hot (kelvin). Power stations differ mostly in how hot their working fluid gets. Nuclear plants make steam at ~285 °C; a gas turbine starts at 1 300 °C, which is why jets and power-station gas turbines are descended from the same engine.' });
  const cv = h('canvas', { class: 'plot' });
  const sC = slider({ label: 'Cold side (river / air)', min: 0, max: 60, step: 1, value: 25, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const sH = slider({ label: 'Your hot side', min: 100, max: 1800, step: 10, value: 500, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { carnot: readout('Carnot limit for your engine', '%', 'good'), c2: readout('If you ran it at CJ-1’s 800 °C', '%', 'cool') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sC.el, sH.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)),
    h('p', { style: { fontSize: '.85rem', color: 'var(--muted)' } }, 'Why steam plants are “rankine” and jets “brayton”: a steam plant boils and condenses water (the working fluid goes round a closed loop, pumped as a liquid, expanded as a gas in the turbine). A jet engine takes in fresh air, burns fuel directly in it, and throws it away.'))));
  const p = new Plot(cv, { xmin: 0, xmax: 100, ymin: 0, ymax: PLANTS.length + 1, xlabel: 'efficiency (%)', aspect: 1.2, margin: { l: 12, r: 12, t: 12, b: 44 }, grid: true });
  function upd() {
    const Tc = sC.get() + 273.15, th = sH.get();
    ro.carnot.set(((1 - Tc / (th + 273.15)) * 100).toFixed(0)); ro.c2.set(((1 - Tc / 1073.15) * 100).toFixed(0));
    const c = p.begin().col; p.set({ yticks: [], ytickFmt: () => '' }); p.axes();
    const ctx = p.ctx, rows = [...PLANTS, { n: 'Your engine (slider)', th, real: null, you: true }];
    rows.forEach((r, i) => {
      const y = p.Y(rows.length - i - 0.2), hh = p.ih / (rows.length + 0.4) * 0.52, carnot = (1 - Tc / (r.th + 273.15)) * 100;
      ctx.fillStyle = c.air; ctx.globalAlpha = .28; ctx.fillRect(p.X(0), y, p.X(carnot) - p.X(0), hh); ctx.globalAlpha = 1;
      ctx.strokeStyle = c.air; ctx.lineWidth = 1.5; ctx.strokeRect(p.X(0) + .5, y + .5, p.X(carnot) - p.X(0), hh);
      if (r.real != null) { ctx.fillStyle = r.me ? c.fire : c.ok; ctx.fillRect(p.X(0), y + hh * 0.25, p.X(r.real) - p.X(0), hh * 0.5); }
      ctx.fillStyle = c.text; ctx.font = '600 11.5px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(r.n + (r.real != null ? `  ·  real ${r.real}%` : '') + `  ·  Carnot ${carnot.toFixed(0)}%`, p.X(0) + 6, y - 3);
    });
    p.legend([[c.air, 'Carnot limit'], [c.ok, 'real plant'], [c.fire, 'CJ-1 (thrust-producing)']], { pos: 'br' });
  }
  p.onDraw(upd); upd();
}
