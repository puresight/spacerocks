/**
 * Procedural retro-arcade SFX synthesized with the Web Audio API.
 * Lazily creates/resumes an AudioContext on first user gesture
 * (autoplay policy) and routes everything through one master gain.
 * One-shot nodes disconnect themselves on ended; the thrust loop is a
 * persistent noise source whose gain is ramped, so no clicks on stop.
 */
export class SoundFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private brownBuffer: AudioBuffer | null = null;
  private crackBuffer: AudioBuffer | null = null;
  private satCurve: Float32Array<ArrayBuffer> | null = null;
  private reverbIR: AudioBuffer | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbWet: GainNode | null = null;
  private thrustSource: AudioBufferSourceNode | null = null;
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;
  private resumeHandler = (): void => {
    void this.unlock();
  };

  attach(): void {
    window.addEventListener('pointerdown', this.resumeHandler);
    window.addEventListener('keydown', this.resumeHandler);
    window.addEventListener('touchstart', this.resumeHandler);
  }

  detach(): void {
    window.removeEventListener('pointerdown', this.resumeHandler);
    window.removeEventListener('keydown', this.resumeHandler);
    window.removeEventListener('touchstart', this.resumeHandler);
    this.setThrust(false);
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.brownBuffer = null;
    this.crackBuffer = null;
    this.satCurve = null;
    this.reverbIR = null;
    this.reverb = null;
    this.reverbWet = null;
  }

  /** Creates the context if needed and resumes it from a user gesture. */
  private unlock(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoiseBuffer(this.ctx);
      this.brownBuffer = this.makeBrownNoiseBuffer(this.ctx);
      this.crackBuffer = this.makeCrackBuffer(this.ctx);
      this.satCurve = this.makeSaturationCurve();
      this.reverbIR = this.makeImpulseResponse(this.ctx, 1.0);
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = this.reverbIR;
      this.reverbWet = this.ctx.createGain();
      this.reverbWet.gain.value = 0.35;
      this.reverb.connect(this.reverbWet).connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Decaying, low-pass-filtered (dark) noise impulse response for the convolver. */
  private makeImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += 0.12 * (Math.random() * 2 - 1 - lp);
        data[i] = lp * Math.pow(1 - i / len, 3);
      }
    }
    return buf;
  }

  /** Brownian noise: leaky random-walk integrator, energy piled in the lows. */
  private makeBrownNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let val = 0;
    for (let i = 0; i < len; i++) {
      val = (val + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = val * 4;
    }
    return buf;
  }

  /** 2-3 micro-impulses of 3-8 clipped noise samples, 5-15ms apart. */
  private makeCrackBuffer(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const bursts = 2 + Math.floor(Math.random() * 2);
    let pos = 0;
    for (let b = 0; b < bursts; b++) {
      pos += Math.floor(ctx.sampleRate * (0.005 + Math.random() * 0.01));
      const burstLen = 3 + Math.floor(Math.random() * 6);
      for (let i = 0; i < burstLen && pos + i < len; i++) {
        data[pos + i] = Math.sign(Math.random() * 2 - 1) * (0.7 + 0.3 * Math.random());
      }
    }
    return buf;
  }

  /** Soft-clipping tanh curve for the WaveShaper. */
  private makeSaturationCurve(): Float32Array<ArrayBuffer> {
    const n = 1024;
    const curve = new Float32Array(n) as Float32Array<ArrayBuffer>;
    const drive = 2.5;
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(drive * x) / norm;
    }
    return curve;
  }

  /** Routes a node into master, also feeding the shared reverb send. */
  private connectBus(node: AudioNode): void {
    if (!this.master || !this.reverb) return;
    node.connect(this.master);
    node.connect(this.reverb);
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Laser: triangle sweep 2400 -> 600 Hz over 70ms plus a bandpass noise "puff". */
  laser(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.now();

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.07);
    oscGain.gain.setValueAtTime(0.2, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(oscGain);
    this.connectBus(oscGain);
    osc.start(t);
    osc.stop(t + 0.1);
    osc.onended = () => {
      osc.disconnect();
      oscGain.disconnect();
    };

    // airy transient hiss at the start of the shot
    if (this.noiseBuffer) {
      const puff = this.ctx.createBufferSource();
      puff.buffer = this.noiseBuffer;
      puff.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3500;
      bp.Q.value = 3;
      const puffGain = this.ctx.createGain();
      puffGain.gain.setValueAtTime(0.25, t);
      puffGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      puff.connect(bp).connect(puffGain);
      this.connectBus(puffGain);
      puff.start(t);
      puff.stop(t + 0.045);
      puff.onended = () => {
        puff.disconnect();
        bp.disconnect();
        puffGain.disconnect();
      };
    }
  }

  /**
   * Explosion, size-scaled, gritty physical impact model:
   * micro-fracture crack impulses -> ring-modulated brown-noise crunch
   * with soft-clip saturation -> sub-bass rumble tail, all through the
   * shared dark convolver reverb.
   */
  explosion(sizeRank: 0 | 1 | 2): void {
    if (!this.ctx || !this.brownBuffer || !this.crackBuffer || !this.satCurve || this.ctx.state !== 'running') return;
    const t = this.now();
    const sources: AudioScheduledSourceNode[] = [];
    const graph: AudioNode[] = [];
    // larger rocks: lower fracture pitch, deeper/longer grind and rumble
    const crunchStart = [1300, 1100, 900][sizeRank];
    const crunchEnd = [260, 200, 150][sizeRank];
    const crunchDur = [0.2, 0.25, 0.3][sizeRank];
    const carrierHz = [70, 55, 42][sizeRank];
    const rumbleDur = [0.35, 0.45, 0.55][sizeRank];
    const rumbleEnd = [55, 42, 30][sizeRank];

    // 1) kinetic crack: micro-impulse fractures before the boom
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.crackBuffer;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime([0.55, 0.65, 0.75][sizeRank], t);
    crack.connect(crackGain);
    this.connectBus(crackGain);
    crack.start(t);
    sources.push(crack);
    graph.push(crackGain);

    // 2) ring-modulated crunch: brown noise swept through a resonant
    // lowpass, multiplied by a low carrier for gritty sidebands
    const src = this.ctx.createBufferSource();
    src.buffer = this.brownBuffer;
    src.loop = true;
    const crunchLp = this.ctx.createBiquadFilter();
    crunchLp.type = 'lowpass';
    crunchLp.frequency.setValueAtTime(crunchStart, t);
    crunchLp.frequency.exponentialRampToValueAtTime(crunchEnd, t + crunchDur);
    crunchLp.Q.value = 3;
    const body = this.ctx.createGain();
    body.gain.setValueAtTime(0.9, t);
    body.gain.exponentialRampToValueAtTime(0.001, t + crunchDur + 0.08);
    const ring = this.ctx.createGain();
    ring.gain.value = 0;
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = carrierHz;
    carrier.connect(ring.gain);
    src.connect(crunchLp).connect(body).connect(ring);

    // 3) nonlinear saturation: soft clip for dirty mid-range bite
    const shaper = this.ctx.createWaveShaper();
    shaper.curve = this.satCurve;
    shaper.oversample = '2x';
    const crunchOut = this.ctx.createGain();
    crunchOut.gain.value = [0.8, 0.9, 1.0][sizeRank];
    ring.connect(shaper).connect(crunchOut);
    this.connectBus(crunchOut);
    src.start(t);
    carrier.start(t);
    src.stop(t + crunchDur + 0.15);
    carrier.stop(t + crunchDur + 0.15);
    sources.push(src, carrier);
    graph.push(crunchLp, body, ring, shaper, crunchOut);

    // 4) low rumble tail: sub-bass sine sweep
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(100, t);
    sub.frequency.exponentialRampToValueAtTime(rumbleEnd, t + rumbleDur);
    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.exponentialRampToValueAtTime(0.45, t + 0.02);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + rumbleDur);
    sub.connect(subGain);
    this.connectBus(subGain);
    sub.start(t);
    sub.stop(t + rumbleDur + 0.05);
    sources.push(sub);
    graph.push(subGain);

    // the sub tail outlasts everything; clean up the whole graph there
    sub.onended = () => {
      for (const s of sources) s.disconnect();
      for (const n of graph) n.disconnect();
    };
  }

  /** Ship destroyed: the large, deep boom. */
  shipExplosion(): void {
    this.explosion(2);
  }

  /** Thrust: looped low-passed noise, gain-ramped on/off to avoid clicks. */
  setThrust(on: boolean): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) {
      if (on) this.pendingThrust = true;
      return;
    }
    const t = this.now();
    if (on) {
      this.pendingThrust = false;
      if (this.thrustSource) {
        this.thrustGain?.gain.cancelScheduledValues(t);
        this.thrustGain?.gain.setTargetAtTime(0.16, t, 0.03);
        return;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 140;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.setTargetAtTime(0.16, t, 0.03);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t);
      this.thrustSource = src;
      this.thrustFilter = filter;
      this.thrustGain = gain;
    } else {
      this.pendingThrust = false;
      if (!this.thrustSource || !this.thrustGain) return;
      const src = this.thrustSource;
      const filter = this.thrustFilter;
      const gain = this.thrustGain;
      this.thrustSource = null;
      this.thrustFilter = null;
      this.thrustGain = null;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setTargetAtTime(0.0001, t, 0.06);
      src.stop(t + 0.3);
      src.onended = () => {
        src.disconnect();
        filter?.disconnect();
        gain.disconnect();
      };
    }
  }

  private pendingThrust = false;

  /** Call once per frame after unlock has had a chance to run. */
  flushPendingThrust(): void {
    if (this.pendingThrust && this.ctx && this.ctx.state === 'running') {
      this.setThrust(true);
    }
  }
}
