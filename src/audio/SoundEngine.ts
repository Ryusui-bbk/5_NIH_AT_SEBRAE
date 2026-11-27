import { GameSettings } from '../types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private rainSource: AudioBufferSourceNode | null = null;
  private roomHumOsc: OscillatorNode | null = null;
  private ambienceActive = false;

  private heartbeatTimer = 0;
  private settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = { ...settings };
  }

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.ambGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.ambGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Buffer de ruído branco/marrom reutilizável (2 segundos)
      const len = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        // Mistura leve de ruído branco + browniano para textura orgânica
        lastOut = (lastOut + 0.06 * white) / 1.06;
        data[i] = lastOut * 2.1 + white * 0.28;
      }

      this.applyVolumes();
    } catch {
      this.ctx = null;
    }
  }

  updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.ambGain) return;
    const now = this.ctx.currentTime;
    const master = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setTargetAtTime(master, now, 0.04);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, now, 0.04);
    this.ambGain.gain.setTargetAtTime(this.settings.ambienceVolume, now, 0.04);
  }

  startAmbience(): void {
    this.init();
    if (!this.ctx || !this.ambGain || !this.noiseBuffer || this.ambienceActive) return;
    this.ambienceActive = true;

    // Chuva noturna abafada vinda principalmente da janela direita
    const rain = this.ctx.createBufferSource();
    rain.buffer = this.noiseBuffer;
    rain.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 680;
    filter.Q.value = 0.65;

    const rainGain = this.ctx.createGain();
    rainGain.gain.value = 0.14;

    const panner = this.ctx.createStereoPanner();
    panner.pan.value = 0.3;

    rain.connect(filter);
    filter.connect(rainGain);
    rainGain.connect(panner);
    panner.connect(this.ambGain);
    rain.start();
    this.rainSource = rain;

    // Sub-ambiência suave da rede elétrica da sala
    const hum = this.ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 60;
    const humFilter = this.ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 110;
    const humGain = this.ctx.createGain();
    humGain.gain.value = 0.018;

    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(this.ambGain);
    hum.start();
    this.roomHumOsc = hum;
  }

  stopAmbience(): void {
    if (!this.ambienceActive) return;
    this.ambienceActive = false;
    try {
      this.rainSource?.stop();
      this.rainSource?.disconnect();
    } catch {}
    try {
      this.roomHumOsc?.stop();
      this.roomHumOsc?.disconnect();
    } catch {}
    this.rainSource = null;
    this.roomHumOsc = null;
  }

  private createPannedOut(pan = 0): AudioNode | null {
    if (!this.ctx || !this.sfxGain) return null;
    if (pan === 0 || !this.ctx.createStereoPanner) return this.sfxGain;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxGain);
    return p;
  }

  playTone(opts: {
    freq: number;
    endFreq?: number;
    duration: number;
    type?: OscillatorType;
    volume?: number;
    pan?: number;
    delay?: number;
  }): void {
    if (!this.ctx) return;
    const dest = this.createPannedOut(opts.pan ?? 0);
    if (!dest) return;

    const start = this.ctx.currentTime + (opts.delay ?? 0);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.endFreq) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(18, opts.endFreq),
        start + opts.duration
      );
    }

    const vol = opts.volume ?? 0.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + Math.min(0.015, opts.duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0008, start + opts.duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + opts.duration + 0.02);
  }

  playNoiseBurst(opts: {
    duration: number;
    filterFreq: number;
    q?: number;
    volume?: number;
    pan?: number;
    filterType?: BiquadFilterType;
    delay?: number;
  }): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const dest = this.createPannedOut(opts.pan ?? 0);
    if (!dest) return;

    const start = this.ctx.currentTime + (opts.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.filterType ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.filterFreq, start);
    filter.Q.value = opts.q ?? 1.2;

    const gain = this.ctx.createGain();
    const vol = opts.volume ?? 0.18;
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + opts.duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(start, Math.random() * 1.2);
    src.stop(start + opts.duration + 0.02);
  }

  playFootstep(side: 'L' | 'R' | 'C', isFemale = false): void {
    const pan = side === 'L' ? -0.82 : side === 'R' ? 0.82 : 0;
    if (isFemale) {
      // Salto no piso externo molhado
      this.playTone({ freq: 290, endFreq: 95, duration: 0.09, type: 'triangle', volume: 0.22, pan });
      this.playNoiseBurst({ duration: 0.08, filterFreq: 1800, q: 2.2, volume: 0.12, pan });
      this.playTone({
        freq: 260,
        endFreq: 85,
        duration: 0.09,
        type: 'triangle',
        volume: 0.17,
        pan,
        delay: 0.28,
      });
    } else {
      // Passo grave no corredor
      this.playTone({ freq: 105, endFreq: 42, duration: 0.16, type: 'sine', volume: 0.34, pan });
      this.playNoiseBurst({ duration: 0.09, filterFreq: 420, q: 1.5, volume: 0.1, pan });
      this.playTone({
        freq: 92,
        endFreq: 38,
        duration: 0.16,
        type: 'sine',
        volume: 0.26,
        pan,
        delay: 0.36,
      });
    }
  }

  playGlassTap(): void {
    this.playTone({ freq: 1150, endFreq: 620, duration: 0.055, type: 'sine', volume: 0.18, pan: 0.85 });
    this.playTone({
      freq: 1240,
      endFreq: 680,
      duration: 0.055,
      type: 'sine',
      volume: 0.15,
      pan: 0.85,
      delay: 0.13,
    });
  }

  playStaticWhisper(side: 'L' | 'R'): void {
    const pan = side === 'L' ? -0.78 : 0.78;
    this.playNoiseBurst({ duration: 0.28, filterFreq: 2200, q: 3.5, volume: 0.14, pan });
    this.playTone({ freq: 155, endFreq: 98, duration: 0.32, type: 'sawtooth', volume: 0.06, pan });
  }

  playChalkScratch(): void {
    this.playNoiseBurst({ duration: 0.34, filterFreq: 3200, q: 4.5, volume: 0.14, pan: 0 });
    this.playTone({ freq: 620, endFreq: 480, duration: 0.25, type: 'triangle', volume: 0.07, pan: 0 });
  }

  playFlashlightClick(on: boolean): void {
    this.playTone({
      freq: on ? 1400 : 980,
      endFreq: on ? 700 : 520,
      duration: 0.045,
      type: 'square',
      volume: 0.12,
    });
  }

  playDoorLatch(closed: boolean): void {
    this.playTone({
      freq: closed ? 160 : 220,
      endFreq: closed ? 58 : 110,
      duration: 0.15,
      type: 'triangle',
      volume: 0.32,
      pan: -0.75,
    });
    this.playNoiseBurst({
      duration: 0.1,
      filterFreq: 600,
      volume: 0.16,
      pan: -0.75,
    });
  }

  playBlindsSlide(closed: boolean): void {
    this.playNoiseBurst({
      duration: 0.22,
      filterFreq: closed ? 1200 : 1650,
      q: 1.8,
      volume: 0.18,
      pan: 0.75,
    });
  }

  playPhoneToggle(open: boolean): void {
    this.playTone({
      freq: open ? 320 : 480,
      endFreq: open ? 560 : 260,
      duration: 0.09,
      type: 'sine',
      volume: 0.11,
    });
  }

  playTap(mult = 1): void {
    this.playTone({
      freq: 580 * mult,
      endFreq: 420 * mult,
      duration: 0.045,
      type: 'sine',
      volume: 0.12,
    });
  }

  playSimonTone(index: number): void {
    const freqs = [329.63, 440, 554.37, 659.25];
    this.playTone({
      freq: freqs[index % freqs.length],
      duration: 0.22,
      type: 'triangle',
      volume: 0.22,
    });
  }

  playTaskSuccess(): void {
    this.playTone({ freq: 523.25, duration: 0.11, type: 'triangle', volume: 0.18 });
    this.playTone({ freq: 659.25, duration: 0.16, type: 'triangle', volume: 0.2, delay: 0.09 });
    this.playTone({ freq: 783.99, duration: 0.22, type: 'triangle', volume: 0.2, delay: 0.18 });
  }

  playLoudErrorAlarm(): void {
    // Barulho alto de erro / propaganda falsa que atrai professores!
    this.playTone({ freq: 440, endFreq: 210, duration: 0.24, type: 'sawtooth', volume: 0.28 });
    this.playTone({
      freq: 390,
      endFreq: 160,
      duration: 0.28,
      type: 'square',
      volume: 0.24,
      delay: 0.14,
    });
  }

  playCameraStatic(): void {
    this.playNoiseBurst({
      duration: 0.11,
      filterFreq: 2600,
      q: 0.9,
      volume: 0.13,
    });
  }

  playNotification(): void {
    this.playTone({ freq: 740, duration: 0.08, type: 'sine', volume: 0.16 });
    this.playTone({ freq: 987, duration: 0.12, type: 'sine', volume: 0.16, delay: 0.09 });
  }

  playSchoolBellAlarm(): void {
    for (let i = 0; i < 6; i++) {
      this.playTone({
        freq: i % 2 === 0 ? 1180 : 960,
        duration: 0.09,
        type: 'square',
        volume: 0.26,
        delay: i * 0.095,
      });
    }
  }

  playRepelSting(): void {
    this.playTone({ freq: 195, endFreq: 68, duration: 0.38, type: 'sine', volume: 0.24 });
  }

  playThunder(): void {
    this.playNoiseBurst({
      duration: 1.4,
      filterFreq: 130,
      filterType: 'lowpass',
      q: 0.7,
      volume: 0.28,
      pan: 0.45,
    });
  }

  updateTension(danger01: number, dt: number): void {
    if (danger01 < 0.18) {
      this.heartbeatTimer = 0;
      return;
    }
    this.heartbeatTimer -= dt;
    if (this.heartbeatTimer <= 0) {
      const interval = Math.max(0.36, 1.05 - danger01 * 0.68);
      this.heartbeatTimer = interval;
      const vol = 0.12 + danger01 * 0.26;
      this.playTone({ freq: 68, endFreq: 36, duration: 0.12, type: 'sine', volume: vol });
      this.playTone({
        freq: 58,
        endFreq: 32,
        duration: 0.13,
        type: 'sine',
        volume: vol * 0.8,
        delay: 0.15,
      });
    }
  }

  playJumpscare(): void {
    this.playNoiseBurst({ duration: 1.15, filterFreq: 1400, q: 0.6, volume: 0.5 });
    this.playTone({ freq: 95, endFreq: 28, duration: 1.3, type: 'sawtooth', volume: 0.55 });
    this.playTone({ freq: 520, endFreq: 140, duration: 0.95, type: 'square', volume: 0.34 });
    this.playTone({ freq: 730, endFreq: 195, duration: 0.85, type: 'sawtooth', volume: 0.28 });
  }

  playVictory(): void {
    // Sirene policial 190 chegando + acorde de alívio do amanhecer
    for (let i = 0; i < 4; i++) {
      this.playTone({
        freq: 660,
        endFreq: 920,
        duration: 0.34,
        type: 'triangle',
        volume: 0.14,
        pan: 0.35,
        delay: i * 0.68,
      });
      this.playTone({
        freq: 920,
        endFreq: 660,
        duration: 0.34,
        type: 'triangle',
        volume: 0.14,
        pan: 0.35,
        delay: i * 0.68 + 0.34,
      });
    }
    [261.63, 329.63, 392.0, 523.25].forEach((f, idx) => {
      this.playTone({
        freq: f,
        duration: 1.6,
        type: 'sine',
        volume: 0.15,
        delay: 0.2 + idx * 0.12,
      });
    });
  }
}
