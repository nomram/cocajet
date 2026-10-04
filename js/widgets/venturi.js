// The venturi: squeeze a flow through a throat and the pressure falls; for gas, the flow chokes at Mach 1 and the "nozzle" takes over.
import { h, shell, slider, select, toggle, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { areaMach, machFromArea, pRatio, normalShock } from '../rocket-model.js';

const G = 1.4;
export default function init(el) {
  const { body } = shell(el, { title: 'The venturi: why a throat sets the flow', note: 'Fluid cannot pile up: what enters must leave (continuity, ρ·A·v = const). In the narrow throat it must go faster, and faster fluid has lower pressure (Bernoulli). That is how a carburettor sucks in fuel and how a flow meter works. For a <i>gas</i> there is a limit: the throat speed cannot pass the speed of sound. Lower the back-pressure further and the flow through the throat <b>stops changing</b>: the nozzle is choked. Then everything downstream of the throat is free to do things the upstream cannot feel, and that is the rocket nozzle (previous widget).' });
  const cv = h('canvas', { class: 'plot' }), cv2 = h('canvas', { class: 'plot' });
  const sB = slider({ label: 'Back-pressure ÷ supply pressure', min: 0.02, max: 1, step: 0.005, value: 0.8, fmt: v => v.toFixed(3), onInput: upd });
  const sAr = slider({ label: 'Exit area ÷ throat area', min: 1.2, max: 6, step: 0.05, value: 2.4, fmt: v => v.toFixed(2), onInput: upd });
  const ro = { st: readout('Flow state', ''), mt: readout('Mach number at the throat', '', 'cool'), me: readout('Mach number at the exit', '', 'hot'), m: readout('Mass flow vs maximum', '%', 'good') };
  body.append(h('div', { class: 'wgrid even' }, cv, cv2), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sB.el, sAr.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p1 = new Plot(cv, { xmin: -1, xmax: 2, ymin: 0, ymax: 3.4, aspect: 1.55, xlabel: 'position along the duct (throat = 0)', ylabel: '', title: 'Mach number (red) and pressure p/p₀ (blue) along the duct', margin: { l: 44, r: 12, t: 28, b: 40 } });
  const p2 = new Plot(cv2, { xmin: 0, xmax: 1, ymin: 0, ymax: 1.1, aspect: 1.55, xlabel: 'back-pressure ÷ supply pressure', ylabel: 'mass flow ÷ choked flow', title: 'Lower the back-pressure: the flow rises, then stops', margin: { l: 50, r: 12, t: 28, b: 40 } });
  const area = (x, Ae) => x < 0 ? 1 + 2.2 * x * x : 1 + (Ae - 1) * Math.pow(x / 2, 0.8);
  function solve(pb, Ae) {
    const pcrSub = pRatio(machFromArea(Ae, G, false), G), pDes = pRatio(machFromArea(Ae, G, true), G);
    if (pb >= pcrSub) {                                          // subsonic all the way: exit pressure = back-pressure
      const Me = Math.sqrt(2 / (G - 1) * (Math.pow(1 / pb, (G - 1) / G) - 1)), Astar = Math.min(1, Ae / areaMach(Me, G));           // Astar = the flow's own sonic area, relative to the real throat area (1)
      return { state: pb > 0.995 ? 'no flow' : 'subsonic', Astar, mflow: Astar, kind: 'sub' };
    }
    if (pb >= pDes * 1.0000 && pb < pcrSub) {                    // choked, with a normal shock in the diverging part, or at the exit
      let lo = 1.0001, hi = Ae, res = null;
      for (let i = 0; i < 70; i++) {
        const As = 0.5 * (lo + hi), M1 = machFromArea(As, G, true), sh = normalShock(M1, G), Astar2 = As / areaMach(sh.M2, G), Me = machFromArea(Ae / Astar2, G, false), pe = sh.p02p01 * pRatio(Me, G);
        res = { As, M1, sh, Me, pe }; if (pe > pb) lo = As; else hi = As;                         // shock further downstream -> lower exit pressure... (monotone)
      }
      return { state: 'choked, shock in the nozzle', Astar: 1, mflow: 1, kind: 'shock', shockA: res.As, xs: 2 * Math.pow((res.As - 1) / (Ae - 1), 1 / 0.8), M1: res.M1, sh: res.sh };
    }
    return { state: pb > pDes * 0.97 ? 'choked, matched (design)' : 'choked, under-expanded', Astar: 1, mflow: 1, kind: 'sup' };
  }
  function upd() {
    const pb = sB.get(), Ae = sAr.get(), S = solve(pb, Ae), c1 = p1.begin().col; p1.axes();
    const xs = [], M = [], P = [];
    for (let x = -1; x <= 2.0001; x += 0.02) {
      const A = area(x, Ae); let m, pp;
      if (S.kind === 'sub') { m = machFromArea(Math.max(1.00001, A / S.Astar), G, false); if (A / S.Astar < 1.0001) m = 1; pp = pRatio(m, G); }
      else if (S.kind === 'sup' || (S.kind === 'shock' && x < S.xs)) { m = x < 0 ? machFromArea(Math.max(1.00001, A), G, false) : machFromArea(Math.max(1.00001, A), G, true); if (x === 0) m = 1; pp = pRatio(m, G); }
      else { const M1 = S.M1, Astar2 = S.shockA / areaMach(S.sh.M2, G); m = machFromArea(Math.max(1.00001, A / Astar2), G, false); pp = S.sh.p02p01 * pRatio(m, G); }
      xs.push(x); M.push(m); P.push(pp);
    }
    p1.set({ ymax: Math.max(2.2, Math.ceil(Math.max(...M) + 0.4)) });
    const top = p1.o.ymax, ctx = p1.ctx;
    ctx.save(); ctx.fillStyle = c1.metal || c1.muted; ctx.globalAlpha = .22; ctx.beginPath();
    xs.forEach((x, i) => { const X = p1.X(x), Y = p1.Y(top * 0.9 - Math.sqrt(area(x, Ae)) * top * 0.06); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(p1.X(xs[i]), p1.Y(top * 0.9 + Math.sqrt(area(xs[i], Ae)) * top * 0.06)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = c1.muted; ctx.stroke(); ctx.restore();
    p1.hline(1, { color: c1.muted, dash: [2, 4], label: 'Mach 1', align: 'right' });
    p1.line(xs, M, { color: c1.fire, width: 3.2 }); p1.line(xs, P.map(v => v * (top * 0.5)), { color: c1.air, width: 2.6 }); p1.vline(0, { color: c1.muted, alpha: .6, label: 'throat' });
    if (S.kind === 'shock') p1.vline(S.xs, { color: c1.bad, label: 'shock' });
    p1.text(1.98, top * 0.5 * P[P.length - 1] + top * 0.07, 'p/p₀', { color: c1.air, align: 'right', size: 11, weight: 700 });
    // right plot: mass flow vs back-pressure
    const c2 = p2.begin().col; p2.axes();
    const bx = [], by = []; for (let b = 0.02; b <= 1.0001; b += 0.01) { const s = solve(Math.min(b, 0.9999), Ae); bx.push(b); by.push(s.mflow * (s.kind === 'sub' ? 1 : 1)); }
    const mmax = Math.max(...by); p2.line(bx, by.map(v => v / mmax), { color: c2.fire, width: 3.2 }); p2.vline(pRatio(machFromArea(Ae, G, false), G), { color: c2.muted, dash: [3, 4] });
    const pc = pRatio(1, G); p2.vline(pc, { color: c2.ok, alpha: .6, label: pc.toFixed(3) + ' (converging-only nozzle)' }); p2.text(0.955, 0.2, 'subsonic duct ↑', { color: c2.muted, size: 11, align: 'right' }); p2.dot(pb, S.mflow / mmax, { color: c2.fire, r: 6.5 });
    p2.text(0.02, 0.5, 'choked: the flow no longer', { color: c2.muted, size: 11 }); p2.text(0.02, 0.43, 'depends on the back-pressure', { color: c2.muted, size: 11 });
    // readouts
    const mt = S.kind === 'sub' ? machFromArea(Math.max(1.00001, 1 / S.Astar), G, false) : 1, me = M[M.length - 1];
    ro.st.set(S.state, S.kind === 'sup' ? 'good' : S.kind === 'shock' ? 'bad' : 'cool'); ro.mt.set(S.kind === 'sub' ? (1 / S.Astar < 1.0001 ? '1.00' : mt.toFixed(2)) : '1.00'); ro.me.set(me.toFixed(2)); ro.m.set((S.mflow / mmax * 100).toFixed(0));
  }
  p1.onDraw(upd); p2.onDraw(upd); upd();
}
