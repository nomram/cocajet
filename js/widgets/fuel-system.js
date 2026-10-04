// Gas fuel metering: how small must the holes be, and does the mixture burn?
import { h, shell, slider, select, readout } from '../ui.js';
import { Plot } from '../plot.js';
import { CJ1, isa, steadyAt, critRatio, flowFn } from '../engine-model.js';

const GAS = { propane: { name: 'Propane vapour', M: 44.1, g: 1.13, lfl: 2.1, ufl: 9.5, LHV: 46.35 }, methane: { name: 'Natural gas', M: 16.04, g: 1.31, lfl: 5, ufl: 15, LHV: 50 }, butane: { name: 'Butane vapour', M: 58.1, g: 1.09, lfl: 1.8, ufl: 8.4, LHV: 45.7 } };

export default function init(el) {
  const { body } = shell(el, { title: 'Fuel metering: the size of the holes that feed the flame', note: 'A gas flows through a small hole at a rate set by its pressure (and becomes choked, i.e. only depends on upstream pressure, when the pressure ratio exceeds ~1.8). So with a regulator you can set the fuel flow with a tiny drilled orifice and a pressure knob, much as a fuel jet in a camping stove. The bars show whether the local mixture is inside the flammable range.' });
  const cv = h('canvas', { class: 'plot' });
  const sel = select({ label: 'Gas', options: Object.entries(GAS).map(([k, v]) => [k, v.name]), value: 'propane', onChange: upd });
  const sN = slider({ label: 'Engine speed to feed', min: 48000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sPr = slider({ label: 'Regulator pressure (gauge)', min: 50, max: 700, step: 10, value: 300, unit: 'kPa', fmt: v => v.toFixed(0), onInput: upd });
  const sH = slider({ label: 'Number of fuel holes (8 lances × …)', min: 8, max: 64, step: 8, value: 8, fmt: v => v.toFixed(0), onInput: upd });
  const ro = { mf: readout('Fuel flow needed', 'g/s', 'fuel'), kg: readout('= per hour', 'kg/h'), A: readout('Total hole area', 'mm²', 'cool'), d: readout('Drill size per hole', 'mm', 'good'), P: readout('Fuel power', 'kW', 'hot'), ch: readout('Flow', '') };
  const mix = h('div', { class: 'callout', style: { margin: '10px 0 0' } });
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sel.el, sN.el, sPr.el, sH.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), mix)));
  const p = new Plot(cv, { xmin: 0, xmax: 20, ymin: 0, ymax: 4, xlabel: 'fuel in the mixture (% by volume)', aspect: 1.9, grid: true, margin: { l: 12, r: 12, t: 20, b: 44 }, title: 'Flammable range (green) and our zones' });
  function upd() {
    const gas = GAS[sel.get()], N = sN.get(), pm = { ...CJ1 }, st = steadyAt(pm, N, isa(0));
    const mfNeed = st.mf * (gas.LHV > 0 ? 46.35 / gas.LHV : 1);
    const P1 = (sPr.get() + 101.325) * 1000, T = 290, R = 8314.46 / gas.M, Cd = 0.8, gm = gas.g;
    const rc = critRatio(gm), pr = 101325 / P1;     // exit to ~atmosphere (the primary zone is at ~190 kPa: use the more realistic liner pressure)
    const Pdown = st.P03 > 0 ? st.P03 * 0.97 : 190000;
    const choked = Pdown / P1 <= rc;
    const flux = Cd * P1 / Math.sqrt(R * T) * flowFn(Math.max(rc, Math.min(0.999, Pdown / P1)), gm);   // kg/(m² s)
    const A = mfNeed / flux * 1e6, d = Math.sqrt(4 * A / (Math.PI * sH.get()));
    ro.mf.set((mfNeed * 1000).toFixed(2)); ro.kg.set((mfNeed * 3600).toFixed(1)); ro.A.set(A.toFixed(2)); ro.d.set(d.toFixed(2)); ro.P.set((mfNeed * gas.LHV * 1000).toFixed(0)); ro.ch.set(Pdown / P1 > 0.98 ? 'NO FLOW (raise P)' : choked ? 'choked' : 'subsonic', Pdown / P1 > 0.98 ? 'bad' : 'cool');
    // mixtures: fuel volume fraction in each zone from phi and AFR (mass AFR → mole fractions)
    const afr = gas === GAS.propane ? 15.6 : gas === GAS.methane ? 17.2 : 15.4, mixF = (phi) => { const nf = phi / afr / gas.M, na = 1 / 28.96; return nf / (nf + na) * 100; };
    const idle = steadyAt(pm, 48000, isa(0));
    const zones = [['primary zone, this speed φ=' + (st.phi / 0.23).toFixed(1), mixF(st.phi / 0.23)], ['whole engine, this speed φ=' + st.phi.toFixed(2), mixF(st.phi)], ['primary zone at idle φ=' + (idle.phi / 0.23).toFixed(1), mixF(idle.phi / 0.23)], ['lance exit (pure gas)', 100]];
    const c = p.begin().col; p.axes();
    const ctx = p.ctx; ctx.fillStyle = c.ok; ctx.globalAlpha = .22; ctx.fillRect(p.X(gas.lfl), p.Y(4), p.X(gas.ufl) - p.X(gas.lfl), p.Y(0) - p.Y(4)); ctx.globalAlpha = 1;
    p.text((gas.lfl + gas.ufl) / 2, 3.7, `flammable ${gas.lfl}–${gas.ufl} %`, { align: 'center', color: c.ok, weight: 800 });
    zones.forEach(([nm, v], i) => { if (v > 20) return; p.vline(v, { color: [c.fire, c.air, c.fuel][i] || c.muted, width: 2 }); p.text(v + 0.2, 0.45 + i * 0.6, nm + `  (${v.toFixed(1)} %)`, { color: c.text, size: 11 }); });
    mix.innerHTML = `<span class="ct">Will it light?</span>The primary zone holds ${mixF(st.phi / 0.23).toFixed(1)} % fuel by volume: ${mixF(st.phi / 0.23) >= gas.lfl && mixF(st.phi / 0.23) <= gas.ufl ? '<b style="color:var(--ok)">inside</b>' : '<b style="color:var(--bad)">outside</b>'} the flammable band (${gas.lfl}–${gas.ufl} %). The whole engine at φ ≈ 0.3 would be <b style="color:var(--bad)">too lean to burn</b>: it only works because the primary zone is isolated.`;
  }
  p.onDraw(upd); upd();
}
