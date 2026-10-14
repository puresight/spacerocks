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

  /** Decaying white-noise impulse response for the convolver. */
  private makeImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    return buf;
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
   * Explosion in three layers, size-scaled, through the shared reverb:
   * crack (bandpass snap), crunch (sweeping resonant lowpass noise),
   * rumble tail (sub-bass sine sweep).
   */
  explosion(sizeRank: 0 | 1 | 2): void {
    if (!this.ctx || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const t = this.now();
    const nodes: { stop?: AudioScheduledSourceNode; disconnect: AudioNode }[] = [];
    // larger rocks: heavier crunch, longer rumble
    const crunchStart = [1200, 1000, 800][sizeRank];
    const crunchEnd = [220, 180, 150][sizeRank];
    const crunchDur = [0.2, 0.25, 0.3][sizeRank];
    const rumbleDur = [0.35, 0.45, 0.55][sizeRank];
    const rumbleEnd = [55, 42, 30][sizeRank];

    // 1) kinetic crack: short bandpass snap
    const crack = this.ctx.createBufferSource();
    crack.buffer = this.noiseBuffer;
    crack.loop = true;
    const crackBp = this.ctx.createBiquadFilter();
    crackBp.type = 'bandpass';
    crackBp.frequency.setValueAtTime(3000, t);
    crackBp.frequency.exponentialRampToValueAtTime(1200, t + 0.02);
    crackBp.Q.value = 1.2;
    const crackGain = this.ctx.createGain();
    crackGain.gain.setValueAtTime(0.5, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    crack.connect(crackBp).connect(crackGain);
    this.connectBus(crackGain);
    crack.start(t);
    crack.stop(t + 0.03);
    nodes.push({ stop: crack, disconnect: crackBp });
    nodes.push({ disconnect: crackGain });

    // 2) mid-body crunch: sweeping resonant lowpass noise
    const crunch = this.ctx.createBufferSource();
    crunch.buffer = this.noiseBuffer;
    crunch.loop = true;
    const crunchLp = this.ctx.createBiquadFilter();
    crunchLp.type = 'lowpass';
    crunchLp.frequency.setValueAtTime(crunchStart, t);
    crunchLp.frequency.exponentialRampToValueAtTime(crunchEnd, t + crunchDur);
    crunchLp.Q.value = 4;
    const crunchGain = this.ctx.createGain();
    crunchGain.gain.setValueAtTime(0.4, t);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, t + crunchDur + 0.05);
    crunch.connect(crunchLp).connect(crunchGain);
    this.connectBus(crunchGain);
    crunch.start(t);
    crunch.stop(t + crunchDur + 0.08);
    nodes.push({ stop: crunch, disconnect: crunchLp });
    nodes.push({ disconnect: crunchGain });

    // 3) low rumble tail: sub-bass sine sweep
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
    nodes.push({ stop: sub, disconnect: subGain });

    const last = nodes[nodes.length - 1];
    if (last?.stop) {
      last.stop.onended = () => {
        for (const n of nodes) n.stop?.disconnect();
        for (const n of nodes) n.disconnect.disconnect();
      };
    }
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
