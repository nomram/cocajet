// A solid-motor design bench: choose the grain shape, throat and burn-rate numbers, watch the grain regress and read off thrust, pressure and motor class.
import { h, shell, slider, select, toggle, button, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { GRAINS, FAMILIES, fireMotor, throatForPeakKn } from '../solid-model.js';

const mm = v => v / 1000;
export default function init(el) {
  const { body } = shell(el, { title: 'Solid motor bench: grain shape → burning area → pressure → thrust', note: 'A solid motor is a pressure vessel full of a propellant that burns only on its exposed surface. <b>Burning area</b> A<sub>b</sub> sets how fast gas is made; the <b>throat</b> A<sub>t</sub> sets how fast it leaves; the chamber pressure settles where the two match: P<sub>c</sub> = (ρ c* a K<sub>n</sub>)<sup>1/(1−n)</sup> with K<sub>n</sub> = A<sub>b</sub>/A<sub>t</sub>. Choose a grain shape and watch its burning surface change as it burns: a growing hole makes <i>progressive</i> thrust, a shrinking surface <i>regressive</i>, and clever shapes stay <i>neutral</i>. Propellant numbers here are generic textbook orders of magnitude; the widget gives no recipe and no way to make anything.' });
  const cvM = h('canvas', { class: 'plot' }), cvF = h('canvas', { class: 'plot' }), cvP = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Grain shape', options: Object.entries(GRAINS).map(([k, g]) => [k, g.name]), value: 'bates', onChange: () => { autoSize(); upd(); } });
  const fam = select({ label: 'Propellant family (generic numbers)', options: Object.entries(FAMILIES).map(([k, f]) => [k, f.n]), value: 'medium', onChange: v => { const f = FAMILIES[v]; sA.set(f.a); sN.set(f.nexp); upd(); } });
  const sD = slider({ label: 'Grain diameter', min: 20, max: 60, step: 1, value: 29, unit: 'mm', fmt: v => v.toFixed(0), onInput: () => { autoSize(); upd(); } });
  const sd = slider({ label: 'Core (hole) diameter', min: 4, max: 30, step: 0.5, value: 9, unit: 'mm', fmt: v => v.toFixed(1), onInput: () => { autoSize(); upd(); } });
  const sL = slider({ label: 'Grain length (total)', min: 50, max: 300, step: 5, value: 100, unit: 'mm', fmt: v => v.toFixed(0), onInput: () => { autoSize(); upd(); } });
  const sS = slider({ label: 'Number of segments (BATES)', min: 1, max: 4, step: 1, value: 2, fmt: v => v.toFixed(0), onInput: () => { autoSize(); upd(); } });
  const sT = slider({ label: 'Throat diameter', min: 1.5, max: 16, step: 0.1, value: 5.5, unit: 'mm', fmt: v => v.toFixed(1), onInput: upd });
  const sE = slider({ label: 'Nozzle expansion ratio', min: 1.5, max: 8, step: 0.1, value: 4, fmt: v => v.toFixed(1), onInput: upd });
  const sA = slider({ label: 'Burn-rate coefficient a (mm/s at 1 MPa)', min: 1, max: 12, step: 0.1, value: 4, fmt: v => v.toFixed(1), onInput: upd });
  const sN = slider({ label: 'Pressure exponent n', min: 0.1, max: 1.0, step: 0.01, value: 0.35, fmt: v => v.toFixed(2), onInput: upd });
  const sB = slider({ label: 'Case burst pressure', min: 3, max: 25, step: 0.5, value: 12, unit: 'MPa', fmt: v => v.toFixed(1), onInput: upd });
  const sK = slider({ label: 'Hidden crack in the grain (extra burning area)', min: 0, max: 100, step: 1, value: 0, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const size = button('Re-size throat for peak Kn = 265', () => { autoSize(); upd(); }, 'small');
  const play = button('▶ Fire (slow motion)', () => { t0 = performance.now(); playing = true; }, 'small');
  const ero = toggle({ label: 'Erosive burning (fast gas in a narrow hole)', checked: true, onChange: upd });
  const ro = { cls: readout('Motor designation', '', 'hot'), I: readout('Total impulse', 'N·s', 'cool'), F: readout('Peak / average thrust', 'N', 'fuel'), tb: readout('Burn time', 's', 'cool'), P: readout('Peak chamber pressure', 'MPa', 'hot'), sf: readout('Burst margin', '×', 'good'), isp: readout('Isp (delivered)', 's', 'cool'), st: readout('Verdict', '', 'good') };
  const kind = h('div', { class: 'widget-note', style: { marginTop: '6px' } });
  body.append(h('div', {}, cvM), h('div', { class: 'wgrid even', style: { marginTop: '10px' } }, cvF, cvP), kind,
    h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sel.el, fam.el, sD.el, sd.el, sL.el, sS.el, sT.el, sE.el, sA.el, sN.el, sB.el, sK.el, ero.el, h('div', { class: 'btn-row' }, size, play)), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pM = new Plot(cvM, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 3.3, minHeight: 200, margin: { l: 4, r: 4, t: 4, b: 4 }, grid: false });
  const pF = new Plot(cvF, { xmin: 0, xmax: 2, ymin: 0, ymax: 100, aspect: 1.55, xlabel: 'time (s)', ylabel: 'thrust (N)', title: 'Thrust curve', margin: { l: 52, r: 12, t: 28, b: 40 } });
  const pP = new Plot(cvP, { xmin: 0, xmax: 2, ymin: 0, ymax: 10, aspect: 1.55, xlabel: 'time (s)', ylabel: 'chamber pressure (MPa)', title: 'Chamber pressure vs case limit', margin: { l: 52, r: 12, t: 28, b: 40 } });
  let res = null, playing = false, t0 = 0, tNow = 0;
  const geo = () => ({ D: mm(sD.get()), d0: sel.get() === 'end' || sel.get() === 'rod' ? 0 : mm(Math.min(sd.get(), sD.get() - 4)), L: mm(sL.get()), N: sel.get() === 'bates' ? Math.round(sS.get()) : 1 });
  function autoSize() { const g = geo(), At = throatForPeakKn(sel.get(), g, 265); sT.set(Math.min(16, Math.max(1.5, Math.sqrt(4 * At / Math.PI) * 1000))); }
  function upd() {
    sd.el.style.display = sel.get() === 'end' || sel.get() === 'rod' ? 'none' : ''; sS.el.style.display = sel.get() === 'bates' ? '' : 'none';
    const f = FAMILIES[fam.get()], g = geo(), type = sel.get(), At = Math.PI / 4 * mm(sT.get()) ** 2;
    res = fireMotor({ type, ...g, At, eps: sE.get(), a: sA.get(), n: sN.get(), rho: f.rho, Tc: f.Tc, Mw: f.Mw, g: f.g, Pburst: sB.get() * 1e6, crack: sK.get() / 100, erosive: ero.get() });
    const r = res, ok = r.lit && !r.fail && r.sliver <= 0.5;
    kind.innerHTML = '<b>' + GRAINS[type].kind + '.</b> ' + GRAINS[type].note + '. Start-up K<sub>n</sub> = ' + r.Kn0.toFixed(0) + (type === 'end' || type === 'rod' ? '' : ', port-to-throat area ' + r.portRatio0.toFixed(1) + '×') + ', propellant ' + (r.mProp * 1000).toFixed(0) + ' g.';
    ro.cls.set(ok ? r.cls + Math.round(r.Favg) : '–'); ro.I.set(ok ? r.I.toFixed(0) : '–'); ro.F.set(ok ? r.Fmax.toFixed(0) + ' / ' + r.Favg.toFixed(0) : '–'); ro.tb.set(ok ? r.tb.toFixed(2) : '–');
    ro.P.set((r.Pmax / 1e6).toFixed(1), r.Pmax > 0.8 * sB.get() * 1e6 ? 'bad' : 'hot'); ro.sf.set(r.Pmax > 0 ? (sB.get() * 1e6 / r.Pmax).toFixed(2) : '–', sB.get() * 1e6 / r.Pmax < 1.5 ? 'bad' : 'good'); ro.isp.set(ok ? r.Isp.toFixed(0) : '–');
    const verdict = r.fail ? ['CASE BURST at ' + r.fail.t.toFixed(2) + ' s', 'bad'] : !r.lit ? ['no sustained burn: Kn too low', 'bad'] : r.sliver > 0.5 ? ['FIRE WENT OUT: only ' + ((1 - r.sliver) * 100).toFixed(0) + ' % burned', 'bad'] : r.Pmax > 0.8 * sB.get() * 1e6 ? ['margin too thin', 'bad'] : r.sliver > 0.12 ? ['works; ' + (r.sliver * 100).toFixed(0) + ' % left as slivers', 'cool'] : ['safe, clean burn', 'good'];
    ro.st.set(verdict[0], verdict[1]);
    const tEnd = Math.max(0.3, res.t[res.t.length - 1] * 1.04), Fm = Math.max(10, r.Fmax * 1.12);
    pF.set({ xmax: tEnd, ymax: Math.ceil(Fm / 10) * 10 }); pP.set({ xmax: tEnd, ymax: Math.max(5, Math.ceil(Math.min(40, Math.max(r.Pmax / 1e6, sB.get()) * 1.1))) });
    drawCurves(); draw();
  }
  function drawCurves() {
    if (!res) return; const r = res;
    let c = pF.begin().col; pF.axes();
    pF.area(r.t, r.t.map(() => 0), r.F, { color: c.fire, alpha: .18 }); pF.line(r.t, r.F, { color: c.fire, width: 3 });
    pF.hline(r.Favg, { color: c.muted, label: 'average ' + r.Favg.toFixed(0) + ' N', align: 'right' }); pF.vline(tNow, { color: c.air, alpha: .9, dash: [3, 3] });
    c = pP.begin().col; pP.axes();
    const Pb = sB.get(); pP.hband(Pb, pP.o.ymax, { color: c.bad, alpha: .08 }); pP.hline(Pb, { color: c.bad, label: 'case bursts', align: 'right', width: 2 }); pP.hline(0.7, { color: c.muted, label: 'burn goes out below ≈ 0.7 MPa', align: 'right' });
    pP.line(r.t, r.P.map(v => v / 1e6), { color: c.air, width: 3 }); pP.vline(tNow, { color: c.air, alpha: .9, dash: [3, 3] });
    if (r.fail) pP.dot(r.fail.t, Pb, { color: c.bad, r: 8 });
  }
  // --- cut-away of the motor, with the grain burning back ---
  function draw() {
    if (!res) return; const r = res, g = r.gr, p = pM, c = p.begin().col, ctx = p.ctx, W = p.W, H = p.H;
    const prm = geo(), type = sel.get(), Rc = prm.D / 2 + r.tIns + 0.0025, Lcase = r.hv + prm.L + r.av, Ln = 0.045, rt = Math.sqrt(4 * (Math.PI / 4 * mm(sT.get()) ** 2) / Math.PI) / 2, re = rt * Math.sqrt(sE.get());
    const s = Math.min((W * 0.60) / (Lcase + Ln), (H * 0.40) / Rc), ox = 0.05 * W, oy = H / 2, X = v => ox + v * s, Y = v => oy - v * s;
    const tEnd = r.t[r.t.length - 1] || 1, idx = Math.min(r.t.length - 1, Math.max(0, r.t.findIndex(v => v >= tNow))), x = r.x[idx] ?? 0, P = r.P[idx] ?? 101325, F = r.F[idx] ?? 0;
    const pk = Math.max(r.Pmax, 1), hot = Math.min(1, 0.1 + 0.9 * (P - 101325) / pk);
    const Ri = prm.D / 2 + r.tIns, xm = Math.min(x, g.web);
    // plume first (behind the nozzle)
    const Fm = Math.max(r.Fmax, 1), fl = F / Fm, plumeL = (0.38 * W) * (0.25 + 0.75 * fl) * (F > 1 ? 1 : 0), flick = 1 + 0.05 * Math.sin(tNow * 90) + 0.03 * Math.sin(tNow * 53 + 1);
    if (plumeL > 4) {
      const x0 = X(Lcase + Ln), L1 = plumeL * flick, w0 = re * s;
      const gr = ctx.createLinearGradient(x0, 0, x0 + L1, 0); gr.addColorStop(0, 'rgba(255,248,215,0.95)'); gr.addColorStop(0.18, 'rgba(255,196,90,0.85)'); gr.addColorStop(0.55, 'rgba(240,110,40,0.45)'); gr.addColorStop(1, 'rgba(200,60,30,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, oy - w0); ctx.quadraticCurveTo(x0 + L1 * 0.5, oy - w0 * 1.25, x0 + L1, oy); ctx.quadraticCurveTo(x0 + L1 * 0.5, oy + w0 * 1.25, x0, oy + w0); ctx.closePath(); ctx.fill();
      const ratio = r.pePc * P / 101325;                                   // exit pressure over ambient: diamonds when near 1
      if (ratio > 0.5 && ratio < 3) for (let k = 0; k < 4; k++) { const dx = x0 + L1 * (0.1 + 0.16 * k), wd = w0 * (0.55 - 0.1 * k); ctx.fillStyle = `rgba(255,252,235,${0.55 - 0.1 * k})`; ctx.beginPath(); ctx.ellipse(dx, oy, L1 * 0.045, Math.max(2, wd), 0, 0, 7); ctx.fill(); }
    }
    // case, interior gas, nozzle
    ctx.fillStyle = c.metal; ctx.globalAlpha = .85; ctx.fillRect(X(0), Y(Rc), Lcase * s, 2 * Rc * s); ctx.globalAlpha = 1;
    ctx.fillStyle = '#c9b79a'; ctx.globalAlpha = .55; ctx.fillRect(X(0), Y(Ri), Lcase * s, 2 * Ri * s); ctx.globalAlpha = 1;   // insulating liner
    ctx.fillStyle = `rgba(255,${Math.round(190 - 110 * hot)},${Math.round(80 - 40 * hot)},${0.12 + 0.55 * hot})`; ctx.fillRect(X(0), Y(prm.D / 2), Lcase * s, prm.D * s);
    // nozzle block and flow path
    ctx.fillStyle = c.metal; ctx.fillRect(X(Lcase), Y(Rc), Ln * s, 2 * Rc * s);
    const xt = Lcase + 0.015, xe = Lcase + Ln;
    ctx.beginPath(); ctx.moveTo(X(Lcase), Y(Ri)); ctx.lineTo(X(xt), Y(rt)); ctx.lineTo(X(xe), Y(re)); ctx.lineTo(X(xe), Y(-re)); ctx.lineTo(X(xt), Y(-rt)); ctx.lineTo(X(Lcase), Y(-Ri)); ctx.closePath();
    ctx.fillStyle = `rgba(255,${Math.round(200 - 100 * hot)},${Math.round(90 - 40 * hot)},${0.25 + 0.6 * hot})`; ctx.fill();
    // grain (top and bottom halves), burning surfaces highlighted
    const grainCol = '#7b4a2a', burnCol = `rgba(255,${Math.round(220 - 60 * hot)},90,${P > 0.7e6 ? 1 : 0.0})`, rect = (xa, xb, ya, yb) => { if (xb <= xa || yb <= ya) return; ctx.fillStyle = grainCol; ctx.fillRect(X(xa), Y(yb), (xb - xa) * s, (yb - ya) * s); ctx.fillRect(X(xa), Y(-ya), (xb - xa) * s, (yb - ya) * s); };
    const burnLine = (xa, ya, xb, yb) => { ctx.strokeStyle = burnCol; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(X(xa), Y(ya)); ctx.lineTo(X(xb), Y(yb)); ctx.moveTo(X(xa), Y(-ya)); ctx.lineTo(X(xb), Y(-yb)); ctx.stroke(); };
    const gs = r.hv, ge = r.hv + prm.L, R = prm.D / 2;
    if (type === 'end') { const xf = 0.004 + prm.L - xm; rect(0.004, xf, 0, R); burnLine(xf, 0, xf, R); }
    else if (type === 'bore') { const ri = g.Rin(xm); rect(gs, ge, ri, R); burnLine(gs, ri, ge, ri); }
    else if (type === 'bates') { const seg = g.seg, ri = g.Rin(xm); for (let i = 0; i < g.N; i++) { const a0 = gs + i * seg + xm, a1 = gs + (i + 1) * seg - xm; rect(a0, a1, ri, R); burnLine(a0, ri, a0, R); burnLine(a1, ri, a1, R); burnLine(a0, ri, a1, ri); } }
    else if (type === 'tube') { const ri = g.Rin(xm), ro_ = g.Rout(xm); rect(gs, ge, ri, ro_); burnLine(gs, ri, ge, ri); burnLine(gs, ro_, ge, ro_); }
    else { const ro_ = g.Rout(xm); rect(gs, ge, 0, ro_); burnLine(gs, ro_, ge, ro_); }
    // outline and labels
    ctx.strokeStyle = c.strong; ctx.lineWidth = 1.5; ctx.strokeRect(X(0), Y(Rc), (Lcase + Ln) * s, 2 * Rc * s);
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = c.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('case', X(0.004), Y(Rc) - 15); ctx.fillText('grain', X(gs + 0.01), Y(Rc) + 2 * Rc * s + 4); ctx.fillText('nozzle', X(Lcase + 0.003), Y(Rc) - 15);
    { let lx = 8; for (const [col, txt] of [[c.fire, '■ hot gas'], [grainCol, '■ unburnt propellant'], ['#e8a33a', '━ burning surface']]) { ctx.fillStyle = col; ctx.fillText(txt, lx, H - 18); lx += ctx.measureText(txt).width + 16; } }
    ctx.fillStyle = c.strong; ctx.textAlign = 'right'; ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`t = ${tNow.toFixed(2)} s    P = ${(P / 1e6).toFixed(1)} MPa    thrust = ${F.toFixed(0)} N    web burnt: ${(g.web > 0 ? 100 * xm / g.web : 0).toFixed(0)} %`, W - 8, 8);
    if (r.fail && tNow >= r.fail.t) { ctx.fillStyle = 'rgba(214,40,40,0.9)'; ctx.font = '800 20px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CASE BURST', W * 0.5, H * 0.45); }
  }
  // animation: scrub through the burn once, in slow motion
  function frame(now) {
    if (playing && res) {
      const tEnd = res.t[res.t.length - 1] || 1, T = Math.max(3.5, tEnd * 2.2) * 1000, k = (now - t0) / T;
      tNow = Math.min(1, k) * tEnd; drawCurves(); draw(); if (k >= 1.15) playing = false;
    }
    requestAnimationFrame(frame);
  }
  cvM.addEventListener('pointerdown', () => { t0 = performance.now(); playing = true; });
  [pF, pP].forEach(p => p.onDraw(() => { drawCurves(); }));
  pM.onDraw(draw);
  autoSize(); upd(); tNow = res.t[Math.floor(res.t.length * 0.5)] || 0; upd(); requestAnimationFrame(frame);
}
