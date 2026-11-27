import { SoundEngine } from '../audio/SoundEngine';
import { StorageManager } from '../state/storage';
import {
  CameraId,
  GameSnapshot,
  PhoneAppId,
  TaskType,
  TeacherId,
} from '../types';

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
      '🎁 GANHOU BOLSA INTEGRAL! RESGATAR',
      '⚠️ ATUALIZAR JAVA DO NSA.EXE',
      '⬇️ BAIXAR ACELERADOR 5G GRÁTIS',
      '🔔 VER NOTA VAZADA DO CONSELHO',
    ];
    const pickedTraps = traps.sort(() => Math.random() - 0.5).slice(0, 2);
    this.shortenerOptions = [
      { label: pickedTraps[0], real: false, styleClass: 'ph-btn-trap1' },
      { label: pickedTraps[1], real: false, styleClass: 'ph-btn-trap2' },
      { label: 'Prosseguir para link seguro ▶', real: true, styleClass: 'ph-btn-subtle' },
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

  update(dt: number, snap: GameSnapshot): void {
    this.animClock += dt;

    // Sincroniza mudança de tarefa
    const expectedTask = snap.nightConfig.tasks[snap.taskIndex] ?? null;
    if (expectedTask && (snap.taskIndex !== this.activeTaskIdx || expectedTask !== this.activeTaskType)) {
      this.setupTask(expectedTask, snap.taskIndex);
      if (snap.view === 'P') this.renderDOM(snap);
    }

    if (snap.view !== 'P') return;

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
    const colors = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'];
    const preview = this.container.querySelector('#ph-simon-preview') as HTMLElement | null;
    if (!preview) return;
    if (this.simonLitPad >= 0) {
      preview.style.background = colors[this.simonLitPad];
      preview.style.boxShadow = `0 0 24px ${colors[this.simonLitPad]}`;
    } else {
      preview.style.background = '#141923';
      preview.style.boxShadow = 'none';
    }
  }

  renderDOM(snap: GameSnapshot): void {
    if (snap.phoneBattery <= 0) {
      this.container.innerHTML = `
        <div class="ph-statusbar"><span>--:--</span><span>🪫 0%</span></div>
        <div class="ph-dead">
          <div class="ph-dead-icon">🪫</div>
          <h3>Bateria Esgotada</h3>
          <p>Guarde o celular (S / Espaço) para recarregar no Powerbank sobre sua carteira!</p>
        </div>
      `;
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
          <div class="ph-warn-tag">SISTEMA ACADÊMICO NSA</div>
          <h3>⚠️ TERMO DE ADVERTÊNCIA</h3>
          <p><b>${valdirDisp.name}</b> detectou tráfego não autorizado na Sala 04.</p>
          <p class="ph-small">Dispense este aviso e jogue a <b>Lanterna (F)</b> no Quadro-Negro à frente!</p>
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

    this.container.innerHTML = `
      <div class="ph-notch"></div>
      <div class="ph-statusbar">
        <span id="ph-clk-val">${snap.clockText}</span>
        <span>4G ▂▄▆ · 🔋<b id="ph-bat-val">${Math.ceil(snap.phoneBattery)}%</b></span>
      </div>
      <div class="ph-tabs">
        <button class="ph-tab ${this.currentApp === 'resgate' ? 'active' : ''}" data-app="resgate">
          🆘 Resgate
        </button>
        <button class="ph-tab ${this.currentApp === 'cftv' ? 'active' : ''}" data-app="cftv">
          📹 CFTV ${bellBadge}
        </button>
        <button class="ph-tab ${this.currentApp === 'zap' ? 'active' : ''}" data-app="zap">
          💬 Dicas ${zapBadge}
        </button>
      </div>
      <div class="ph-screen-body">
        ${bodyHtml}
      </div>
      <div class="ph-homebar"></div>
    `;

    this.bindEvents(snap);
  }

  private renderResgateApp(snap: GameSnapshot): string {
    if (snap.nightConfig.mode === 'survive6am') {
      return `
        <div class="ph-card">
          <div class="ph-url">🔒 nsa.etec.sp.gov.br/ponto</div>
          <h3>Modo Sobrevivência 6AM</h3>
          <p class="ph-small">O portão abrirá automaticamente às <b>06:00 AM</b>. Use o app <b>CFTV</b> para vigiar a equipe e manter o sinal da CAM 03 adiado!</p>
        </div>
      `;
    }

    if (snap.taskIndex >= snap.totalTasks) {
      return `
        <div class="ph-card">
          <h3>✅ Protocolo Concluído!</h3>
          <p>Sinal de emergência transmitido!</p>
        </div>
      `;
    }

    const stepHeader = `
      <div class="ph-step-bar">
        <span>Etapa ${snap.taskIndex + 1} de ${snap.totalTasks}</span>
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
            <div class="ph-url">🔒 linkcurto.io/desbloqueio-190</div>
            <div class="ph-card">
              <h3>Liberando túnel DNS...</h3>
              <div class="ph-big-num" id="ph-short-cd">${Math.ceil(this.shortenerCd)}</div>
              <p class="ph-small">Mantenha a tela aberta para o contador avançar.</p>
            </div>
          `;
        }
        return `
          ${stepHeader}
          <div class="ph-url">🔒 linkcurto.io/pronto</div>
          <div class="ph-card">
            <h3>Link pronto! Cuidado com anúncios falsos:</h3>
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
          <div class="ph-url">🔒 firewall.etec/captcha</div>
          <div class="ph-card">
            <h3>Prove que é humano</h3>
            <div class="ph-math-box">${this.captchaExpr}</div>
            <div class="ph-input-preview">${this.captchaInput || '?'}</div>
            <div class="ph-numpad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, 'OK']
                .map((k) => `<button data-capkey="${k}">${k}</button>`)
                .join('')}
            </div>
          </div>
        `;
      }

      case 'memory': {
        const colors = ['#ef4444', '#22c55e', '#3b82f6', '#eab308'];
        if (this.simonShowing) {
          return `
            ${stepHeader}
            <div class="ph-url">🔒 auth.sebrae/token-visual</div>
            <div class="ph-card">
              <h3>Memorize os ${this.simonSeq.length} sinais</h3>
              <div id="ph-simon-preview" class="ph-simon-single"></div>
              <p class="ph-small">Observe a ordem das cores...</p>
            </div>
          `;
        }
        return `
          ${stepHeader}
          <div class="ph-url">🔒 auth.sebrae/token-visual</div>
          <div class="ph-card">
            <h3>Repita (${this.simonInput.length}/${this.simonSeq.length})</h3>
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
          <div class="ph-url">📡 192.168.0.1/antena-4g</div>
          <div class="ph-card">
            <h3>Alinhe as ondas do sinal</h3>
            <canvas id="ph-wifi-canvas" width="240" height="96"></canvas>
            <div class="ph-tuner-controls">
              <div class="ph-tuner-row">
                <span>Frequência: <b>${this.userFreq}</b></span>
                <div>
                  <button data-wifi="f-">-</button>
                  <button data-wifi="f+">+</button>
                </div>
              </div>
              <div class="ph-tuner-row">
                <span>Amplitude: <b>${this.userAmp}</b></span>
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
        const masked = this.pinInput.padEnd(4, '•');
        return `
          ${stepHeader}
          <div class="ph-url">🔐 catraca.bloco-b/pin</div>
          <div class="ph-card">
            <h3>Senha Diária da Catraca</h3>
            <p class="ph-small">Dica: veja o post-it no <b>Mural Esquerdo</b> ou na <b>CAM 04</b>!</p>
            <div class="ph-input-preview ph-mono">${masked}</div>
            <div class="ph-numpad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK']
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
            <div class="ph-url">📞 Chamada de Emergência</div>
            <div class="ph-card ph-calling">
              <div class="ph-pulse-ring">🚓</div>
              <h3>190 — COPOM Atendeu!</h3>
              <p id="ph-call-timer">Rastreando Sala 04... ${Math.ceil(this.callCountdown)}s</p>
              <p class="ph-small">Mantenha a linha aberta na tela até concluir!</p>
            </div>
          `;
        }
        return `
          ${stepHeader}
          <div class="ph-url">📞 Telefone de Emergência</div>
          <div class="ph-card">
            <h3>Disque 190 para Resgate</h3>
            <div class="ph-input-preview ph-mono">${this.dialInput || '—'}</div>
            <div class="ph-numpad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '📞']
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
      { id: 'cam3', label: 'CAM 03 · Sinal' },
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
              <span>Temporizador da Sirene: <b>${bellPct}%</b></span>
              <div class="ph-bell-bar"><i style="width:${bellPct}%;background:${
                bellPct < 32 ? '#ef4444' : '#22c55e'
              }"></i></div>
            </div>
            <button class="ph-btn-bell" data-act="rewind-bell">🔔 ADIAR SINAL (+35%)</button>
          </div>
        `
          : `<p class="ph-small">Painel da sirene desligado nesta noite.</p>`
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
        <div class="ph-zap-header">💬 Grupo: Sobreviventes ETEC</div>
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
          <b>Resumo Rápido:</b> ${snap.nightConfig.briefingTip}
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
        if (k === '⌫') {
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
        if (k === 'C') {
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
        if (k === 'C') {
          this.dialInput = '';
          this.sound.playTap(0.8);
          this.renderDOM(fresh());
        } else if (k === '📞') {
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

    x.fillStyle = '#08111a';
    x.fillRect(0, 0, w, h);

    // Grade do osciloscópio
    x.strokeStyle = 'rgba(56, 189, 248, 0.12)';
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

    // Onda alvo (verde tracejada)
    x.strokeStyle = 'rgba(74, 222, 128, 0.72)';
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

    // Onda do jogador (ciano brilhante)
    const matched = this.userFreq === this.targetFreq && this.userAmp === this.targetAmp;
    x.strokeStyle = matched ? '#4ade80' : '#38bdf8';
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
      x.fillStyle = '#0d2619';
      x.strokeStyle = '#6ee7a8';
      x.lineWidth = 1.6;
      // Silhueta tronco + cabeça
      x.beginPath();
      x.arc(0, -24, 10, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillRect(-14, -13, 28, 36);
      x.strokeRect(-14, -13, 28, 36);
      // Olhos brilhantes no infravermelho!
      x.fillStyle = '#d9fbe8';
      x.fillRect(-5, -26, 3, 3);
      x.fillRect(2, -26, 3, 3);
      x.restore();

      x.fillStyle = '#86efac';
      x.font = 'bold 10px monospace';
      x.textAlign = 'center';
      x.fillText(`${disp.name} ${stageLabel}`, cx, cy + 36 * scale);
    };

    if (this.activeCamera === 'cam1') {
      // Perspectiva do Corredor Bloco A
      x.strokeStyle = '#1f4d33';
      x.lineWidth = 1.5;
      x.strokeRect(48, 28, w - 96, h - 56);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(48, 28);
      x.moveTo(w, 0);
      x.lineTo(w - 48, 28);
      x.moveTo(0, h);
      x.lineTo(48, h - 28);
      x.moveTo(w, h);
      x.lineTo(w - 48, h - 28);
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
          x.font = 'bold 12px monospace';
          x.textAlign = 'center';
          x.fillText('⚠️ SAIU DA SECRETARIA!', 172, 78);
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
