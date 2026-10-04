// Why throw a lot of air slowly rather than a little air fast.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Big and slow, or small and fast?', note: 'Same thrust, very different fuel bills. The wasted energy is the kinetic energy left in the jet, which the surrounding air gets for free. That is why airliners use huge fans (turbofans), why propellers beat jets at low speed, and why rockets are thirsty.' });
  const c1 = h('canvas', { class: 'plot' }), c2 = h('canvas', { class: 'plot' });
  const sF = slider({ label: 'Thrust you need', min: 10, max: 200, step: 5, value: 58, unit: 'N', fmt: v => v.toFixed(0), onInput: upd });
  const sV0 = slider({ label: 'Flight speed', min: 10, max: 300, step: 5, value: 100, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sM = slider({ label: 'Air you accelerate  ṁ', min: 0.05, max: 5, step: 0.05, value: 0.151, unit: 'kg/s', fmt: v => v.toFixed(2), onInput: upd, log: true });
  const ro = { Ve: readout('Needed exhaust speed', 'm/s', 'cool'), eta: readout('Propulsive efficiency', '%', 'good'), jet: readout('Jet kinetic power', 'kW', 'fuel'), use: readout('Useful thrust power', 'kW', 'good'), waste: readout('Wasted in the jet', 'kW', 'hot') };
  body.append(h('div', { class: 'wgrid even' }, c1, c2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sF.el, sV0.el, sM.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(c1, { xmin: 0, xmax: 6, ymin: 0, ymax: 100, xlabel: 'jet speed ÷ flight speed  (Vₑ / V₀)', ylabel: 'propulsive efficiency (%)', aspect: 1.35, xticks: [0, 1, 2, 3, 4, 5, 6] });
  const p2 = new Plot(c2, { xmin: 0.05, xmax: 5, ymin: 0.2, ymax: 200, xlog: true, ylog: true, xlabel: 'air accelerated  ṁ (kg/s)', ylabel: 'jet power to make the thrust (kW)', aspect: 1.35 });
  function upd() {
    const F = sF.get(), V0 = sV0.get(), m = sM.get(), Ve = V0 + F / m;
    const eta = 2 / (1 + Ve / V0), jet = 0.5 * m * (Ve * Ve - V0 * V0), use = F * V0;
    ro.Ve.set(Ve.toFixed(0)); ro.eta.set((eta * 100).toFixed(0)); ro.jet.set((jet / 1000).toFixed(1)); ro.use.set((use / 1000).toFixed(1)); ro.waste.set(((jet - use) / 1000).toFixed(1));
    let c = p1.begin().col; p1.axes();
    p1.fn(r => 200 / (1 + r), 1, 6, { color: c.air, width: 2.8 }, 100);
    p1.band(0, 1, { color: c.muted, alpha: .08 });
    const marks = [[1.05, 'propeller', 'left'], [1.6, 'turbofan (airliner)', 'left'], [3.2, 'turbojet cruise', 'left'], [5.6, 'rocket-ish', 'right']];
    marks.forEach(([r, n, al]) => { p1.dot(r, 200 / (1 + r), { color: c.fuel, r: 4 }); p1.text(al === 'left' ? r + 0.15 : r + 0.3, 200 / (1 + r) + (al === 'left' ? -3 : 6), n, { color: c.text, size: 11, base: al === 'left' ? 'top' : 'bottom', align: al }); });
    p1.dot(Ve / V0, eta * 100, { color: c.fire, r: 6 }); p1.text(Ve / V0, eta * 100 - 8, 'you are here', { color: c.fire, align: 'center', size: 11, base: 'top' });
    c = p2.begin().col; p2.axes();
    // at fixed thrust F and flight speed V0:  Ve = V0 + F/m ; P_jet = 1/2 m (Ve^2 - V0^2)
    p2.fn(mm => 0.5 * mm * Math.pow(V0 + F / mm, 2) / 1000 - 0.5 * mm * V0 * V0 / 1000, 0.05, 5, { color: c.fire, width: 2.8 }, 120);
    p2.hline(F * V0 / 1000 || 0.21, { color: c.ok, label: 'the useful part: F·V₀', align: 'right' });
    p2.dot(m, jet / 1000, { color: c.fire, r: 6 });
    p2.text(0.06, 120, 'small, fast: expensive', { color: c.fire, size: 11, bg: true }); p2.text(4.9, 0.5, 'big, slow: cheap', { color: c.air, size: 11, align: 'right', bg: true });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
