// The map of all propulsion: thrust vs specific impulse (log-log), with lines of constant jet power. High Isp and high thrust together would need enormous power.
import { h, shell, toggle, legend } from '../ui.js';
import { Plot } from '../plot.js';
import { G0 } from '../rocket-model.js';

/* family, Isp range [s], thrust range [N], class, story, label anchor (Isp, thrust, align) */
const FAM = [
  ['Gridded ion',      1500, 10000, 1e-3, 0.5,  'electric', 'Needs electricity (solar array or reactor), gives millinewtons for kilowatts. Very high Isp: perfect for long, patient trips (chapter 15).', 4000, 0.02, 'center'],
  ['Hall thruster',    1000, 3000,  1e-3, 1.2,  'electric', 'Like an ion thruster with a magnetic trap instead of grids: more thrust per kilowatt, lower Isp. Satellites and probes.', 1500, 2.6, 'center'],
  ['Arcjet / resistojet', 150, 800, 1e-2, 5,    'electric', 'Heat the propellant electrically, then expand it in a nozzle: the simplest electric thrusters.', 350, 0.1, 'center'],
  ['Cold gas',            40, 80,   1e-3, 20,   'chem', 'No combustion: just released gas. Tiny attitude thrusters.', 57, 0.03, 'center'],
  ['Water rocket',         3, 10,   5, 100,     'chem', 'Chapter 12: pressurised water, a few kilograms of thrust for a fraction of a second.', 5.5, 22, 'center'],
  ['Hydrazine thrusters', 200, 240, 0.5, 500,   'chem', 'Single liquid over a catalyst: the spacecraft’s workhorse.', 150, 60, 'right'],
  ['Solid motors',     200, 285,    1, 1.5e7,   'chem', 'From a model rocket motor to the Shuttle booster (≈ 12 MN). Chapter 13.', 185, 2e6, 'right'],
  ['Hybrid rockets',   220, 320,    50, 2e6,    'chem', 'Solid fuel, flowing oxidiser: throttle and shut-off. Chapter 14.', 500, 2e4, 'left'],
  ['Liquid rockets',   250, 460,    5, 8e6,     'chem', 'Pumps, valves and cooling: the highest chemical Isp, from 5 N thrusters to 8 MN engines (hydrogen/oxygen gives 450 s).', 500, 2e6, 'left'],
  ['Turbojet (CJ-1 class)', 1700, 3500, 15, 3000, 'air', 'Chapters 2–9: air is the oxidiser, so Isp is 5–10× higher than any rocket.', 2400, 600, 'center'],
  ['Ramjet / scramjet', 1000, 4000, 1e3, 3e5,   'air', 'Needs speed to work (chapter 14).', 2000, 3e4, 'center'],
  ['Turbofan (airliner)', 5000, 15000, 3e4, 5e5, 'air', 'A big bypass fan accelerates a lot of air a little: the most efficient of all fuel-burning engines.', 8000, 1.4e5, 'center'],
];
const CLS = { electric: ['violet', 'electric (power-limited)'], chem: ['fire', 'rocket (carries its propellant)'], air: ['air', 'air-breathing'] };

export default function init(el) {
  const { body } = shell(el, { title: 'The map of propulsion: thrust vs specific impulse', note: 'Every engine in the book fits on one picture. The diagonal lines are <b>constant jet power</b>, P = ½·F·V<sub>e</sub> = ½·F·I<sub>sp</sub>·g₀: you can have high thrust or high Isp, but both together cost power that grows with their product. Rockets sit at modest Isp and enormous thrust (their power comes from chemistry, billions of watts in a small engine). Electric thrusters sit far to the right and far down: their Isp is great and their thrust is limited by the power the spacecraft can generate. Air-breathing engines get their Isp for free from the atmosphere. Tap a region.' });
  const cv = h('canvas', { class: 'plot' }), info = h('div', { class: 'widget-note', style: { minHeight: '3.6em', marginTop: '8px' } }, 'Tap or hover a coloured region.');
  const pw = toggle({ label: 'Show lines of constant jet power', checked: true, onChange: draw });
  body.append(cv, legend(Object.values(CLS).map(([c, n]) => ['var(--' + c + ')', n])), info, h('div', { style: { marginTop: '8px' } }, pw.el));
  const p = new Plot(cv, { xmin: 3, xmax: 30000, ymin: 1e-3, ymax: 3e7, xlog: true, ylog: true, aspect: 1.7, xlabel: 'specific impulse Isp (s)', ylabel: 'thrust (N)', title: 'Thrust vs Isp, log scales', margin: { l: 58, r: 14, t: 28, b: 40 }, xtickFmt: v => v >= 1000 ? (v / 1000) + 'k' : String(v), ytickFmt: v => v >= 1e6 ? (v / 1e6) + ' M' : v >= 1e3 ? (v / 1e3) + ' k' : v >= 1 ? String(v) : v >= 1e-3 ? (v * 1000) + ' m' : String(v) });
  let sel = 6;
  function draw() {
    const c = p.begin().col, ctx = p.ctx; p.axes();
    if (pw.get()) for (const P of [1, 1e3, 1e6, 1e9]) { const xs = [], ys = []; for (let I = 10; I <= 30000; I *= 1.2) { xs.push(I); ys.push(2 * P / (I * G0)); } p.clip(true); p.line(xs, ys, { color: c.muted, width: 1.2, dash: [3, 4], alpha: .7 }); p.clip(false); const xl = Math.min(25000, 2 * P / (1e-3 * G0) * 0.0 + 14), yl = 2 * P / (14 * G0); if (yl < 2e7 && yl > 2e-3) p.text(14, yl * 1.3, P >= 1e9 ? '1 GW' : P >= 1e6 ? '1 MW' : P >= 1e3 ? '1 kW' : '1 W', { color: c.muted, size: 10.5, weight: 700 }); }
    FAM.forEach((f, i) => {
      const col = c[CLS[f[5]][0]], x0 = p.X(f[1]), x1 = p.X(f[2]), y0 = p.Y(f[4]), y1 = p.Y(f[3]);
      ctx.fillStyle = col; ctx.globalAlpha = i === sel ? .55 : .28; ctx.beginPath(); ctx.roundRect(x0, y0, Math.max(10, x1 - x0), y1 - y0, 8); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = i === sel ? 2.4 : 1.2; ctx.stroke();
      const [lx, ly, al] = f.slice(7), px = p.X(lx), py = p.Y(ly);
      if (al !== 'center') { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo((x0 + Math.max(x0 + 10, x1)) / 2, (y0 + y1) / 2); ctx.lineTo(px + (al === 'right' ? 4 : -4), py); ctx.stroke(); }
      ctx.fillStyle = c.strong; ctx.font = (i === sel ? '800' : '700') + ' 10.5px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = al; ctx.textBaseline = 'middle'; ctx.fillText(f[0].replace('Turbofan (airliner)', 'Turbofan').replace('Turbojet (CJ-1 class)', 'Turbojet').replace('Hydrazine thrusters', 'Hydrazine').replace('Arcjet / resistojet', 'Arcjet'), px, py);
    });
    p.dot(2070, 58, { color: c.strong, r: 6 }); p.text(2300, 58 * 0.55, 'CJ-1', { color: c.strong, size: 11, weight: 800 });
    const f = FAM[sel]; info.innerHTML = '<b>' + f[0] + '</b>: Isp ' + f[1] + '–' + f[2] + ' s, thrust ' + (f[3] < 1 ? (f[3] * 1000) + ' mN' : f[3] + ' N') + ' to ' + (f[4] >= 1e6 ? (f[4] / 1e6) + ' MN' : f[4] >= 1e3 ? (f[4] / 1e3) + ' kN' : f[4] + ' N') + '. ' + f[6];
  }
  p.interact((x, y, pt, kind) => { if (kind === 'leave' || x == null) return; let best = -1, area = 1e18; FAM.forEach((f, i) => { if (x >= f[1] && x <= f[2] && y >= f[3] && y <= f[4]) { const a = Math.log(f[2] / f[1]) * Math.log(f[4] / f[3]); if (a < area) { area = a; best = i; } } }); if (best >= 0 && best !== sel) { sel = best; draw(); } });
  p.onDraw(draw); draw();
}
