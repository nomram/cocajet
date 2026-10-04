// Fans: a compressor that hardly compresses. Fan curve vs system curve, the operating point, stall, and the affinity laws.
import { h, shell, slider, select, button, readout, legend } from '../ui.js';
import { Plot } from '../plot.js';

const RHO = 1.2, P_ATM = 101325, N0 = 1000, D0 = 0.6;
// Dimensionless fan characteristics. z = Q / free-delivery flow; ψ = Δp / (½ρU²); λ = P_shaft / (½ρ A U³); φ = Q / (A U) = φmax·z.
// ψ(z) and λ(z) are fitted polynomials (lowest power first); efficiency is  η = φψ / λ.
const TYPES = {
  axial: { name: 'Axial (propeller, tube-axial)', phimax: 0.55, psi: [0.272237, -0.694641, 1.08112, 14.9392, -49.3459, 52.8233, -19.0768], lam: [0.0888611, 0.140724, -0.136667] },
  fc: { name: 'Centrifugal, forward-curved', phimax: 0.30, psi: [0.939975, -0.415511, -4.62097, 20.4636, -24.3078, 6.06146, 1.87908], lam: [0.0718139, 0.468889, -0.285608] },
  bc: { name: 'Centrifugal, backward-curved', phimax: 0.27, psi: [0.981424, 0.447849, -3.35913, 10.2007, -18.5097, 15.3131, -5.07457], lam: [0.0736215, 0.250405, -0.200564] },
};
const poly = (c, x) => { let r = 0; for (let i = c.length - 1; i >= 0; i--) r = r * x + c[i]; return r; };
const dpoly = (c, x) => { let r = 0; for (let i = c.length - 1; i >= 1; i--) r = r * x + i * c[i]; return r; };
for (const t of Object.values(TYPES)) {
  t.f = (z) => Math.max(0, poly(t.psi, z)); t.df = (z) => dpoly(t.psi, z); t.L = (z) => poly(t.lam, z);
  t.eta = (z) => Math.min(0.95, Math.max(0, t.phimax * z * t.f(z) / t.L(z)));
  let best = 0; for (let z = 0.02; z < 0.99; z += 0.005) if (t.eta(z) > t.eta(best)) best = z;
  t.zb = best; t.Kphi = t.f(best) / (t.phimax * best) ** 2;                              // the "matched" duct runs through the best-efficiency point
  t.zpk = 0; for (let z = 0.995; z > 0; z -= 0.005) if (t.df(z) >= 0) { t.zpk = z; break; }  // right-most pressure peak: left of it is stall
}
const nice = (x) => { const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return e * (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10); };
const fw = (w) => (w >= 1e4 ? (w / 1000).toFixed(1) + ' kW' : w >= 1000 ? (w / 1000).toFixed(2) + ' kW' : w.toFixed(0) + ' W');

export default function init(el) {
  const { body } = shell(el, {
    title: 'Fan curve, system curve and the affinity laws',
    note: 'A fan is a compressor whose pressure ratio is 1.001–1.1, so the air is effectively incompressible and the scaling laws are exact. The <b>fan curve</b> (what the fan can deliver) meets the <b>system curve</b> Δp = K·Q² (what the duct demands) at the <b>operating point</b>. K = 1 is a duct matched to the best-efficiency point; close the damper and K rises. Left of the pressure peak an axial or forward-curved fan <b>stalls</b>: the same blade stall that surges a jet-engine compressor (chapter 7). Air density 1.2 kg/m³; static pressure and static efficiency.',
  });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Fan type', options: Object.entries(TYPES).map(([k, t]) => [k, t.name]), value: 'axial', onChange: upd });
  const sN = slider({ label: 'Speed N', min: 300, max: 1500, step: 10, value: 1000, unit: 'rpm', fmt: (v) => v.toFixed(0), onInput: upd });
  const sD = slider({ label: 'Impeller diameter D', min: 0.3, max: 1.2, step: 0.01, value: 0.6, unit: 'm', fmt: (v) => v.toFixed(2), onInput: upd });
  const sK = slider({ label: 'Damper / duct restriction  K (1 = matched duct)', min: 0.25, max: 6, step: 0.01, value: 1, log: true, fmt: (v) => '×' + v.toFixed(2), onInput: upd });
  const btns = h('div', { class: 'btn-row' },
    button('Cut speed by 20 %', () => { sN.set(Math.max(300, sN.get() * 0.8)); upd(); }, 'small fire'),
    button('Close the damper', () => { sK.set(3); upd(); }, 'small'),
    button('Reset', () => { sel.set('axial'); sN.set(1000); sD.set(0.6); sK.set(1); upd(); }, 'small'));
  const ro = {
    Q: readout('Air flow Q', 'm³/s', 'cool'), dp: readout('Pressure rise Δp', 'Pa', 'hot'), pr: readout('Pressure ratio', 'p₂/p₁', 'good'), m: readout('Mass flow', 'kg/s', 'cool'),
    Pa: readout('Air power Q·Δp', '', 'fuel'), Ps: readout('Shaft power', '', 'hot'), eta: readout('Efficiency', '%', 'good'), ws: readout('Specific speed', 'ω_s', 'cool'),
  };
  const ro2 = { q: readout('Flow vs base', '×', 'cool'), p: readout('Pressure vs base', '×', 'fuel'), w: readout('Shaft power vs base', '×', 'hot'), sv: readout('Power saved', '%', 'good') };
  const info = h('div', { class: 'callout', style: { margin: '10px 0 0', padding: '10px 14px', fontSize: '.86rem' } });
  const lgd = legend([['var(--air)', 'fan curve now'], ['var(--muted)', 'fan at 1000 rpm, 0.60 m (dashed)'], ['var(--fuel)', 'system curve ΔP = KQ²'], ['var(--bad)', 'stall zone']]);
  body.append(
    h('div', { class: 'wgrid' }, h('div', { style: { minWidth: '0' } }, cv, lgd), h('div', { class: 'ctls', style: { minWidth: '0' } }, sel.el, sN.el, sD.el, sK.el, btns)),
    h('div', { class: 'readouts' }, ...Object.values(ro).map((r) => r.el)), info,
    h('div', { class: 'wgrid', style: { marginTop: '14px' } }, cv2, h('div', { style: { minWidth: '0' } }, h('div', { class: 'readouts', style: { marginTop: 0 } }, ...Object.values(ro2).map((r) => r.el)),
      h('p', { style: { fontSize: '.85rem', color: 'var(--muted)', margin: '10px 0 0' } }, '“Base” is the same fan type at 1000 rpm and 0.60 m in a duct matched to it. Affinity laws for the same fan in the same duct:  Q ∝ N,  Δp ∝ N²,  P ∝ N³.  For a geometrically similar fan of diameter D:  Q ∝ N·D³,  Δp ∝ N²·D²,  P ∝ N³·D⁵. Move the sliders and watch the readouts agree with them exactly. The dots on the chart mark your present speed.'))));
  const p1 = new Plot(cv, { xmin: 0, xmax: 5, ymin: 0, ymax: 300, xlabel: 'air flow Q (m³/s)', ylabel: 'static pressure rise Δp (Pa)', aspect: 1.3, minHeight: 300, margin: { l: 56, r: 12, t: 14, b: 42 } });
  const p2 = new Plot(cv2, { xmin: 0.3, xmax: 1.5, ymin: 0, ymax: 3.6, xlabel: 'speed  N / 1000 rpm', ylabel: 'relative to 1000 rpm', aspect: 1.3, minHeight: 280, margin: { l: 50, r: 12, t: 14, b: 42 } });

  let S = null;
  /** everything about the current state, in physical units */
  function solve(type, N, D, Kr) {
    const t = TYPES[type], A = Math.PI * D * D / 4, U = Math.PI * D * N / 60, q = 0.5 * RHO * U * U, Qf = t.phimax * A * U, Kp = Kr * t.Kphi;
    const g = (z) => t.f(z) - Kp * (t.phimax * z) ** 2, roots = [];
    let za = 0.0005, ga = g(za);
    for (let i = 1; i <= 600; i++) {
      const zb = i / 600, gb = g(zb);
      if (ga > 0 && gb <= 0) { let lo = za, hi = zb; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; } roots.push((lo + hi) / 2); }
      za = zb; ga = gb;
    }
    const z = roots.length ? roots[roots.length - 1] : 0.01, phi = t.phimax * z, Q = phi * A * U, dp = t.f(z) * q, Ps = t.L(z) * q * A * U, Pa = Q * dp;
    const Ksys = Kp * q / (A * U) ** 2;          // Pa s² / m⁶
    return { t, A, U, q, Qf, Ksys, z, Q, dp, Ps, Pa, eta: Pa / Ps, roots: roots.map((r) => ({ z: r, Q: t.phimax * r * A * U, dp: t.f(r) * q })), w: 2 * Math.PI * N / 60, stall: z < t.zpk };
  }
  function upd() {
    const type = sel.get(), N = sN.get(), D = sD.get(), Kr = sK.get();
    const s = solve(type, N, D, Kr), b = solve(type, N0, D0, Kr);
    S = { s, b, type, N, D, Kr };
    const pr = 1 + s.dp / P_ATM, ws = s.w * Math.sqrt(s.Q) / Math.pow(s.dp / RHO, 0.75);
    ro.Q.set(s.Q < 10 ? s.Q.toFixed(2) : s.Q.toFixed(1)); ro.dp.set(s.dp.toFixed(0)); ro.pr.set(pr.toFixed(4)); ro.m.set(((RHO * s.Q)).toFixed(2));
    ro.Pa.set(fw(s.Pa)); ro.Ps.set(fw(s.Ps)); ro.eta.set((s.eta * 100).toFixed(0), s.eta < 0.3 ? 'bad' : 'good');
    ro.ws.set(ws.toFixed(2) + (ws > 3.5 ? ' axial' : ws > 1.8 ? ' mixed' : ' radial'));
    const rq = s.Q / b.Q, rp = s.dp / b.dp, rw = s.Ps / b.Ps;
    ro2.q.set(rq.toFixed(2)); ro2.p.set(rp.toFixed(2)); ro2.w.set(rw.toFixed(2)); ro2.sv.set(rw <= 1 ? ((1 - rw) * 100).toFixed(0) : '–', rw <= 1 ? 'good' : 'bad');
    const msg = [];
    if (s.stall) msg.push(`<span class="ct">Stalled: unstable operating point</span>The fan is working left of its pressure peak (flow ${(s.z * 100).toFixed(0)} % of free delivery, stall below ${(s.t.zpk * 100).toFixed(0)} %). Air separates from the blades, pressure and flow pulsate and the fan roars: the stall and surge of chapter 7 in a ventilation duct. Open the damper or pick a backward-curved fan.`);
    else msg.push(`<span class="ct">Stable and healthy</span>The fan runs at ${(s.z * 100).toFixed(0)} % of free-delivery flow with ${(s.eta * 100).toFixed(0)} % efficiency. It lifts the air pressure by only ${(s.dp / P_ATM * 100).toFixed(2)} % (p₂/p₁ = ${pr.toFixed(4)}; the density rises by ${(s.dp / P_ATM / 1.4 * 100).toFixed(2)} %), so air behaves as an incompressible fluid. CJ-1’s compressor has p₂/p₁ = 1.94. ${Math.abs(N - N0) > 1 && Math.abs(D - D0) < 0.005 ? `Speed ×${(N / N0).toFixed(2)}: flow ×${rq.toFixed(2)}, pressure ×${rp.toFixed(2)}, power ×${rw.toFixed(2)}.` : ''}`);
    info.className = 'callout ' + (s.stall ? 'danger' : 'tip'); info.innerHTML = msg.join('');
    draw1(); draw2();
  }
  function draw1() {
    if (!S) return;
    const { s, b } = S, t = s.t;
    const xmax = nice(Math.max(s.Qf, b.Qf) * 1.04), ymax = nice(Math.max(s.q, b.q) * 1.1 * Math.max(...Array.from({ length: 41 }, (_, i) => t.f(i / 40))));
    p1.set({ xmax, ymax }); const col = p1.begin().col; p1.axes();
    const zs = Array.from({ length: 101 }, (_, i) => i / 100), curve = (q) => [zs.map((z) => t.phimax * z * q.A * q.U), zs.map((z) => t.f(z) * q.q)];
    p1.clip(true);
    // stall zone
    p1.band(0, t.zpk * s.Qf, { color: col.bad, alpha: .13 });
    // baseline fan + baseline system
    const [bx, by] = curve(b); p1.line(bx, by, { color: col.muted, width: 2, dash: [6, 5], alpha: .9 });
    const sysQ = Array.from({ length: 81 }, (_, i) => i / 80 * xmax);
    p1.line(sysQ, sysQ.map((Q) => b.Ksys * Q * Q), { color: col.fuel, width: 1.4, dash: [2, 4], alpha: .6 });
    // current system + fan
    p1.line(sysQ, sysQ.map((Q) => s.Ksys * Q * Q), { color: col.fuel, width: 3 });
    const [fx, fy] = curve(s); p1.line(fx, fy, { color: col.air, width: 3.2 });
    p1.clip(false);
    // intersections: unstable ones hollow, the operating point filled
    for (const r of s.roots) if (Math.abs(r.z - s.z) > 1e-6) { p1.dot(r.Q, r.dp, { color: col.bg, r: 5, ring: true }); }
    const apart = Math.hypot(p1.X(b.Q) - p1.X(s.Q), p1.Y(b.dp) - p1.Y(s.dp)) > 14;
    if (apart) { p1.dot(b.Q, b.dp, { color: col.bg, r: 5, ring: true }); p1.arrow(b.Q, b.dp, s.Q, s.dp, { color: col.muted, width: 1.5, head: 7 }); p1.ptext(p1.X(b.Q) + 8, p1.Y(b.dp) + 10, 'base', { color: col.muted, size: 10.5, weight: 600 }); }
    p1.dot(s.Q, s.dp, { color: s.stall ? col.bad : col.fire, r: 6.5 });
    const right = p1.X(s.Q) > p1.m.l + p1.iw * 0.6;
    p1.ptext(p1.X(s.Q) + (right ? -9 : 9), p1.Y(s.dp) + 12, 'operating point', { color: col.strong, align: right ? 'right' : 'left', base: 'top', size: 11.5 });
    if (p1.X(t.zpk * s.Qf) - p1.m.l > 56) p1.ptext(p1.m.l + 6, p1.m.t + 6, 'STALL', { color: col.bad, size: 11, weight: 800 });
    else p1.ptext(p1.m.l + 3, p1.m.t + 6, 'stall', { color: col.bad, size: 10, weight: 800 });
    p1.ptext(p1.m.l + p1.iw - 6, p1.m.t + 6, fw(s.Ps) + ' shaft', { color: col.hot || col.fire, align: 'right', size: 11, weight: 700 });
  }
  function draw2() {
    if (!S) return;
    const sn = S.N / N0, col = p2.begin().col; p2.axes();
    p2.hline(1, { color: col.muted, alpha: .6, width: 1 }); p2.vline(1, { color: col.muted, alpha: .6, width: 1 });
    const laws = [[1, col.air, 'flow Q ∝ N'], [2, col.fuel, 'pressure Δp ∝ N²'], [3, col.fire, 'power P ∝ N³']];
    for (const [k, c, lab] of laws) {
      p2.fn((x) => Math.pow(x, k), 0.3, 1.5, { color: c, width: 2.8 });
      p2.ptext(p2.X(1.5) - 6, p2.Y(Math.pow(1.5, k)) + (k === 1 ? 14 : -4), lab, { color: c, align: 'right', base: k === 1 ? 'top' : 'bottom', size: 11, weight: 700 });
    }
    p2.vline(sn, { color: col.strong, alpha: .55, dash: [3, 4], width: 1.3 });
    for (const [k, c] of laws) p2.dot(sn, Math.pow(sn, k), { color: c, r: 5 });
    p2.ptext(p2.m.l + 8, p2.m.t + 6, `at ${S.N.toFixed(0)} rpm  (× ${sn.toFixed(2)})`, { color: col.strong, size: 11, weight: 700 });
    laws.forEach(([k, c, lab], i) => p2.ptext(p2.m.l + 8, p2.m.t + 24 + i * 16, `${['flow', 'pressure', 'power'][i]} × ${Math.pow(sn, k).toFixed(2)}`, { color: c, size: 12, weight: 800 }));
  }
  p1.onDraw(draw1); p2.onDraw(draw2);
  upd();
}
