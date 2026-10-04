// Heat range of a spark plug / igniter: how hot does the tip get, and is that too hot or too cold?
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Hot plug or cold plug? The tip temperature balance', note: 'The ceramic tip is heated by the gas and cooled by conduction down the insulator into the metal body (which the engine air keeps cool). A <b>long</b> insulator nose is a poor path for heat: the tip runs hot (a “hot plug”). A <b>short</b> nose runs cold. Between about 450 °C and 850 °C soot burns off the tip (self-cleaning) without the tip ever glowing; below that it fouls with carbon, above that it can glow and light the mixture by itself (pre-ignition) or melt.' });
  const cv = h('canvas', { class: 'plot' });
  const sL = slider({ label: 'Insulator nose length', min: 2, max: 16, step: 0.5, value: 8, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sT = slider({ label: 'Gas temperature around the tip', min: 300, max: 2200, step: 10, value: 1300, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sU = slider({ label: 'Gas speed past the tip', min: 1, max: 80, step: 1, value: 10, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sS = slider({ label: 'Metal body temperature', min: 300, max: 800, step: 10, value: 450, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const pre = h('div', { class: 'btn-row' }, button('Plug at the liner wall, idle', () => { sT.set(900); sU.set(5); sS.set(380); upd(); }, 'small'), button('Plug at the liner wall, full power', () => { sT.set(1300); sU.set(10); sS.set(450); upd(); }, 'small'), button('Plug sticking into the flame (φ ≈ 1.1)', () => { sT.set(2000); sU.set(10); sS.set(500); upd(); }, 'small'));
  const ro = { T: readout('Tip temperature', '°C', 'hot'), z: readout('Zone', ''), q: readout('Heat flowing down the insulator', 'W', 'fuel') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, pre, sL.el, sT.el, sU.el, sS.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 2, xmax: 16, ymin: 100, ymax: 1400, aspect: 1.35, xlabel: 'insulator nose length (mm)', ylabel: 'tip temperature (°C)' });
  const A = 2.0e-5, As = 1.5e-4, k = 25;                          // insulator cross-section, exposed tip area (m^2), alumina conductivity (W/m K)
  const tip = (L, Tg, U, Ts) => { const hc = 60 * Math.pow(U, 0.6) * 1.0, G = hc * As, Rc = (L * 1e-3) / (k * A); return (G * Tg + Ts / Rc) / (G + 1 / Rc); };
  function upd() {
    const L = sL.get(), Tg = sT.get(), U = sU.get(), Ts = sS.get(), T = tip(L, Tg, U, Ts), TC = T - 273.15;
    const hc = 60 * Math.pow(U, 0.6), q = hc * As * (Tg - T);
    ro.T.set(TC.toFixed(0), TC < 450 ? 'cool' : TC < 850 ? 'good' : 'bad'); ro.z.set(TC < 450 ? 'fouls with soot' : TC < 850 ? 'self-cleaning' : TC < 1000 ? 'pre-ignition risk' : 'glows / melts', TC < 450 ? 'cool' : TC < 850 ? 'good' : 'bad'); ro.q.set(q.toFixed(1));
    const c = p.begin().col; p.axes();
    p.hband(100, 450, { color: c.air, alpha: .12 }); p.hband(450, 850, { color: c.ok, alpha: .14 }); p.hband(850, 1400, { color: c.bad, alpha: .12 });
    p.text(15.9, 270, 'too cold: carbon fouling', { color: c.air, align: 'right', size: 11, weight: 700 }); p.text(15.9, 650, 'self-cleaning window', { color: c.ok, align: 'right', size: 11, weight: 700 }); p.text(15.9, 1100, 'too hot: pre-ignition, erosion', { color: c.bad, align: 'right', size: 11, weight: 700 });
    const xs = [], ys = []; for (let x = 2; x <= 16; x += 0.25) { xs.push(x); ys.push(tip(x, Tg, U, Ts) - 273.15); }
    p.line(xs, ys, { color: c.fire, width: 3.2 }); p.vline(L, { color: c.air }); p.dot(L, TC, { color: c.fire, r: 6.5 });
  }
  p.onDraw(upd); upd();
}
