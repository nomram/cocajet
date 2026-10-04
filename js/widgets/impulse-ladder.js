// The motor-class ladder (A to O): each letter doubles the total impulse. Pick a class and see what it means: club level, legal category, and what a sensibly built rocket does with it.
import { h, shell, slider, select, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { G0, motorClass, flyVertical } from '../rocket-model.js';

const L = 'ABCDEFGHIJKLMNO'.split(''), EDGE = i => 1.25 * Math.pow(2, i);                 // class i spans (EDGE(i), EDGE(i+1)]: A = 1.25-2.5 N s
const CAT = i => i <= 6 ? 'model' : i <= 8 ? 'L1' : i <= 11 ? 'L2' : 'L3';
const LEVEL = { model: 'no certification (model rocketry)', L1: 'Level 1 certification', L2: 'Level 2 certification', L3: 'Level 3 certification' };
const MOTORS = { bp: ['black-powder-type motor (Isp ≈ 85 s)', 85], comp: ['composite motor (Isp ≈ 200 s)', 200] };
const COLS = { model: 'air', L1: 'fuel', L2: 'fire', L3: 'violet' };

export default function init(el) {
  const { body } = shell(el, { title: 'The motor-class ladder: each letter doubles the impulse', note: 'A motor’s <b>class letter</b> is its total impulse I = ∫F dt in newton-seconds, and every letter allows twice the impulse of the one before. Hobby clubs hang their certification levels on the letters, and laws hang their categories on them. Move the slider to climb the ladder; the widget sizes a typical rocket for the motor (you can change it) and flies it straight up with drag and gravity. Clubs publish launch-site distances for each class; this is a teaching estimate, not a flight-safety tool.' });
  const cvL = h('canvas', { class: 'plot' }), cvF = h('canvas', { class: 'plot' });
  const sI = slider({ label: 'Total impulse of the motor', min: 1.3, max: 40960, step: 1, value: 8, unit: 'N·s', log: true, fmt: v => v < 100 ? v.toFixed(1) : v.toFixed(0), onInput: v => { autoSize(); upd(); } });
  const mt = select({ label: 'Motor type', options: Object.entries(MOTORS).map(([k, v]) => [k, v[0]]), value: 'bp', onChange: () => { autoSize(); upd(); } });
  const sB = slider({ label: 'Burn time', min: 0.2, max: 20, step: 0.1, value: 1.7, unit: 's', fmt: v => v.toFixed(1), onInput: upd });
  const sM = slider({ label: 'Rocket mass at lift-off (with motor)', min: 0.02, max: 300, step: 0.01, value: 0.05, unit: '', log: true, fmt: v => v < 1 ? (v * 1000).toFixed(0) + ' g' : v.toFixed(1) + ' kg', onInput: upd });
  const sD = slider({ label: 'Body diameter', min: 10, max: 300, step: 1, value: 24, unit: 'mm', fmt: v => v.toFixed(0), onInput: upd });
  const sC = slider({ label: 'Drag coefficient (fins, lug, rough finish)', min: 0.3, max: 1.0, step: 0.01, value: 0.75, fmt: v => v.toFixed(2), onInput: upd });
  const auto = button('Re-size the rocket for this motor', () => { autoSize(); upd(); }, 'small');
  const ro = { cls: readout('Motor designation', '', 'hot'), lv: readout('Club level', '', 'cool'), us: readout('US legal category', '', 'fuel'), tw: readout('Thrust ÷ weight', '', 'cool'), vr: readout('Speed leaving a 1.2 m rod', 'm/s', 'cool'), ap: readout('Apogee', 'm', 'good'), vm: readout('Fastest speed', 'm/s', 'cool'), st: readout('Check', '', 'good') };
  body.append(cvL, h('div', { class: 'wgrid even', style: { marginTop: '10px' } }, cvF, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))), h('div', { class: 'ctls', style: { marginTop: '12px' } }, sI.el, mt.el, sB.el, sM.el, sD.el, sC.el, h('div', { class: 'btn-row' }, auto)));
  const pL = new Plot(cvL, { xmin: 1, xmax: 50000, xlog: true, ymin: 0, ymax: 1, aspect: 4.6, minHeight: 130, margin: { l: 8, r: 8, t: 14, b: 26 }, grid: false, xlabel: 'total impulse (N·s)', xtickFmt: v => v >= 1000 ? (v / 1000) + 'k' : String(v) });
  const pF = new Plot(cvF, { xmin: 0, xmax: 10, ymin: 0, ymax: 500, aspect: 1.5, xlabel: 'time (s)', ylabel: 'altitude (m)', title: 'Straight-up flight (no wind)', margin: { l: 56, r: 12, t: 28, b: 40 } });
  let res = null;
  const isp = () => MOTORS[mt.get()][1];
  function autoSize() {
    const I = sI.get(), burn = Math.min(20, Math.max(0.3, 0.9 * Math.pow(I, 0.28))), F = I / burn, mp = I / (isp() * G0);
    const m = Math.max(mp * 2.2 + 0.012, F / ((I < 160 ? 10 : 7) * G0));       // roughly 10:1 (small) or 7:1 (large) thrust-to-weight, never lighter than the propellant allows
    sB.set(Math.round(burn * 10) / 10); sM.set(m); sD.set(Math.round(Math.min(300, Math.max(12, 24 * Math.pow(m / 0.05, 0.33)))));
  }
  function upd() {
    const I = sI.get(), tb = sB.get(), m0 = sM.get(), F = I / tb, mp = I / (isp() * G0), D = sD.get() / 1000, idx = Math.max(0, Math.min(14, L.indexOf(motorClass(I)) >= 0 ? L.indexOf(motorClass(I)) : (I > 40960 ? 14 : 0)));
    const cls = motorClass(I), cat = I < 1.25 ? 'model' : CAT(idx);
    const r = res = flyVertical({ m0, mp: Math.min(mp, m0 * 0.9), F, tb, D, Cd: sC.get() });
    const model = I <= 160 && mp <= 0.125 && m0 <= 1.5;
    ro.cls.set(cls + Math.round(F)); ro.lv.set(I > 40960 ? 'beyond the club ladder' : LEVEL[cat].replace(' certification', '').replace('no ', 'none: ')); ro.us.set(I > 40960 ? 'Class 3 (waiver)' : model ? 'Class 1: model rocket' : 'Class 2: high-power');
    ro.tw.set(r.tw.toFixed(1), r.tw < 5 ? 'bad' : 'cool'); ro.vr.set(r.lift ? r.vRod.toFixed(0) : '–', r.vRod < 15 ? 'bad' : 'cool'); ro.ap.set(r.lift ? r.apogee.toFixed(0) : '0'); ro.vm.set(r.vmax.toFixed(0));
    const chk = !r.lift ? ['too heavy to lift off', 'bad'] : mp > 0.9 * m0 ? ['motor heavier than the rocket', 'bad'] : r.tw < 5 ? ['thrust-to-weight under the usual 5:1 guideline', 'bad'] : r.vRod < 15 ? ['too slow leaving the rod: fins cannot steer yet', 'bad'] : ['inside the usual guidelines', 'good'];
    ro.st.set(chk[0], chk[1]);
    let c = pL.begin().col, ctx = pL.ctx; const y0 = pL.Y(1) + 2, hgt = pL.ih * 0.62;
    for (let i = 0; i < 15; i++) {
      const lo = Math.max(1.25 * Math.pow(2, i), 1), hi = EDGE(i + 1), x0 = pL.X(lo), x1 = pL.X(hi), col = c[COLS[CAT(i)]];
      ctx.fillStyle = col; ctx.globalAlpha = i === idx && I >= 1.25 ? .95 : .45; ctx.fillRect(x0 + 1, pL.m.t, x1 - x0 - 2, hgt); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff'; ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(L[i], (x0 + x1) / 2, pL.m.t + hgt / 2);
    }
    pL.axes();
    const bands = [['model rockets', 1.25, 160, 'air'], ['Level 1', 160, 640, 'fuel'], ['Level 2', 640, 5120, 'fire'], ['Level 3', 5120, 40960, 'violet']];
    for (const [n, a, b, k] of bands) { const xa = pL.X(a) + 2, xb = pL.X(b) - 2, yy = pL.m.t + hgt + 7; ctx.strokeStyle = c[k]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xb, yy); ctx.stroke(); ctx.fillStyle = c.text; ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(n, (xa + xb) / 2, yy + 3); }
    ctx.fillStyle = c.strong; ctx.beginPath(); const xm = pL.X(Math.min(Math.max(I, 1.25), 49000)); ctx.moveTo(xm, pL.m.t - 1); ctx.lineTo(xm - 6, pL.m.t - 8); ctx.lineTo(xm + 6, pL.m.t - 8); ctx.closePath(); ctx.fill();
    c = pF.set({ xmax: Math.max(2, Math.ceil(r.tApogee * 1.05)), ymax: Math.max(20, Math.ceil(r.apogee * 1.15 / 10) * 10) }).begin().col; pF.axes();
    pF.area(r.t, r.t.map(() => 0), r.h, { color: c.air, alpha: .12 }); pF.line(r.t, r.h, { color: c.air, width: 3 }); pF.vline(tb, { color: c.fire, label: 'burn-out' }); if (r.lift) pF.dot(r.tApogee, r.apogee, { color: c.fire, r: 7 });
  }
  pL.onDraw(upd); pF.onDraw(upd); autoSize(); upd();
}
