import * as THREE from 'three';
import { EffectComposer } from '../vendor/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/postprocessing/OutputPass.js';
import { buildAngel, buildCircus, buildScatter, srand, rnd } from './shapes.js?v=38';

const $ = (s) => document.querySelector(s);
const MOBILE = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const N = MOBILE ? 38000 : 72000;

// ---------------------------------------------------------------- palettes
const PALETTES = {
  gold: { name: 'Gold', tint: '#ffbf4a', css: '#ffc864' },
  ice:  { name: 'Ice',  tint: '#79c8ff', css: '#9ad6ff' },
  rose: { name: 'Rose', tint: '#ff3355', css: '#ff6a80' },
};

// ---------------------------------------------------------------- renderer
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);

// ---------------------------------------------------------------- particles
const angel = buildAngel(N);
const circus = buildCircus(N, angel.pos);
const scatter = buildScatter(N);
// Quiet solid architecture under the luminous point layer. Closed volumes
// provide wall/roof shading and occlude the far facade when the map settles.
const buildingGeo=new THREE.BufferGeometry();
buildingGeo.setAttribute('position',new THREE.BufferAttribute(circus.solids,3));
buildingGeo.computeVertexNormals();
const buildingMat=new THREE.MeshLambertMaterial({color:0x493626,emissive:0x090604,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
const buildings=new THREE.Mesh(buildingGeo,buildingMat);buildings.renderOrder=-1;buildings.visible=false;scene.add(buildings);
scene.add(new THREE.AmbientLight(0xc1d0ec,.32));
const keyLight=new THREE.DirectionalLight(0xffdfac,1.25);keyLight.position.set(-8,12,5);scene.add(keyLight);
const fillLight=new THREE.DirectionalLight(0x97b7df,.5);fillLight.position.set(10,6,-10);scene.add(fillLight);

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(angel.pos, 3)); // bounds only
geo.setAttribute('aA', new THREE.BufferAttribute(angel.pos, 3));
geo.setAttribute('aB', new THREE.BufferAttribute(circus.pos, 3));
geo.setAttribute('aC', new THREE.BufferAttribute(scatter.pos, 3));
const bri = new Float32Array(N * 3), wht = new Float32Array(N * 3), rnds = new Float32Array(N * 2);
srand(4242);
for (let i = 0; i < N; i++) {
  bri[i * 3] = angel.bri[i]; bri[i * 3 + 1] = circus.bri[i]; bri[i * 3 + 2] = scatter.bri[i];
  wht[i * 3] = angel.wht[i]; wht[i * 3 + 1] = circus.wht[i]; wht[i * 3 + 2] = scatter.wht[i];
  rnds[i * 2] = rnd(); rnds[i * 2 + 1] = 0.55 + rnd() * 0.9;
}
geo.setAttribute('aBri', new THREE.BufferAttribute(bri, 3));
geo.setAttribute('aWht', new THREE.BufferAttribute(wht, 3));
geo.setAttribute('aRnd', new THREE.BufferAttribute(rnds, 2));
geo.setAttribute('aMapHalo',new THREE.BufferAttribute(circus.halo,1));
geo.setAttribute('aSpec', new THREE.BufferAttribute(circus.spec, 1));
geo.setAttribute('aMove', new THREE.BufferAttribute(circus.move, 3));

// A shuffled rank makes density reduction uniform over the whole shape.
const ranks = Float32Array.from({length:N},(_,i)=>i);
for(let i=N-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[ranks[i],ranks[j]]=[ranks[j],ranks[i]];}
geo.setAttribute('aRank',new THREE.BufferAttribute(ranks,1));
const uniforms = {
  uT: { value: 0 },
  uW: { value: new THREE.Vector3(0, 0, 1) },
  uTint: { value: new THREE.Color(PALETTES.gold.tint) },
  uSize: { value: 0.039 },
  uScale: { value: 1 },
  uPR: { value: PR },
  uLoose: { value: 0 },
  uBrightness: { value: 1.4 },
  uCount: { value: N },
  uSquare: { value: 0 },
};

const mat = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    attribute vec3 aA; attribute vec3 aB; attribute vec3 aC;
    attribute vec3 aBri; attribute vec3 aWht; attribute vec2 aRnd; attribute float aSpec; attribute vec3 aMove;
    attribute float aRank; attribute float aMapHalo;
    uniform float uT, uSize, uScale, uPR, uLoose, uBrightness, uCount, uSquare;
    uniform vec3 uW, uTint;
    varying vec3 vCol; varying float vA; varying float vHalo; varying float vSquareGain;
    void main(){
      float r = aRnd.x;
      // staggered morph: every particle leaves and arrives at its own moment
      vec3 w = clamp(uW * 1.6 - r * 0.6, 0.0, 1.0);
      w = w * w * (3.0 - 2.0 * w);
      float s = w.x + w.y + w.z;
      w = s > 0.01 ? w / s : uW;
      // buses drive along their street while the map is formed
      float busFade = 1.0;
      vec3 B = aB;
      if (abs(aMove.x) > 0.0) {
        float off = mod(aMove.x * uT + aMove.z + 15.0, 30.0) - 15.0;
        if (aMove.y < 0.5) B.x += off; else B.z += off;
        busFade = smoothstep(15.0, 12.5, abs(off));
      }
      vec3 p = aA * w.x + B * w.y + aC * w.z;
      float settled = max(w.x, max(w.y, w.z));
      float travel = 1.0 - settled;
      // flight arcs while morphing, a slow drift in the cloud, a breath when formed
      vec3 n = vec3(
        sin(uT * 0.61 + p.y * 1.7 + r * 41.0),
        sin(uT * 0.53 + p.z * 1.9 + r * 23.0),
        sin(uT * 0.71 + p.x * 1.3 + r * 11.0));
      p += n * (travel * 2.4 + 0.012 + w.z * 0.9 + uLoose * 0.35);
      p.y += travel * travel * 1.5 * sin(r * 6.2831);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float sz = uSize * aRnd.y * (1.0 + w.z * 0.4 + w.y * 0.18);
      float baseSize = max(1.2, sz * uScale * uPR / -mv.z);
      gl_PointSize = mix(baseSize, max(3.2*uPR,baseSize), uSquare);
      vSquareGain = mix(0.12, 0.10, w.y) * pow(baseSize/gl_PointSize,2.0);
      vHalo = w.y * aMapHalo;
      #ifdef HALO_PASS
        gl_PointSize = baseSize * 3.8;
      #endif
      // LEDs: steady glow, a soft twinkle, and a slow cascade running down the strings
      float b = dot(aBri, w);
      float tw = 0.78 + 0.22 * sin(uT * (1.3 + r * 3.7) + r * 60.0);
      float cascade = smoothstep(0.86, 1.0, sin(p.y * 1.4 + p.x * 0.15 - uT * 1.7)) * 0.7 * (1.0 - w.z);
      float spark = step(0.996, fract(r * 91.7 + uT * 0.07)) * 2.0;
      // Distance falloff distinguishes front and rear nets under additive light.
      float depthLight = clamp(exp((19.0 + mv.z) * 0.055), 0.38, 1.18);
      vA = b * (tw + cascade + spark) * mix(1.0, busFade, w.y) * mix(1.0, depthLight, w.x);
      vA *= uBrightness * (1.0 - step(uCount,aRank));
      float white = dot(aWht, w);
      vCol = mix(uTint, vec3(1.0, 0.96, 0.86), clamp(white * 0.75 + cascade * 0.5 + spark * 0.4, 0.0, 1.0));
      // London red and Underground blue, only on the map
      vec3 red = vec3(1.0, 0.12, 0.09), blue = vec3(0.1, 0.28, 1.0);
      float isRed = 1.0 - step(0.5, abs(aSpec - 1.0)), isBlue = 1.0 - step(0.5, abs(aSpec - 2.0));
      vCol = mix(vCol, red, isRed * w.y);
      vCol = mix(vCol, blue, isBlue * w.y);
    }`,
  fragmentShader: /* glsl */`
    uniform float uSquare;
    varying vec3 vCol; varying float vA; varying float vHalo; varying float vSquareGain;
    void main(){
      vec2 pc = abs(gl_PointCoord - 0.5);
      float d = mix(length(pc),max(pc.x,pc.y),uSquare);
      #ifdef HALO_PASS
        float hd = length(pc);
        float haloA = exp(-24.0*hd*hd) * smoothstep(0.5,0.32,hd) * vA * vHalo * 0.055;
        if(haloA<0.001) discard;
        gl_FragColor=vec4(vCol*haloA,1.0);
        return;
      #endif
      float glow = smoothstep(0.5, 0.0, d);
      float core = smoothstep(0.2, 0.0, d);
      float roundLight = glow * 0.23 + core * 0.86;
      float squareEdge = 1.0 - smoothstep(0.41,0.48,max(pc.x,pc.y));
      float a = mix(roundLight,squareEdge*vSquareGain,uSquare) * vA;
      if (a < 0.003) discard;
      gl_FragColor = vec4(vCol * a, 1.0);
    }`,
});
const points = new THREE.Points(geo, mat);
points.frustumCulled = false;
scene.add(points);
// A separate soft emitter layer restores lamp/bus halos without blurring
// the architectural point layer. It shares positions and morph weights.
const haloMat = new THREE.ShaderMaterial({
  uniforms, defines:{HALO_PASS:1}, vertexShader:mat.vertexShader,
  fragmentShader:mat.fragmentShader, transparent:true, depthWrite:false,
  blending:THREE.AdditiveBlending,
});
const haloPoints=new THREE.Points(geo,haloMat);
haloPoints.frustumCulled=false;scene.add(haloPoints);

// faint far dust so the dark has depth
{
  const n = 1800, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 40 + Math.random() * 50, th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1);
    p[i * 3] = r * Math.sin(ph) * Math.cos(th); p[i * 3 + 1] = r * Math.cos(ph); p[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8a8578, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.35, depthWrite: false })));
}

// ---------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.58, 0.32, 0.38);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  uniforms.uScale.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- modes & camera
const MODES = {
  angel:   { i: 0, label: 'Angel',         w: [1, 0, 0], pitch: 0.05, dist: 16.5, ty: 1.15 },
  circus:  { i: 1, label: 'Oxford Circus', w: [0, 1, 0], pitch: 0.62, dist: 30,   ty: -2.2 },
  release: { i: 2, label: 'Release',       w: [0, 0, 1], pitch: 0.12, dist: 24,   ty: 0 },
};
let mode = 'release';
const W = new THREE.Vector3(1, 0, 0);
const DEFAULT_YAW = Math.PI + 2 * Math.PI / 180;
const cam = { yaw: DEFAULT_YAW, pitch: 0.05, dist: 30, ty: 0, yawT: DEFAULT_YAW, yawUser: DEFAULT_YAW, pitchUser: 0, zoom: 1 };

function setMode(m, src = 'ui') {
  if (!MODES[m]) return;
  // Autoplay must reset the view even if we were already in Angel mode.
  if (src === 'auto' && m === 'angel') {
    cam.yawUser = DEFAULT_YAW; cam.pitchUser = 0; cam.zoom = 1;
    $('#zoom').value = 100; $('#zoom-value').textContent = '100%';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='front')));
  }
  if (m === mode) return;
  mode = m;
  document.body.dataset.mode = m;
  document.querySelectorAll('[data-set-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setMode === m)));
  $('#mode-name').textContent = MODES[m].label;
  $('#mode-idx').textContent = String(MODES[m].i + 1).padStart(2, '0');
  if (src !== 'auto') wake();
}

// Explicit inspection views keep depth easy to verify without a camera.
const VIEWS = { front: [DEFAULT_YAW, 0], spatial: [DEFAULT_YAW + 0.55, 0.12], side: [Math.PI / 2, 0.08] };
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  [cam.yawUser, cam.pitchUser] = VIEWS[button.dataset.view];
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  wake();
}));

// ---------------------------------------------------------------- input
let dragging = false, lastX = 0, lastY = 0, lastInput = performance.now();
const wake = () => { lastInput = performance.now(); standby=false; document.body.classList.remove('standby'); };
let activePointer = null;
function endDrag() {
  const id=activePointer;
  dragging=false; activePointer=null;
  if(id!==null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
}
canvas.addEventListener('pointerdown', e => {
  if(!e.isPrimary || (e.pointerType==='mouse' && e.button!==0)) return;
  if(activePointer!==null) return;
  // Mouse/touch ownership replaces hand control without a camera jump.
  cam.yawUser=cam.yaw;
  cam.pitchUser=(cam.pitch-MODES[mode].pitch)/(mode==='circus'?.6:1);
  if(hand || handStarting) stopHand();
  dragging=true;activePointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;
  canvas.setPointerCapture(e.pointerId);e.preventDefault();wake();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed','false'));
});
canvas.addEventListener('pointermove', e => {
  if(!dragging || e.pointerId!==activePointer) return;
  if(e.pointerType==='mouse' && !(e.buttons & 1)){endDrag();return;}
  cam.yawUser+=(e.clientX-lastX)*.006;
  cam.pitchUser=Math.max(-.35,Math.min(.5,cam.pitchUser+(e.clientY-lastY)*.003));
  cam.yaw=cam.yawUser;
  cam.pitch=MODES[mode].pitch+cam.pitchUser*(mode==='circus'?.6:1);
  lastX=e.clientX;lastY=e.clientY;wake();
});
addEventListener('pointerup',e=>{if(e.pointerId===activePointer)endDrag();});
addEventListener('pointercancel',e=>{if(e.pointerId===activePointer)endDrag();});
canvas.addEventListener('lostpointercapture',endDrag);
addEventListener('blur',endDrag);
document.addEventListener('visibilitychange',()=>{if(document.hidden)endDrag();});
addEventListener('pointermove', wake, { passive: true });
addEventListener('keydown', (e) => {
  if (e.target.matches('input,select')) return;
  if (['1','2','3'].includes(e.key)) stopHand();
  if (e.key === '1') setMode('angel');
  if (e.key === '2') setMode('circus');
  if (e.key === '3') setMode('release');
  wake();
});

document.querySelectorAll('[data-set-mode]').forEach((b) => b.addEventListener('click', () => { stopHand(); setMode(b.dataset.setMode); wake(); }));

function setPalette(k) {
  const P = PALETTES[k];
  uniforms.uTint.value.set(P.tint);
  document.documentElement.style.setProperty('--accent', P.css);
  document.querySelectorAll('[data-pal]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pal === k)));
  $('#pal-name').textContent = P.name;
  const hue=Math.round(uniforms.uTint.value.getHSL({}).h*360);
  $('#particleHue').value=hue; $('#hue-value').textContent=hue+'°';
}
document.querySelectorAll('[data-pal]').forEach((b) => b.addEventListener('click', () => { setPalette(b.dataset.pal); wake(); }));

// ---------------------------------------------------------------- restored settings
const countInput = $('#particleCount');
countInput.max = N; countInput.value = N;
$('#count-value').textContent = N.toLocaleString('en-GB');
countInput.addEventListener('input', () => {
  uniforms.uCount.value = +countInput.value;
  $('#count-value').textContent = $('#led-count').textContent = (+countInput.value).toLocaleString('en-GB'); wake();
});
$('#particleShape').addEventListener('change',e=>{uniforms.uSquare.value = +(e.target.value === 'square');wake();});
$('#particleHue').addEventListener('input',e=>{
  const h=+e.target.value, color=new THREE.Color(`hsl(${h},100%,65%)`);
  uniforms.uTint.value.copy(color); document.documentElement.style.setProperty('--accent',color.getStyle());
  $('#pal-name').textContent='Custom'; $('#hue-value').textContent=h+'°';
  document.querySelectorAll('[data-pal]').forEach(b=>b.setAttribute('aria-pressed','false'));wake();
});
$('#brightness').addEventListener('input',e=>{
  uniforms.uBrightness.value = +e.target.value/100;
  $('#brightness-value').textContent=e.target.value+'%';wake();
});
let handSensitivity=3;
$('#handSensitivity').addEventListener('input',e=>{handSensitivity=+e.target.value;$('#sensitivity-value').textContent=handSensitivity+'×';wake();});
function setZoom(value){
  cam.zoom=Math.max(.75,Math.min(2,value));
  $('#zoom').value=Math.round(cam.zoom*100);$('#zoom-value').textContent=Math.round(cam.zoom*100)+'%';wake();
}
$('#zoom').addEventListener('input',e=>setZoom(+e.target.value/100));
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(cam.zoom*Math.exp(-e.deltaY*.001));},{passive:false});
$('#settings').addEventListener('toggle',wake);

// ---------------------------------------------------------------- hand
let hand = null, noHandSince = 0, handStarting = false, handGeneration = 0;
const handBtn = $('#hand-btn'), handState = $('#hand-state');
function stopHand() {
  handGeneration++; handStarting=false;
  hand?.stop(); hand=null; noHandSince=0;
  document.body.classList.remove('hand-on');
  handBtn.disabled=false; handBtn.textContent='Recognise gestures';
  handState.textContent='Manual · Drag to turn';
}
function cameraError(err) {
  const messages = {
    NotAllowedError: 'Camera blocked · allow camera for this page, then retry.',
    NotFoundError: 'No camera found · connect a camera, then retry.',
    NotReadableError: 'Camera busy · close the other camera app, then retry.',
  };
  stopHand(); handState.textContent=messages[err.name] || 'Camera / model failed · retry hand control.';
  handBtn.textContent='Retry camera / hand';
  console.warn('Hand control:',err);
}
async function startHand() {
  if(handStarting || hand?.ready) return;
  setMode('release'); wake();
  const generation=++handGeneration;
  handStarting=true; handBtn.disabled=true;
  handBtn.textContent='Starting camera…'; handState.textContent='Waiting for camera permission…';wake();
  let candidate;
  try {
    const {Hand}=await import('./hand.js?v=22');
    if(generation!==handGeneration) return;
    candidate=new Hand($('#cam'),$('#hand-preview')); hand=candidate;
    candidate.onChange = g=> {
      if(g==='fist') setMode('angel','hand');
      if(g==='open') setMode('circus','hand');
    };
    await candidate.start();
    if(generation!==handGeneration){candidate.stop();return;}
    handStarting=false;handBtn.disabled=false;
    document.body.classList.add('hand-on');
    handBtn.textContent='Turn camera off'; handState.textContent='Camera ready · Show your hand';wake();
  } catch(err) {
    candidate?.stop();
    if(generation===handGeneration) cameraError(err);
  }
}
handBtn.addEventListener('click',()=>{if(hand?.ready)stopHand();else startHand();wake();});

// ---------------------------------------------------------------- intro and explicit standby
let entranceTimer;
function scheduleStandby(){
  clearTimeout(entranceTimer);
  entranceTimer=setTimeout(()=>{
    if(!document.body.classList.contains('entered')) {
      document.body.classList.add('entered');
      lastInput=performance.now()-61000;
    }
  },7000);
}
function enter(useCamera) {
  clearTimeout(entranceTimer);
  cam.yaw = cam.yawUser = DEFAULT_YAW; cam.pitchUser = 0; cam.pitch = 0.05; setZoom(1);
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view==='front')));
  document.body.classList.add('entered');setMode('angel');wake();
  if(useCamera) startHand();
}
$('#enter').addEventListener('click',()=>enter(false));
$('#enter-hand').addEventListener('click',()=>enter(true));
$('#return-entrance').addEventListener('click',()=>{
  stopHand();$('#settings').open=false;setMode('release');
  document.body.classList.remove('entered','standby');standby=false;wake();scheduleStandby();
});
addEventListener('pagehide',stopHand);

// ---------------------------------------------------------------- labels (map mode)
const labelEls = circus.labels.map((L) => {
  const el = document.createElement('div');
  el.className = 'map-label' + (L.key === 'circus' ? ' is-centre' : '') + (L.kind === 'shop' ? ' is-shop' : '');
  el.innerHTML = `<span>${L.text}</span>${L.sub ? `<small>${L.sub}</small>` : ''}`;
  $('#labels').appendChild(el);
  return { el, v: new THREE.Vector3(...L.p) };
});
const tmp = new THREE.Vector3();

// ---------------------------------------------------------------- ruler
const ruler = $('#ruler');
function drawRuler(yaw) {
  const c = ruler, g = c.getContext('2d'), dpr = Math.min(2, devicePixelRatio);
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const deg = (yaw * 180) / Math.PI;
  const pxPerDeg = 3;
  g.font = '9px "JetBrains Mono", monospace'; g.textAlign = 'center';
  for (let d = Math.floor((deg - w / 2 / pxPerDeg) / 5) * 5; d <= deg + w / 2 / pxPerDeg; d += 5) {
    const x = w / 2 + (d - deg) * pxPerDeg;
    const a = Math.max(0, 1 - Math.abs(x - w / 2) / (w / 2)); // fade toward the ends
    const major = d % 30 === 0;
    g.strokeStyle = `rgba(233,228,216,${0.45 * a})`; g.fillStyle = `rgba(233,228,216,${0.6 * a})`;
    g.beginPath(); g.moveTo(x + 0.5, h - 1); g.lineTo(x + 0.5, h - (major ? 9 : 4)); g.stroke();
    if (major) g.fillText(((d % 360) + 360) % 360 + '°', x, h - 12);
  }
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let autoT = 0, standby = false;
const yawRead = $('#yaw'), handLabel = { fist: 'Fist · Angel', open: 'Open palm · Street', none: 'No hand' };

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  const now = performance.now();
  uniforms.uT.value = t;

  // standby / autoplay after a quiet minute, like the exhibition version
  const idle = now - lastInput;
  if (document.body.classList.contains('entered') && !standby && !dragging && idle > 60000 && !(hand && hand.present)) {
    standby = true; document.body.classList.add('standby'); autoT = 0;
  }
  if (standby) {
    if (idle < 1000) standby = false;
    autoT += dt;
    const phase = Math.floor(autoT / 11) % 3;
    setMode(['angel','circus','release'][phase], 'auto');
  }

  // hand drives yaw/pitch; no hand for a while → release
  let yawGoal = cam.yawUser;
  let pitchGoal = cam.pitchUser;
  if (hand && hand.ready) {
    try { hand.update(now); } catch(err) { cameraError(err); }
    if (hand?.present) {
      wake();
      noHandSince = 0;
      yawGoal = cam.yawUser + (hand.x - 0.5) * 2.8 * handSensitivity;
      pitchGoal = cam.pitchUser + (hand.y - 0.5) * 0.5;
      handState.textContent = handLabel[hand.gesture] || 'Reading hand…';
    } else {
      noHandSince = noHandSince || now;
      handState.textContent = 'No hand';
      if (now - noHandSince > 2500 && mode !== 'release' && !standby) setMode('release', 'hand');
    }
  }


  // morph weights ease toward the mode
  const M = MODES[mode];
  const k = 1 - Math.exp(-dt * 1.7);
  W.x += (M.w[0] - W.x) * k; W.y += (M.w[1] - W.y) * k; W.z += (M.w[2] - W.z) * k;
  uniforms.uW.value.copy(W);
  uniforms.uLoose.value += ((hand && hand.present && hand.gesture === 'none' ? 1 : 0) - uniforms.uLoose.value) * k;

  // camera
  const aspectFit = camera.aspect < 1.6 ? 1.6 / camera.aspect : 1;
  const ck = 1 - Math.exp(-dt * 1.6);
  cam.yaw += (yawGoal - cam.yaw) * (1 - Math.exp(-dt * 3));
  cam.pitch += (M.pitch + pitchGoal * (mode === 'circus' ? 0.6 : 1) - cam.pitch) * ck;
  cam.dist += (M.dist * aspectFit / cam.zoom - cam.dist) * ck;
  cam.ty += (M.ty - cam.ty) * ck;
  const cp = Math.max(-0.4, Math.min(1.25, cam.pitch));
  camera.position.set(Math.sin(cam.yaw) * Math.cos(cp) * cam.dist, cam.ty + Math.sin(cp) * cam.dist, Math.cos(cam.yaw) * Math.cos(cp) * cam.dist);
  camera.lookAt(0, cam.ty, 0);

  // map labels follow the street, fade with the circus weight
  const lw = Math.max(0, (W.y - 0.6) / 0.4);
  for (const L of labelEls) {
    tmp.copy(L.v).project(camera);
    const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    L.el.style.opacity = vis ? lw.toFixed(3) : '0';
    L.el.style.transform = `translate3d(${((tmp.x + 1) / 2) * innerWidth}px, ${((1 - tmp.y) / 2) * innerHeight}px, 0)`;
  }


  const deg = ((((cam.yaw * 180) / Math.PI) % 360) + 360) % 360;
  yawRead.textContent = deg.toFixed(0).padStart(3, '0') + '°';
  drawRuler(cam.yaw);

  const buildingFade=Math.max(0,(W.y-.45)/.55);
  buildings.visible=buildingFade>.005;buildingMat.opacity=buildingFade*.26;
  buildingMat.depthWrite=false;
  bloom.strength = 0.48 - W.y * 0.22;
  composer.render();
  requestAnimationFrame(frame);
}

$('#led-count').textContent = N.toLocaleString('en-GB');
setPalette('gold');
setMode('angel');
requestAnimationFrame(frame);
// Exhibition auto-start is only scheduled by explicit Return to standby.
window.__spirit = { setMode, cam, get mode() { return mode; }, get diagnostics() { return {count:uniforms.uCount.value, brightness:uniforms.uBrightness.value, square:uniforms.uSquare.value, camera:!!hand?.ready, starting:handStarting, handSensitivity, dragging}; } };
