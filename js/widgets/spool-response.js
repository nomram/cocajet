// Why you can't snap the throttle: the rotor takes time to speed up, so extra fuel first heats the turbine instead of making thrust.
import { h, shell, slider, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt, stepSpool } from '../engine-model.js';

const TLIM = 1200;                                           // K, hot-section limit used in the guide
export default function init(el) {
  const { body } = shell(el, { title: 'Throttle response: speed, turbine temperature and surge during an acceleration', note: 'The rotor weighs about 200 g and spins at up to 115 000 rpm; to speed it up the turbine must deliver more power than the compressor takes, and that surplus comes from burning more fuel. But fuel acts <i>at once</i> (the gas heats immediately) while the speed rises over seconds. A sudden fuel step therefore overheats the turbine and pushes the compressor toward surge before the speed catches up. The cure is a fuel ramp, and the engine controller (ECU) limits the temperature while it ramps.' });
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sR = slider({ label: 'Fuel ramp time (idle → full)', min: 0.05, max: 10, step: 0.05, value: 0.2, unit: 's', log: true, fmt: v => v.toFixed(2), onInput: upd });
  const sI = slider({ label: 'Rotor inertia (× the CJ-1 rotor)', min: 0.5, max: 4, step: 0.1, value: 1, fmt: v => v.toFixed(1), onInput: upd });
  const sT = slider({ label: 'Air temperature', min: -20, max: 45, step: 1, value: 15, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const lim = toggle({ label: 'ECU limits the turbine temperature during the ramp', checked: false, onChange: upd });
  const ro = { pk: readout('Peak turbine inlet temperature', '°C', 'hot'), t98: readout('Time to 98 % speed', 's', 'cool'), sg: readout('Surge during the acceleration?', '', 'good'), v: readout('Verdict', '', 'good') };
  body.append(h('div', { class: 'wgrid even' }, cvA, cvB), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sR.el, sI.el, sT.el, lim.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cvA, { xmin: 0, xmax: 12, ymin: 40000, ymax: 120000, aspect: 1.5, xlabel: 'time (s)', ylabel: 'rotor speed (rpm)', title: 'Speed', margin: { l: 56, r: 12, t: 28, b: 40 }, ytickFmt: v => (v / 1000) + 'k' });
  const p2 = new Plot(cvB, { xmin: 0, xmax: 12, ymin: 500, ymax: 1700, aspect: 1.5, xlabel: 'time (s)', ylabel: 'turbine inlet temperature (°C)', title: 'Turbine temperature', margin: { l: 56, r: 12, t: 28, b: 40 } });
  function upd() {
    const p = { ...CJ1, I: CJ1.I * sI.get() }, amb = isa(0, sT.get() - 15), idle = steadyAt(p, 48000, amb), full = steadyAt(p, p.Ndesign, amb), ramp = sR.get();
    const st = { N: 48000, lit: true }, dt = 0.01, ts = [], Ns = [], Ts = []; let t = 0, peak = 0, surge = false, t98 = null, cut = 1;
    while (t < 12) {
      const k = Math.min(1, t / ramp), sched = idle.mf + (full.mf - idle.mf) * k, mf = sched * (lim.get() ? cut : 1);
      const r = stepSpool(p, st, { mf, starter: 0 }, amb, dt); st.N = r.N; t += dt; const T03 = r.gp.T03;
      if (lim.get()) cut = Math.min(1, Math.max(0.25, cut + dt * (T03 > TLIM - 100 ? -6 * (T03 - (TLIM - 100)) / 100 : 1.5)));      // simple limiter: trim fuel above 1100 K
      peak = Math.max(peak, T03); if (r.gp.surge) surge = true; if (t98 == null && st.N > 0.98 * p.Ndesign) t98 = t;
      if (Math.round(t / dt) % 5 === 0) { ts.push(t); Ns.push(st.N); Ts.push(T03 - 273.15); }
    }
    ro.pk.set((peak - 273.15).toFixed(0), peak > TLIM ? 'bad' : 'hot'); ro.t98.set(t98 ? t98.toFixed(1) : '> 12'); ro.sg.set(surge ? 'YES' : 'no', surge ? 'bad' : 'good');
    ro.v.set(surge ? 'SURGE: compressor stalls' : peak > TLIM ? 'OVER-TEMPERATURE: turbine damaged' : 'safe acceleration', surge || peak > TLIM ? 'bad' : 'good');
    p2.set({ ymax: Math.max(1300, Math.ceil((peak - 273.15) / 100 + 0.5) * 100) });
    let c = p1.begin().col; p1.axes(); p1.line(ts, Ns, { color: c.air, width: 3 }); p1.hline(p.Ndesign, { color: c.muted, label: 'full power', align: 'right' });
    c = p2.begin().col; p2.axes(); p2.hband(TLIM - 273.15, 1700, { color: c.bad, alpha: .1, label: 'above the hot-section limit' }); p2.hline(TLIM - 273.15, { color: c.bad, width: 2 }); p2.hline(full.T03 - 273.15, { color: c.muted, label: 'steady full power', align: 'right' });
    p2.line(ts, Ts, { color: peak > TLIM || surge ? c.bad : c.fire, width: 3 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
