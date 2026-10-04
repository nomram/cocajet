// Flame-tube design: hole sizing from pressure drop and air split, zone mixtures, and a printable 1:1 drilling template.
import { h, shell, slider, readout, button } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';
import { flameTemp } from './combustion.js';

const FUEL = { x: 3, y: 8, z: 0, LHV: 46.35 };
const ROWS = [['primary', 10, 0], ['secondary', 34, 22.5], ['dilution', 64, 0]];      // distance from the front edge of the straight wall (mm), angular phase (deg)
const STL = { primary: [5.5, 4.5], secondary: [6.5, 5.0], dilution: [8.0, 6.5] };
const R_OUT = 33, R_IN = 17.25, WALL_LEN = 87;

export function templateSVG(rowsOut, rowsIn, n) {
  const Co = 2 * Math.PI * R_OUT, Ci = 2 * Math.PI * R_IN;
  const draw = (C, rows, title, phaseOff) => {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${C.toFixed(1)}mm" height="${(WALL_LEN + 16).toFixed(1)}mm" viewBox="0 0 ${C.toFixed(2)} ${WALL_LEN + 16}" font-family="sans-serif" font-size="3">`;
    s += `<rect x="0" y="8" width="${C.toFixed(2)}" height="${WALL_LEN}" fill="none" stroke="#000" stroke-width=".3"/>`;
    s += `<text x="1" y="5" font-size="3.4" font-weight="bold">${title}: unrolled, 1:1 (print at 100 %). Wrap around the can; join at the dashed edge.</text>`;
    s += `<text x="${(C / 2).toFixed(1)}" y="${WALL_LEN + 12}" text-anchor="middle">▼ FRONT edge is at the TOP (dome end) ▼ — cut the opposite edge to length ${WALL_LEN} mm</text>`;
    s += `<line x1="${C.toFixed(2)}" y1="8" x2="${C.toFixed(2)}" y2="${8 + WALL_LEN}" stroke="#000" stroke-width=".3" stroke-dasharray="1.5 1"/>`;
    for (const [name, d, ph, dia] of rows) {
      for (let i = 0; i < n; i++) {
        const ang = (ph + phaseOff + 360 * i / n) % 360, x = ang / 360 * C, y = 8 + d;
        s += `<circle cx="${x.toFixed(2)}" cy="${y}" r="${(dia / 2).toFixed(2)}" fill="none" stroke="#c00" stroke-width=".25"/><line x1="${(x - 1).toFixed(2)}" y1="${y}" x2="${(x + 1).toFixed(2)}" y2="${y}" stroke="#c00" stroke-width=".15"/><line x1="${x.toFixed(2)}" y1="${y - 1}" x2="${x.toFixed(2)}" y2="${y + 1}" stroke="#c00" stroke-width=".15"/>`;
        if (i === 0) s += `<text x="${(x + dia / 2 + 1.2).toFixed(2)}" y="${y + 1}" fill="#c00">${name} Ø${dia.toFixed(1)}</text>`;
      }
    }
    s += `<g stroke="#000" stroke-width=".25"><line x1="2" y1="${WALL_LEN + 8 - 4}" x2="52" y2="${WALL_LEN + 8 - 4}"/>${[0, 10, 20, 30, 40, 50].map(k => `<line x1="${2 + k}" y1="${WALL_LEN + 4 - 1}" x2="${2 + k}" y2="${WALL_LEN + 4 + 1}"/>`).join('')}</g><text x="54" y="${WALL_LEN + 5}" font-size="2.6">50 mm scale check</text></svg>`;
    return s;
  };
  return { outer: draw(Co, rowsOut, 'OUTER LINER (Coke can, Ø66)', 0), inner: draw(Ci, rowsIn, 'INNER LINER (Ø34.5 tube)', 180 / n) };
}

export default function init(el) {
  const { body } = shell(el, { title: 'Design the flame tube: holes, air split and a drilling template', note: 'The liner drops a few % of the pressure to push the air through its holes. A bigger drop makes faster, deeper, better-mixing jets but costs thrust; a small one gives a lazy, hot, patchy flame. Total hole area follows from continuity: ṁ = Cd·A·√(2ρΔP).' });
  const cv = h('canvas', { class: 'plot' }), cvZ = h('canvas', { class: 'plot' });
  const sDP = slider({ label: 'Liner pressure drop  ΔP / P₂', min: 1.5, max: 8, step: 0.1, value: 3.7, unit: '%', fmt: v => v.toFixed(1), onInput: upd });
  const sP = slider({ label: 'Air through the primary holes', min: 12, max: 35, step: 1, value: 22, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const sS = slider({ label: 'Air through the secondary holes', min: 15, max: 45, step: 1, value: 30, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const sN = slider({ label: 'Holes per row', min: 6, max: 12, step: 1, value: 8, fmt: v => v.toFixed(0), onInput: upd });
  const sO = slider({ label: 'Share of holes in the outer wall', min: 40, max: 75, step: 1, value: 61, unit: '%', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { A: readout('Total hole area needed', 'mm²', 'fuel'), vj: readout('Jet speed through holes', 'm/s', 'cool'), stl: readout('Area of the STL model', 'mm²'), dp: readout('ΔP the STL gives', '%'), dil: readout('Dilution share', '%', 'good') };
  const tbl = h('tbody'), tplHost = h('div', { style: { marginTop: '12px' } }), prev = h('div', { style: { background: '#fff', border: '1px solid var(--line)', borderRadius: '10px', padding: '8px', overflowX: 'auto' } });
  body.append(h('div', { class: 'wgrid' }, h('div', { class: 'ctls' }, sDP.el, sP.el, sS.el, sN.el, sO.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))), cvZ),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, 'Row'), h('th', { class: 'num' }, 'from front (mm)'), h('th', { class: 'num' }, 'holes'), h('th', { class: 'num' }, 'outer Ø (mm)'), h('th', { class: 'num' }, 'inner Ø (mm)'), h('th', { class: 'num' }, 'STL: outer / inner'))), tbl)),
    cv, tplHost);
  const g = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0)), rho = g.P02 / (287.05 * g.T02);
  const pT = new Plot(cvZ, { xmin: 0, xmax: 3.6, ymin: 0, ymax: 2400, xlabel: '', ylabel: 'gas temperature (K)', aspect: 1.2, title: 'Mixture temperature in each zone', margin: { l: 56, r: 12, t: 30, b: 44 }, xticks: [0.5, 1.5, 2.5], xtickFmt: v => ['primary', 'secondary', 'dilution (exit)'][Math.floor(v)] || '' });
  const pB = new Plot(cv, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 4.8, grid: false, margin: { l: 4, r: 4, t: 4, b: 4 } });
  let last = null;
  function upd() {
    const dpF = sDP.get() / 100, shP = sP.get() / 100, shS = sS.get() / 100, shD = Math.max(0.05, 1 - shP - shS - 0.01), n = sN.get(), os = sO.get() / 100;
    const dP = dpF * g.P02, vj = Math.sqrt(2 * dP / rho), Cd = 0.65, Atot = g.m * 0.99 / (Cd * rho * vj) * 1e6;
    const rows = [['primary', shP], ['secondary', shS], ['dilution', shD]];
    const out = [], inn = [];
    tbl.innerHTML = '';
    let aSTL = 0;
    rows.forEach(([nm, sh], i) => {
      const A = sh / 0.99 * Atot, dO = Math.sqrt(4 * A * os / (Math.PI * n)), dI = Math.sqrt(4 * A * (1 - os) / (Math.PI * n)), rnd = (d) => Math.round(d * 2) / 2;
      out.push([nm, ROWS[i][1], ROWS[i][2], rnd(dO)]); inn.push([nm, ROWS[i][1], ROWS[i][2], rnd(dI)]);
      aSTL += 8 * Math.PI / 4 * (STL[nm][0] ** 2 + STL[nm][1] ** 2);
      tbl.append(h('tr', {}, h('td', {}, h('b', {}, nm)), h('td', { class: 'num' }, ROWS[i][1]), h('td', { class: 'num' }, n), h('td', { class: 'num' }, `${dO.toFixed(2)} → ${rnd(dO).toFixed(1)}`), h('td', { class: 'num' }, `${dI.toFixed(2)} → ${rnd(dI).toFixed(1)}`), h('td', { class: 'num' }, `${STL[nm][0]} / ${STL[nm][1]}  (8 holes)`)));
    });
    const dpSTL = 0.5 * rho * (g.m * 0.99 / (Cd * rho * aSTL * 1e-6)) ** 2 / g.P02 * 100;
    ro.A.set(Atot.toFixed(0)); ro.vj.set(vj.toFixed(0)); ro.stl.set(aSTL.toFixed(0)); ro.dp.set(dpSTL.toFixed(1)); ro.dil.set((shD * 100).toFixed(0));
    // zone temperatures
    const phi0 = g.phi, cum = [shP + 0.01, shP + shS + 0.01, 1], Tin = g.T02;
    const Tz = cum.map(a => flameTemp(FUEL, phi0 / a, Tin));
    const c = pT.begin().col; pT.axes();
    const ctx = pT.ctx; Tz.forEach((T, i) => { const x0 = pT.X(i + 0.08), x1 = pT.X(i + 0.92), y = pT.Y(T); ctx.fillStyle = [c.fire, c.fuel, c.air][i]; ctx.globalAlpha = .75; ctx.fillRect(x0, y, x1 - x0, pT.Y(0) - y); ctx.globalAlpha = 1; pT.text(i + 0.5, T + 80, `φ = ${(phi0 / cum[i]).toFixed(2)}  ·  ${(T - 273.15).toFixed(0)} °C`, { align: 'center', color: c.text, size: 11.5, weight: 700, base: 'bottom' }); });
    pT.hline(933, { color: c.bad, label: 'aluminium melts', align: 'right' }); pT.hline(g.T03, { color: c.ok, label: 'turbine inlet target', align: 'right' });
    // template preview
    last = templateSVG(out, inn, n);
    prev.innerHTML = last.outer + '<div style="height:10px"></div>' + last.inner; prev.querySelectorAll('svg').forEach(s => { s.style.maxWidth = '100%'; s.style.height = 'auto'; });
    pB.begin();
  }
  tplHost.append(h('h4', { style: { margin: '6px 0' } }, 'Printable 1:1 drilling templates'), h('p', { style: { fontSize: '.88rem', color: 'var(--muted)' } }, 'Print at 100 % (no “fit to page”): check the 50 mm scale bar with a ruler. Tape the outer template round the can with the top edge on the dome side, centre-punch each cross, drill small (2 mm) then open up with a step drill. The inner liner uses the second sheet (holes are offset half a pitch).'),
    h('div', { class: 'btn-row', style: { marginBottom: '8px' } }, button('⬇ Download outer-liner template (SVG)', () => dl(last.outer, 'cj1-outer-liner-template.svg'), 'small primary'), button('⬇ Download inner-liner template (SVG)', () => dl(last.inner, 'cj1-inner-liner-template.svg'), 'small')), prev);
  function dl(svg, name) { const a = h('a', { href: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), download: name }); document.body.append(a); a.click(); a.remove(); }
  pT.onDraw(upd); cv.style.display = 'none'; upd();
}
