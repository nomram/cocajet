// A zoo of rockets sorted by class: thrust against lift-off mass (with lines of constant thrust-to-weight), and a to-scale line-up.
import { h, shell, toggle, legend } from '../ui.js';
import { Plot } from '../plot.js';
import { G0 } from '../rocket-model.js';

/* name, class, height m, diameter m, lift-off mass kg, thrust N, payload to low Earth orbit kg, story.  Rounded public figures; launcher figures change between versions. */
const Z = [
  ['Water rocket (chapter 12)', 'water', 0.45, 0.09, 0.2, 73, 0, 'A 2-litre bottle and water. Thrust lasts half a second; apogee about 75 m. The safest real rocket.'],
  ['Model rocket, C-class', 'model', 0.35, 0.024, 0.05, 14, 0, 'A cardboard tube, a black-powder-type motor of 10 N·s. Peak thrust about 14 N for 1.7 s; apogee a few hundred metres. “Class 1” in US law.'],
  ['High-power rocket, Level 1 (H)', 'hpr', 1.5, 0.075, 2.5, 180, 0, 'Fibreglass and cardboard, a 160–320 N·s motor, flown at a club field after Level 1 certification. Apogee: a few hundred metres to a kilometre or two.'],
  ['High-power rocket, Level 3 (N)', 'hpr', 3.5, 0.15, 40, 2500, 0, 'Carbon fibre or fibreglass, 10 000–20 000 N·s, certified, flown at special launches. Apogee: several kilometres.'],
  ['Sounding rocket (typical)', 'sound', 10, 0.4, 3000, 100e3, 0, 'One or two solid stages; 100–300 km altitude, a few minutes of weightlessness or observation above the atmosphere. Typical figures, not one vehicle.'],
  ['Electron', 'small', 18, 1.2, 12500, 224e3, 300, 'Small launcher, two liquid stages (kerosene and oxygen), electric pumps; about 300 kg to low orbit.'],
  ['Falcon 9', 'medium', 70, 3.7, 549e3, 7.6e6, 22800, 'Medium launcher: nine engines on the first stage; about 17–23 t to low orbit depending on whether the booster is recovered. The first stage lands and flies again.'],
  ['Delta IV Heavy (retired 2024)', 'heavy', 72, 5.1, 733e3, 9.4e6, 28000, 'Heavy launcher: three liquid-hydrogen cores strapped together; about 28 t to low orbit. Flew from 2004 to 2024.'],
  ['Falcon Heavy', 'super', 70, 3.7, 1.42e6, 22.8e6, 63800, 'Three Falcon 9 cores strapped together: about 64 t to low orbit when expended.'],
  ['Saturn V', 'super', 110.6, 10.1, 2.97e6, 34e6, 140000, 'The Apollo moon rocket, three stages, 140 t to low orbit including the third stage. Still the tallest and strongest rocket flown to orbit before Starship.'],
  ['SLS Block 1', 'super', 98, 8.4, 2.6e6, 39e6, 95000, 'Two solid boosters and a hydrogen/oxygen core. About 95 t to low orbit.'],
  ['Starship + Super Heavy', 'super', 121, 9, 5.0e6, 74e6, 100000, 'A fully reusable two-stage design with methane/oxygen engines, still in development; payload figures are design goals (about 100 t or more).'],
];
const CL = { water: ['air', 'water rocket'], model: ['air', 'model rocket'], hpr: ['fuel', 'high-power hobby'], sound: ['violet', 'sounding rocket'], small: ['ok', 'small-lift launcher (< 2 t to LEO)'], medium: ['warn', 'medium-lift (2–20 t)'], heavy: ['fire', 'heavy-lift (20–50 t)'], super: ['bad', 'super-heavy-lift (> 50 t)'] };

export default function init(el) {
  const { body } = shell(el, { title: 'The rocket zoo: from a water bottle to Starship', note: 'Rockets span ten orders of magnitude in lift-off mass and nine in thrust. The dotted lines are constant <b>thrust-to-weight ratio</b> (F/mg): hobby rockets sit high (5 to 15, they must be fast off the rod to steer), orbital launchers sit low (1.2 to 1.5, they spend minutes climbing). Launch vehicles are classed by the mass they can put into low Earth orbit: small-lift under 2 t, medium 2 to 20 t, heavy 20 to 50 t, super-heavy above 50 t. Tap a point or a rocket. Figures are rounded public numbers and some vehicles are still changing.' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const info = h('div', { class: 'widget-note', style: { minHeight: '4.2em', marginTop: '8px' } }, 'Tap a rocket.');
  const scale = toggle({ label: 'Draw the line-up to true scale (otherwise every rocket the same height)', checked: true, onChange: draw });
  body.append(cv, legend(Object.values(CL).map(([c, n]) => ['var(--' + c + ')', n])), info, h('div', { style: { marginTop: '8px' } }, scale.el), cv2);
  const p = new Plot(cv, { xmin: 0.03, xmax: 2e7, ymin: 3, ymax: 3e8, xlog: true, ylog: true, aspect: 1.65, minHeight: 280, xlabel: 'lift-off mass (kg)', ylabel: 'lift-off thrust (N)', title: 'Thrust vs lift-off mass', margin: { l: 58, r: 14, t: 28, b: 40 }, xtickFmt: v => v >= 1e6 ? (v / 1e6) + ' kt' : v >= 1e3 ? (v / 1e3) + ' t' : v >= 1 ? v + ' kg' : (v * 1000) + ' g', ytickFmt: v => v >= 1e6 ? (v / 1e6) + ' MN' : v >= 1e3 ? (v / 1e3) + ' kN' : v + ' N' });
  const q = new Plot(cv2, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 3.2, minHeight: 230, margin: { l: 6, r: 6, t: 6, b: 6 }, grid: false });
  let sel = 6;
  const short = ['Water rocket', 'Model C', 'HPR Level 1', 'HPR Level 3', 'Sounding rocket', 'Electron', 'Falcon 9', 'Delta IV H', 'Falcon Heavy', 'Saturn V', 'SLS', 'Starship'];
  const place = [[10, 0, 'left'], [10, 0, 'left'], [-10, -6, 'right'], [-10, 0, 'right'], [10, 0, 'left'], [10, 0, 'left'], [-10, 12, 'right'], [-10, -10, 'right'], [10, 8, 'left'], [-10, 8, 'right'], [-10, -12, 'right'], [-8, -12, 'right']];
  const lineup = ['Water', 'Model C', 'HPR L1', 'HPR L3', 'Sounding', 'Electron', 'Falcon 9', 'Delta IV H', 'F. Heavy', 'Saturn V', 'SLS', 'Starship'];
  function draw() {
    let c = p.begin().col; p.axes(); p.clip(true);
    for (const k of [1, 2, 5, 10, 20]) { p.line([0.03, 2e7], [0.03 * G0 * k, 2e7 * G0 * k], { color: k === 1 ? c.bad : c.muted, width: k === 1 ? 1.6 : 1, dash: [2, 4], alpha: .8 }); }
    p.clip(false);
    p.text(6e3, 6e3 * G0 * 0.55, 'T/W = 1: it just hovers', { color: c.bad, size: 10.5, weight: 700, align: 'left' });
    [2, 5, 10, 20].forEach(k => p.text(300, 300 * G0 * k * 1.28, 'T/W ' + k, { color: c.muted, size: 10.5, weight: 700, align: 'center' }));
    Z.forEach((z, i) => p.points([z[4]], [z[5]], { color: c[CL[z[1]][0]], r: i === sel ? 9 : 6, stroke: i === sel ? c.strong : null }));
    Z.forEach((z, i) => { const [dx, dy, al] = place[i]; p.ptext(p.X(z[4]) + dx, p.Y(z[5]) + dy, short[i], { color: c.text, size: 10.5, weight: i === sel ? 800 : 600, align: al, base: 'middle' }); });
    // line-up
    c = q.begin().col; const ctx = q.ctx, W = q.W, H = q.H, n = Z.length, pad = 14, base = H - 26, maxH = Math.max(...Z.map(z => z[2]));
    const slot = (W - 2 * pad) / n;
    ctx.strokeStyle = c.grid2; ctx.beginPath(); ctx.moveTo(pad, base + .5); ctx.lineTo(W - pad, base + .5); ctx.stroke();
    Z.forEach((z, i) => {
      const x = pad + slot * (i + .5), hh = scale.get() ? Math.max(3, z[2] / maxH * (base - 22)) : (base - 40), w = scale.get() ? Math.max(1.5, z[3] / maxH * (base - 22)) : Math.min(slot * 0.5, hh * z[3] / z[2] * 1.0 + 3);
      const col = c[CL[z[1]][0]], sw = Math.min(Math.max(w, 1.5), slot * 0.9);
      ctx.fillStyle = col; ctx.globalAlpha = i === sel ? 1 : .75;
      ctx.beginPath(); ctx.moveTo(x - sw / 2, base); ctx.lineTo(x - sw / 2, base - hh * 0.8); ctx.quadraticCurveTo(x - sw / 2, base - hh * 0.95, x, base - hh); ctx.quadraticCurveTo(x + sw / 2, base - hh * 0.95, x + sw / 2, base - hh * 0.8); ctx.lineTo(x + sw / 2, base); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - sw / 2, base); ctx.lineTo(x - sw * 0.95, base + 0); ctx.lineTo(x - sw / 2, base - hh * 0.12); ctx.moveTo(x + sw / 2, base); ctx.lineTo(x + sw * 0.95, base); ctx.lineTo(x + sw / 2, base - hh * 0.12); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = i === sel ? c.strong : c.text; ctx.font = (i === sel ? '800 ' : '600 ') + '10px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(lineup[i], x, base + 5); ctx.fillStyle = c.muted; ctx.textBaseline = 'bottom'; ctx.fillText(z[2] >= 10 ? z[2].toFixed(0) + ' m' : z[2] + ' m', x, base - hh - 3);
    });
    const z = Z[sel]; info.innerHTML = '<b>' + z[0] + '</b> · ' + z[2] + ' m tall, lift-off mass ' + (z[4] >= 1000 ? (z[4] / 1000).toFixed(z[4] >= 1e5 ? 0 : 1) + ' t' : z[4] + ' kg') + ', thrust ' + (z[5] >= 1e6 ? (z[5] / 1e6).toFixed(1) + ' MN' : z[5] >= 1e3 ? (z[5] / 1e3).toFixed(0) + ' kN' : z[5] + ' N') + ', thrust-to-weight ' + (z[5] / (z[4] * G0)).toFixed(1) + (z[6] ? ', low-orbit payload ≈ ' + (z[6] >= 1000 ? (z[6] / 1000).toFixed(z[6] % 1000 ? 1 : 0) + ' t' : z[6] + ' kg') : '') + '. ' + z[7];
  }
  const pick = (x, y, pt, kind) => { if (kind === 'leave' || x == null) return; let best = -1, bd = 1e9; Z.forEach((z, i) => { const d = (p.X(z[4]) - pt.px) ** 2 + (p.Y(z[5]) - pt.py) ** 2; if (d < bd) { bd = d; best = i; } }); if (bd < 36 * 36 && best !== sel) { sel = best; draw(); } };
  p.interact(pick);
  cv2.addEventListener('pointerdown', (e) => { const r = cv2.getBoundingClientRect(), px = (e.clientX - r.left) * (q.W / r.width), slot = (q.W - 28) / Z.length, i = Math.floor((px - 14) / slot); if (i >= 0 && i < Z.length && i !== sel) { sel = i; draw(); } });
  p.onDraw(draw); q.onDraw(draw); draw();
}
