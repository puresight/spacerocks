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

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Laser: square sweep 880 -> 110 Hz over 100ms with exponential decay. */
  laser(): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.1);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Explosion: filtered noise, pitch scaled by asteroid size rank. */
  explosion(sizeRank: 0 | 1 | 2): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.ctx.state !== 'running') return;
    const t = this.now();
    // larger rocks: deeper start, longer rumble
    const fStart = [800, 600, 400][sizeRank];
    const fEnd = [60, 48, 40][sizeRank];
    const dur = [0.25, 0.3, 0.4][sizeRank];
    const peak = [0.3, 0.36, 0.45][sizeRank];

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(fStart, t);
    filter.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      gain.disconnect();
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
