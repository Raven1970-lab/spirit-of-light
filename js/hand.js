// Hand tracking with MediaPipe Tasks (HandLandmarker), all files served locally.
import { FilesetResolver, HandLandmarker } from '../vendor/vision_bundle.mjs';

const TIPS = [8, 12, 16, 20], PIPS = [6, 10, 14, 18];
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Hand {
  constructor(video, preview) {
    this.video = video;
    this.preview = preview;
    this.pctx = preview.getContext('2d');
    this.ready = false;
    this.present = false;
    this.x = 0.5; this.y = 0.5;   // palm centre, mirrored so moving right = right
    this.gesture = 'none';        // 'fist' | 'open' | 'none'
    this._votes = [];
    this._last = -1;
    this.onChange = null;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    if(this.cancelled) { stream.getTracks().forEach(t=>t.stop()); throw new Error('Camera start cancelled'); }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    const files = await FilesetResolver.forVisionTasks(new URL('../vendor/wasm', import.meta.url).href);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('../vendor/hand_landmarker.task', import.meta.url).href, delegate },
      runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.lm = await HandLandmarker.createFromOptions(files, opts('GPU')); }
    catch (e) { this.lm = await HandLandmarker.createFromOptions(files, opts('CPU')); }
    if(this.cancelled) { this.lm.close(); throw new Error('Camera start cancelled'); }
    this.ready = true;
  }

  stop() {
    this.cancelled = true;
    this.ready = false; this.present = false;
    this.stream?.getTracks().forEach(t=>t.stop());
    this.video.pause(); this.video.srcObject = null;
    this.lm?.close(); this.lm = null;
    this.pctx.clearRect(0,0,this.preview.width,this.preview.height);
  }

  classify(L) {
    // a finger counts as extended when its tip is clearly further from the wrist than its middle joint
    const w = L[0];
    let ext = 0;
    for (let i = 0; i < 4; i++) if (d2(L[TIPS[i]], w) > d2(L[PIPS[i]], w) * 1.12) ext++;
    if (ext >= 3) return 'open';
    if (ext <= 1) return 'fist';
    return null; // ambiguous, keep previous
  }

  update(now) {
    if (!this.ready || this.video.readyState < 2) return;
    if (now - this._last < 33) return; // ~30 Hz is plenty
    this._last = now;
    const res = this.lm.detectForVideo(this.video, now);
    const L = res.landmarks && res.landmarks[0];
    this.present = !!L;
    if (L) {
      const palm = L[9];
      this.x += ((1 - palm.x) - this.x) * 0.5;
      this.y += (palm.y - this.y) * 0.5;
      const g = this.classify(L);
      if (g) {
        this._votes.push(g);
        if (this._votes.length > 5) this._votes.shift();
        if (this._votes.length === 5 && this._votes.every((v) => v === g) && g !== this.gesture) {
          this.gesture = g;
          this.onChange && this.onChange(g);
        }
      }
    } else {
      this._votes.length = 0;
      if (this.gesture !== 'none') { this.gesture = 'none'; this.onChange && this.onChange('none'); }
    }
    this.draw(L);
  }

  draw(L) {
    const c = this.preview, g = this.pctx, W = c.width, H = c.height;
    g.save();
    g.clearRect(0, 0, W, H);
    g.translate(W, 0); g.scale(-1, 1);
    g.globalAlpha = 0.55;
    g.drawImage(this.video, 0, 0, W, H);
    g.restore();
    if (!L) return;
    const col = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ffc864';
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1;
    const P = (p) => [(1 - p.x) * W, p.y * H];
    const bones = [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
    for (const b of bones) { g.beginPath(); b.forEach((i, j) => { const [x, y] = P(L[i]); j ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    for (const p of L) { const [x, y] = P(p); g.fillRect(x - 1.5, y - 1.5, 3, 3); }
  }
}
