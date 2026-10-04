// A flame held in a "well-stirred reactor": ignition, blow-out and hysteresis (the S-curve), and where the CJ-1 sits on it.
import { h, shell, slider, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { flameTemp } from './combustion.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

const R = 8.314, A0 = 2.7e7, PROPANE = { x: 3, y: 8, z: 0, LHV: 46.35 };
const VPZ = 9.4e-5;                                   // primary-zone volume of the CJ-1 liner (m^3): annulus r 17.5-32.5 mm x 40 mm

/* classify roots properly: for residence time tau the energy residual f(T) = T - Tin - dT*X(T) goes + -> - ... */
function branches(phi, Tin, P, Ea) {
  const Tad = flameTemp(PROPANE, phi, Tin), dT = Tad - Tin;
  const k = (T) => A0 * Math.exp(-Ea * 1000 / (R * T)) * Math.pow(P, 0.75);
  const lo = [], up = [], mid = [];
  for (let lt = -2; lt <= 3; lt += 0.03) {
    const tau = Math.pow(10, lt) * 1e-3, roots = []; let prev = null, prevT = null;
    for (let i = 0; i <= 700; i++) {
      const T = Tin + dT * i / 700, X = k(T) * tau / (1 + k(T) * tau), f = T - Tin - dT * X;
      if (prev != null && (prev < 0) !== (f < 0)) roots.push(0.5 * (T + prevT));
      prev = f; prevT = T;
    }
    // f<0 just above Tin means heat release dominates; ordered roots: cold (stable), middle (unstable), hot (stable)
    const ms = Math.pow(10, lt);
    if (roots.length === 1) (roots[0] > Tin + 0.5 * dT ? up : lo).push([ms, roots[0]]);
    else if (roots.length >= 3) { lo.push([ms, roots[0]]); mid.push([ms, roots[1]]); up.push([ms, roots[roots.length - 1]]); }
    else if (roots.length === 2) { up.push([ms, roots[1]]); lo.push([ms, roots[0]]); }
  }
  return { Tad, lo, up, mid };
}

export default function init(el) {
  const { body } = shell(el, { title: 'Why the flame lights, why it blows out: the well-stirred reactor', note: 'Fresh mixture enters, burns, and leaves after a <b>residence time</b> τ. Short τ: the gas leaves before it can burn → the flame is blown out. Long τ: it burns completely and sits at the flame temperature. In between lies a range where <i>both</i> states are possible (a cold, unlit one and a burning one) with an unstable state between them. That is hysteresis: you need a spark to jump to the upper branch, and a much shorter τ to push it back down. This is the model behind every lean blow-out limit.' });
  const cv = h('canvas', { class: 'plot' });
  const sPhi = slider({ label: 'Mixture strength in the flame zone φ', min: 0.25, max: 2.0, step: 0.01, value: 1.13, fmt: v => v.toFixed(2), onInput: upd });
  const sT = slider({ label: 'Temperature of the incoming air', min: 250, max: 900, step: 5, value: 366, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sP = slider({ label: 'Pressure', min: 0.5, max: 4, step: 0.05, value: 1.85, unit: 'bar', fmt: v => v.toFixed(2), onInput: upd });
  const sE = slider({ label: 'Activation energy (fuel)', min: 90, max: 200, step: 1, value: 130, unit: 'kJ/mol', fmt: v => v.toFixed(0), onInput: upd });
  const pre = h('div', { class: 'btn-row' }, button('CJ-1 full power', () => { sPhi.set(1.13); sT.set(366); sP.set(1.85); upd(); }, 'small'), button('CJ-1 at idle', () => { sPhi.set(1.15); sT.set(301); sP.set(1.12); upd(); }, 'small'), button('Lean cruise φ = 0.4', () => { sPhi.set(0.4); upd(); }, 'small'));
  const ro = { tad: readout('Flame temperature', 'K', 'hot'), bo: readout('Blow-out residence time', 'ms', 'bad'), full: readout('CJ-1 residence time, full power', 'ms', 'cool'), idle: readout('CJ-1 residence time, idle', 'ms', 'cool'), mar: readout('Blow-out margin at full power', '×', 'good') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, pre, sPhi.el, sT.el, sP.el, sE.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 0.01, xmax: 1000, ymin: 250, ymax: 2800, xlog: true, aspect: 1.35, xlabel: 'residence time in the flame zone τ (ms)   ← fast flow · slow flow →', xtickFmt: v => (Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9 ? String(v) : ''), ylabel: 'gas temperature (K)', margin: { l: 56, r: 12, t: 14, b: 40 } });
  const amb = isa(0), full = steadyAt({ ...CJ1 }, 115000, amb), idle = steadyAt({ ...CJ1 }, 48000, amb);
  const tau = (g, Tpz) => 1e3 * (g.P03 / (g.Rhot * Tpz)) * VPZ / (0.26 * g.m + g.mf);
  function upd() {
    const phi = sPhi.get(), Tin = sT.get(), P = sP.get(), Ea = sE.get();
    const b = branches(phi, Tin, P, Ea), tFull = tau(full, 1900), tIdle = tau(idle, 1750);
    const bo = b.up.length ? b.up[0][0] : NaN;
    ro.tad.set(b.Tad.toFixed(0)); ro.bo.set(isFinite(bo) ? (bo < 1 ? bo.toFixed(3) : bo.toFixed(1)) : '> 1000', 'bad'); ro.full.set(tFull.toFixed(2)); ro.idle.set(tIdle.toFixed(2));
    ro.mar.set(isFinite(bo) ? (tFull / bo).toFixed(1) : '< 0.01', isFinite(bo) && tFull / bo > 1.5 ? 'good' : 'bad');
    const c = p.begin().col; p.axes();
    p.vline(tFull, { color: c.fire, width: 2, dash: [] }); p.vline(tIdle, { color: c.air, width: 2, dash: [] });
    if (isFinite(bo)) p.vline(bo, { color: c.bad, dash: [2, 3], width: 2 });
    p.text(990, 2700, '— CJ-1 at full power', { color: c.fire, align: 'right', size: 11, weight: 700 }); p.text(990, 2600, '— CJ-1 at idle', { color: c.air, align: 'right', size: 11, weight: 700 }); p.text(990, 2500, '··· blow-out limit', { color: c.bad, align: 'right', size: 11, weight: 700 });
    p.hline(b.Tad, { color: c.muted, alpha: .6, label: 'flame temperature', align: 'right' });
    const draw = (arr, col, dash) => { if (arr.length > 1) p.line(arr.map(a => a[0]), arr.map(a => a[1]), { color: col, width: 3.2, dash }); };
    draw(b.lo, c.air); draw(b.up, c.fire); draw(b.mid, c.muted, [6, 5]);
    p.text(0.012, 330 + 0 * Tin, 'unlit', { color: c.air, weight: 800 });
    p.text(500, b.Tad - 120, 'burning', { color: c.fire, weight: 800, align: 'right' });
    if (b.mid.length) p.text(b.mid[Math.floor(b.mid.length / 2)][0] * 1.1, b.mid[Math.floor(b.mid.length / 2)][1], 'unstable', { color: c.muted, size: 11 });
  }
  p.onDraw(upd); upd();
}
