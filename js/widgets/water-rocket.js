// A water rocket: the safest real rocket there is. Thrust = 2 Cd A (P - Pa) while the water leaves, then a puff of compressed air.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { G0, motorClass } from '../rocket-model.js';

const PA = 101325, RHO_W = 1000, RHO_A = 1.2, GAM = 1.4, R_AIR = 287;

export function flyWaterRocket({ Vb, fill, Pg, dn, mDry, Db, Cd = 0.45 }, record = false) {
  const Vt = Vb / 1000, An = Math.PI / 4 * (dn / 1000) ** 2, Ab = Math.PI / 4 * (Db / 1000) ** 2, Va0 = Vt * (1 - fill), Pa0 = PA + Pg * 1e5, T0 = 293;
  let Vw = Vt * fill, Va = Va0, v = 0, hgt = 0, t = 0, imp = 0, vmax = 0, tb = null, Tmax = 0, hmax = 0;
  const dt = 0.0004, tr = [];
  let phase = 'water', mAir = Pa0 * Va0 / (R_AIR * T0), Pend = 0, mEnd = 1;
  while (t < 30) {
    const P = phase === 'water' ? Pa0 * Math.pow(Va0 / Va, GAM) : Math.max(PA, Pend * Math.pow(mAir / mEnd, GAM));
    let thrust = 0, dm = 0;
    if (phase === 'water' && P > PA) {
      const vw = Math.sqrt(2 * (P - PA) / RHO_W), dV = 0.95 * An * vw * dt; thrust = RHO_W * 0.95 * An * vw * vw;
      Vw -= dV; Va += dV; dm = RHO_W * dV; if (Vw <= 0) { phase = 'air'; Va = Vt; Pend = Pa0 * Math.pow(Va0 / Vt, GAM); mEnd = mAir; }
    } else if (phase === 'air' && P > PA * 1.001) {
      const Tair = T0 * Math.pow(P / Pa0, (GAM - 1) / GAM), choked = P / PA > 1.893;
      let md, ve, pe = PA;
      if (choked) { md = 0.9 * An * P * Math.sqrt(GAM / (R_AIR * Tair)) * Math.pow(2 / (GAM + 1), (GAM + 1) / (2 * (GAM - 1))); ve = Math.sqrt(GAM * R_AIR * Tair * 2 / (GAM + 1)); pe = P * 0.528; }
      else { const rho = P / (R_AIR * Tair); ve = Math.sqrt(2 * (P - PA) / rho); md = 0.9 * An * rho * ve; }
      thrust = md * ve + (pe - PA) * An; mAir = Math.max(0, mAir - md * dt); dm = 0;                      // the air's own mass is negligible next to the bottle
    } else if (phase !== 'coast') { phase = 'coast'; tb = t; }
    const m = mDry + RHO_W * Math.max(Vw, 0) + 0.0005;
    const drag = 0.5 * RHO_A * v * Math.abs(v) * Cd * Ab, acc = (thrust - drag) / m - G0;
    if (hgt <= 0 && acc < 0 && v <= 0) { thrust = Math.min(thrust, m * G0); } else { v += acc * dt; hgt += v * dt; }
    if (hgt < 0) { hgt = 0; v = Math.max(v, 0); }
    imp += thrust * dt; Tmax = Math.max(Tmax, thrust); vmax = Math.max(vmax, v); hmax = Math.max(hmax, hgt);
    if (record && (tr.length === 0 || t - tr[tr.length - 1][0] >= 0.004)) tr.push([t, thrust, hgt, v]);
    t += dt;
    if (phase === 'coast' && v <= 0) break;
  }
  const mWater = RHO_W * Vt * fill;
  return { apogee: hmax, vmax, burn: tb ?? t, Tmax, imp, isp: mWater > 0 ? imp / (mWater * G0) : 0, tr };
}

export default function init(el) {
  const { body } = shell(el, { title: 'Water rocket: thrust, burn and apogee', note: 'A PET soda bottle partly filled with water, pumped to a few bar and released. The water leaves at v = √(2ΔP/ρ) (Bernoulli), so the thrust is F = ṁ·v = 2·C<sub>d</sub>·A<sub>n</sub>·(P − P<sub>a</sub>): it depends on the pressure and the <i>nozzle area</i>, not on the water. As the water goes the air expands and the pressure falls. The best height is reached with about a third of the bottle full: too little water and there is nothing to throw; too much and the bottle is too heavy. (A water rocket has an Isp of only 3–10 s: a chemical rocket is 50× better, a jet engine 600× better.)' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sV = slider({ label: 'Bottle volume', min: 0.5, max: 3, step: 0.1, value: 2, unit: 'L', fmt: v => v.toFixed(1), onInput: upd });
  const sF = slider({ label: 'Water fill', min: 0.05, max: 0.9, step: 0.01, value: 0.33, fmt: v => Math.round(v * 100) + ' %', onInput: upd });
  const sP = slider({ label: 'Pump pressure (gauge)', min: 1, max: 9, step: 0.1, value: 6, unit: 'bar', fmt: v => v.toFixed(1), onInput: upd });
  const sN = slider({ label: 'Nozzle diameter', min: 5, max: 24, step: 0.5, value: 9, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sM = slider({ label: 'Empty mass (bottle + fins + nose)', min: 40, max: 400, step: 5, value: 110, unit: 'g', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { ap: readout('Apogee', 'm', 'hot'), vm: readout('Fastest speed', 'm/s', 'cool'), tb: readout('Thrust lasts', 's', 'fuel'), T: readout('Peak thrust', 'N', 'hot'), I: readout('Total impulse', 'N·s', 'cool'), isp: readout('Isp (water only)', 's', 'good'), w: readout('Safety', '', '') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sV.el, sF.el, sP.el, sN.el, sM.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: 0, xmax: 0.4, ymin: 0, ymax: 100, aspect: 1.5, xlabel: 'time after release (s)', ylabel: 'thrust (N)', title: 'Thrust curve', margin: { l: 50, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 0.9, ymin: 0, ymax: 100, aspect: 1.5, xlabel: 'water fill (fraction of the bottle)', ylabel: 'apogee (m)', title: 'How much water is best?', margin: { l: 50, r: 12, t: 28, b: 40 }, xtickFmt: v => Math.round(v * 100) + '%' });
  function upd() {
    const prm = { Vb: sV.get(), fill: sF.get(), Pg: sP.get(), dn: sN.get(), mDry: sM.get() / 1000, Db: 88 }, r = flyWaterRocket(prm, true);
    ro.ap.set(r.apogee.toFixed(0)); ro.vm.set(r.vmax.toFixed(0)); ro.tb.set(r.burn.toFixed(2)); ro.T.set(r.Tmax.toFixed(0)); ro.I.set(r.imp.toFixed(1)); ro.isp.set(r.isp.toFixed(1));
    ro.w.set(prm.Pg > 7 ? 'too high for a PET bottle' : 'within 7 bar', prm.Pg > 7 ? 'bad' : 'good');
    let c = p1.begin().col; p1.set({ xmax: Math.max(0.12, Math.ceil((r.burn + 0.05) * 20) / 20), ymax: Math.max(20, Math.ceil(r.Tmax * 1.1 / 10) * 10) }); p1.axes();
    const tr = r.tr.filter(q => q[0] <= p1.o.xmax); p1.area(tr.map(q => q[0]), tr.map(() => 0), tr.map(q => q[1]), { color: c.fire, alpha: .18 }); p1.line(tr.map(q => q[0]), tr.map(q => q[1]), { color: c.fire, width: 3 });
    p1.vline(r.burn, { color: c.air, label: 'burn-out' });
    c = p2.begin().col;
    const xs = [], ys = []; for (let f = 0.05; f <= 0.9; f += 0.025) { xs.push(f); ys.push(flyWaterRocket({ ...prm, fill: f }).apogee); }
    p2.set({ ymax: Math.max(20, Math.ceil(Math.max(...ys) * 1.1 / 10) * 10) }); p2.axes(); p2.line(xs, ys, { color: c.air, width: 3 }); p2.vline(prm.fill, { color: c.muted }); p2.dot(prm.fill, r.apogee, { color: c.fire, r: 7 });
    const k = ys.indexOf(Math.max(...ys)); p2.text(xs[k], ys[k] + p2.o.ymax * 0.06, 'best ≈ ' + Math.round(xs[k] * 100) + ' %', { color: c.ok, align: 'center', weight: 800 });
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
