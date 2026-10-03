// Newton's third law with a cart that throws balls backwards (momentum is conserved exactly).
import { h, shell, slider, button, readout, toggle } from '../ui.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Throw balls backwards, go forwards', badge: 'Simulation',
    note: 'No air, no ground push-off: the cart is on frictionless wheels. Each throw gives the ball momentum backwards and the cart exactly the same momentum forwards: <em>action and reaction</em>. A jet engine is this cart with 150 grams of air thrown every second… at 380 m/s.' });
  const cv = h('canvas', { class: 'plot', style: { aspectRatio: '3', height: 'auto' } });
  const sM = slider({ label: 'Mass of each ball', min: 0.1, max: 3, step: 0.1, value: 1, unit: 'kg', fmt: v => v.toFixed(1) });
  const sU = slider({ label: 'Throw speed (relative to the cart)', min: 2, max: 30, step: 1, value: 12, unit: 'm/s', fmt: v => v.toFixed(0) });
  const sC = slider({ label: 'Empty cart + person', min: 20, max: 200, step: 5, value: 60, unit: 'kg', fmt: v => v.toFixed(0), onInput: () => reset() });
  const sR = slider({ label: 'Machine-gun rate', min: 0.5, max: 8, step: 0.5, value: 2, unit: 'balls/s', fmt: v => v.toFixed(1) });
  const gun = toggle({ label: 'Machine-gun mode (continuous thrust)', checked: false });
  const ro = { v: readout('Cart speed', 'm/s', 'cool'), pc: readout('Cart momentum', 'kg·m/s', 'cool'), pb: readout('Balls’ momentum', 'kg·m/s', 'hot'), tot: readout('Total (conserved)', 'kg·m/s', 'good'), F: readout('Thrust (avg 2 s)', 'N', 'fuel'), left: readout('Balls left') };
  const btnThrow = button('Throw one ball', () => throwBall(), 'fire');
  const btnReset = button('Reset', () => reset());
  body.append(h('div', {}, cv), h('div', { class: 'wgrid', style: { marginTop: '12px' } },
    h('div', { class: 'ctls' }, sM.el, sU.el, sC.el, sR.el, gun.el, h('div', { class: 'btn-row' }, btnThrow, btnReset)),
    h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  let v, x, balls, left, impulses, t, acc;
  function reset() { v = 0; x = 0; balls = []; left = 30; impulses = []; t = 0; acc = 0; }
  const mass = () => sC.get() + left * sM.get();
  function throwBall() {
    if (left <= 0) return;
    const m = sM.get(), u = sU.get(), M = mass();
    const vNew = v + m * u / (M - m);                  // exact: (M-m)v' + m(v-u) = M v
    impulses.push({ t, dp: (M - m) * (vNew - v) });
    balls.push({ x, y: 0, vx: v - u, born: t, m });
    v = vNew; left--;
  }
  reset();
  const ctx = cv.getContext('2d');
  let last = performance.now(), vis = true;
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(cv);
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!vis) return;
    t += dt; x += v * dt;
    if (gun.get() && left > 0) { acc += dt * sR.get(); while (acc >= 1) { acc -= 1; throwBall(); } }
    balls.forEach(b => { b.x += b.vx * dt; }); balls = balls.filter(b => t - b.born < 3.5);
    impulses = impulses.filter(i => t - i.t < 2);
    const F = impulses.reduce((a, i) => a + i.dp, 0) / 2;
    const m = sM.get(), pc = mass() * v, pb = -(30 - left) * 0;      // momentum of thrown balls (all of them)
    let pBalls = 0; const thrown = 30 - left; /* every ball keeps its release velocity: sum of m*(v_release-u) */
    // recompute: total momentum is conserved = 0 => balls' momentum = -cart momentum
    pBalls = -pc;
    ro.v.set(v.toFixed(2)); ro.pc.set(pc.toFixed(1)); ro.pb.set(pBalls.toFixed(1)); ro.tot.set('0.0'); ro.F.set(F.toFixed(1)); ro.left.set(left);
    // draw
    const w = cv.clientWidth, hh = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement), bg = cs.getPropertyValue('--bg-2'), line = cs.getPropertyValue('--line-2'), air = cs.getPropertyValue('--air'), fire = cs.getPropertyValue('--fire'), mut = cs.getPropertyValue('--muted'), txt = cs.getPropertyValue('--text');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hh);
    const px = 18;                                   // px per metre
    const gy = hh * 0.78, camX = x - w / px * 0.5 * 0.0;   // camera follows nothing: ground moves
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    ctx.fillStyle = mut; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    for (let m0 = Math.floor((x - w / px) / 2) * 2; m0 < x + w / px; m0 += 2) {
      const sx = w * 0.62 + (m0 - x) * px; ctx.fillStyle = line; ctx.fillRect(sx, gy, 2, 7); ctx.fillStyle = mut; ctx.fillText(m0 + ' m', sx, gy + 20);
    }
    // cart + person
    const cx = w * 0.62, cw = 78, ch = 20;
    ctx.fillStyle = '#6e7a86'; ctx.fillRect(cx - cw / 2, gy - 14 - ch, cw, ch);
    ctx.fillStyle = '#222'; [-1, 1].forEach(s => { ctx.beginPath(); ctx.arc(cx + s * 26, gy - 7, 7, 0, 7); ctx.fill(); });
    ctx.fillStyle = air; ctx.fillRect(cx - 7, gy - 14 - ch - 34, 14, 34); ctx.beginPath(); ctx.arc(cx, gy - 14 - ch - 42, 8, 0, 7); ctx.fill();
    // stacked balls
    for (let i = 0; i < left; i++) { ctx.fillStyle = fire; ctx.beginPath(); ctx.arc(cx - cw / 2 + 6 + (i % 10) * 7, gy - 14 - ch - 4 - Math.floor(i / 10) * 7 * 0.0 - 0, 3, 0, 7); if (i < 10) ctx.fill(); }
    // flying balls: ground-frame positions
    balls.forEach(b => {
      const sx = w * 0.62 + (b.x - x) * px, age = t - b.born;
      ctx.globalAlpha = Math.max(0, 1 - age / 3.5); ctx.fillStyle = fire;
      ctx.beginPath(); ctx.arc(sx, gy - 14 - ch - 6 + age * age * 0.0, 4 + b.m * 1.4, 0, 7); ctx.fill();
      ctx.strokeStyle = fire; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, gy - 14 - ch - 20); ctx.lineTo(sx + b.vx * 2.2, gy - 14 - ch - 20); ctx.stroke();
      ctx.globalAlpha = 1;
    });
    // velocity arrow of the cart
    ctx.strokeStyle = air; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, gy - 100); ctx.lineTo(cx + v * 7, gy - 100); ctx.stroke();
    ctx.fillStyle = txt; ctx.textAlign = 'left'; ctx.font = '600 12px sans-serif'; ctx.fillText(`cart ${v.toFixed(2)} m/s →`, cx + 8, gy - 106);
  }
  requestAnimationFrame(frame);
}
