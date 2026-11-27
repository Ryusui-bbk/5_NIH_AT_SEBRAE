import { SoundEngine } from '../audio/SoundEngine';
import { StorageManager } from '../state/storage';
import {
  CameraId,
  GameSnapshot,
  PhoneAppId,
  TaskType,
  TeacherId,
} from '../types';
import { ICONS } from '../ui/icons';

interface ShortenerOption {
  label: string;
  real: boolean;
  styleClass: string;
}

export class PhoneSystem {
  private container: HTMLElement;
  private sound: SoundEngine;
  private storage: StorageManager;

  private onTaskCompleted: () => void;
  private onMistake: (reason: string) => void;
  private onRewindBell: () => void;
  private onDismissValdir: () => void;
  private onReadMessages: () => void;
  private getSnapshot: () => GameSnapshot;

  private currentApp: PhoneAppId = 'resgate';
  private activeCamera: CameraId = 'cam1';
  private camStaticTimer = 0;

  // Estados internos dos minigames
  private activeTaskType: TaskType | null = null;
  private activeTaskIdx = -1;

  // 1. Shortener
  private shortenerCd = 6.5;
  private shortenerOptions: ShortenerOption[] = [];

  // 2. Captcha
  private captchaExpr = '';
  private captchaAnswer = 0;
  private captchaInput = '';

  // 3. Memory (Simon)
  private simonSeq: number[] = [];
  private simonInput: number[] = [];
  private simonShowTimer = 0;
  private simonShowing = true;
  private simonLitPad = -1;
  private lastToneStep = -1;

  // 4. Wi-Fi Tuner
  private targetFreq = 3;
  private targetAmp = 3;
  private userFreq = 1;
  private userAmp = 1;
  private wifiLockProgress = 0;

  // 5. PIN Pad
  private pinInput = '';

  // 6. Dial 190
  private dialInput = '';
  private callCountdown = 0;
  private callActive = false;

  private cftvCanvas: HTMLCanvasElement | null = null;
  private wifiCanvas: HTMLCanvasElement | null = null;
  private animClock = 0;

  constructor(opts: {
    container: HTMLElement;
    sound: SoundEngine;
    storage: StorageManager;
    onTaskCompleted: () => void;
    onMistake: (reason: string) => void;
    onRewindBell: () => void;
    onDismissValdir: () => void;
    onReadMessages: () => void;
    getSnapshot: () => GameSnapshot;
  }) {
    this.container = opts.container;
    this.sound = opts.sound;
    this.storage = opts.storage;
    this.onTaskCompleted = opts.onTaskCompleted;
    this.onMistake = opts.onMistake;
    this.onRewindBell = opts.onRewindBell;
    this.onDismissValdir = opts.onDismissValdir;
    this.onReadMessages = opts.onReadMessages;
    this.getSnapshot = opts.getSnapshot;
  }

  resetForNight(firstTask: TaskType | null): void {
    this.currentApp = 'resgate';
    this.activeCamera = 'cam1';
    this.activeTaskIdx = -1;
    this.activeTaskType = null;
    if (firstTask) {
      this.setupTask(firstTask, 0);
    }
  }

  switchApp(app: PhoneAppId, snap: GameSnapshot): void {
    this.sound.playTap(1.1);
    this.currentApp = app;
    if (app === 'zap') {
      this.onReadMessages();
    }
    this.renderDOM(snap);
  }

  private setupTask(type: TaskType, index: number): void {
    this.activeTaskType = type;
    this.activeTaskIdx = index;

    switch (type) {
      case 'shortener': {
        this.shortenerCd = 6.0;
        this.shuffleShortener();
        break;
      }
      case 'captcha': {
        this.generateCaptcha();
        break;
      }
      case 'memory': {
        const len = index >= 3 ? 5 : 4;
        this.simonSeq = Array.from({ length: len }, () => Math.floor(Math.random() * 4));
        this.simonInput = [];
        this.simonShowTimer = 0;
        this.simonShowing = true;
        this.lastToneStep = -1;
        this.simonLitPad = -1;
        break;
      }
      case 'wifi': {
        this.targetFreq = 2 + Math.floor(Math.random() * 4); // 2..5
        this.targetAmp = 2 + Math.floor(Math.random() * 4); // 2..5
        this.userFreq = this.targetFreq === 2 ? 5 : 2;
        this.userAmp = this.targetAmp === 4 ? 1 : 4;
        this.wifiLockProgress = 0;
        break;
      }
      case 'pin': {
        this.pinInput = '';
        break;
      }
      case 'dial190': {
        this.dialInput = '';
        this.callCountdown = 0;
        this.callActive = false;
        break;
      }
    }
  }

  private shuffleShortener(): void {
    const traps = [
      'BAIXAR ATUALIZACAO_NSA_2026.EXE',
      'RESGATAR BOLSA ESTUDANTIL AGORA!',
      'INSTALAR ACELERADOR DE SINAL 5G',
      'VER GABARITO VAZADO DO CONSELHO',
    ];
    const pickedTraps = traps.sort(() => Math.random() - 0.5).slice(0, 2);
    this.shortenerOptions = [
      { label: pickedTraps[0], real: false, styleClass: 'ph-btn-trap1' },
      { label: pickedTraps[1], real: false, styleClass: 'ph-btn-trap2' },
      { label: 'Prosseguir para o destino >', real: true, styleClass: 'ph-btn-subtle' },
    ].sort(() => Math.random() - 0.5);
  }

  private generateCaptcha(): void {
    const a = 3 + Math.floor(Math.random() * 7);
    const b = 3 + Math.floor(Math.random() * 7);
    const c = 2 + Math.floor(Math.random() * 9);
    this.captchaExpr = `${a} × ${b} − ${c}`;
    this.captchaAnswer = a * b - c;
    this.captchaInput = '';
  }

  handleKeyInput(key: string, snap: GameSnapshot): boolean {
    if (snap.view !== 'P' || snap.phoneBattery <= 0 || snap.valdirPopup) return false;
    if (this.currentApp !== 'resgate') return false;

    if (this.activeTaskType === 'captcha') {
      if (/^[0-9]$/.test(key) && this.captchaInput.length < 3) {
        this.captchaInput += key;
        this.sound.playTap();
        this.renderDOM(snap);
        return true;
      }
      if (key === 'Backspace') {
        this.captchaInput = this.captchaInput.slice(0, -1);
        this.sound.playTap(0.8);
        this.renderDOM(snap);
        return true;
      }
      if (key === 'Enter') {
        this.submitCaptcha(snap);
        return true;
      }
    } else if (this.activeTaskType === 'pin') {
      if (/^[0-9]$/.test(key) && this.pinInput.length < 4) {
        this.pinInput += key;
        this.sound.playTap();
        if (this.pinInput.length === 4) {
          this.submitPin(snap);
        } else {
          this.renderDOM(snap);
        }
        return true;
      }
      if (key === 'Backspace') {
        this.pinInput = this.pinInput.slice(0, -1);
        this.renderDOM(snap);
        return true;
      }
    } else if (this.activeTaskType === 'dial190' && !this.callActive) {
      if (/^[0-9]$/.test(key) && this.dialInput.length < 3) {
        this.dialInput += key;
        this.sound.playTap(1 + Number(key) * 0.04);
        this.renderDOM(snap);
        return true;
      }
      if (key === 'Backspace') {
        this.dialInput = this.dialInput.slice(0, -1);
        this.renderDOM(snap);
        return true;
      }
      if (key === 'Enter') {
        this.submitDial(snap);
        return true;
      }
    }
    return false;
  }

  private submitCaptcha(snap: GameSnapshot): void {
    if (this.captchaInput.length === 0) return;
    if (Number(this.captchaInput) === this.captchaAnswer) {
      this.sound.playTaskSuccess();
      this.onTaskCompleted();
    } else {
      this.sound.playLoudErrorAlarm();
      this.generateCaptcha();
      this.onMistake('CAPTCHA incorreto! O alarme do navegador fez barulho.');
      this.renderDOM(snap);
    }
  }

  private submitPin(snap: GameSnapshot): void {
    if (this.pinInput === snap.dailyGatePin) {
      this.sound.playTaskSuccess();
      this.onTaskCompleted();
    } else {
      this.sound.playLoudErrorAlarm();
      this.pinInput = '';
      this.onMistake('PIN inválido! Confira o post-it no mural esquerdo ou na CAM 04.');
      this.renderDOM(snap);
    }
  }

  private submitDial(snap: GameSnapshot): void {
    if (this.dialInput === '190') {
      this.callActive = true;
      this.callCountdown = 5.5;
      this.sound.playNotification();
      this.renderDOM(snap);
    } else {
      this.sound.playLoudErrorAlarm();
      this.dialInput = '';
      this.onMistake('Número incorreto! Disque 190 para emergências.');
      this.renderDOM(snap);
    }
  }

  update(dt: number, snap: GameSnapshot, mouseNDC: { x: number; y: number } = { x: 0, y: 0 }): void {
    this.animClock += dt;

    // Sincroniza mudança de tarefa
    const expectedTask = snap.nightConfig.tasks[snap.taskIndex] ?? null;
    if (expectedTask && (snap.taskIndex !== this.activeTaskIdx || expectedTask !== this.activeTaskType)) {
      this.setupTask(expectedTask, snap.taskIndex);
      if (snap.view === 'P') this.renderDOM(snap);
    }

    if (snap.view !== 'P') return;

    const glareShift = 38 + mouseNDC.x * 26 + Math.sin(this.animClock * 1.1) * 6;
    this.container.style.setProperty('--ph-glare', `${glareShift.toFixed(1)}%`);

    if (this.camStaticTimer > 0) {
      this.camStaticTimer = Math.max(0, this.camStaticTimer - dt);
    }

    // Se bateria acabou ou popup de Valdir travou, pausa progresso ativo
    if (snap.phoneBattery <= 0) {
      return;
    }

    if (!snap.valdirPopup && this.currentApp === 'resgate') {
      if (this.activeTaskType === 'shortener' && this.shortenerCd > 0) {
        const prevCeil = Math.ceil(this.shortenerCd);
        this.shortenerCd = Math.max(0, this.shortenerCd - dt);
        if (this.shortenerCd <= 0) {
          this.renderDOM(snap);
        } else if (Math.ceil(this.shortenerCd) !== prevCeil) {
          const cdEl = this.container.querySelector('#ph-short-cd');
          if (cdEl) cdEl.textContent = String(Math.ceil(this.shortenerCd));
        }
      }

      if (this.activeTaskType === 'memory' && this.simonShowing) {
        this.simonShowTimer += dt;
        const stepDur = 0.72;
        const idx = Math.floor(this.simonShowTimer / stepDur);
        const within = (this.simonShowTimer % stepDur) < 0.46;

        if (idx >= this.simonSeq.length) {
          this.simonShowing = false;
          this.simonLitPad = -1;
          this.renderDOM(snap);
        } else {
          if (idx !== this.lastToneStep && within) {
            this.lastToneStep = idx;
            this.sound.playSimonTone(this.simonSeq[idx]);
          }
          const newLit = within ? this.simonSeq[idx] : -1;
          if (newLit !== this.simonLitPad) {
            this.simonLitPad = newLit;
            this.updateSimonPreviewBox();
          }
        }
      }

      if (this.activeTaskType === 'wifi') {
        const matched = this.userFreq === this.targetFreq && this.userAmp === this.targetAmp;
        if (matched) {
          this.wifiLockProgress = Math.min(1, this.wifiLockProgress + dt / 1.15);
          if (this.wifiLockProgress >= 1) {
            this.wifiLockProgress = 0;
            this.sound.playTaskSuccess();
            this.onTaskCompleted();
            return;
          }
        } else {
          this.wifiLockProgress = Math.max(0, this.wifiLockProgress - dt * 0.8);
        }
        this.drawWifiCanvas();
      }

      if (this.activeTaskType === 'dial190' && this.callActive) {
        this.callCountdown -= dt;
        if (this.callCountdown <= 0) {
          this.callActive = false;
          this.onTaskCompleted();
          return;
        }
        const dlEl = this.container.querySelector('#ph-call-timer');
        if (dlEl) {
          dlEl.textContent = `Rastreando Sala 04... ${Math.ceil(this.callCountdown)}s`;
        }
      }
    }

    if (this.currentApp === 'cftv') {
      this.drawCftvCanvas(snap);
    }

    // Atualiza barra superior de bateria e hora sem recriar o DOM inteiro
    const batEl = this.container.querySelector('#ph-bat-val');
    if (batEl) {
      batEl.textContent = `${Math.ceil(snap.phoneBattery)}%`;
    }
    const clkEl = this.container.querySelector('#ph-clk-val');
    if (clkEl) {
      clkEl.textContent = snap.clockText;
    }
  }

  isCftvActive(): boolean {
    return this.currentApp === 'cftv';
  }

  private updateSimonPreviewBox(): void {
    const colors = ['#c42b2b', '#439c63', '#2e6eb5', '#c9932c'];
    const preview = this.container.querySelector('#ph-simon-preview') as HTMLElement | null;
    if (!preview) return;
    if (this.simonLitPad >= 0) {
      preview.style.background = colors[this.simonLitPad];
      preview.style.boxShadow = `0 0 18px ${colors[this.simonLitPad]}`;
    } else {
      preview.style.background = '#070709';
      preview.style.boxShadow = 'none';
    }
  }

  private wrapPhysicalPhoneHardware(screenContentHtml: string): string {
    return `
      <div class="ph-oled-glass">
        ${screenContentHtml}
        <svg class="ph-screen-crack" viewBox="0 0 300 500" aria-hidden="true">
          <path d="M 252 0 L 269 27 L 300 41 M 269 27 L 284 62 L 300 71 M 269 27 L 246 44"
            fill="none" stroke="rgba(215, 232, 250, 0.2)" stroke-width="0.9"/>
        </svg>
        <div class="ph-glass-glare" aria-hidden="true"></div>
      </div>
    `;
  }

  renderDOM(snap: GameSnapshot): void {
    if (snap.phoneBattery <= 0) {
      this.container.innerHTML = this.wrapPhysicalPhoneHardware(`
        <div class="ph-statusbar"><span>--:--</span><span>SEM CARGA · 0%</span></div>
        <div class="ph-dead">
          <div class="ph-dead-icon">${ICONS.battery}</div>
          <h3>Aparelho Desligado</h3>
          <p>Abaixe o celular [S] para recarregar no Powerbank da carteira.</p>
        </div>
        <div class="ph-homebar"></div>
      `);
      return;
    }

    const bellBadge = snap.bellAlert ? `<span class="ph-badge-alert">!</span>` : '';
    const zapBadge =
      snap.unreadMessages > 0 ? `<span class="ph-badge">${snap.unreadMessages}</span>` : '';

    let bodyHtml = '';

    if (snap.valdirPopup) {
      const valdirDisp = this.storage.getTeacherDisplay('valdir');
      bodyHtml = `
        <div class="ph-valdir-lock">
          <div class="ph-warn-tag">SISTEMA ACADÊMICO NSA // BLOQUEIO</div>
          <h3>TERMO DE ADVERTÊNCIA</h3>
          <p><b>${valdirDisp.name}</b> interceptou tráfego na rede da Sala 04.</p>
          <p class="ph-small">Assine para liberar a tela e acenda a <b>Lanterna [F]</b> no Quadro-Negro à frente.</p>
          <button class="ph-btn-danger" data-act="dismiss-valdir">ASSINAR E DISPENSAR</button>
        </div>
      `;
    } else if (this.currentApp === 'resgate') {
      bodyHtml = this.renderResgateApp(snap);
    } else if (this.currentApp === 'cftv') {
      bodyHtml = this.renderCftvApp(snap);
    } else {
      bodyHtml = this.renderZapApp(snap);
    }

    this.container.innerHTML = this.wrapPhysicalPhoneHardware(`
      <div class="ph-statusbar">
        <span id="ph-clk-val">${snap.clockText}</span>
        <span class="ph-status-right">
          <i class="ph-sig-bars"><b></b><b></b><b></b><b></b></i>
          <span>4G</span>
          <b id="ph-bat-val">${Math.ceil(snap.phoneBattery)}%</b>
        </span>
      </div>
      <div class="ph-tabs">
        <button class="ph-tab ${this.currentApp === 'resgate' ? 'active' : ''}" data-app="resgate">
          ${ICONS.shield}<span>Rede</span>
        </button>
        <button class="ph-tab ${this.currentApp === 'cftv' ? 'active' : ''}" data-app="cftv">
          ${ICONS.camera}<span>CFTV</span>${bellBadge}
        </button>
        <button class="ph-tab ${this.currentApp === 'zap' ? 'active' : ''}" data-app="zap">
          ${ICONS.chat}<span>Chat</span>${zapBadge}
        </button>
      </div>
      <div class="ph-screen-body">
        ${bodyHtml}
      </div>
      <div class="ph-homebar"></div>
    `);

    this.bindEvents(snap);
  }

  private renderResgateApp(snap: GameSnapshot): string {
    if (snap.nightConfig.mode === 'survive6am') {
      return `
        <div class="ph-card">
          <div class="ph-url">https://nsa.etec.local/trava-horaria</div>
          <h3>Trava Automática 06:00</h3>
          <p class="ph-small">Os portões destravarão às <b>06:00 AM</b>. Monitore os corredores no <b>CFTV</b> e mantenha a sirene da CAM 03 adiada.</p>
        </div>
      `;
    }

    if (snap.taskIndex >= snap.totalTasks) {
      return `
        <div class="ph-card">
          <h3>Sinal Transmitido</h3>
          <p class="ph-small">Chamado registrado com sucesso.</p>
        </div>
      `;
    }

    const stepHeader = `
      <div class="ph-step-bar">
        <span>ETAPA ${snap.taskIndex + 1}/${snap.totalTasks}</span>
        <div class="ph-dots">
          ${Array.from({ length: snap.totalTasks })
            .map(
              (_, i) =>
                `<i class="${i < snap.taskIndex ? 'done' : i === snap.taskIndex ? 'cur' : ''}"></i>`
            )
            .join('')}
        </div>
      </div>
    `;

    switch (this.activeTaskType) {
      case 'shortener': {
        if (this.shortenerCd > 0) {
          return `
            ${stepHeader}
            <div class="ph-url">http://encurta-etec.net/gate-bypass</div>
            <div class="ph-card">
              <h3>Aguardando liberação DNS...</h3>
              <div class="ph-big-num" id="ph-short-cd">${Math.ceil(this.shortenerCd)}</div>
              <p class="ph-small">Mantenha a tela ativa até zerar.</p>
            </div>
          `;
        }
        return `
          ${stepHeader}
          <div class="ph-url">http://encurta-etec.net/pronto</div>
          <div class="ph-card">
            <h3>Evite os links falsos:</h3>
            <div class="ph-stack">
              ${this.shortenerOptions
                .map(
                  (opt, idx) =>
                    `<button class="${opt.styleClass}" data-short="${idx}">${opt.label}</button>`
                )
                .join('')}
            </div>
          </div>
        `;
      }

      case 'captcha': {
        return `
          ${stepHeader}
          <div class="ph-url">https://firewall.sebrae/auth</div>
          <div class="ph-card">
            <h3>Verificação de Segurança</h3>
            <div class="ph-math-box">${this.captchaExpr}</div>
            <div class="ph-input-preview">${this.captchaInput || '_'}</div>
            <div class="ph-numpad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'DEL', 0, 'OK']
                .map((k) => `<button data-capkey="${k}">${k}</button>`)
                .join('')}
            </div>
          </div>
        `;
      }

      case 'memory': {
        const colors = ['#c42b2b', '#439c63', '#2e6eb5', '#c9932c'];
        if (this.simonShowing) {
          return `
            ${stepHeader}
            <div class="ph-url">https://nsa.local/token-optico</div>
            <div class="ph-card">
              <h3>Memorize ${this.simonSeq.length} pulsos</h3>
              <div id="ph-simon-preview" class="ph-simon-single"></div>
              <p class="ph-small">Aguarde a transmissão da sequência...</p>
            </div>
          `;
        }
        return `
          ${stepHeader}
          <div class="ph-url">https://nsa.local/token-optico</div>
          <div class="ph-card">
            <h3>Repita a ordem (${this.simonInput.length}/${this.simonSeq.length})</h3>
            <div class="ph-simon-grid">
              ${colors
                .map(
                  (c, i) =>
                    `<button class="ph-simon-pad" style="background:${c}" data-simon="${i}"></button>`
                )
                .join('')}
            </div>
          </div>
        `;
      }

      case 'wifi': {
        return `
          ${stepHeader}
          <div class="ph-url">192.168.0.1 // MODEM BLOCO B</div>
          <div class="ph-card">
            <h3>Sincronizar Portadora 4G</h3>
            <canvas id="ph-wifi-canvas" width="240" height="96"></canvas>
            <div class="ph-tuner-controls">
              <div class="ph-tuner-row">
                <span>FREQ: <b>${this.userFreq} Hz</b></span>
                <div>
                  <button data-wifi="f-">-</button>
                  <button data-wifi="f+">+</button>
                </div>
              </div>
              <div class="ph-tuner-row">
                <span>GANHO: <b>${this.userAmp} dB</b></span>
                <div>
                  <button data-wifi="a-">-</button>
                  <button data-wifi="a+">+</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      case 'pin': {
        const masked = this.pinInput.padEnd(4, '·');
        return `
          ${stepHeader}
          <div class="ph-url">catraca.portaria // PIN DIÁRIO</div>
          <div class="ph-card">
            <h3>Código da Portaria</h3>
            <p class="ph-small">Anote no <b>Mural Esquerdo</b> da sala ou na <b>CAM 04</b>.</p>
            <div class="ph-input-preview">${masked}</div>
            <div class="ph-numpad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'CLR', 0, 'OK']
                .map((k) => `<button data-pinkey="${k}">${k}</button>`)
                .join('')}
            </div>
          </div>
        `;
      }

      case 'dial190':
      default: {
        if (this.callActive) {
          return `
            ${stepHeader}
            <div class="ph-url">VOZ // LINHA DE EMERGÊNCIA</div>
            <div class="ph-card ph-calling">
              <div class="ph-pulse-ring">${ICONS.call}</div>
              <h3>190 — COPOM Conectado</h3>
              <p id="ph-call-timer" class="ph-small">Rastreando Sala 04... ${Math.ceil(this.callCountdown)}s</p>
              <p class="ph-small">Não feche o aparelho até concluir o rastreio.</p>
            </div>
          `;
        }
        return `
          ${stepHeader}
          <div class="ph-url">DISCADOR DE EMERGÊNCIA</div>
          <div class="ph-card">
            <h3>Disque 190 para Resgate</h3>
            <div class="ph-input-preview">${this.dialInput || '---'}</div>
            <div class="ph-numpad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'CLR', 0, 'LIGAR']
                .map((k) => `<button data-dialkey="${k}">${k}</button>`)
                .join('')}
            </div>
          </div>
        `;
      }
    }
  }

  private renderCftvApp(snap: GameSnapshot): string {
    const cams: { id: CameraId; label: string }[] = [
      { id: 'cam1', label: 'CAM 01 · Corredor' },
      { id: 'cam2', label: 'CAM 02 · Pátio' },
      { id: 'cam3', label: 'CAM 03 · Sirene' },
      { id: 'cam4', label: 'CAM 04 · Sala Prof.' },
    ];

    const celiaActive = snap.nightConfig.aiLevels.celia > 0;
    const bellPct = Math.ceil(snap.teachers.celia.bellCharge);
    const bellHtml =
      this.activeCamera === 'cam3'
        ? celiaActive
          ? `
          <div class="ph-bell-box">
            <div class="ph-bell-meter">
              <span>CARGA DA SIRENE: <b>${bellPct}%</b></span>
              <div class="ph-bell-bar"><i style="width:${bellPct}%;background:${
                bellPct < 32 ? '#c42b2b' : '#59b377'
              }"></i></div>
            </div>
            <button class="ph-btn-bell" data-act="rewind-bell">${ICONS.bell} ADIAR SINAL (+35%)</button>
          </div>
        `
          : `<p class="ph-small">Sirene desativada neste turno.</p>`
        : '';

    return `
      <div class="ph-cftv-wrap">
        <canvas id="ph-cftv-canvas" width="252" height="154"></canvas>
        ${bellHtml}
        <div class="ph-cam-grid">
          ${cams
            .map(
              (c) => `
            <button class="ph-cam-btn ${this.activeCamera === c.id ? 'active' : ''} ${
              c.id === 'cam3' && snap.bellAlert ? 'alert' : ''
            }" data-cam="${c.id}">
              ${c.label}
            </button>`
            )
            .join('')}
        </div>
      </div>
    `;
  }

  private renderZapApp(snap: GameSnapshot): string {
    return `
      <div class="ph-zap-list">
        <div class="ph-zap-header">CANAL // TURMA DA RECUPERAÇÃO</div>
        ${snap.nightConfig.veteranoMessages
          .map(
            (m) => `
          <div class="ph-msg-bubble">
            <div class="ph-msg-meta"><b>${m.sender}</b><span>${m.time}</span></div>
            <p>${m.text}</p>
          </div>
        `
          )
          .join('')}
        <div class="ph-msg-tip">
          <b>NOTA FIXADA:</b> ${snap.nightConfig.briefingTip}
        </div>
      </div>
    `;
  }

  private bindEvents(snap: GameSnapshot): void {
    this.cftvCanvas = this.container.querySelector('#ph-cftv-canvas');
    this.wifiCanvas = this.container.querySelector('#ph-wifi-canvas');
    if (this.wifiCanvas) this.drawWifiCanvas();
    if (this.cftvCanvas) this.drawCftvCanvas(snap);
    if (this.activeTaskType === 'memory' && this.simonShowing) {
      this.updateSimonPreviewBox();
    }

    const fresh = () => this.getSnapshot();

    this.container.querySelectorAll('[data-app]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const app = (btn as HTMLElement).dataset.app as PhoneAppId;
        this.switchApp(app, fresh());
      });
    });

    this.container.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeCamera = (btn as HTMLElement).dataset.cam as CameraId;
        this.camStaticTimer = 0.22;
        this.sound.playCameraStatic();
        this.renderDOM(fresh());
      });
    });

    this.container.querySelector('[data-act="rewind-bell"]')?.addEventListener('click', () => {
      this.sound.playTap(1.25);
      this.onRewindBell();
      this.renderDOM(fresh());
    });

    this.container.querySelector('[data-act="dismiss-valdir"]')?.addEventListener('click', () => {
      this.sound.playTap(0.95);
      this.onDismissValdir();
      this.renderDOM(fresh());
    });

    this.container.querySelectorAll('[data-short]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number((btn as HTMLElement).dataset.short);
        const opt = this.shortenerOptions[idx];
        if (opt?.real) {
          this.sound.playTaskSuccess();
          this.onTaskCompleted();
        } else {
          this.sound.playLoudErrorAlarm();
          this.shuffleShortener();
          this.onMistake('Era anúncio falso! O pop-up sonoro alertou o corredor!');
          this.renderDOM(fresh());
        }
      });
    });

    this.container.querySelectorAll('[data-capkey]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = (btn as HTMLElement).dataset.capkey!;
        if (k === 'DEL') {
          this.captchaInput = this.captchaInput.slice(0, -1);
          this.sound.playTap(0.8);
          this.renderDOM(fresh());
        } else if (k === 'OK') {
          this.submitCaptcha(fresh());
        } else if (this.captchaInput.length < 3) {
          this.captchaInput += k;
          this.sound.playTap();
          this.renderDOM(fresh());
        }
      });
    });

    this.container.querySelectorAll('[data-simon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pad = Number((btn as HTMLElement).dataset.simon);
        this.simonInput.push(pad);
        this.sound.playSimonTone(pad);
        const pos = this.simonInput.length - 1;
        const curSnap = fresh();
        if (this.simonInput[pos] !== this.simonSeq[pos]) {
          this.sound.playLoudErrorAlarm();
          this.setupTask('memory', curSnap.taskIndex);
          this.onMistake('Sequência errada! Reiniciando autenticador...');
          this.renderDOM(fresh());
        } else if (this.simonInput.length === this.simonSeq.length) {
          this.sound.playTaskSuccess();
          this.onTaskCompleted();
        } else {
          this.renderDOM(curSnap);
        }
      });
    });

    this.container.querySelectorAll('[data-wifi]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cmd = (btn as HTMLElement).dataset.wifi!;
        this.sound.playTap();
        if (cmd === 'f-') this.userFreq = Math.max(1, this.userFreq - 1);
        if (cmd === 'f+') this.userFreq = Math.min(6, this.userFreq + 1);
        if (cmd === 'a-') this.userAmp = Math.max(1, this.userAmp - 1);
        if (cmd === 'a+') this.userAmp = Math.min(6, this.userAmp + 1);
        this.renderDOM(fresh());
      });
    });

    this.container.querySelectorAll('[data-pinkey]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = (btn as HTMLElement).dataset.pinkey!;
        if (k === 'CLR') {
          this.pinInput = '';
          this.sound.playTap(0.8);
          this.renderDOM(fresh());
        } else if (k === 'OK') {
          this.submitPin(fresh());
        } else if (this.pinInput.length < 4) {
          this.pinInput += k;
          this.sound.playTap();
          if (this.pinInput.length === 4) {
            this.submitPin(fresh());
          } else {
            this.renderDOM(fresh());
          }
        }
      });
    });

    this.container.querySelectorAll('[data-dialkey]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = (btn as HTMLElement).dataset.dialkey!;
        if (k === 'CLR') {
          this.dialInput = '';
          this.sound.playTap(0.8);
          this.renderDOM(fresh());
        } else if (k === 'LIGAR') {
          this.submitDial(fresh());
        } else if (this.dialInput.length < 3) {
          this.dialInput += k;
          this.sound.playTap(1 + Number(k) * 0.04);
          this.renderDOM(fresh());
        }
      });
    });
  }

  private drawWifiCanvas(): void {
    if (!this.wifiCanvas) return;
    const x = this.wifiCanvas.getContext('2d')!;
    const w = this.wifiCanvas.width;
    const h = this.wifiCanvas.height;

    x.fillStyle = '#070a08';
    x.fillRect(0, 0, w, h);

    // Grade do osciloscópio analógico
    x.strokeStyle = 'rgba(89, 179, 119, 0.14)';
    x.lineWidth = 1;
    for (let gx = 0; gx < w; gx += 24) {
      x.beginPath();
      x.moveTo(gx, 0);
      x.lineTo(gx, h);
      x.stroke();
    }
    x.beginPath();
    x.moveTo(0, h / 2);
    x.lineTo(w, h / 2);
    x.stroke();

    // Onda alvo (fósforo verde)
    x.strokeStyle = 'rgba(89, 179, 119, 0.52)';
    x.lineWidth = 2;
    x.beginPath();
    for (let px = 0; px < w; px++) {
      const y =
        h / 2 +
        Math.sin((px / w) * Math.PI * 2 * this.targetFreq + this.animClock * 3.5) *
          (this.targetAmp * 6.5);
      if (px === 0) x.moveTo(px, y);
      else x.lineTo(px, y);
    }
    x.stroke();

    // Onda do jogador (âmbar -> fósforo ao sincronizar)
    const matched = this.userFreq === this.targetFreq && this.userAmp === this.targetAmp;
    x.strokeStyle = matched ? '#6ee7a8' : '#d69e36';
    x.lineWidth = 2.6;
    x.beginPath();
    for (let px = 0; px < w; px++) {
      const y =
        h / 2 +
        Math.sin((px / w) * Math.PI * 2 * this.userFreq + this.animClock * 3.5) *
          (this.userAmp * 6.5);
      if (px === 0) x.moveTo(px, y);
      else x.lineTo(px, y);
    }
    x.stroke();

    if (this.wifiLockProgress > 0) {
      x.fillStyle = '#22c55e';
      x.fillRect(0, h - 5, w * this.wifiLockProgress, 5);
    }
  }

  private drawCftvCanvas(snap: GameSnapshot): void {
    if (!this.cftvCanvas) return;
    const x = this.cftvCanvas.getContext('2d')!;
    const w = this.cftvCanvas.width;
    const h = this.cftvCanvas.height;

    // Fundo visão noturna esverdeada
    x.fillStyle = '#07140d';
    x.fillRect(0, 0, w, h);

    if (this.camStaticTimer > 0) {
      // Chiado forte de troca de câmera
      for (let i = 0; i < 420; i++) {
        const g = Math.floor(Math.random() * 190);
        x.fillStyle = `rgb(${g * 0.6},${g},${g * 0.7})`;
        x.fillRect(Math.random() * w, Math.random() * h, 8, 3);
      }
      return;
    }

    const drawFigure = (
      cx: number,
      cy: number,
      scale: number,
      id: TeacherId,
      stageLabel: string
    ) => {
      const disp = this.storage.getTeacherDisplay(id);
      x.save();
      x.translate(cx, cy);
      x.scale(scale, scale);

      // Silhueta amedrontadora de aparição encapuzada em farrapos no infravermelho (manto rasgado em pontas + capuz fundo)
      x.fillStyle = '#06110b';
      x.strokeStyle = 'rgba(134, 239, 172, 0.52)';
      x.lineWidth = 1.1;
      x.beginPath();
      x.moveTo(-22, 26);
      x.lineTo(-17, 6);
      x.lineTo(-24, 15);
      x.lineTo(-19, -12);
      x.quadraticCurveTo(0, -18, 19, -12);
      x.lineTo(24, 15);
      x.lineTo(17, 6);
      x.lineTo(22, 26);
      // Pontas rasgadas inferiores da mortalha
      x.lineTo(14, 18);
      x.lineTo(9, 28);
      x.lineTo(2, 19);
      x.lineTo(-3, 29);
      x.lineTo(-10, 18);
      x.lineTo(-15, 27);
      x.closePath();
      x.fill();
      x.stroke();

      // Capuz cônico fundo cobrindo a cabeça + abismo negro facial
      x.fillStyle = '#07140d';
      x.beginPath();
      x.moveTo(-13, -10);
      x.quadraticCurveTo(-12, -31, 0, -37);
      x.quadraticCurveTo(12, -31, 13, -10);
      x.closePath();
      x.fill();
      x.stroke();

      x.fillStyle = '#020503';
      x.beginPath();
      x.ellipse(0, -22, 7.5, 9.5, 0, 0, Math.PI * 2);
      x.fill();

      // Reflexo vítreo minúsculo de infravermelho dos olhos lá no fundo do capuz!
      x.fillStyle = '#ecfdf5';
      x.fillRect(-4.2, -23.5, 1.6, 1.4);
      x.fillRect(2.6, -23.5, 1.6, 1.4);
      x.restore();

      x.fillStyle = '#86efac';
      x.font = 'bold 10px monospace';
      x.textAlign = 'center';
      x.fillText(`${disp.name} ${stageLabel}`, cx, cy + 36 * scale);
    };

    if (this.activeCamera === 'cam1') {
      // Perspectiva IR do Corredor Outlast 2 (forro modular T-Bar, luminária estourada e reflexo no piso úmido!)
      const hallGrad = x.createLinearGradient(0, 0, 0, h);
      hallGrad.addColorStop(0, '#092216');
      hallGrad.addColorStop(0.48, '#040d08');
      hallGrad.addColorStop(1, '#081d13');
      x.fillStyle = hallGrad;
      x.fillRect(0, 0, w, h);

      // Luminária fluorescente estourada no teto + reflexo espelhado no piso molhado
      const ceilGlow = x.createRadialGradient(w / 2, 24, 2, w / 2, 24, 52);
      ceilGlow.addColorStop(0, 'rgba(209, 250, 229, 0.85)');
      ceilGlow.addColorStop(0.4, 'rgba(52, 211, 153, 0.22)');
      ceilGlow.addColorStop(1, 'rgba(16, 185, 129, 0)');
      x.fillStyle = ceilGlow;
      x.fillRect(0, 0, w, 76);

      const floorRefl = x.createRadialGradient(w / 2, h - 18, 2, w / 2, h - 18, 48);
      floorRefl.addColorStop(0, 'rgba(167, 243, 208, 0.35)');
      floorRefl.addColorStop(1, 'rgba(16, 185, 129, 0)');
      x.fillStyle = floorRefl;
      x.fillRect(0, h - 64, w, 64);

      x.strokeStyle = 'rgba(74, 222, 128, 0.32)';
      x.lineWidth = 1.2;
      x.strokeRect(58, 34, w - 116, h - 68);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(58, 34);
      x.moveTo(w, 0);
      x.lineTo(w - 58, 34);
      x.moveTo(0, h);
      x.lineTo(58, h - 34);
      x.moveTo(w, h);
      x.lineTo(w - 58, h - 34);
      // Barra bicolor nas paredes laterais
      x.moveTo(0, h * 0.62);
      x.lineTo(58, h * 0.56);
      x.moveTo(w, h * 0.62);
      x.lineTo(w - 58, h * 0.56);
      x.stroke();

      // Buraco escuro da placa de forro arrancada + cabos pendurados
      x.fillStyle = '#020604';
      x.fillRect(82, 12, 24, 11);
      x.strokeStyle = 'rgba(134, 239, 172, 0.45)';
      x.beginPath();
      x.moveTo(90, 23);
      x.lineTo(89, 39);
      x.moveTo(97, 23);
      x.lineTo(99, 43);
      x.stroke();

      const present = (['marcos', 'ricardo'] as TeacherId[]).filter(
        (id) => snap.teachers[id].side === 'L' && snap.teachers[id].stage > 0
      );
      if (present.length === 0) {
        x.fillStyle = 'rgba(134,239,172,0.5)';
        x.font = '11px monospace';
        x.textAlign = 'center';
        x.fillText('CORREDOR LIVRE', w / 2, h / 2);
      } else {
        present.forEach((id, i) => {
          const st = snap.teachers[id].stage;
          const sc = st === 1 ? 0.68 : st === 2 ? 1.05 : 1.3;
          drawFigure(
            w / 2 + (i - (present.length - 1) / 2) * 58,
            h / 2 + (st - 1) * 10,
            sc,
            id,
            st >= 3 ? '[NA PORTA!]' : st === 2 ? '[PRÓXIMO]' : '[LONGE]'
          );
        });
      }
    } else if (this.activeCamera === 'cam2') {
      // Pátio externo sob chuva
      x.strokeStyle = '#1b4332';
      x.strokeRect(20, 96, w - 40, 2);
      for (let r = 0; r < 28; r++) {
        const rx = ((r * 37 + this.animClock * 90) % w);
        const ry = ((r * 29 + this.animClock * 180) % h);
        x.fillStyle = 'rgba(134,239,172,0.28)';
        x.fillRect(rx, ry, 1, 8);
      }

      const present = (['helena', 'ricardo'] as TeacherId[]).filter(
        (id) => snap.teachers[id].side === 'R' && snap.teachers[id].stage > 0
      );
      if (present.length === 0) {
        x.fillStyle = 'rgba(134,239,172,0.5)';
        x.font = '11px monospace';
        x.textAlign = 'center';
        x.fillText('PÁTIO SEM MOVIMENTO', w / 2, h / 2);
      } else {
        present.forEach((id, i) => {
          const st = snap.teachers[id].stage;
          const sc = st === 1 ? 0.68 : st === 2 ? 1.05 : 1.3;
          drawFigure(
            w / 2 + (i - (present.length - 1) / 2) * 58,
            h / 2 + 6,
            sc,
            id,
            st >= 3 ? '[NA JANELA!]' : st === 2 ? '[PRÓXIMO]' : '[PÁTIO]'
          );
        });
      }
    } else if (this.activeCamera === 'cam3') {
      // Secretaria & Painel do Sinal
      x.strokeStyle = '#24593c';
      x.strokeRect(24, 30, 82, 54);
      x.fillStyle = '#86efac';
      x.font = '10px monospace';
      x.textAlign = 'left';
      x.fillText('PAINEL SIRENE', 29, 46);
      const pct = Math.ceil(snap.teachers.celia.bellCharge);
      x.fillStyle = pct < 32 ? '#f87171' : '#4ade80';
      x.font = 'bold 18px monospace';
      x.fillText(`${pct}%`, 42, 72);

      if (snap.nightConfig.aiLevels.celia > 0) {
        const st = snap.teachers.celia.stage;
        if (st < 3) {
          drawFigure(178, 78, pct < 35 ? 1.05 : 0.82, 'celia', pct < 35 ? '[LEVANTANDO!]' : '[POSTO]');
        } else {
          x.fillStyle = '#f87171';
          x.font = 'bold 11px monospace';
          x.textAlign = 'center';
          x.fillText('[POSTO VAZIO!]', 172, 78);
        }
      }
    } else {
      // CAM 04 — Sala dos Professores + PIN da Catraca!
      x.fillStyle = '#123121';
      x.fillRect(150, 26, 86, 56);
      x.strokeStyle = '#4ade80';
      x.strokeRect(150, 26, 86, 56);
      x.fillStyle = '#bbf7d0';
      x.font = '9px monospace';
      x.textAlign = 'center';
      x.fillText('PIN CATRACA', 193, 42);
      x.font = 'bold 18px monospace';
      x.fillText(snap.dailyGatePin, 193, 68);

      const waiting = (['marcos', 'helena', 'ricardo'] as TeacherId[]).filter(
        (id) => snap.teachers[id].stage === 0 && snap.nightConfig.aiLevels[id] > 0
      );
      x.textAlign = 'left';
      x.font = '10px monospace';
      x.fillStyle = '#86efac';
      x.fillText('NA SALA DOS PROF.:', 14, 40);
      if (waiting.length === 0) {
        x.fillStyle = '#fca5a5';
        x.fillText('• Todos em ronda!', 14, 60);
      } else {
        waiting.forEach((id, idx) => {
          x.fillStyle = '#a7f3d0';
          x.fillText(`• ${this.storage.getTeacherDisplay(id).name}`, 14, 58 + idx * 16);
        });
      }
    }

    // Linhas de varredura CRT + carimbo REC
    x.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < h; y += 4) {
      x.fillRect(0, y, w, 1.5);
    }
    x.fillStyle = Math.floor(this.animClock * 2) % 2 === 0 ? '#ef4444' : '#7f1d1d';
    x.beginPath();
    x.arc(14, 14, 4, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#d1fae5';
    x.font = 'bold 10px monospace';
    x.textAlign = 'left';
    x.fillText(`REC · ${this.activeCamera.toUpperCase()}`, 23, 17);
    x.textAlign = 'right';
    x.fillText(snap.clockText, w - 10, 17);
  }
}
