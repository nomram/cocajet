// Windmill family: drag-type vs lift-type rotors. Animated icon of each, velocity triangle, Cp(lambda) curves, comparison table.
import { h, shell, slider, button, readout, whenVisible, cssVar, clamp } from '../ui.js';
import { Plot } from '../plot.js';
import { drawTurbine, slowRot, rrect } from './wind-turbine.js';

const RHO = 1.225, BETZ = 16 / 27, TAU = 2 * Math.PI;
// Typical empirical shapes: Cp(l) = Cpmax * bell(l / lamD), bell = 1 - smoothstep(|x-1| / w) on each side of the optimum (w = wl left, wr right). Not measurements.
const TYPES = [
  { id: 'sav', name: 'Savonius', col: '--violet', lamD: 0.8, cp: 0.2, wl: 0.8, wr: 0.95, drag: true, f: 0.6, stn: 'bucket centre, 60 % radius', hr: 2, sol: '≈ 100 %', cps: '0.15–0.25', start: 'Very high (≈ 2× running)', q0: 2, noise: 'Very quiet', use: 'Cup anemometers, ventilators, small off-grid pumps and lights', why: 'Two scooped half-cylinders: cheap, works from any wind direction, starts in a breath. It is a drag device: the bucket can never move faster than the wind, so Cp stays below about 0.25.' },
  { id: 'farm', name: 'Farm windmill', col: '--fuel', lamD: 1, cp: 0.3, wl: 1, wr: 1.1, f: 0.75, stn: '75 % radius', sol: '60–80 %', cps: '0.25–0.35', start: 'High (≈ 1× running)', q0: 1, noise: 'Low whirr, rod clank', use: 'Pumping water from wells with a piston pump, 1–6 m/s', why: '12–24 wide curved blades at λ ≈ 1 give huge torque at low speed: exactly what lifting a heavy column of water with a piston needs. A tail vane turns it into the wind and furls it in storms.' },
  { id: 'dutch', name: 'Dutch mill', col: '--ok', lamD: 2, cp: 0.25, wl: 1, wr: 1, f: 0.75, stn: '75 % radius', sol: '20–30 %', cps: '0.2–0.3', start: 'Medium (≈ 0.5× running)', q0: 0.5, noise: 'Low whoosh', use: 'Grinding grain, draining polders, sawing (13th–19th century)', why: 'Four twisted lattice sails with adjustable cloth: a slow, steady, strong turning for millstones at 10–20 rpm. The sails are twisted like wings, so it is already a lift machine (λ ≈ 2).' },
  { id: 'two', name: '2-blade', col: '--fire', lamD: 9, cp: 0.47, wl: 1, wr: 1.2, f: 0.75, stn: '75 % radius', sol: '3–4 %', cps: 'up to 0.47', start: 'Very low (≈ 0.03× running)', q0: 0.03, noise: 'Loudest (tip speed 80–90 m/s)', use: 'Some offshore and test turbines, small wind chargers', why: 'One blade fewer saves cost and weight, but the rotor must run faster (λ ≈ 9), is noisier and needs a teetering hub so the unbalance does not shake the tower.' },
  { id: 'three', name: '3-blade', col: '--air', lamD: 7.5, cp: 0.49, wl: 1, wr: 1.2, f: 0.75, stn: '75 % radius', sol: '4–5 %', cps: '0.45–0.50', start: 'Low (≈ 0.05× running)', q0: 0.05, noise: 'Moderate (tip ~70 m/s)', use: 'Every utility-scale wind farm, 2–15 MW', why: 'Few slender twisted blades at λ ≈ 7.5: small tip loss, balanced, smooth and quiet-ish, and the high shaft speed needs only a light gearbox and a small generator. Best Cp of all.' },
  { id: 'h', name: 'Darrieus / H-rotor', col: '--metal', lamD: 4.5, cp: 0.38, wl: 0.75, wr: 0.9, f: 1, stn: 'blade, side-on to the wind', hr: 1.5, dead: 0.05, sol: '10–25 %', cps: '0.30–0.40', start: 'None: needs a push (≈ 0)', q0: 0, noise: 'Medium hum, pulsing', use: 'Research, rooftop and urban turbines; rare', why: 'Lift blades parallel to a vertical axis: no yaw system, generator at ground level. But each blade works well only part of every turn (torque ripple) and the rotor cannot start by itself.' },
];
const bell = (x, T) => { const t = Math.min(1, (x <= 1 ? 1 - x : x - 1) / (x <= 1 ? T.wl : T.wr)); return 1 - t * t * (3 - 2 * t); };
const cpOf = (T, l) => { const x = l / T.lamD; return T.cp * bell(x, T) - (T.dead ? T.dead * Math.exp(-(((x - 0.28) / 0.14) ** 2)) : 0); };
const fmtW = P => { const a = Math.abs(P), s = P < 0 ? '−' : ''; return s + (a >= 1e6 ? (a / 1e6).toFixed(2) + ' MW' : a >= 1e4 ? (a / 1e3).toFixed(0) + ' kW' : a >= 1e3 ? (a / 1e3).toFixed(1) + ' kW' : a.toFixed(0) + ' W'); };
const fmtQ = Q => { const a = Math.abs(Q), s = Q < 0 ? '−' : ''; return s + (a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + ' kN·m' : a.toFixed(a < 10 ? 1 : 0) + ' N·m'); };
const theme = () => ({ bg: cssVar('--bg-2'), air: cssVar('--air'), air2: cssVar('--air-2'), text: cssVar('--text'), t2: cssVar('--text-2'), muted: cssVar('--muted'), line: cssVar('--line-2'), p3: cssVar('--panel-3'), fire: cssVar('--fire'), fuel: cssVar('--fuel'), violet: cssVar('--violet'), ok: cssVar('--ok'), bad: cssVar('--bad') });

function streaks(ctx, t, tm, v, ys, x0, x1) {
  ctx.save(); ctx.strokeStyle = t.air; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.globalAlpha = 0.45; ctx.beginPath();
  ys.forEach((y, i) => { for (let x = x0 + ((tm * (20 + v * 6) + i * 37) % 64) - 64; x < x1; x += 64) { const a = Math.max(x, x0), b = Math.min(x + 22, x1); if (b > a) { ctx.moveTo(a, y); ctx.lineTo(b, y); } } });
  ctx.stroke(); ctx.restore();
}
const label = (ctx, t, s, x, y, al = 'left') => { ctx.font = '11px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = t.muted; ctx.textAlign = al; ctx.textBaseline = 'top'; ctx.fillText(s, x, y); };
const ground = (ctx, t, w, hh) => { const gy = hh * 0.93; ctx.fillStyle = t.p3; ctx.globalAlpha = 0.55; ctx.fillRect(0, gy, w, hh - gy); ctx.globalAlpha = 1; ctx.strokeStyle = t.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); return gy; };
function lens(ctx, x, y, a, len, th, fill, stroke) { ctx.beginPath(); ctx.ellipse(x, y, len / 2, th / 2, a, 0, 7); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }

function dSavonius(ctx, w, hh, { ang, t, tm, v }) {
  const cx = w / 2, cy = hh * 0.5, R = Math.min(w, hh) * 0.3, rho = R / 1.85, e = 0.3 * rho, c = rho - e / 2;
  streaks(ctx, t, tm, v, [0.14, 0.26, 0.38, 0.62, 0.74, 0.86].map(f => f * hh), 0, w);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.lineCap = 'round';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * c, 0, rho, s < 0 ? Math.PI : 0, s < 0 ? TAU : Math.PI); ctx.fillStyle = t.violet; ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = t.violet; ctx.lineWidth = 0.1 * rho + 2; ctx.stroke(); }
  ctx.restore(); ctx.beginPath(); ctx.arc(cx, cy, 0.09 * rho + 2, 0, 7); ctx.fillStyle = t.text; ctx.fill();
  label(ctx, t, 'top view, looking down the axis', 10, hh - 20); ctx.fillStyle = t.air; ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('wind →', 10, 8);
}

function dFarm(ctx, w, hh, { ang, t, tm, v }) {
  const cx = 0.46 * w, cy = 0.4 * hh, R = Math.min(0.36 * w, 0.3 * hh), gy = ground(ctx, t, w, hh), y0 = cy + 0.1 * R, N = 18, xl = y => 0.06 * R + (y - y0) / (gy - y0) * 0.28 * R;
  ctx.strokeStyle = t.muted; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - xl(y0), y0); ctx.lineTo(cx - xl(gy), gy); ctx.moveTo(cx + xl(y0), y0); ctx.lineTo(cx + xl(gy), gy); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i <= 6; i++) { const ya = y0 + (gy - y0) * i / 6, yb = y0 + (gy - y0) * (i + 1) / 6; ctx.moveTo(cx - xl(ya), ya); ctx.lineTo(cx + xl(ya), ya); if (i < 6) { ctx.moveTo(cx - xl(ya), ya); ctx.lineTo(cx + xl(yb), yb); ctx.moveTo(cx + xl(ya), ya); ctx.lineTo(cx - xl(yb), yb); } } ctx.stroke();
  const ry = (y0 + gy) / 2 + 0.05 * hh * Math.sin(ang * 2); ctx.strokeStyle = t.fuel; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, gy); ctx.stroke(); ctx.fillStyle = t.fuel; ctx.fillRect(cx - 5, ry - 3, 10, 6);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(0.94, 1); ctx.rotate(ang);
  for (let k = 0; k < N; k++) { ctx.save(); ctx.rotate(k * TAU / N); const r1 = 0.42 * R, w1 = TAU * r1 / N * 0.5, w2 = TAU * R / N * 0.78; ctx.beginPath(); ctx.moveTo(-w1 / 2 + 0.2 * w1, -r1); ctx.lineTo(w1 / 2 + 0.2 * w1, -r1); ctx.lineTo(w2 / 2 + 0.3 * w2, -R); ctx.lineTo(-w2 / 2 + 0.3 * w2, -R); ctx.closePath(); ctx.fillStyle = t.air; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 0.6; ctx.strokeStyle = t.text; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore(); }
  ctx.globalAlpha = 1; ctx.strokeStyle = t.muted; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 0.42 * R, 0, 7); ctx.moveTo(R, 0); ctx.arc(0, 0, R, 0, 7); for (let k = 0; k < 6; k++) { ctx.moveTo(0, 0); ctx.lineTo(0.42 * R * Math.cos(k * Math.PI / 3), 0.42 * R * Math.sin(k * Math.PI / 3)); } ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 0.07 * R, 0, 7); ctx.fillStyle = t.t2; ctx.fill(); ctx.restore();
  label(ctx, t, 'front view: 18 blades, pump rod', 10, hh - 20);
}

function dDutch(ctx, w, hh, { ang, t }) {
  const cx = 0.5 * w, cy = 0.38 * hh, R = Math.min(0.4 * w, 0.31 * hh), gy = ground(ctx, t, w, hh), yt = cy + 0.22 * R, bw = 0.34 * R, tw = 0.17 * R;
  ctx.fillStyle = t.muted; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(cx - bw, gy); ctx.lineTo(cx - tw, yt); ctx.lineTo(cx + tw, yt); ctx.lineTo(cx + bw, gy); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = t.muted; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - bw, gy); ctx.lineTo(cx - tw, yt); ctx.lineTo(cx + tw, yt); ctx.lineTo(cx + bw, gy); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = t.muted; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 1; i < 9; i++) { const y = yt + (gy - yt) * i / 9, hw = tw + (bw - tw) * i / 9; ctx.moveTo(cx - hw, y); ctx.lineTo(cx + hw, y); } ctx.stroke(); ctx.globalAlpha = 1;
  const yg = yt + (gy - yt) * 0.4, hg = tw + (bw - tw) * 0.4 + 0.05 * R; ctx.fillStyle = t.muted; ctx.fillRect(cx - hg, yg, 2 * hg, 3); ctx.fillStyle = t.line; rrect(ctx, cx - 0.05 * R, gy - 0.2 * R, 0.1 * R, 0.2 * R, [0.05 * R, 0.05 * R, 0, 0]); ctx.fill();
  ctx.fillStyle = t.t2; ctx.strokeStyle = t.line; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx - tw - 0.03 * R, yt); ctx.quadraticCurveTo(cx - tw, cy - 0.06 * R, cx, cy - 0.06 * R); ctx.quadraticCurveTo(cx + tw, cy - 0.06 * R, cx + tw + 0.03 * R, yt); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-ang);
  for (let k = 0; k < 4; k++) {
    ctx.save(); ctx.rotate(k * Math.PI / 2); ctx.strokeStyle = t.text; ctx.lineWidth = 0.03 * R + 1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -0.04 * R); ctx.lineTo(0, -R); ctx.stroke();
    const sw = r => 0.21 * R * Math.cos((25 - 19 * (r - 0.2) / 0.8) * Math.PI / 180), r0 = 0.2 * R, r1 = 0.97 * R;
    ctx.beginPath(); ctx.moveTo(-0.04 * R, -r0); ctx.lineTo(-0.04 * R, -r1); ctx.lineTo(sw(0.97), -r1); ctx.lineTo(sw(0.2), -r0); ctx.closePath(); ctx.fillStyle = t.air; ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 0.9; ctx.strokeStyle = t.air; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); for (let i = 0; i <= 9; i++) { const r = 0.2 + 0.77 * i / 9; ctx.moveTo(-0.04 * R, -r * R); ctx.lineTo(sw(r), -r * R); } ctx.moveTo(0.33 * sw(0.6), -0.6 * R); ctx.lineTo(0.33 * sw(0.97), -r1); ctx.moveTo(0.66 * sw(0.6), -0.6 * R); ctx.lineTo(0.66 * sw(0.97), -r1); ctx.lineWidth = 0.9; ctx.globalAlpha = 0.6; ctx.stroke(); ctx.restore();
  }
  ctx.restore(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(cx, cy, 0.05 * R, 0, 7); ctx.fillStyle = t.text; ctx.fill();
  label(ctx, t, 'front view: 4 lattice sails, turning anticlockwise', 10, hh - 20);
}

function dHrotor(ctx, w, hh, { ang, t, tm, v }) {
  const gy = ground(ctx, t, w, hh), yT = 0.13 * hh, yB = 0.78 * hh, R = Math.min((yB - yT) / 3, 0.2 * w), cx = 0.3 * w, N = 3, tcx = 0.72 * w, tcy = 0.52 * hh, ri = Math.min(0.17 * w, 0.17 * hh);
  ctx.fillStyle = t.muted; ctx.fillRect(cx - 3, yT - 8, 6, gy - yT + 8);
  const bl = [...Array(N)].map((_, k) => ({ th: ang + k * TAU / N })).sort((a, b) => Math.sin(a.th) - Math.sin(b.th));
  for (const b of bl) {
    const x = cx + R * Math.cos(b.th), d = Math.sin(b.th), near = 0.5 + 0.5 * d; ctx.globalAlpha = 0.45 + 0.55 * near;
    ctx.strokeStyle = t.muted; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, yT); ctx.lineTo(x, yT); ctx.moveTo(cx, yB); ctx.lineTo(x, yB); ctx.stroke();
    ctx.fillStyle = t.air; rrect(ctx, x - 2.5 - near * 1.5, yT, 5 + near * 3, yB - yT, 3); ctx.fill(); ctx.strokeStyle = t.text; ctx.lineWidth = 0.8; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  streaks(ctx, t, tm, v, [0.34, 0.44, 0.6, 0.7].map(f => f * hh), 0.5 * w, w); ctx.strokeStyle = t.muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tcx, tcy, ri, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  for (let k = 0; k < N; k++) { const th = ang + k * TAU / N, px = tcx + ri * Math.cos(th), py = tcy + ri * Math.sin(th); lens(ctx, px, py, th + Math.PI / 2, 0.45 * ri, 0.1 * ri + 1, t.air, t.text);
    ctx.strokeStyle = t.fuel; ctx.fillStyle = t.fuel; ctx.lineWidth = 1.5; const ax = px - 0.5 * ri * Math.sin(th), ay = py + 0.5 * ri * Math.cos(th); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ax, ay); ctx.stroke(); const aa = Math.atan2(ay - py, ax - px); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - 6 * Math.cos(aa - 0.4), ay - 6 * Math.sin(aa - 0.4)); ctx.lineTo(ax - 6 * Math.cos(aa + 0.4), ay - 6 * Math.sin(aa + 0.4)); ctx.fill(); }
  ctx.beginPath(); ctx.arc(tcx, tcy, 3, 0, 7); ctx.fillStyle = t.text; ctx.fill();
  label(ctx, t, 'side view (left), top view (right)', 10, hh - 20); ctx.fillStyle = t.air; ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('wind →', 0.52 * w, 0.26 * hh);
}

const DRAW = {
  sav: dSavonius, farm: dFarm, dutch: dDutch, h: dHrotor,
  two: (ctx, w, hh, o) => { drawTurbine(ctx, w, hh, { B: 2, lamD: 9, ang: o.ang, t: o.t }); label(ctx, o.t, 'front view, 3/4 angle', 10, hh - 20); },
  three: (ctx, w, hh, o) => { drawTurbine(ctx, w, hh, { B: 3, lamD: 7.5, ang: o.ang, t: o.t }); label(ctx, o.t, 'front view, 3/4 angle', 10, hh - 20); },
};

function arrow(ctx, x0, y0, x1, y1, col, wd = 2.5) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), hd = Math.min(9, L * 0.5); ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = wd; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * hd * 0.6, y1 - Math.sin(a) * hd * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - hd * Math.cos(a - 0.4), y1 - hd * Math.sin(a - 0.4)); ctx.lineTo(x1 - hd * Math.cos(a + 0.4), y1 - hd * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
}
/** velocity triangle c = u + w (wind, blade, relative wind) in units of the wind speed */
function drawTri(ctx, W, H, T, lam, t) {
  const U = T.f * lam, wr = T.drag ? Math.abs(1 - U) : Math.hypot(1, U), tx = W * 0.52;
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  if (T.drag) {
    const L = W * 0.46, y = [H * 0.27, H * 0.5, H * 0.73], s = L / Math.max(1, U);
    arrow(ctx, 10, y[0], 10 + s, y[0], t.air); arrow(ctx, 10, y[1], 10 + Math.max(2, U * s), y[1], t.fuel); const wl = Math.max(1, wr * s);
    if (U < 1) arrow(ctx, 10 + U * s, y[2], 10 + U * s + wl, y[2], t.text); else arrow(ctx, 10 + s, y[2], 10 + s - Math.max(1, wr * s), y[2], t.bad);
    ctx.textAlign = 'left'; ctx.fillStyle = t.air; ctx.fillText('wind c', 14, y[0] - 11); ctx.fillStyle = t.fuel; ctx.fillText('bucket speed u', 14, y[1] - 11); ctx.fillStyle = t.t2; ctx.fillText('w = c − u', 14, y[2] - 11);
  } else {
    const s = Math.max(14, Math.min(W * 0.42 / Math.max(U, 0.05), H - 46)), x0 = 14, y0 = 18, Lx = Math.min(W * 0.46, Math.max(3, U * s)), Ly = s;
    arrow(ctx, x0, y0, x0, y0 + Ly, t.air); arrow(ctx, x0, y0, x0 + Lx, y0, t.fuel); arrow(ctx, x0 + Lx, y0, x0, y0 + Ly, t.text, 3);
    ctx.textAlign = 'left'; ctx.fillStyle = t.air; ctx.fillText('c', x0 + 5, y0 + Ly * 0.7); ctx.fillStyle = t.fuel; ctx.fillText('u', x0 + Lx / 2, y0 - 8); ctx.fillStyle = t.text; ctx.fillText('w', x0 + Lx * 0.55, y0 + Ly * 0.62);
    let kx = 8; for (const [txt, col] of [['c = wind', t.air], ['u = blade', t.fuel], ['w = air seen by blade', t.t2]]) { ctx.fillStyle = col; ctx.fillText(txt, kx, H - 10); kx += ctx.measureText(txt).width + 12; }
  }
  ctx.textAlign = 'left'; ctx.fillStyle = t.muted; ctx.font = '11px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.fillText('At the ' + T.stn, tx, 6, W - tx - 6);
  ctx.font = '700 22px ui-monospace, Menlo, monospace'; ctx.fillStyle = T.drag ? (wr < 0.5 ? t.bad : t.fuel) : t.ok; ctx.fillText('w/c = ' + wr.toFixed(wr < 10 ? 2 : 1), tx, 26);
  ctx.font = '11.5px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = t.t2; const msg = T.drag ? ['The faster the bucket runs,', 'the less wind it can push against.', 'u can never pass c.'] : ['Moving blades see a stronger', 'wind than the real one: lift', 'grows with w², not with c.']; msg.forEach((m, i) => ctx.fillText(m, tx, 58 + i * 15, W - tx - 6));
}

export default function init(el) {
  const { body } = shell(el, { title: 'The windmill family: drag-type versus lift-type rotors', note: 'Cp(λ) curves are typical empirical bell shapes drawn from textbook ranges (Savonius ≲ 0.25, farm windmill 0.25–0.35, Dutch sail mill 0.2–0.3, 2- and 3-blade 0.45–0.50, H-rotor 0.30–0.40), not measurements of any one machine. Sizes: the swept area of a horizontal-axis rotor is πR²; for the vertical-axis types it is diameter × height (height = 2 × or 1.5 × diameter). The animation shows true speed up to about 24 rpm and slows faster rotors (soft cap near 57 rpm) to avoid the wagon-wheel effect, so compare speeds with the readouts, not the picture.' });
  let sel = TYPES[4], ang = 0, last = performance.now(), tm = 0, info = ['', ''];
  const cvM = h('canvas', { class: 'plot', style: { aspectRatio: '1.05', height: 'auto' } }), cvT = h('canvas', { class: 'plot', style: { aspectRatio: '2.5', height: 'auto', marginTop: '10px' } }), cv = h('canvas', { class: 'plot' });
  const btns = TYPES.map(T => { const b = button(T.name, () => { sel = T; sS.set(1); upd(); }, 'small'); b.prepend(h('i', { style: { width: '10px', height: '10px', borderRadius: '50%', background: `var(${T.col})`, flex: 'none' } })); return b; }), btnRow = h('div', { class: 'btn-row' }, btns);
  const sW = slider({ label: 'Wind speed', min: 3, max: 25, step: 0.5, value: 8, unit: 'm/s', fmt: v => v.toFixed(1), onInput: upd });
  const sA = slider({ label: 'Swept area (same for every type)', min: 1, max: 5000, step: 1, value: 40, unit: 'm²', log: true, fmt: v => v.toFixed(v < 10 ? 1 : 0), onInput: upd });
  const sS = slider({ label: 'Rotor speed relative to its best  (λ ÷ λd)', min: 0.15, max: 1.7, step: 0.01, value: 1, fmt: v => v.toFixed(2) + '×', onInput: upd });
  const ro = { lam: readout('Tip-speed ratio', '', 'cool'), cp: readout('Power coefficient Cp', '', 'good'), pct: readout('Share of Betz limit', '%'), P: readout('Power', '', 'fuel'), rpm: readout('Rotor speed', 'rpm', 'cool'), tip: readout('Tip speed', 'm/s', 'hot'), Q: readout('Shaft torque', '', 'cool'), q0: readout('Starting torque (standing)', '', 'hot') };
  const tbl = h('table', { class: 'data', style: { minWidth: '880px', fontSize: '.82rem' } }, h('thead', {}, h('tr', {}, ['Type', 'Best tip-speed ratio', 'Solidity', 'Cp max', 'Starting torque', 'Noise', 'Typical use', 'Why that shape'].map(x => h('th', {}, x)))),
    h('tbody', {}, TYPES.map(T => h('tr', { style: { cursor: 'pointer' }, onclick: () => { sel = T; sS.set(1); upd(); } }, h('td', {}, h('strong', { style: { color: `var(${T.col})` } }, T.name)), h('td', { class: 'num' }, String(T.lamD)), h('td', {}, T.sol), h('td', {}, T.cps), h('td', {}, T.start), h('td', {}, T.noise), h('td', {}, T.use), h('td', { style: { minWidth: '280px' } }, T.why)))));
  body.append(btnRow, h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, h('div', {}, cvM, cvT), cv), h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sW.el, sA.el, sS.el), h('div', { class: 'readouts', style: { marginTop: 0 } }, ...Object.values(ro).map(r => r.el))), h('div', { class: 'table-wrap' }, tbl));
  const p = new Plot(cv, { xmin: 0.1, xmax: 20, ymin: -0.1, ymax: 0.65, xlog: true, xlabel: 'tip-speed ratio λ  (log scale)', ylabel: 'power coefficient Cp', aspect: 0.82, title: 'Cp(λ) of each type' });
  let S = { lam: 7.5, R: 3, v: 8, T: sel };
  function upd() {
    const T = sel, v = sW.get(), A = sA.get(), x = sS.get(), lam = T.lamD * x, cp = cpOf(T, lam), R = T.hr ? Math.sqrt(A / T.hr) / 2 : Math.sqrt(A / Math.PI), P = 0.5 * RHO * A * v ** 3 * cp, om = lam * v / R;
    S = { lam, R, v, T }; btns.forEach((b, i) => b.classList.toggle('on', TYPES[i] === T)); [...tbl.tBodies[0].rows].forEach((r, i) => [...r.cells].forEach(c => { c.style.background = TYPES[i] === T ? 'color-mix(in srgb, var(--air) 14%, transparent)' : ''; }));
    ro.lam.set(lam.toFixed(lam < 2 ? 2 : 1)); ro.cp.set(cp.toFixed(3), cp < 0 ? 'bad' : 'good'); ro.pct.set((cp / BETZ * 100).toFixed(0)); ro.P.set(fmtW(P), P < 0 ? 'bad' : 'fuel'); ro.rpm.set((om * 60 / TAU).toFixed(om * 9.55 < 10 ? 1 : 0));
    ro.tip.set((lam * v).toFixed(0), lam * v > 80 ? 'bad' : 'hot'); ro.Q.set(om > 0 ? fmtQ(P / om) : '–'); const Q0 = T.q0 * T.cp / T.lamD * 0.5 * RHO * v * v * A * R; ro.q0.set(T.q0 < 0.005 ? '≈ 0' : fmtQ(Q0), T.q0 >= 0.5 ? 'good' : T.q0 > 0.01 ? 'hot' : 'bad');
    const rpm = (om * 60 / TAU).toFixed(om * 9.55 < 10 ? 1 : 0); info = [`λ = ${lam.toFixed(lam < 2 ? 2 : 1)}   ${rpm} rpm`, om > 1.25 * slowRot(om) ? `animation slowed ×${(om / slowRot(om)).toFixed(om > 10 * slowRot(om) ? 0 : 1)}` : ''];
    drawPlot();
  }
  function drawPlot() {
    const T = S.T, c = p.begin().col; p.axes(); p.hline(0, { color: c.muted, dash: [], alpha: 0.7, width: 1 }); p.hline(BETZ, { color: c.bad, label: 'Betz limit 0.593', align: 'right' });
    p.hline(0.2, { color: c.muted, dash: [2, 4], alpha: 0.8 }); p.text(0.105, 0.222, 'drag-type limit ≈ 0.2', { color: c.muted, size: 11 });
    const colOf = X => cssVar(X.col);
    for (const X of TYPES) if (X !== T) p.fn(l => cpOf(X, l), 0.1, 20, { color: colOf(X), width: 1.7, alpha: 0.6 }, 240);
    p.fn(l => cpOf(T, l), 0.1, 20, { color: colOf(T), width: 4 }, 240);
    p.dot(S.lam, cpOf(T, S.lam), { color: colOf(T), r: 6 }); p.vline(T.lamD, { color: colOf(T), alpha: 0.5, dash: [3, 4] });
    p.text(T.lamD, T.cp + 0.025, T.name, { color: colOf(T), align: 'center', size: 12, base: 'bottom' });
  }
  const mctx = cvM.getContext('2d'), tctx = cvT.getContext('2d'), vis = whenVisible(cvM, () => {}), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fit = (cvs, ctx) => { const w = cvs.clientWidth, hh = cvs.clientHeight, d = Math.min(2, devicePixelRatio || 1); if (!w || !hh) return null; if (cvs.width !== Math.round(w * d) || cvs.height !== Math.round(hh * d)) { cvs.width = Math.round(w * d); cvs.height = Math.round(hh * d); } ctx.setTransform(d, 0, 0, d, 0, 0); return [w, hh]; };
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.04, (now - last) / 1000); last = now; if (!vis()) return;
    const om = S.lam * S.v / S.R; if (!still) { ang += slowRot(om) * dt; tm += dt; }
    const t = theme(), m = fit(cvM, mctx);
    if (m) { const [w, hh] = m; mctx.fillStyle = t.bg; mctx.fillRect(0, 0, w, hh); DRAW[S.T.id](mctx, w, hh, { ang, t, tm, v: S.v }); mctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'; mctx.fillStyle = t.t2; mctx.textAlign = 'right'; mctx.textBaseline = 'top'; mctx.fillText(info[0], w - 8, 8); mctx.font = '11px ui-sans-serif, system-ui, sans-serif'; mctx.fillStyle = t.muted; mctx.fillText(info[1], w - 8, 25); }
    const q = fit(cvT, tctx); if (q) { tctx.fillStyle = t.bg; tctx.fillRect(0, 0, q[0], q[1]); drawTri(tctx, q[0], q[1], S.T, S.lam, t); }
  }
  p.onDraw(drawPlot); upd(); requestAnimationFrame(frame);
}
