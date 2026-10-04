#!/usr/bin/env python3
"""Build data/steam-tables.json for js/steam.js (the Rankine-plant widget).

Source: IAPWS-IF97 through the `iapws` package (pip install iapws).  Units: p in MPa, T in degC,
h in kJ/kg, s in kJ/(kg K), v in m^3/kg.

  sat   saturation properties on a log pressure grid, triple point (0.6 kPa) .. the critical point (22.064 MPa)
  grid  h(p, s) and T(p, s) on a (ln p, s) grid, 5 kPa .. 30 MPa.  The grid covers liquid, wet steam,
        vapour and the supercritical fluid in one smooth surface, so the browser can do isentropic
        expansion by a plain bilinear lookup (h2s = h(p2, s1)) and invert for T or h by bisection.

Run:  python3 tools/build-steam-tables.py        (about 20 s, writes ~110 KB)
"""
import json, math, os, sys
from iapws import IAPWS97

P_MIN, P_MAX, P_CRIT = 0.005, 30.0, 22.064      # P_MIN: lowest pressure of the (p, s) grid
P_TRIPLE = 0.000612                                # the saturation table runs down to the triple point (for drawing the dome)
NP = int(sys.argv[1]) if len(sys.argv) > 1 else 88      # pressure rows of the (p, s) grid
S0, DS = 0.1, 0.1                                      # entropy grid start / step
T_TOP = 700.0                                          # rows run up to this temperature (degC)


def sat_rows():
    ps = [P_TRIPLE * (20.0 / P_TRIPLE) ** (i / 139) for i in range(140)]      # 0.6 kPa .. 20 MPa, 140 points (log grid)
    ps += [20.5, 21.0, 21.4, 21.7, 21.9, 22.0, P_CRIT]                        # refine toward the critical point
    out = {k: [] for k in ('p', 'T', 'hf', 'hg', 'sf', 'sg', 'vf', 'vg')}
    for p in ps:
        if p >= P_CRIT - 1e-9:
            f = g = IAPWS97(P=P_CRIT * 0.99999, x=0)
            g = IAPWS97(P=P_CRIT * 0.99999, x=1)
            T = 373.946
        else:
            f, g = IAPWS97(P=p, x=0), IAPWS97(P=p, x=1)
            T = f.T - 273.15
        out['p'].append(round(p, 5)); out['T'].append(round(T, 3))
        out['hf'].append(round(f.h, 2)); out['hg'].append(round(g.h, 2))
        out['sf'].append(round(f.s, 5)); out['sg'].append(round(g.s, 5))
        out['vf'].append(float('%.6g' % f.v)); out['vg'].append(float('%.6g' % g.v))
    return out


def grid():
    lnp0, dlnp = math.log(P_MIN), (math.log(P_MAX) - math.log(P_MIN)) / (NP - 1)
    H, T = [], []
    for i in range(NP):
        p = math.exp(lnp0 + i * dlnp)
        smax = IAPWS97(P=p, T=T_TOP + 273.15).s
        n = int(math.ceil((smax - S0) / DS)) + 1
        hr, tr = [], []
        for j in range(n):
            w = IAPWS97(P=p, s=S0 + j * DS)
            hr.append(round(w.h, 1)); tr.append(round(w.T - 273.15, 2))
        H.append(hr); T.append(tr)
    return {'lnp0': round(lnp0, 8), 'dlnp': round(dlnp, 8), 'np': NP, 's0': S0, 'ds': DS, 'h': H, 'T': T}


if __name__ == '__main__':
    d = {'meta': {'source': 'IAPWS-IF97 (python iapws)', 'units': 'p MPa, T degC, h kJ/kg, s kJ/kgK, v m3/kg', 'pc': P_CRIT, 'tc': 373.946},
         'sat': sat_rows(), 'grid': grid()}
    out = os.path.join(os.path.dirname(__file__), '..', 'data', 'steam-tables.json')
    with open(out, 'w') as f:
        json.dump(d, f, separators=(',', ':'))
    print('wrote', os.path.normpath(out), os.path.getsize(out) // 1024, 'KB')
