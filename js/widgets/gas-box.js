// Molecules in a box with a movable piston: pressure = wall hits, temperature = motion, compression heats.
import { h, shell, slider, button, readout, legend } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Molecules in a box', badge: 'Simulation',
    note: 'A 2-D toy gas: hard discs bouncing elastically. “Pressure” is the momentum the walls receive per second per length of wall. Compress the piston quickly and watch the molecules speed up: that is why squeezing air heats it.' });
  const cv = h('canvas', { class: 'plot', style: { aspectRatio: '1.9', height: 'auto' } });
  const histCv = h('canvas', { class: 'plot' });
  const W0 = 520, H0 = 260;
  let N = 140, T = 300, pistonX = 520, targetX = 520, adiabatic = true;
  const k0 = 60;                                        // kT = k0*T  (m = 1; 2-D gas: <KE> = kT)
  const sigma = (T) => Math.sqrt(k0 * T);
  let ps = [];
  const seed = () => {
    ps = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * 6.283, v = sigma(T) * Math.sqrt(-2 * Math.log(1 - Math.random()));   // Rayleigh = 2-D Maxwell
      ps.push({ x: 10 + Math.random() * (pistonX - 20), y: 10 + Math.random() * (H0 - 20), vx: Math.cos(a) * v, vy: Math.sin(a) * v });
    }
  };
  let impulse = 0, tWin = 0, Pmeas = 0, hits = 0, hitsRate = 0;
  const ro = { P: readout('Measured pressure', '', 'hot'), Pi: readout('Ideal-gas law  NkT/A', '', 'cool'), Tm: readout('Temperature (from motion)', 'K', 'fuel'), V: readout('Volume (area)', 'px²'), hr: readout('Wall hits', '/s') };

  const sN = slider({ label: 'Number of molecules', min: 40, max: 300, step: 10, value: N, onInput: (v) => { N = v; seed(); } });
  const sT = slider({ label: 'Heat it: temperature', min: 100, max: 1200, step: 10, value: T, unit: 'K', fmt: v => v.toFixed(0), onInput: (v) => { const f = Math.sqrt(v / T); ps.forEach(p => { p.vx *= f; p.vy *= f; }); T = v; } });
  const sV = slider({ label: 'Push the piston (volume)', min: 140, max: 520, step: 1, value: 520, unit: 'px', fmt: v => v.toFixed(0), onInput: (v) => { targetX = v; } });
  const reset = button('Reset', () => { pistonX = targetX = 520; sV.set(520); T = 300; sT.set(300); seed(); impulse = 0; tWin = 0; });
  const hot = button('Slam the piston in', () => { targetX = 150; sV.set(150); }, 'fire small');
  const out = button('Release', () => { targetX = 520; sV.set(520); }, 'small');
  const ctls = h('div', { class: 'ctls' }, sN.el, sT.el, sV.el, h('div', { class: 'btn-row' }, hot, out, reset), h('div', { class: 'readouts' }, ro.P.el, ro.Pi.el, ro.Tm.el, ro.V.el, ro.hr.el));
  body.append(h('div', { class: 'wgrid' }, h('div', {}, cv, h('div', { style: { height: '10px' } }), histCv), ctls));
  seed();

  const hp = new Plot(histCv, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, xlabel: 'molecule speed', ylabel: 'share of molecules', aspect: 3.2, margin: { l: 54, r: 10, t: 10, b: 30 } });
  const ctx = cv.getContext('2d');
  let last = performance.now(), vis = true, kinAvg = k0 * 300;
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(cv);

  function step(dt) {
    // piston moves toward target at a limited speed
    const maxv = 260, dx = targetX - pistonX; let vp = Math.max(-maxv, Math.min(maxv, dx * 6));
    if (Math.abs(dx) < 0.3) vp = 0;
    pistonX += vp * dt;
    for (const p of ps) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < 4) { p.y = 4; p.vy = Math.abs(p.vy); impulse += 2 * Math.abs(p.vy); hits++; }
      if (p.y > H0 - 4) { p.y = H0 - 4; p.vy = -Math.abs(p.vy); impulse += 2 * Math.abs(p.vy); hits++; }
      if (p.x < 4) { p.x = 4; p.vx = Math.abs(p.vx); impulse += 2 * Math.abs(p.vx); hits++; }
      if (p.x > pistonX - 4) { p.x = pistonX - 4; const rel = p.vx - vp; if (rel > 0) { p.vx = p.vx - 2 * rel; impulse += 2 * rel; } hits++; }
    }
    tWin += dt;
  }

  function frame(now) {
    requestAnimationFrame(frame); if (!vis) { last = now; return; }
    let dt = Math.min(0.033, (now - last) / 1000); last = now;
    const sub = 4; for (let i = 0; i < sub; i++) step(dt / sub);
    if (tWin > 0.6) {
      const area = pistonX * H0, perim = 2 * (pistonX + H0);
      Pmeas = impulse / tWin / perim; hitsRate = hits / tWin; impulse = 0; hits = 0; tWin = 0;
      kinAvg = ps.reduce((a, p) => a + 0.5 * (p.vx * p.vx + p.vy * p.vy), 0) / ps.length;     // = kT in these units
      const Tm = kinAvg / (k0);                                                              // m = 1, KE = kT  => T = KE/k0
      ro.P.set(Pmeas.toFixed(2)); ro.Pi.set((ps.length * kinAvg / area).toFixed(2)); ro.Tm.set(Tm.toFixed(0)); ro.V.set(area.toFixed(0)); ro.hr.set(hitsRate.toFixed(0));
      T = Tm; if (Math.abs(sT.get() - T) > 5) sT.set(Math.min(1200, Math.max(100, T)));
    }
    // draw box
    const w = cv.clientWidth, hh = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const sc = w / W0, col = hp.colors();
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc, 0, 0); ctx.clearRect(0, 0, W0, H0 * hh / (H0 * sc) );
    ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W0, H0 + 40);
    ctx.fillStyle = 'rgba(76,201,240,.07)'; ctx.fillRect(0, 0, pistonX, H0);
    ctx.strokeStyle = col.grid2; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W0 - 2, H0 - 2);
    ctx.fillStyle = '#9aa4ad'; ctx.fillRect(pistonX, 0, 8, H0); ctx.fillStyle = '#6e7a86'; ctx.fillRect(pistonX + 8, H0 / 2 - 6, W0, 12);
    for (const p of ps) {
      const sp = Math.hypot(p.vx, p.vy) / (sigma(Math.max(100, T)) * 2.4);
      const t = Math.min(1, sp);
      ctx.fillStyle = `rgb(${Math.round(76 + 179 * t)},${Math.round(201 - 100 * t)},${Math.round(240 - 190 * t)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, 7); ctx.fill();
    }
    drawHist();
  }
  function drawHist() {
    const vmax = sigma(Math.max(T, 600)) * 4.2, nb = 24, bins = new Array(nb).fill(0);
    ps.forEach(p => { const s = Math.hypot(p.vx, p.vy); bins[Math.min(nb - 1, Math.floor(s / vmax * nb))]++; });
    hp.set({ xmax: vmax, ymax: 0.2, xtickFmt: () => '', xlabel: 'molecule speed  →' });
    hp.begin().axes();
    const xs = [], ys = [];
    bins.forEach((b, i) => { xs.push((i + 0.5) / nb * vmax); ys.push(b / ps.length); });
    const c = hp.col, ctx2 = hp.ctx;
    ctx2.fillStyle = c.air; ctx2.globalAlpha = .55;
    bins.forEach((b, i) => { const x0 = hp.X(i / nb * vmax), x1 = hp.X((i + 1) / nb * vmax), y = hp.Y(b / ps.length); ctx2.fillRect(x0 + 1, y, x1 - x0 - 2, hp.Y(0) - y); });
    ctx2.globalAlpha = 1;
    // 2-D Maxwell-Boltzmann (m = 1):  f(v) = (v/kT) exp(-v²/2kT),   <KE> = kT
    const kT = kinAvg, binW = vmax / nb;
    hp.fn((v) => (v / kT) * Math.exp(-v * v / (2 * kT)) * binW, 1, vmax, { color: c.fire, width: 2.2 }, 120);
    hp.legend([[c.air, 'simulation'], [c.fire, 'Maxwell–Boltzmann theory']], { pos: 'tr' });
  }
  requestAnimationFrame(frame);
}
