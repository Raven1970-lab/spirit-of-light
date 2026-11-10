// Procedural point-cloud shapes for Spirit of Light.
// Everything is built as "LED strings": parametric curves sampled into points,
// the way the real Oxford Circus angel installations are wired.

// ---------- seeded random ----------
let seed = 1337;
export function srand(s) { seed = s >>> 0; }
export function rnd() {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const gauss = () => {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const lerp = (a, b, t) => a + (b - a) * t;
const v3 = (x, y, z) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// A "part" is a parametric curve f(t), t in [0,1] -> [x,y,z],
// with a brightness and a density weight. Length is estimated numerically.
class Builder {
  constructor() { this.parts = []; this.halo = 0; }
  curve(f, bright = 1, density = 1, white = 0) {
    let L = 0, p = f(0);
    for (let i = 1; i <= 24; i++) { const q = f(i / 24); L += len(sub(q, p)); p = q; }
    if (L > 1e-4) this.parts.push({ f, L, bright, density, white, halo: this.halo });
  }
  line(a, b, bright, density, white) { this.curve((t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)], bright, density, white); }
  // sample exactly n points over all parts, proportional to length*density
  sample(n, jitter = 0.012) {
    const W = this.parts.reduce((s, p) => s + p.L * p.density, 0);
    const pos = new Float32Array(n * 3), bri = new Float32Array(n), wht = new Float32Array(n);
    const halo = new Float32Array(n);
    let k = 0;
    const counts = this.parts.map((p) => Math.floor((n * p.L * p.density) / W));
    let rem = n - counts.reduce((a, b) => a + b, 0);
    while (rem-- > 0) counts[Math.floor(rnd() * counts.length)]++;
    this.parts.forEach((p, i) => {
      const c = counts[i];
      for (let j = 0; j < c; j++) {
        // even spacing with tiny phase noise reads as an LED string
        const t = c === 1 ? rnd() : Math.min(1, Math.max(0, (j + 0.5 + (rnd() - 0.5) * 0.35) / c));
        const q = p.f(t);
        pos[k * 3] = q[0] + gauss() * jitter;
        pos[k * 3 + 1] = q[1] + gauss() * jitter;
        pos[k * 3 + 2] = q[2] + gauss() * jitter;
        bri[k] = (typeof p.bright === 'function' ? p.bright(t) : p.bright) * (0.75 + rnd() * 0.5);
        wht[k] = p.white;
        halo[k] = p.halo;
        k++;
      }
    });
    return { pos, bri, wht, halo };
  }
}

// ======================================================================
//  THE ANGEL
// ======================================================================
export function buildAngel(n) {
  srand(7);
  const B = new Builder();

  // Proportions follow the Regent Street / Oxford Circus angels:
  // a slender figure with both arms raised, very wide near-horizontal wings
  // made of long stacked feathers, a trapezoid net skirt, and two swags.

  // --- closed ellipsoidal head, with round cross-sections at every angle
  const head = v3(0, 2.72, 0.02), hr = 0.15;
  for (let m = 0; m < 10; m++) {
    const ph = m / 10 * Math.PI * 2;
    B.curve(t => {
      const th = t * Math.PI;
      return [hr * Math.sin(th) * Math.cos(ph), head[1] + hr * 1.35 * Math.cos(th), head[2] + hr * Math.sin(th) * Math.sin(ph)];
    }, 1.15, 1.3, 0.6);
  }
  B.line([0, 2.52, 0], [0, 2.35, 0], 1.1, 1.3, 0.5);

  // --- raised arms: round wire cages, not three parallel planar strokes
  for (const s of [-1, 1]) {
    const sh = v3(0.2 * s, 2.32, 0), el = v3(0.44 * s, 2.95, 0.06), hd = v3(0.39 * s, 3.6, 0.1);
    const arm = (t, ph) => {
      const p = add(add(mul(sh, (1-t)**2), mul(el, 2*t*(1-t))), mul(hd,t*t));
      const r = lerp(0.065,0.035,t);
      return [p[0]+r*Math.cos(ph),p[1],p[2]+r*Math.sin(ph)];
    };
    for(let k=0;k<8;k++) B.curve(t=>arm(t,k/8*Math.PI*2),0.9,1,0.5);
    for(let k=1;k<12;k++) B.curve(t=>arm(k/12,t*Math.PI*2),0.65,0.7,0.4);
    for(let f=0;f<4;f++) B.line([hd[0]+(f-1.5)*0.021,hd[1],hd[2]], [hd[0]+(f-1.5)*0.03,hd[1]+0.12-Math.abs(f-1.5)*0.02,hd[2]+0.01],1,1.2,0.6);
  }

  // --- slender body: torso into a long narrow gown (surface of revolution)
  const bodyTop = 2.35, bodyBot = -0.9;
  const bodyR = (y) => {
    if (y > 2.15) return lerp(0.1, 0.2, (bodyTop - y) / 0.2);   // shoulders
    if (y > 1.55) return lerp(0.2, 0.13, (2.15 - y) / 0.6);     // chest → waist
    if (y > 0.5) return lerp(0.13, 0.3, (1.55 - y) / 1.05); // gown
    return lerp(0.3, 0.03, Math.pow((0.5 - y) / (0.5 - bodyBot), 0.8)); // tapering point
  };
  for (let m = 0; m < 16; m++) {
    const th = (m / 16) * Math.PI * 2;
    B.curve((t) => { const y = lerp(bodyTop, bodyBot, t), r = bodyR(y); return [r * Math.cos(th), y, r * 0.6 * Math.sin(th)]; }, 1.15, 1.5, 0.45);
  }
  for (let i = 0; i <= 12; i++) {
    const y = lerp(bodyTop - 0.05, bodyBot, i / 12), r = bodyR(y);
    B.curve((t) => { const th = t * Math.PI * 2; return [r * Math.cos(th), y, r * 0.6 * Math.sin(th)]; }, 0.9, 1, 0.35);
  }
  // drapery: long V lines from the shoulders down the gown
  for (const s of [-1, 1]) B.curve((t) => { const y = lerp(2.2, bodyBot, t); return [s * bodyR(y) * lerp(0.9, 0.2, t), y, bodyR(y) * 0.6]; }, 1.2, 1.4, 0.5);

  // Suspended LED nets, not vertical sheets or rolled ribbons.
  // u follows the suspension span; v crosses its open U-shaped section.
  // Both boundaries share the same anchors, with a deeper catenary belly.
  // The central net runs along the street; side nets spread across it.
  const sling = (A, end, sag, width, depth, br, taper = 1.5, rounded = false) => {
    const dx = end[0] - A[0], dz = end[2] - A[2];
    const length = Math.hypot(dx, dz);
    const nx = dz / length, nz = -dx / length;
    const at = (u, v) => {
      if (rounded) {
        // Two cubic Beziers share exactly the same tangent at the widest
        // point. The mirrored far ends meet horizontally: no lip splice.
        const cubic = (a,b,c,d,t) => a*(1-t)**3+3*b*t*(1-t)**2+3*c*t*t*(1-t)+d*t**3;
        let x,y,z;
        if(u<=0.5) {
          const t=2*u;
          x=cubic(0,0.12,2.05,2.05,t);
          y=cubic(1.55,0.20,-0.95,-1.20,t);
          z=cubic(0.05,0.70,1.80,2.70,t);
        } else {
          const t=2*u-1;
          x=cubic(2.05,2.05,1.0,0,t);
          y=cubic(-1.20,-1.45,-1.65,-1.65,t);
          z=cubic(2.70,3.60,4.30,4.30,t);
        }
        return [x*v,y-1.05*Math.sin(Math.PI*u)*(1-v*v),z];
      }
      const env = Math.sin(Math.PI * u);
      const spread = width * Math.pow(env, taper);
      // Continuous, single-valued surface: no folds or self-intersections.
      return [
        lerp(A[0], end[0], u) + nx * spread * v,
        lerp(A[1], end[1], u) - sag * env - depth * env * (1 - v * v),
        lerp(A[2], end[2], u) + nz * spread * v,
      ];
    };
    // Bright suspension rims, but no pile-up of dozens of strings at the hip.
    for (const v of [-1, 1]) B.curve(u => at(u, v), u => br * (0.45 + 0.8 * Math.sin(Math.PI*u)), 1.6, 0.18);

    const lanes = Math.round(width * 11) + 7;
    const light = (u, v) => br * (0.10 + 0.88 * Math.pow(Math.sin(Math.PI*u), 3) * Math.pow(1-v*v, 0.8));
    for (let j = 1; j < lanes; j++) {
      const v = -1 + 2 * j / lanes;
      // Sparse single suspension strands above; luminous net below.
      const start = j % 4 === 0 ? 0.08 : 0.27;
      B.curve(t => at(lerp(start,1-start,t),v), t => light(lerp(start,1-start,t),v), 0.75, 0.72);
    }
    const ribs = Math.round(length * 5);
    for (let j = 1; j < ribs; j++) {
      const u = j / ribs;
      if (u < 0.24 || u > 0.76) continue;
      B.curve(t => at(u,t*2-1), t => light(u,t*2-1)*0.72, 0.65, 0.75);
    }

  };
  const WAIST = [0, 1.55, 0.05];
  // Restore the original suspended pouch: a continuous open U section
  // running along the street, with one tangent-continuous forward rim.
  // The stronger transverse taper gives inward-curving sides.
  sling(WAIST, [0, -0.55, 5.2], 1.65, 2.05, 1.35, 1, 2.35, true);

  // --- wings: streamlined feathers. Each leaves the shoulder flat, then
  // sweeps up to a tip above the hands. Feathers are tubes with real
  // thickness, layered front to back, and the whole wing cups forward.
  const F = 10;
  for (const s of [-1, 1]) {
    for (let i = 0; i < F; i++) {
      const u = i / (F - 1);
      const root = [s * lerp(0.2, 0.32, u), lerp(2.35, 1.95, u), -0.2 - u * 0.18];
      const span = lerp(8.3, 3.12, Math.pow(u, 0.85));
      const tip = [s * span, 0, 0];
      const dx = tip[0] - root[0];
      // Raised inner shoulder, then nearly horizontal layered flight feathers.
      // All rows wrap the same wing vault instead of radiating as a leaf fan.
      const xy = (t) => {
        const x = lerp(Math.abs(root[0]), span, t);
        const shoulder = 1 - Math.exp(-Math.pow((x-Math.abs(root[0])) / 0.65, 2));
        const y = root[1] + (1.0 - 2.35*u) * shoulder + (0.75 - 0.2*u) * Math.pow(t, 3);
        return [s*x, 2.65 + (y - 2.65) * 0.94];
      };
      const dy = xy(1)[1] - root[1];
      const zc = (t) => root[2] + 0.5 * Math.sin(Math.PI * t) - t * t * lerp(2.0, 1.1, u) + 0.4 * Math.sin(Math.PI * u) - 0.25 * u;
      const W = lerp(0.09, 0.135, u);
      const wid = (t) => W * Math.pow(Math.sin(Math.PI * Math.min(1, 0.05 + t * 0.97)), 0.55);
      const frame = (t) => {
        const p = xy(t), q = xy(Math.min(1, t + 0.01)), r = xy(Math.max(0, t - 0.01));
        const tx = q[0] - r[0], ty = q[1] - r[1], tl = Math.hypot(tx, ty) || 1;
        return { p, n: [-ty / tl, tx / tl], z: zc(t) };
      };
      const tube = (t, phi) => {
        const { p, n, z } = frame(t), w = wid(t);
        return [p[0] + n[0] * w * Math.cos(phi), p[1] + n[1] * w * Math.cos(phi), z + w * 1.1 * Math.sin(phi)];
      };
      const top = i === 0 ? 1.5 : 1.15;
      B.curve((t) => tube(t, 0), top, 1.5, 0.5);
      B.curve((t) => tube(t, Math.PI), 1.05, 1.3, 0.45);
      B.curve((t) => tube(t, Math.PI / 2), 0.6, 0.55, 0.2);
      B.curve((t) => tube(t, -Math.PI / 2), 0.5, 0.45, 0.2);
      const L = Math.hypot(dx, dy), nb = Math.round(L / 0.17);
      for (let b = 1; b < nb; b++) {
        const t0 = b / nb;
        B.line(tube(t0, Math.PI), tube(Math.min(1, t0 + 0.035), 0), 0.55, 0.5, 0.2);
      }
    }
    // covert feathers wrapping the shoulder
    for (let r = 0; r < 3; r++) {
      B.curve((t) => {
        const x = lerp(0.25, 2.2 + r * 0.6, t);
        return [s * x, 2.05 - r * 0.3 + 0.25 * t * t - 0.06 * Math.abs(Math.sin(t * Math.PI * 7)), -0.1 - 0.4 * Math.sin(Math.PI * t) + 0.2 * r];
      }, 1.0, 1.2, 0.4);
    }
  }

  // --- side swags: open hammock sections, pinched at both anchors
  for (const s of [-1, 1]) sling(WAIST, [7.6 * s, 0.75, 0.6], 1.2, 0.95, 0.95, 1);

  // --- the wires it hangs from (dim)
  B.curve((t) => [lerp(-13, 13, t), 5.6 - 0.9 * Math.sin(Math.PI * t), -0.3], 0.28, 0.35, 0);
  B.line([0, 4.75, -0.25], [0, 3.75, -0.05], 0.3, 0.6, 0);
  for (const s of [-1, 1]) {
    B.line([7.6 * s, 0.75, 0.6], [10.5 * s, 4.6, 0.6], 0.25, 0.4, 0);
    B.line([7.6 * s, 3.4, -1.8], [10.5 * s, 5.0, -0.3], 0.25, 0.4, 0);

  }

  // Reference rigging: overhead span, centre hanger, diagonal stays,
  // and short wing-tip drops. Keep them fine enough to read as cables.
  B.curve(t=>[0,5.25+0.3*(2*t-1)**2,lerp(-8,8,t)],0.42,0.48,0.6);
  B.line([0,5.25,0],[0,2.92,0],0.45,0.55,0.6);
  for(const side of [-1,1]) {
    B.line([side*0.38,2.3,-0.2],[side*10.5,5.5,-2.5],0.38,0.55,0.55);
    B.line([side*8.3,4.0,-2.2],[side*10.5,5.5,-2.5],0.48,0.7,0.6);
    B.line([side*7.6,0.75,0.6],[side*10.5,5.5,-2.5],0.38,0.5,0.55);
  }

  // 97% structure, 3% soft haze hugging the structure
  const ns = Math.floor(n * 0.97);
  const S = B.sample(ns);
  const pos = new Float32Array(n * 3), bri = new Float32Array(n), wht = new Float32Array(n);
  pos.set(S.pos); bri.set(S.bri); wht.set(S.wht);
  for (let i = ns; i < n; i++) {
    const j = Math.floor(rnd() * ns);
    pos[i * 3] = S.pos[j * 3] + gauss() * 0.055;
    pos[i * 3 + 1] = S.pos[j * 3 + 1] + gauss() * 0.055;
    pos[i * 3 + 2] = S.pos[j * 3 + 2] + gauss() * 0.055;
    bri[i] = 0.08 + rnd() * 0.1;
    wht[i] = 0;
  }
  return { pos, bri, wht };
}

// ======================================================================
//  OXFORD CIRCUS — the cross of Oxford Street (E–W) and Regent Street (N–S)
// ======================================================================
export function buildCircus(n, angelPos) {
  srand(21);
  const B = new Builder();
  const solids = [];
  const solidQuad = (a,b,c,d) => solids.push(...a,...b,...c,...a,...c,...d);
  const G = -2.6;            // ground height
  const EXT = 15;            // half extent
  const ow = 1.25, rw = 1.1; // street half widths (Oxford, Regent)
  const pave = 0.45;         // pavement width
  const R = 3.3;             // radius of the circus kerb, centred on the junction

  // kerbs and building lines, four quadrants; the corners are concave arcs
  // centred on the junction, like the real circus facades
  const arc = (ax, az, rc, y, sx, sz) => {
    const a0 = Math.asin(az / rc), a1 = Math.acos(ax / rc);
    return (t) => { const a = lerp(a0, a1, t); return [sx * rc * Math.cos(a), y, sz * rc * Math.sin(a)]; };
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (const [off, br] of [[0, 0.9], [pave, 0.55]]) {
      const ax = rw + off, az = ow + off, rc = R + off;
      B.line([sx * Math.sqrt(rc * rc - az * az), G, sz * az], [sx * EXT, G, sz * az], br, 1.0, 0.3);
      B.line([sx * ax, G, sz * Math.sqrt(rc * rc - ax * ax)], [sx * ax, G, sz * EXT], br, 1.0, 0.3);
      B.curve(arc(ax, az, rc, G, sx, sz), br * 1.2, 1.4, 0.4);
    }
  }

  // Architectural vocabulary from the listed Regent Street quadrants:
  // shop arcades, giant pilasters, cornices, balconies and mansard dormers.
  // Local axes are mapped to straight or curved street frontages.
  const facade = (at, w, h, kind='classical') => {
    // Closed wall and mansard volumes sit just behind the LED outlines.
    // Subdivision also follows the curved Oxford Circus frontages.
    const steps=Math.max(3,Math.ceil(w/.35)), d=1.15;
    for(let i=0;i<steps;i++){
      const u=w*i/steps,v=w*(i+1)/steps;
      solidQuad(at(u,0,.035),at(v,0,.035),at(v,h,.035),at(u,h,.035));
      solidQuad(at(u,0,d),at(u,h,d),at(v,h,d),at(v,0,d));
      solidQuad(at(u,h,0),at(v,h,0),at(v,h+.65,.42),at(u,h+.65,.42));
      solidQuad(at(u,h+.65,.42),at(v,h+.65,.42),at(v,h+.65,.75),at(u,h+.65,.75));
      solidQuad(at(u,h+.65,.75),at(v,h+.65,.75),at(v,h,d),at(u,h,d));
    }
    for(const u of [0,w]){
      solidQuad(at(u,0,.035),at(u,h,.035),at(u,h,d),at(u,0,d));
      solidQuad(at(u,h,0),at(u,h+.65,.42),at(u,h+.65,.75),at(u,h,d));
      // Recessed side windows and floor bands make depth legible in orbit.
      for(const yy of [.78,h-.35,h]) B.line(at(u,yy,0),at(u,yy,d),.45,.6,.5);
      for(const dd of [.26,.7])for(let yy=1.05;yy<h-.45;yy+=.55){
        B.line(at(u,yy,dd),at(u,yy+.32,dd),.5,.7,.5);
        B.line(at(u,yy+.32,dd),at(u,yy+.32,dd+.2),.5,.7,.5);
        B.line(at(u,yy+.32,dd+.2),at(u,yy,dd+.2),.5,.7,.5);
      }
    }

    const line=(a,b,br=.55,d=.7)=>B.line(at(...a),at(...b),br,d,.55);
    const rect=(x,y,ww,hh,depth=0,br=.55)=>{
      const c=[[x,y,depth],[x+ww,y,depth],[x+ww,y+hh,depth],[x,y+hh,depth]];
      for(let i=0;i<4;i++)line(c[i],c[(i+1)%4],br,.7);
    };
    const arch=(x,y,ww,hh)=>{
      line([x,y,0],[x,y+hh-ww/2,0],.8);
      line([x+ww,y,0],[x+ww,y+hh-ww/2,0],.8);
      B.curve(t=>at(x+ww/2+ww/2*Math.cos(Math.PI*t),y+hh-ww/2+ww/2*Math.sin(Math.PI*t),0),.85,.85,.7);
      line([x+ww/2,y,0],[x+ww/2,y+hh,0],.45,.5);
    };
    const bays=Math.max(3,Math.round(w/.48)), step=w/bays;
    // Back elevation keeps the model readable from both sides of the street.
    for(const yy of [.78,h-.35,h]) line([0,yy,1.17],[w,yy,1.17],.38,.5);
    for(let j=0;j<bays;j++)for(let yy=1.03;yy<h-.4;yy+=.55){
      rect(j*step+.12,yy,step-.24,.32,1.17,.32);
    }

    // Recessed shopfronts with a continuous fascia and stone piers.
    for(let j=0;j<bays;j++){
      const x=j*step+.07, ww=step-.14;
      if(kind==='apple') { if(j%2===0)arch(x,.08,step*1.75,1.18); }
      else arch(x,.06,ww,.67);
      if(kind==='hamleys'){
        line([x,.72,-.02],[x,.58,-.22],.9);
        line([x,.58,-.22],[x+ww,.58,-.22],1.1,1);
        line([x+ww,.58,-.22],[x+ww,.72,-.02],.9);
      }
    }
    const base=kind==='apple'?1.4:.94;
    for(const y of [.78,base,h-.35,h,h+.08])
      line([0,y,-.04],[w,y,-.04],y===h?.95:.5,.9);
    // Tall windows have real jambs, mullions and alternating pediments.
    for(let y=base+.12;y<h-.45;y+=.55)for(let j=0;j<bays;j++){
      const x=j*step+.12,ww=step-.24;
      rect(x,y,ww,.34,-.025,.58);
      line([x+ww/2,y,-.04],[x+ww/2,y+.34,-.04],.35,.45);
      line([x,y+.18,-.04],[x+ww,y+.18,-.04],.3,.4);
      if(y<base+.7){
        if(j%2===0){line([x-.04,y+.4,-.06],[x+ww/2,y+.5,-.06],.6);line([x+ww/2,y+.5,-.06],[x+ww+.04,y+.4,-.06],.6);}
        else B.curve(t=>at(x+ww/2+(ww/2+.04)*Math.cos(Math.PI*t),y+.4+.10*Math.sin(Math.PI*t),-.06),.6,.6,.5);
      }
    }
    for(let j=0;j<=bays;j++){
      const x=j*step;
      // Double lines form stone pilasters; capitals and bases read in 3D.
      for(const off of [-.025,.025])line([x+off,.82,-.05],[x+off,h-.36,-.05],.52,.65);
      rect(x-.06,h-.36,.12,.08,-.07,.7);
      if(j%3===1){
        line([x-.17,base+.05,-.15],[x+.17,base+.05,-.15],.7);
        for(let k=0;k<5;k++)line([x-.17+k*.085,base-.1,-.15],[x-.17+k*.085,base+.05,-.15],.4,.5);
      }
    }
    // Mansard silhouette with recessed ridge, dormer windows and chimney pots.
    for(const depth of [0,1.15])line([0,h,depth],[w,h,depth],.65,.8);
    line([0,h+.65,.42],[w,h+.65,.42],.7,.85);
    line([0,h+.65,.75],[w,h+.65,.75],.65,.85);
    for(const x of [0,w]){
      line([x,h,0],[x,h+.65,.42],.65);
      line([x,h+.65,.42],[x,h+.65,.75],.35);
      line([x,h+.65,.75],[x,h,1.15],.65);
    }
    for(let j=0;j<bays;j+=2){
      const x=(j+.5)*step;
      rect(x-.1,h+.14,.2,.24,.12,.7);
      line([x-.14,h+.38,.12],[x,h+.52,.18],.75);
      line([x,h+.52,.18],[x+.14,h+.38,.12],.75);
    }
    for(const x of [.18,w-.18]){
      rect(x-.06,h+.65,.12,.3,.65,.5);
      line([x-.08,h+.95,.65],[x+.08,h+.95,.65],.65);
    }
    // Complete volumetric perimeter, equally legible from either side.
    for(const z of [0,1.15]) {
      line([0,0,z],[w,0,z],.7,.85);
      for(const x of [0,w])line([x,0,z],[x,h,z],.8,.95);
    }
    for(const x of [0,w])for(const y of [0,h])line([x,y,0],[x,y,1.15],.8,.95);
  };
  const rectBuilding=(axis,start,end,side,offset,h,kind)=>{
    const w=end-start;
    const at=axis==='x' ? (u,y,d)=>[start+u,G+y,side*(offset+d)] : (u,y,d)=>[side*(offset+d),G+y,start+u];
    facade(at,w,h,kind);
  };
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const bx=rw+pave,bz=ow+pave;
    // Cohesive terraces replace randomly sized boxes. Gaps are side streets.
    const spans=[[3.45,5.5],[5.62,8.1],[8.22,10.55],[10.7,13.15],[13.28,15]];
    spans.forEach(([a,b],i)=>{
      rectBuilding('x',sx<0?-b:a,sx<0?-a:b,sz,bz,2.65+(i%3)*.18,'classical');
      if(!(sx===1&&sz===1&&i===1))
        rectBuilding('z',sz<0?-b:a,sz<0?-a:b,sx,bx,2.65+(i%2)*.2,
          sx===-1&&sz===1&&i===1?'apple':sx===1&&sz===1&&i===3?'hamleys':'classical');
    });
    const r=R+pave,a0=Math.asin(bz/r),a1=Math.acos(bx/r),w=r*(a1-a0);
    facade((u,y,d)=>{const a=a0+u/r;return[sx*(r+d)*Math.cos(a),G+y,sz*(r+d)*Math.sin(a)];},w,3.05,'classical');
  }

  // Great Marlborough Street and Liberty: an inset Tudor frontage, not
  // a generic Regent Street stone block. Dimensions are an artistic scale.
  for(const z of [6.0,6.65])B.line([rw+pave,G,z],[7.8,G,z],.55,.8,.4);
  {
    const x0=2.05,z0=6.8,w=4.5,h=2.65,depth=1.65;
    const T=(x,y,z)=>[x0+x,G+y,z0+z];
    solidQuad(T(0,0,.035),T(w,0,.035),T(w,h,.035),T(0,h,.035));
    solidQuad(T(0,0,depth),T(0,h,depth),T(w,h,depth),T(w,0,depth));
    for(const x of [0,w])solidQuad(T(x,0,0),T(x,h,0),T(x,h,depth),T(x,0,depth));
    const L=(a,b,br=.7)=>B.line([x0+a[0],G+a[1],z0+a[2]],[x0+b[0],G+b[1],z0+b[2]],br,.9,.45);
    for(const y of [0,.7,1.35,2.0,h])L([0,y,0],[w,y,0],.9);
    for(let x=0;x<=w+.01;x+=.3)L([x,.7,0],[x,h,0],.75);
    for(let x=.1;x<w;x+=.6)for(const y of [.82,1.48,2.1]){
      for(const dx of [0,.18,.36])L([x+dx,y,-.035],[x+dx,y+.38,-.035],.45);
      L([x,y,-.035],[x+.36,y,-.035],.6);L([x,y+.38,-.035],[x+.36,y+.38,-.035],.6);
    }
    for(let j=0;j<4;j++){
      const a=j*w/4,b=(j+1)*w/4,c=(a+b)/2,peak=h+.85+(j%2)*.18;
      solidQuad(T(a,h,0),T(c,peak,0),T(c,peak,depth),T(a,h,depth));
      solidQuad(T(c,peak,0),T(b,h,0),T(b,h,depth),T(c,peak,depth));
      solidQuad(T(a,h,.035),T(b,h,.035),T(c,peak,.035),T(c,peak,.035));
      L([a,h,0],[c,peak,0],1.05);L([c,peak,0],[b,h,0],1.05);
      L([c,h,0],[c,peak,0],.8);L([a,h,0],[b,h,0],.85);
      // Rear gable, roof ridge and both eaves form a triangular prism.
      L([a,h,depth],[c,peak,depth],1.0);
      L([c,peak,depth],[b,h,depth],1.0);
      L([a,h,depth],[b,h,depth],.9);
      L([c,peak,0],[c,peak,depth],1.0);
      // Rear wall base and floor bands connect each gabled bay.
      for(const yy of [0,.7,1.35,2.0])L([a,yy,depth],[b,yy,depth],.6);
      solidQuad(T(a,h,depth),T(c,peak,depth),T(b,h,depth),T(b,h,depth));
      for(const k of [.25,.5,.75]){const x=lerp(a,b,k);L([x,h,0],[x,h+.85*(1-Math.abs(2*k-1)),0],.6);}
      for(const y of [.7,1.35]){L([a,y,0],[b,y+.65,0],.7);L([b,y,0],[a,y+.65,0],.7);}
      for(const xx of [c-.08,c+.08])L([xx,peak-.1,depth*.7],[xx,peak+.5,depth*.7],.7);
      L([c-.15,peak+.5,depth*.7],[c+.15,peak+.5,depth*.7],.85);
    }
    // Draw shared corners once: complete front/back verticals and depth
    // edges at the base and eaves, including the two exposed end walls.
    for(let j=0;j<=4;j++) {
      const x=j*w/4;
      for(const z of [0,depth])L([x,0,z],[x,h,z],.95);
      for(const yy of [0,h])L([x,yy,0],[x,yy,depth],.95);
    }
    // Clock bridge over the pedestrian passage alongside the Tudor block.
    L([-.65,1.5,0],[0,1.5,0],.9);L([-.65,2.25,0],[0,2.25,0],.8);
    for(const x of [-.65,0])L([x,1.5,0],[x,2.25,0],.8);
    B.curve(t=>[x0-.325+.17*Math.cos(t*6.283),G+1.87+.17*Math.sin(t*6.283),z0-.03],1,1,.8);
    L([-.325,1.87,-.04],[-.325,2.01,-.04],1);L([-.325,1.87,-.04],[-.23,1.87,-.04],1);
  }

  // Pavement lanterns, bollards and signals anchor the buildings to a street.
  for(const axis of ['x','z'])for(const side of [-1,1])for(const t of [-12,-9,-6,6,9,12]){
    const at=(u,y)=>axis==='x'?[t+u,G+y,side*(ow+.22)]:[side*(rw+.22),G+y,t+u];
    B.line(at(0,0),at(0,1.48),.6,.7,.5);
    B.line(at(-.16,1.36),at(.16,1.36),.7,.8,.5);
    for(const dx of [-.16,.16]){
      B.curve(a=>at(dx+.07*Math.cos(a*6.283),1.46+.10*Math.sin(a*6.283)),1.15,1.1,.8);
    }
    B.line(at(.28,0),at(.28,.28),.5,.7,.5);
  }
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*1.7,z=sz*2.0;
    B.line([x,G,z],[x,G+1.1,z],.55,.8,.4);
    for(const y of [.83,.94,1.05])B.curve(t=>[x+.045*Math.cos(t*6.283),G+y+.045*Math.sin(t*6.283),z],.85,.8,.5);
  }

  // road markings: centre dashes and the diagonal "X" crossing at the circus
  for (let x = -EXT; x < EXT; x += 0.9) if (Math.abs(x) > R + 0.6) B.line([x, G, 0], [x + 0.45, G, 0], 0.5, 1, 0.6);
  for (let z = -EXT; z < EXT; z += 0.9) if (Math.abs(z) > R + 0.6) B.line([0, G, z], [0, G, z + 0.45], 0.5, 1, 0.6);
  for (const d of [-1, 1]) {
    for (let t = -2.9; t <= 2.9; t += 0.32) {
      // zebra stripes perpendicular to each diagonal
      const cx = t * 0.707, cz = t * 0.707 * d;
      B.line([cx - 0.3 * 0.707 * d, G, cz + 0.3 * 0.707], [cx + 0.3 * 0.707 * d, G, cz - 0.3 * 0.707], 0.85, 1.6, 0.8);
    }
  }

  // Oxford Street lights: festoons across the street with hanging drops
  B.halo = 1;
  const H = G + 2.6;
  for (let x = -EXT + 0.6; x < EXT; x += 1.35) {
    if (Math.abs(x) < R + 1) continue;
    B.curve((t) => [x, H - 0.45 * Math.sin(Math.PI * t), lerp(-ow - pave, ow + pave, t)], 1.25, 1.6, 0.6);
    for (let k = 1; k < 7; k++) {
      const t = k / 7, z = lerp(-ow - pave, ow + pave, t), y = H - 0.45 * Math.sin(Math.PI * t);
      B.line([x, y, z], [x, y - 0.35 - 0.2 * Math.sin(Math.PI * t), z], 1.1, 1.8, 0.7);
    }
  }

  B.halo = 0;

  // All Souls, Langham Place: round colonnaded portico and needle spire,
  // closing the north end of Regent Street
  {
    const cx = 0, cz = -13.4;
    const ring = (r, y, br, d) => B.curve((t) => [cx + r * Math.cos(t * 6.283), y, cz + r * Math.sin(t * 6.283)], br, d, 0.5);
    for (let c = 0; c < 12; c++) {
      const a = (c / 12) * 6.283;
      B.line([cx + 0.75 * Math.cos(a), G, cz + 0.75 * Math.sin(a)], [cx + 0.75 * Math.cos(a), G + 1.25, cz + 0.75 * Math.sin(a)], 0.8, 1.2, 0.5);
      B.line([cx + 0.48 * Math.cos(a), G + 1.45, cz + 0.48 * Math.sin(a)], [cx + 0.48 * Math.cos(a), G + 2.15, cz + 0.48 * Math.sin(a)], 0.8, 1.2, 0.5);
      B.line([cx + 0.48 * Math.cos(a), G + 2.25, cz + 0.48 * Math.sin(a)], [cx, G + 5.4, cz], 0.9, 1.3, 0.6);
    }
    for (const [r, y] of [[0.75, G], [0.75, G + 1.25], [0.8, G + 1.38], [0.48, G + 1.45], [0.48, G + 2.15], [0.5, G + 2.25]]) ring(r, y, 0.9, 1.4);
    for (let k = 1; k < 8; k++) ring(0.48 * (1 - k / 8), G + 2.25 + 3.15 * (k / 8), 0.6, 0.8);
    B.line([cx - 1.6, G + 2.4, cz - 0.8], [cx + 1.6, G + 2.4, cz - 0.8], 0.4, 0.6, 0.2);
  }

  // All Souls' church body behind the circular portico, with pediment.
  {
    const z=-14.15;
    facade((u,y,d)=>[-1.35+u,G+y,z-d],2.7,2.3,'classical');
    B.line([-1.35,G+2.3,z],[0,G+3.1,z],.9,1,.6);
    B.line([0,G+3.1,z],[1.35,G+2.3,z],.9,1,.6);
    for(const x of [-1.35,1.35])B.line([x,G+2.3,z],[x,G+2.3,-16],.55,.7,.5);
    B.line([0,G+3.1,z],[0,G+3.1,-16],.55,.7,.5);
  }

  const nStruct = Math.floor(n * 0.73);
  const S = B.sample(nStruct, 0.008);
  const pos = new Float32Array(n * 3), bri = new Float32Array(n), wht = new Float32Array(n);
  const spec = new Float32Array(n), move = new Float32Array(n * 3), halo = new Float32Array(n);
  halo.set(S.halo);
  pos.set(S.pos); bri.set(S.bri); wht.set(S.wht);
  // Architectural lines need legibility against the moving lamps and buses.
  for(let i=0;i<nStruct;i++) bri[i] *= 1.8;
  let k = nStruct;
  const put = (p, b, w, sp, mv) => {
    if (k >= n) return;
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    bri[k] = b; wht[k] = w; spec[k] = sp; halo[k] = 1;
    if (mv) { move[k * 3] = mv[0]; move[k * 3 + 1] = mv[1]; move[k * 3 + 2] = mv[2]; }
    k++;
  };
  const emit = (builder, count, map, b, w, sp, mv) => {
    const T = builder.sample(count, 0.004);
    for (let i = 0; i < count; i++) put(map([T.pos[i * 3], T.pos[i * 3 + 1], T.pos[i * 3 + 2]]), b * T.bri[i], T.wht[i], sp, mv);
  };

  // Underground roundels on the four corners (red ring, blue bar)
  const nRound = Math.floor(n * 0.022 / 4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const rr = R + pave * 0.5, a = Math.atan2(sz, sx);
    const cxp = Math.cos(a) * rr, czp = Math.sin(a) * rr, ty = -Math.sin(a), tz = Math.cos(a);
    const at = (lx, ly) => [cxp + ty * lx, G + 1.15 + ly, czp + tz * lx];
    const ringB = new Builder(), barB = new Builder(), postB = new Builder();
    for (const r of [0.2, 0.235, 0.27]) ringB.curve((t) => [r * Math.cos(t * 6.283), r * Math.sin(t * 6.283), 0], 1.6, 1, 0);
    for (let y = -0.06; y <= 0.061; y += 0.03) barB.line([-0.36, y, 0], [0.36, y, 0], 1.5, 1, 0);
    postB.line([0, -1.15, 0], [0, -0.28, 0], 0.6, 1, 0.5);
    const map = (p) => at(p[0], p[1]);
    emit(ringB, Math.floor(nRound * 0.55), map, 1.4, 0, 1);
    emit(barB, Math.floor(nRound * 0.35), map, 1.4, 0, 2);
    emit(postB, nRound - Math.floor(nRound * 0.55) - Math.floor(nRound * 0.35), map, 0.6, 0.6, 0);
  }

  // New Routemaster double-deckers: red bodies, lit decks, the swooping
  // staircase glazing at the corners. They drive (on the left) along both streets.
  const busShape = () => {
    const bb = new Builder(), L = 0.62, Wd = 0.17, y0 = 0.07, y1 = 0.7;
    const box = (yy) => { for (const [a, c] of [[[-L, -Wd], [L, -Wd]], [[L, -Wd], [L, Wd]], [[L, Wd], [-L, Wd]], [[-L, Wd], [-L, -Wd]]]) bb.line([a[0], yy, a[1]], [c[0], yy, c[1]], 1.2, 1, 0); };
    box(y0); box(y1); box(0.38);
    for (const x of [-L, L]) for (const z of [-Wd, Wd]) bb.line([x, y0, z], [x, y1, z], 1.2, 1, 0);
    return bb;
  };
  const glassShape = () => {
    const gb = new Builder(), L = 0.62, Wd = 0.17;
    for (const z of [-Wd, Wd]) {
      for (const y of [0.2, 0.28, 0.48, 0.58]) gb.line([-L + 0.12, y, z], [L - 0.18, y, z], 1, 1, 0.8);
      gb.line([L - 0.15, 0.12, z], [L - 0.02, 0.62, z], 1.3, 1.4, 0.9);   // staircase swoop
      gb.line([-L + 0.02, 0.62, z], [-L + 0.14, 0.12, z], 1.3, 1.4, 0.9);
      for (const x of [-0.38, 0.38]) gb.curve((t) => [x + 0.075 * Math.cos(t * 6.283), 0.075 + 0.075 * Math.sin(t * 6.283), z], 0.6, 1, 0.4);
    }
    gb.line([L, 0.62, -0.1], [L, 0.62, 0.1], 1.4, 1, 1); // destination blind
    return gb;
  };
  const buses = [];
  // Oxford Street: eastbound on the north lane, westbound on the south lane
  for (let i = 0; i < 4; i++) buses.push({ axis: 0, lane: -0.55, dir: 1, phase: i * 7.5 + 1 });
  for (let i = 0; i < 4; i++) buses.push({ axis: 0, lane: 0.55, dir: -1, phase: i * 7.5 + 4.5 });
  // Regent Street: southbound on the east lane, northbound on the west lane
  for (let i = 0; i < 2; i++) buses.push({ axis: 1, lane: 0.5, dir: 1, phase: i * 15 + 3 });
  for (let i = 0; i < 2; i++) buses.push({ axis: 1, lane: -0.5, dir: -1, phase: i * 15 + 10 });
  const nBus = Math.floor((n * 0.13) / buses.length);
  for (const bus of buses) {
    const speed = 0.9 * bus.dir;
    const map = (p) => {
      const k = 1.35, lx = p[0] * bus.dir * k, lz = p[2] * k;
      return bus.axis === 0 ? [lx, G + p[1] * k, bus.lane + lz] : [bus.lane + lz, G + p[1] * k, lx];
    };
    const mv = [speed, bus.axis, bus.phase];
    emit(busShape(), Math.floor(nBus * 0.55), map, 2.0, 0, 1, mv);
    emit(glassShape(), nBus - Math.floor(nBus * 0.55), map, 1.4, 0.8, 0, mv);
  }

  // Regent Street angels: miniature copies hanging over the road
  const slots = [];
  for (const sz of [-1, 1]) for (let z = R + 1.8; z < EXT - 2; z += 3.1) slots.push(sz * z);
  const start = k, aN = angelPos.length / 3, per = Math.floor((n - start) / slots.length);
  const sc = 0.18;
  slots.forEach((zc, si) => {
    const cnt = si === slots.length - 1 ? n - k : per;
    for (let j = 0; j < cnt; j++) {
      const a = Math.floor(rnd() * aN);
      put([angelPos[a * 3] * sc, G + 2.7 + angelPos[a * 3 + 1] * sc, zc + angelPos[a * 3 + 2] * sc], 1.15, 0.5, 0);
    }
  });
  const side = rw + pave + 0.1;
  return { pos, bri, wht, spec, move, halo, solids: new Float32Array(solids), ground: G, labels: [
    { key: 'oxford-w', text: 'OXFORD STREET', p: [-9.5, G, ow + pave + 0.2] },
    { key: 'oxford-e', text: 'OXFORD STREET', p: [9.5, G, -ow - pave - 0.2] },
    { key: 'regent-n', text: 'REGENT STREET', p: [rw + pave + 0.2, G, -8] },
    { key: 'regent-s', text: 'REGENT STREET · TO PICCADILLY', p: [-rw - pave - 0.2, G, 9.8] },
    { key: 'circus', text: 'OXFORD CIRCUS', sub: '51.515° N  0.142° W', p: [0, G + 0.02, 0] },
    { key: 'ikea', text: 'OXFORD CIRCUS · NORTH EAST', sub: 'CURVED STONE FRONTAGE', kind: 'shop', p: [6.8, G + 4.6, -5.2] },
    { key: 'allsouls', text: 'ALL SOULS', sub: 'LANGHAM PLACE · NASH, 1824', kind: 'shop', p: [0, G + 5.8, -13.4] },
    { key: 'apple', text: 'APPLE', sub: '235 REGENT ST', kind: 'shop', p: [-side - 1.5, G + 3.2, 6.2] },
    { key: 'liberty', text: 'LIBERTY', sub: 'TUDOR GABLES · GREAT MARLBOROUGH ST', kind: 'shop', p: [4.3, G + 4.1, 7.2] },
    { key: 'hamleys', text: 'HAMLEYS', sub: '188–196 REGENT ST', kind: 'shop', p: [side + 1.5, G + 3.2, 11.6] },
  ] };
}

// ======================================================================
//  SCATTER — a loose drifting cloud
// ======================================================================
export function buildScatter(n) {
  srand(99);
  const pos = new Float32Array(n * 3), bri = new Float32Array(n), wht = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = 5 + Math.pow(rnd(), 0.6) * 15;
    const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    bri[i] = 0.35 + rnd() * 0.5;
    wht[i] = rnd() * 0.4;
  }
  return { pos, bri, wht };
}
