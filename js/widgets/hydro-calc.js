// Hydroelectric turbines: power and which runner to choose.
import { h, shell, slider, readout } from '../ui.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Water turbines: how much power, and which turbine?', note: 'P = η ρ g Q H. High head (a tall dam or mountain) with little water: Pelton wheel, which is a row of spoon-shaped buckets hit by a jet. Medium head: Francis (a spiral-case, inward-flow runner). Low head, big flow: Kaplan (a boat-propeller with adjustable blades). They are all <em>the same idea as our turbine wheel</em>: a bladed rotor that turns the fluid’s momentum into torque.' });
  const sH = slider({ label: 'Head (height of the water drop)', min: 2, max: 1500, step: 1, value: 120, unit: 'm', fmt: v => v.toFixed(0), log: true, onInput: upd });
  const sQ = slider({ label: 'Flow rate Q', min: 0.05, max: 500, step: 0.05, value: 20, unit: 'm³/s', fmt: v => v.toFixed(v < 10 ? 2 : 0), log: true, onInput: upd });
  const sE = slider({ label: 'Efficiency (typical 0.88–0.94)', min: 0.7, max: 0.95, step: 0.01, value: 0.9, fmt: v => v.toFixed(2), onInput: upd });
  const ro = { P: readout('Electrical power', '', 'fuel'), type: readout('Best turbine type', '', 'good'), homes: readout('Homes served (1 kW average each)', ''), v: readout('Jet / water speed  √(2gH)', 'm/s', 'cool') };
  const hint = h('div', { class: 'callout', style: { margin: '10px 0 0' } });
  body.append(h('div', { class: 'wgrid' }, h('div', { class: 'ctls' }, sH.el, sQ.el, sE.el), h('div', {}, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), hint)));
  const fmt = (w) => w >= 1e9 ? (w / 1e9).toFixed(2) + ' GW' : w >= 1e6 ? (w / 1e6).toFixed(1) + ' MW' : w >= 1e3 ? (w / 1e3).toFixed(0) + ' kW' : w.toFixed(0) + ' W';
  function upd() {
    const H = sH.get(), Q = sQ.get(), e = sE.get(), P = e * 1000 * 9.81 * Q * H;
    const type = H > 300 ? 'Pelton' : H > 40 ? 'Francis' : 'Kaplan';
    ro.P.set(fmt(P)); ro.type.set(type); ro.homes.set(Math.round(P / 1000).toLocaleString()); ro.v.set(Math.sqrt(2 * 9.81 * H).toFixed(0));
    hint.innerHTML = { Pelton: '<span class="ct">Pelton wheel</span>One or more jets hit double-cup buckets at nearly 0.5 × jet speed. All the pressure has been turned into speed in the nozzle first. Example: Bieudron (Switzerland), 1 883 m head, 423 MW per unit.',
      Francis: '<span class="ct">Francis turbine</span>Water spirals in through guide vanes and flows inwards through the runner, giving up pressure and swirl. The workhorse: most big dams. Example: Three Gorges, ~80 m head, 700 MW units.',
      Kaplan: '<span class="ct">Kaplan turbine</span>An axial-flow propeller whose blade <em>pitch</em> adjusts with the flow (like a variable-pitch propeller: chapter 4’s angle of attack again). For rivers and tides with a small drop and a lot of water.' }[type];
  }
  upd();
}
