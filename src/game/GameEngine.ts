import { SoundEngine } from '../audio/SoundEngine';
import { TEACHER_ORDER } from '../config/teachers';
import { StorageManager } from '../state/storage';
import {
  GameSnapshot,
  NightConfig,
  TeacherId,
  TeacherRuntimeState,
  ViewDirection,
} from '../types';

export interface GameEndPayload {
  won: boolean;
  title: string;
  description: string;
  killerId?: TeacherId;
  nightNumber: number;
  customScore: number;
  newAchievements: string[];
}

export class GameEngine {
  private sound: SoundEngine;
  private storage: StorageManager;
  private onSnapshot?: (snap: GameSnapshot) => void;
  private onJumpscare: (teacherId: TeacherId, done: () => void) => void;
  private onGameEnd: (payload: GameEndPayload) => void;

  private running = false;
  private paused = false;
  private dying = false;

  private nightConfig!: NightConfig;
  private elapsedSeconds = 0;
  private view: ViewDirection = 'C';
  private flashlightOn = false;

  private doorClosed = false;
  private doorHoldEnergy = 100;
  private doorLockCooldown = 0;
  private usedDoorLock = false;

  private blindsClosed = false;
  private roomStress = 0;

  private phoneBattery = 100;
  private powerbankReserve = 100;
  private noiseLevel = 0;

  private dailyGatePin = '1904';
  private taskIndex = 0;
  private unreadMessages = 0;

  private activeSubtitle: { speaker: string; text: string; color: string } | null = null;
  private subtitleTimer = 0;
  private statusHint = '';
  private statusHintTimer = 0;

  private valdirExposure = 0;
  private thunderTimer = 22;
  private lightningFlash = 0;

  private teachers!: Record<TeacherId, TeacherRuntimeState>;

  constructor(opts: {
    sound: SoundEngine;
    storage: StorageManager;
    onSnapshot?: (snap: GameSnapshot) => void;
    onJumpscare: (teacherId: TeacherId, done: () => void) => void;
    onGameEnd: (payload: GameEndPayload) => void;
  }) {
    this.sound = opts.sound;
    this.storage = opts.storage;
    this.onSnapshot = opts.onSnapshot;
    this.onJumpscare = opts.onJumpscare;
    this.onGameEnd = opts.onGameEnd;
  }

  startNight(config: NightConfig): GameSnapshot {
    this.nightConfig = config;
    this.running = true;
    this.paused = false;
    this.dying = false;
    this.elapsedSeconds = 0;
    this.view = 'C';
    this.flashlightOn = false;

    this.doorClosed = false;
    this.doorHoldEnergy = 100;
    this.doorLockCooldown = 0;
    this.usedDoorLock = false;

    this.blindsClosed = false;
    this.roomStress = 0;

    this.phoneBattery = 100;
    this.powerbankReserve = 100;
    this.noiseLevel = 0;
    this.valdirExposure = 0;
    this.thunderTimer = 14 + Math.random() * 18;
    this.lightningFlash = 0;

    this.dailyGatePin = String(1000 + Math.floor(Math.random() * 9000));
    this.taskIndex = 0;
    this.unreadMessages = config.veteranoMessages.length;

    this.activeSubtitle = null;
    this.subtitleTimer = 0;
    this.setHint('Abra o Celular (S) para iniciar o protocolo ou veja as Dicas!', 6);

    this.teachers = {
      marcos: this.makeTeacherState('marcos', config.aiLevels.marcos, 'L'),
      helena: this.makeTeacherState('helena', config.aiLevels.helena, 'R'),
      ricardo: this.makeTeacherState(
        'ricardo',
        config.aiLevels.ricardo,
        Math.random() < 0.5 ? 'L' : 'R'
      ),
      valdir: this.makeTeacherState('valdir', config.aiLevels.valdir, 'C'),
      celia: this.makeTeacherState('celia', config.aiLevels.celia, 'L'),
    };

    this.sound.startAmbience();
    return this.getSnapshot();
  }

  private makeTeacherState(
    id: TeacherId,
    aiLevel: number,
    side: 'L' | 'R' | 'C'
  ): TeacherRuntimeState {
    return {
      id,
      aiLevel,
      stage: 0,
      side,
      moveTimer: 2.5 + Math.random() * 2.0,
      attackProgress: 0,
      repelProgress: 0,
      enterAnim: 0,
      popupActive: false,
      bellCharge: 100,
      lastMoveTime: 0,
    };
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.dying = false;
    this.sound.stopAmbience();
  }

  setPaused(p: boolean): void {
    if (!this.running || this.dying) return;
    this.paused = p;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  getDailyPin(): string {
    return this.dailyGatePin;
  }

  setView(target: ViewDirection): void {
    if (!this.running || this.paused || this.dying) return;
    const next: ViewDirection = this.view === target && target !== 'C' ? 'C' : target;
    if (next === this.view) return;

    const wasPhone = this.view === 'P';
    this.view = next;

    if (next === 'P') {
      this.flashlightOn = false;
      this.sound.playPhoneToggle(true);
    } else if (wasPhone) {
      this.sound.playPhoneToggle(false);
    }
  }

  toggleFlashlight(): void {
    if (!this.running || this.paused || this.dying) return;
    if (this.view === 'P') {
      this.setHint('Guarde o celular antes de ligar a Lanterna!', 2.2);
      return;
    }
    this.flashlightOn = !this.flashlightOn;
    this.sound.playFlashlightClick(this.flashlightOn);
  }

  toggleDoorLock(): void {
    if (!this.running || this.paused || this.dying) return;
    if (!this.doorClosed) {
      if (this.doorLockCooldown > 0 || this.doorHoldEnergy < 12) {
        this.setHint('Trava magnética superaquecida! Aguarde recarregar.', 2.5);
        this.sound.playTap(0.6);
        return;
      }
      this.doorClosed = true;
      this.usedDoorLock = true;
      this.sound.playDoorLatch(true);
    } else {
      this.doorClosed = false;
      this.sound.playDoorLatch(false);
    }
  }

  toggleBlinds(): void {
    if (!this.running || this.paused || this.dying) return;
    this.blindsClosed = !this.blindsClosed;
    this.sound.playBlindsSlide(this.blindsClosed);
  }

  rewindSchoolBell(): void {
    if (!this.running || this.dying) return;
    const celia = this.teachers.celia;
    celia.bellCharge = Math.min(100, celia.bellCharge + 38);
    this.setHint('Temporizador da sirene adiado na Secretaria!', 2.2);
  }

  dismissValdirPopup(): void {
    const valdir = this.teachers.valdir;
    valdir.popupActive = false;
    this.setHint(
      'Olhe para o Quadro (W) e acenda a Lanterna (F) para dissipar o Coordenador!',
      4.0
    );
  }

  markMessagesRead(): void {
    this.unreadMessages = 0;
  }

  completeCurrentTask(): void {
    if (!this.running || this.dying) return;
    this.taskIndex++;
    this.storage.recordTaskCompleted();

    if (
      this.nightConfig.mode !== 'survive6am' &&
      this.taskIndex >= this.nightConfig.tasks.length
    ) {
      this.finishVictory();
    } else {
      this.setHint(
        `Etapa ${this.taskIndex}/${this.nightConfig.tasks.length} concluída! Fique atento aos arredores.`,
        3.2
      );
    }
  }

  triggerMistakeNoise(reason: string): void {
    if (!this.running || this.dying) return;
    this.noiseLevel = 1.0;
    this.setHint(reason, 3.6);

    // Barulho alto pode acelerar quem está em ronda
    for (const id of ['marcos', 'helena', 'ricardo'] as TeacherId[]) {
      const st = this.teachers[id];
      if (st.aiLevel > 0 && st.stage < 3 && Math.random() < 0.55) {
        this.advanceTeacher(st);
      }
    }

    // Valdir pode disparar advertência imediatamente por erro na rede!
    const valdir = this.teachers.valdir;
    if (valdir.aiLevel > 0 && !valdir.popupActive && Math.random() < 0.45 + valdir.aiLevel * 0.02) {
      this.triggerValdirWarning();
    }
  }

  private setHint(text: string, duration = 3.2): void {
    this.statusHint = text;
    this.statusHintTimer = duration;
  }

  private emitTeacherQuote(id: TeacherId, kind: 'stalk' | 'near' | 'attack' | 'retreat'): void {
    const disp = this.storage.getTeacherDisplay(id);
    if (kind === 'attack' && disp.customQuote) {
      this.activeSubtitle = {
        speaker: disp.name,
        text: disp.customQuote,
        color: disp.config.accentColor,
      };
      this.subtitleTimer = 3.6;
      return;
    }
    const pool = disp.config.quotes[kind];
    if (!pool || pool.length === 0) return;
    const text = pool[Math.floor(Math.random() * pool.length)];
    this.activeSubtitle = {
      speaker: disp.name,
      text,
      color: disp.config.accentColor,
    };
    this.subtitleTimer = 3.4;
  }

  private advanceTeacher(st: TeacherRuntimeState): void {
    st.stage = Math.min(3, st.stage + 1);
    st.lastMoveTime = this.elapsedSeconds;
    if (st.stage === 3) {
      st.enterAnim = 0;
    }

    const disp = this.storage.getTeacherDisplay(st.id);

    if (st.id === 'marcos') {
      this.sound.playFootstep('L', false);
      if (st.stage === 1) this.emitTeacherQuote('marcos', 'stalk');
      if (st.stage === 2) this.emitTeacherQuote('marcos', 'near');
      if (st.stage === 3) {
        this.emitTeacherQuote('marcos', 'attack');
        this.setHint(`${disp.name} abriu a porta! Olhe para a Porta (A) + Lanterna (F)!`, 3.5);
      }
    } else if (st.id === 'helena') {
      if (st.stage === 1) {
        this.sound.playFootstep('R', true);
        this.emitTeacherQuote('helena', 'stalk');
      } else if (st.stage === 2) {
        this.sound.playGlassTap();
        this.emitTeacherQuote('helena', 'near');
      } else if (st.stage === 3) {
        this.sound.playGlassTap();
        this.emitTeacherQuote('helena', 'attack');
        this.setHint(`${disp.name} está na janela! Guarde o celular e olhe p/ Janela (D)!`, 3.5);
      }
    } else if (st.id === 'ricardo') {
      this.sound.playStaticWhisper(st.side === 'L' ? 'L' : 'R');
      if (st.stage === 1) this.emitTeacherQuote('ricardo', 'stalk');
      if (st.stage === 2) this.emitTeacherQuote('ricardo', 'near');
      if (st.stage === 3) {
        this.emitTeacherQuote('ricardo', 'attack');
        const where = st.side === 'L' ? 'Porta (Esquerda)' : 'Janela (Direita)';
        this.setHint(`${disp.name} invadiu pela ${where}!`, 3.4);
      }
    }
  }

  private repelTeacher(st: TeacherRuntimeState): void {
    st.stage = 0;
    st.attackProgress = 0;
    st.repelProgress = 0;
    st.enterAnim = 0;
    st.popupActive = false;
    if (st.id === 'ricardo') {
      st.side = Math.random() < 0.5 ? 'L' : 'R';
    }
    if (st.id === 'celia') {
      st.bellCharge = 68;
    }
    this.storage.recordRepel();
    this.sound.playRepelSting();
    this.emitTeacherQuote(st.id, 'retreat');
  }

  private triggerValdirWarning(): void {
    const valdir = this.teachers.valdir;
    valdir.popupActive = true;
    valdir.stage = 3;
    valdir.enterAnim = 1;
    this.valdirExposure = 0;
    this.sound.playNotification();
    this.sound.playChalkScratch();
    this.emitTeacherQuote('valdir', 'attack');
  }

  update(dt: number, cftvOpen = false): GameSnapshot {
    if (!this.running || this.paused || this.dying) {
      return this.getSnapshot();
    }

    this.elapsedSeconds += dt;
    this.noiseLevel = Math.max(0, this.noiseLevel - dt * 0.45);

    if (this.subtitleTimer > 0) {
      this.subtitleTimer = Math.max(0, this.subtitleTimer - dt);
      if (this.subtitleTimer <= 0) this.activeSubtitle = null;
    }
    if (this.statusHintTimer > 0) {
      this.statusHintTimer = Math.max(0, this.statusHintTimer - dt);
      if (this.statusHintTimer <= 0) this.statusHint = '';
    }

    // Relâmpago + trovoada distante ocasional para atmosfera
    this.lightningFlash = Math.max(0, this.lightningFlash - dt * 2.4);
    this.thunderTimer -= dt;
    if (this.thunderTimer <= 0) {
      this.thunderTimer = 24 + Math.random() * 26;
      this.lightningFlash = 1.0;
      this.sound.playThunder();
    }

    // Verifica relógio da madrugada (00:00 -> 06:00)
    const currentHour = this.elapsedSeconds / this.nightConfig.hourDurationSeconds;
    if (currentHour >= 6.0) {
      if (this.nightConfig.mode === 'survive6am') {
        this.finishVictory();
      } else {
        this.finishTimeoutDefeat();
      }
      return this.getSnapshot();
    }

    // Energia da trava magnética da porta
    if (this.doorLockCooldown > 0) {
      this.doorLockCooldown = Math.max(0, this.doorLockCooldown - dt);
    }
    if (this.doorClosed) {
      this.doorHoldEnergy = Math.max(0, this.doorHoldEnergy - dt * 15.5);
      if (this.doorHoldEnergy <= 0) {
        this.doorClosed = false;
        this.doorLockCooldown = 4.5;
        this.sound.playDoorLatch(false);
        this.setHint('Trava magnética desarmou por sobrecarga!', 3.0);
      }
    } else {
      this.doorHoldEnergy = Math.min(100, this.doorHoldEnergy + dt * 11.0);
    }

    // Abafamento da sala (evita deixar persiana + porta fechadas a noite inteira)
    if (this.blindsClosed && this.doorClosed) {
      this.roomStress = Math.min(100, this.roomStress + dt * 11.5);
    } else if (this.blindsClosed) {
      this.roomStress = Math.min(100, this.roomStress + dt * 4.2);
    } else {
      this.roomStress = Math.max(0, this.roomStress - dt * 15.0);
    }
    if (this.roomStress >= 98 && this.blindsClosed) {
      this.blindsClosed = false;
      this.sound.playBlindsSlide(false);
      this.setHint('Sala abafada! Você precisou abrir a persiana para respirar.', 3.2);
    }

    // Bateria do celular & Powerbank da carteira
    const phoneOpen = this.view === 'P';
    if (phoneOpen && this.phoneBattery > 0) {
      const drainRate =
        (1.18 + (cftvOpen ? 0.42 : 0)) * this.nightConfig.batteryDrainMultiplier;
      this.phoneBattery = Math.max(0, this.phoneBattery - dt * drainRate);
    } else if (!phoneOpen) {
      if (this.powerbankReserve > 0 && this.phoneBattery < 100) {
        const charge = dt * 2.7;
        this.phoneBattery = Math.min(100, this.phoneBattery + charge);
        this.powerbankReserve = Math.max(0, this.powerbankReserve - charge * 0.48);
      } else if (this.phoneBattery < 18) {
        // Carga mínima residual de emergência para nunca travar permanentemente
        this.phoneBattery = Math.min(18, this.phoneBattery + dt * 1.1);
      }
    }

    const pastGrace = this.elapsedSeconds >= this.nightConfig.graceSeconds;

    // === ATUALIZAÇÃO DE CADA PROFESSOR ===
    if (pastGrace) {
      this.updateLateralTeacher(this.teachers.marcos, dt, phoneOpen);
      if (this.dying) return this.getSnapshot();

      this.updateLateralTeacher(this.teachers.helena, dt, phoneOpen);
      if (this.dying) return this.getSnapshot();

      this.updateLateralTeacher(this.teachers.ricardo, dt, phoneOpen);
      if (this.dying) return this.getSnapshot();

      this.updateValdir(dt, phoneOpen);
      if (this.dying) return this.getSnapshot();

      this.updateCelia(dt, phoneOpen);
      if (this.dying) return this.getSnapshot();
    }

    // Batimento cardíaco proporcional ao maior perigo ativo
    const snap = this.getSnapshot();
    this.sound.updateTension(snap.dangerLevel, dt);
    return snap;
  }

  private updateLateralTeacher(
    st: TeacherRuntimeState,
    dt: number,
    phoneOpen: boolean
  ): void {
    if (st.aiLevel <= 0) return;

    // Tentativas periódicas de avanço (Estágios 0 -> 1 -> 2 -> 3)
    st.moveTimer -= dt;
    if (st.moveTimer <= 0) {
      st.moveTimer = 3.4 + Math.random() * 1.2;
      if (st.stage < 3) {
        let chance = (st.aiLevel / 20) * 0.58;

        if (st.id === 'marcos' && this.view === 'L') {
          chance = 0; // Marcos congela quando observado!
          if (this.flashlightOn && st.stage === 2) {
            st.repelProgress += 0.6;
          }
        }

        if (st.id === 'helena') {
          if (phoneOpen && this.phoneBattery > 0) {
            chance *= this.blindsClosed ? 1.1 : 2.35;
          } else if (this.blindsClosed) {
            chance *= 0.65;
          }
        }

        if (Math.random() < chance) {
          this.advanceTeacher(st);
        }
      }
    }

    // No estágio 2, focar lanterna diretamente também pode repelir preventivamente!
    if (st.stage === 2 && this.view === st.side && this.flashlightOn) {
      const blockedByCover =
        (st.side === 'L' && this.doorClosed) || (st.side === 'R' && this.blindsClosed);
      if (!blockedByCover) {
        st.repelProgress += dt / 2.2;
        if (st.repelProgress >= 1) {
          this.repelTeacher(st);
          return;
        }
      }
    }

    // Estágio 3: Na brecha da sala!
    if (st.stage === 3) {
      st.enterAnim = Math.min(1, st.enterAnim + dt * 0.95);

      const physicallyBlocked =
        (st.side === 'L' && this.doorClosed) || (st.side === 'R' && this.blindsClosed);
      const lookingAtThem = this.view === st.side && !phoneOpen;

      if (physicallyBlocked) {
        st.attackProgress = Math.max(0, st.attackProgress - dt * 0.45);
        st.repelProgress += dt / 1.45;
        if (st.repelProgress >= 1) {
          this.repelTeacher(st);
          return;
        }
      } else if (lookingAtThem) {
        // Encarar repele; com lanterna acesa repele ainda mais rápido!
        const speed = this.flashlightOn ? 1.25 : 1.85;
        st.repelProgress += dt / speed;
        st.attackProgress = Math.max(0, st.attackProgress - dt * 0.25);
        if (st.repelProgress >= 1) {
          this.repelTeacher(st);
          return;
        }
      } else {
        st.repelProgress = Math.max(0, st.repelProgress - dt * 0.5);
        // Com celular levantado sem proteção, o bote é rápido!
        const killSeconds = phoneOpen ? 2.85 - st.aiLevel * 0.03 : 7.8 - st.aiLevel * 0.11;
        st.attackProgress += dt / Math.max(1.8, killSeconds);
        if (st.attackProgress >= 1) {
          this.triggerDeath(st.id);
        }
      }
    } else {
      st.attackProgress = Math.max(0, st.attackProgress - dt * 0.5);
    }
  }

  private updateValdir(dt: number, phoneOpen: boolean): void {
    const st = this.teachers.valdir;
    if (st.aiLevel <= 0) return;

    if (st.stage < 3) {
      if (phoneOpen && this.phoneBattery > 0) {
        this.valdirExposure += dt * (0.65 + st.aiLevel * 0.045);
        if (this.valdirExposure >= 14.5) {
          this.triggerValdirWarning();
        }
      } else {
        this.valdirExposure = Math.max(0, this.valdirExposure - dt * 1.4);
      }
    } else {
      // Valdir materializado no quadro à frente!
      if (!st.popupActive && this.view === 'C' && this.flashlightOn) {
        st.repelProgress += dt / 1.05;
        st.attackProgress = Math.max(0, st.attackProgress - dt * 0.4);
        if (st.repelProgress >= 1) {
          this.repelTeacher(st);
          return;
        }
      } else {
        const limit = st.popupActive ? 8.5 : 6.5;
        st.attackProgress += dt / limit;
        if (st.attackProgress >= 1) {
          this.triggerDeath('valdir');
        }
      }
    }
  }

  private updateCelia(dt: number, phoneOpen: boolean): void {
    const st = this.teachers.celia;
    if (st.aiLevel <= 0) return;

    if (st.stage < 3) {
      const drain = 0.95 + st.aiLevel * 0.085;
      const wasAbove = st.bellCharge >= 32;
      st.bellCharge = Math.max(0, st.bellCharge - dt * drain);
      if (wasAbove && st.bellCharge < 32) {
        this.sound.playNotification();
        this.setHint('Sirene da Secretaria abaixo de 30% — abra CFTV > CAM 03.', 3.8);
      }
      if (st.bellCharge <= 0) {
        st.stage = 3;
        st.side = 'L';
        st.enterAnim = 0;
        st.attackProgress = 0;
        this.sound.playSchoolBellAlarm();
        this.emitTeacherQuote('celia', 'attack');
        this.setHint('O SINAL DISPAROU! TRANQUE A PORTA [ESPAÇO] IMEDIATAMENTE!', 4.0);
      }
    } else {
      st.enterAnim = Math.min(1, st.enterAnim + dt * 1.2);
      if (this.doorClosed) {
        st.repelProgress += dt / 1.3;
        if (st.repelProgress >= 1) {
          this.repelTeacher(st);
        }
      } else {
        st.attackProgress += dt / (phoneOpen ? 2.2 : 3.1);
        if (st.attackProgress >= 1) {
          this.triggerDeath('celia');
        }
      }
    }
  }

  private triggerDeath(killerId: TeacherId): void {
    if (this.dying) return;
    this.dying = true;
    this.running = false;
    this.view = 'C';
    this.flashlightOn = false;
    this.storage.recordDeath();
    this.sound.stopAmbience();
    this.sound.playJumpscare();

    const disp = this.storage.getTeacherDisplay(killerId);

    this.onJumpscare(killerId, () => {
      this.onGameEnd({
        won: false,
        title: 'MENÇÃO I — RETIDO!',
        description: `${disp.name} pegou você no plantão noturno. "${disp.config.quotes.jumpscare}"`,
        killerId,
        nightNumber: this.nightConfig.nightNumber,
        customScore: 0,
        newAchievements: [],
      });
    });
  }

  private finishTimeoutDefeat(): void {
    this.running = false;
    this.sound.stopAmbience();
    this.sound.playSchoolBellAlarm();
    this.storage.recordDeath();
    this.onGameEnd({
      won: false,
      title: '06:00 — DIÁRIO FECHADO!',
      description:
        'O relógio bateu 06:00 antes de você concluir o protocolo de emergência no celular. O Diário de Classe selou sua retenção na Sala 04.',
      nightNumber: this.nightConfig.nightNumber,
      customScore: 0,
      newAchievements: [],
    });
  }

  private finishVictory(): void {
    this.running = false;
    this.sound.stopAmbience();
    this.sound.playVictory();

    const aiSum = Object.values(this.nightConfig.aiLevels).reduce((a, b) => a + b, 0);
    const customScore =
      this.nightConfig.nightNumber === 6
        ? aiSum * (this.nightConfig.mode === 'protocol' ? 120 : 100) +
          Math.round(this.phoneBattery * 10)
        : 0;

    const newAchievements = this.storage.recordVictory(
      this.nightConfig.nightNumber,
      customScore
    );

    if (this.phoneBattery >= 45 && this.storage.unlockAchievement('battery_saver')) {
      newAchievements.push('battery_saver');
    }
    if (!this.usedDoorLock && this.storage.unlockAchievement('no_door_slam')) {
      newAchievements.push('no_door_slam');
    }
    if (this.nightConfig.nightNumber === 6 && aiSum >= 50) {
      if (this.storage.unlockAchievement('custom_winner')) {
        newAchievements.push('custom_winner');
      }
    }
    if (this.nightConfig.nightNumber === 6 && aiSum === 100) {
      if (this.storage.unlockAchievement('jubilado_20')) {
        newAchievements.push('jubilado_20');
      }
    }

    const isFinalNight = this.nightConfig.nightNumber === 5;
    const isCustom = this.nightConfig.nightNumber === 6;

    this.onGameEnd({
      won: true,
      title: isFinalNight
        ? '190 ATENDEU — LIBERDADE!'
        : isCustom
          ? 'APROVADO PELO CONSELHO!'
          : `NOITE ${this.nightConfig.nightNumber} CONCLUÍDA!`,
      description: isFinalNight
        ? 'O giroflex das viaturas ilumina o pátio da ETEC Sebrae! A catraca destrava e os professores desaparecem nas sombras antes do amanhecer. No sistema NSA, sua menção aparece cravada: MB.'
        : isCustom
          ? `Você dominou o Conselho de Classe com pontuação final de ${customScore} pontos!`
          : 'O protocolo da madrugada funcionou e você escapou deste turno! Mas o Diário de Classe ainda guarda pendências para a próxima noite...',
      nightNumber: this.nightConfig.nightNumber,
      customScore,
      newAchievements,
    });
  }

  getSnapshot(): GameSnapshot {
    const currentHour = Math.min(
      6,
      this.elapsedSeconds / Math.max(1, this.nightConfig.hourDurationSeconds)
    );
    const hInt = Math.floor(currentHour);
    const mInt = Math.floor((currentHour - hInt) * 60);
    const clockText = `${String(hInt).padStart(2, '0')}:${String(mInt).padStart(2, '0')} AM`;

    // Maior risco iminente entre os professores
    let maxDanger = 0;
    let dangerName: string | null = null;
    for (const id of TEACHER_ORDER) {
      const st = this.teachers[id];
      if (st.stage === 3 && st.attackProgress > maxDanger) {
        maxDanger = st.attackProgress;
        dangerName = this.storage.getTeacherDisplay(id).name;
      }
    }

    const celiaActive = this.nightConfig.aiLevels.celia > 0;
    const bellAlert = celiaActive && this.teachers.celia.bellCharge < 32;

    return {
      running: this.running,
      paused: this.paused,
      nightConfig: this.nightConfig,
      elapsedSeconds: this.elapsedSeconds,
      currentHour,
      clockText,
      view: this.view,
      flashlightOn: this.flashlightOn,
      doorClosed: this.doorClosed,
      doorLockCooldown: this.doorLockCooldown,
      doorHoldEnergy: this.doorHoldEnergy,
      blindsClosed: this.blindsClosed,
      roomStress: this.roomStress,
      phoneBattery: this.phoneBattery,
      powerbankReserve: this.powerbankReserve,
      noiseLevel: this.noiseLevel,
      lightningFlash: this.lightningFlash,
      dangerLevel: maxDanger,
      dangerTeacherName: dangerName,
      activeSubtitle: this.activeSubtitle,
      statusHint: this.statusHint,
      dailyGatePin: this.dailyGatePin,
      taskIndex: this.taskIndex,
      totalTasks: this.nightConfig.tasks.length,
      unreadMessages: this.unreadMessages,
      bellAlert,
      valdirPopup: this.teachers.valdir.popupActive,
      teachers: this.teachers,
    };
  }
}
