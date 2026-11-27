import { ACHIEVEMENTS } from '../config/achievements';
import {
  buildCustomNightConfig,
  CAMPAIGN_NIGHTS,
  CUSTOM_NIGHT_PRESETS,
} from '../config/nights';
import { TEACHER_ORDER } from '../config/teachers';
import { GameEndPayload } from '../game/GameEngine';
import { StorageManager } from '../state/storage';
import {
  GameSettings,
  GameSnapshot,
  NightConfig,
  TeacherId,
  ViewDirection,
} from '../types';

type MenuTab = 'home' | 'nights' | 'custom' | 'dossie' | 'achievements' | 'settings';

export class UIManager {
  private overlayRoot: HTMLElement;
  private hudRoot: HTMLElement;
  private grainEl: HTMLElement;
  private vignetteEl: HTMLElement;
  private flashEl: HTMLElement;
  private phoneEl: HTMLElement;

  private storage: StorageManager;
  private currentTab: MenuTab = 'home';
  private editingTeacher: TeacherId | null = null;

  private customAi: Record<TeacherId, number> = {
    marcos: 10,
    helena: 10,
    ricardo: 10,
    valdir: 10,
    celia: 10,
  };
  private customMode: 'protocol' | 'survive6am' = 'protocol';

  private callbacks: {
    onStartNight: (config: NightConfig) => void;
    onSetView: (v: ViewDirection) => void;
    onToggleFlashlight: () => void;
    onToggleDoor: () => void;
    onToggleBlinds: () => void;
    onTogglePause: () => void;
    onQuitToMenu: () => void;
    onSettingsChanged: (s: GameSettings) => void;
    onTeacherAppearanceChanged: (id: TeacherId) => void;
    onUiSound: () => void;
  };

  constructor(opts: {
    overlayRoot: HTMLElement;
    hudRoot: HTMLElement;
    grainEl: HTMLElement;
    vignetteEl: HTMLElement;
    flashEl: HTMLElement;
    phoneEl: HTMLElement;
    storage: StorageManager;
    callbacks: UIManager['callbacks'];
  }) {
    this.overlayRoot = opts.overlayRoot;
    this.hudRoot = opts.hudRoot;
    this.grainEl = opts.grainEl;
    this.vignetteEl = opts.vignetteEl;
    this.flashEl = opts.flashEl;
    this.phoneEl = opts.phoneEl;
    this.storage = opts.storage;
    this.callbacks = opts.callbacks;

    this.buildHudDOM();
    this.applyVisualSettings();
  }

  applyVisualSettings(): void {
    const s = this.storage.getSettings();
    this.grainEl.classList.toggle('off', !s.filmGrain);
  }

  triggerRedFlash(opacity = 0.78): void {
    const reduced = this.storage.getSettings().reducedFlashes;
    this.flashEl.style.opacity = String(reduced ? Math.min(0.25, opacity) : opacity);
    setTimeout(() => {
      this.flashEl.style.opacity = '0';
    }, 320);
  }

  showMainMenu(tab: MenuTab = 'home'): void {
    this.currentTab = tab;
    this.hudRoot.style.display = 'none';
    this.phoneEl.style.display = 'none';
    this.overlayRoot.style.display = 'flex';
    this.renderCurrentMenuTab();
  }

  private renderCurrentMenuTab(): void {
    const save = this.storage.getData();

    if (this.currentTab === 'home') {
      const nextNightNum = Math.min(5, save.unlockedNight);
      const nextNight = CAMPAIGN_NIGHTS[nextNightNum - 1];

      this.overlayRoot.innerHTML = `
        <div class="menu-shell">
          <span class="brand-kicker">🔴 ETEC SEBRAE · SURVIVAL HORROR 3D</span>
          <h1 class="brand-title">PLANTÃO NOTURNO</h1>
          <p class="brand-sub">
            Sexta-feira, meia-noite. Os portões magnéticos da ETEC Sebrae travaram e o
            <b>Diário de Classe</b> manteve a equipe pedagógica em ronda eterna.
            Quebre o bloqueio no celular para chamar o resgate 190 antes das 06:00 — mas lembre-se da regra nº 1:
            <b>celular guardado quando eles estiverem olhando</b>.
          </p>

          <div class="menu-grid">
            <div class="menu-actions">
              <button class="btn btn-primary" data-go-night="${nextNightNum}">
                <span>▶ Iniciar ${nextNight.dayLabel}: ${nextNight.title.split('—')[1]?.trim() || ''}</span>
                <span>→</span>
              </button>
              <button class="btn" data-tab="nights">
                <span>📅 Selecionar Noite (Campanha 1–5)</span>
                <span>${save.completedNights.length}/5 concluídas</span>
              </button>
              <button class="btn" data-tab="custom">
                <span>⚖️ Conselho de Classe (Noite Personalizada)</span>
                <span>IA 0–20</span>
              </button>
              <button class="btn" data-tab="dossie">
                <span>🗂️ Dossiê & Personalizar Professores (Fotos/Nomes)</span>
                <span>5 docentes</span>
              </button>
              <button class="btn" data-tab="achievements">
                <span>🏆 Conquistas & Histórico</span>
                <span>${save.unlockedAchievements.length}/${ACHIEVEMENTS.length}</span>
              </button>
              <button class="btn" data-tab="settings">
                <span>⚙️ Configurações & Controles</span>
                <span>Áudio / Vídeo</span>
              </button>
            </div>

            <div class="info-panel">
              <div>
                <h3 style="margin:0 0 8px;font-size:15px;color:#f8fafc">Resumo de Comandos</h3>
                <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.55">
                  • <b>A / D / W</b> (ou botões): Olhar Porta, Janela e Quadro<br/>
                  • <b>S</b>: Levantar / Guardar o Celular<br/>
                  • <b>F</b>: Ligar / Desligar a Lanterna<br/>
                  • <b>Espaço</b>: Trava Magnética da Porta Esquerda<br/>
                  • <b>E</b>: Fechar / Abrir Persiana da Janela Direita<br/>
                  • <b>ESC</b>: Pausar partida
                </p>
              </div>

              <div class="stat-pills">
                <div class="stat-pill">
                  <span>Turnos Vencidos</span>
                  <b>${save.stats.nightsWon}</b>
                </div>
                <div class="stat-pill">
                  <span>Retenções (I)</span>
                  <b>${save.stats.deaths}</b>
                </div>
                <div class="stat-pill">
                  <span>Recorde Conselho</span>
                  <b>${save.customNightBestScore}</b>
                </div>
                <div class="stat-pill">
                  <span>Conquistas</span>
                  <b>${save.unlockedAchievements.length}/${ACHIEVEMENTS.length}</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'nights') {
      this.overlayRoot.innerHTML = `
        <div class="menu-shell">
          <div class="sub-header">
            <h2>📅 Selecionar Noite — Campanha</h2>
            <button class="btn btn-sm" data-tab="home">← Voltar</button>
          </div>
          <div class="nights-list">
            ${CAMPAIGN_NIGHTS.map((n) => {
              const unlocked = n.nightNumber <= save.unlockedNight;
              const completed = save.completedNights.includes(n.nightNumber);
              const activeNames = TEACHER_ORDER.filter((id) => n.aiLevels[id] > 0)
                .map((id) => this.storage.getTeacherDisplay(id).name)
                .join(', ');
              return `
                <div class="night-card ${unlocked ? '' : 'locked'}">
                  <div>
                    <span class="brand-kicker">${n.dayLabel} ${completed ? '· ⭐ CONCLUÍDA' : ''}</span>
                    <h3>${n.title.split('—')[1]?.trim() || n.title}</h3>
                    <p>${n.subtitle}</p>
                    <p style="margin-top:8px;font-size:12px;color:#cbd5e1">
                      <b>Em ronda:</b> ${activeNames}
                    </p>
                  </div>
                  ${
                    unlocked
                      ? `<button class="btn btn-primary btn-sm" data-go-night="${n.nightNumber}">Jogar ${n.dayLabel} ▶</button>`
                      : `<button class="btn btn-sm" disabled>🔒 Conclua a Noite ${n.nightNumber - 1}</button>`
                  }
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (this.currentTab === 'custom') {
      const sum = Object.values(this.customAi).reduce((a, b) => a + b, 0);
      this.overlayRoot.innerHTML = `
        <div class="menu-shell">
          <div class="sub-header">
            <h2>⚖️ Conselho de Classe — Noite Personalizada</h2>
            <button class="btn btn-sm" data-tab="home">← Voltar</button>
          </div>

          <div class="preset-bar">
            ${CUSTOM_NIGHT_PRESETS.map(
              (pr) =>
                `<button class="btn btn-sm" data-preset="${pr.id}" title="${pr.description}">⚡ ${pr.name}</button>`
            ).join('')}
            <button class="btn btn-sm" data-custom-mode="toggle">
              Modo: <b>${
                this.customMode === 'protocol' ? '📱 Protocolo (6 Etapas)' : '🕕 Sobreviver até 06:00'
              }</b>
            </button>
          </div>

          <div class="teacher-cards">
            ${TEACHER_ORDER.map((id) => {
              const disp = this.storage.getTeacherDisplay(id);
              const avatarInner = disp.photoDataUrl
                ? `<img src="${disp.photoDataUrl}" alt="${disp.name}"/>`
                : disp.name.charAt(0);
              return `
                <div class="teacher-card">
                  <div class="t-head">
                    <div class="t-avatar" style="border-color:${disp.config.accentColor}">${avatarInner}</div>
                    <div class="t-meta">
                      <h3>${disp.name}</h3>
                      <small>${disp.subject}</small>
                    </div>
                  </div>
                  <div class="ai-stepper">
                    <button class="btn btn-sm" data-ai="${id}:-5">-5</button>
                    <button class="btn btn-sm" data-ai="${id}:-1">-</button>
                    <b style="color:${disp.config.accentColor}">${this.customAi[id]}</b>
                    <button class="btn btn-sm" data-ai="${id}:1">+</button>
                    <button class="btn btn-sm" data-ai="${id}:5">+5</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <span style="font-size:14px;color:#cbd5e1">
              Dificuldade Total: <b>${sum}/100</b> · Recorde Atual: <b>${save.customNightBestScore} pts</b>
            </span>
            <button class="btn btn-primary" data-start-custom="1">
              ▶ Iniciar Sessão do Conselho
            </button>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'dossie') {
      this.overlayRoot.innerHTML = `
        <div class="menu-shell">
          <div class="sub-header">
            <h2>🗂️ Dossiê & Editor de Professores</h2>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm" data-reset-teachers="1">Restaurar Padrão</button>
              <button class="btn btn-sm" data-tab="home">← Voltar</button>
            </div>
          </div>
          <p style="margin:0 0 14px;font-size:13.5px;color:#94a3b8">
            Conheça o comportamento de cada membro do plantão. Você também pode <b>personalizar nomes, matérias, frases e enviar fotos</b> para aparecerem direto nos modelos 3D e crachás!
          </p>
          <div class="teacher-cards">
            ${TEACHER_ORDER.map((id) => {
              const disp = this.storage.getTeacherDisplay(id);
              const isEditing = this.editingTeacher === id;
              const avatarInner = disp.photoDataUrl
                ? `<img src="${disp.photoDataUrl}" alt="${disp.name}"/>`
                : disp.name.charAt(0);
              return `
                <div class="teacher-card">
                  <div class="t-head">
                    <div class="t-avatar" style="border-color:${disp.config.accentColor}">${avatarInner}</div>
                    <div class="t-meta">
                      <h3>${disp.name}</h3>
                      <small>${disp.subject} · ${disp.config.originLabel}</small>
                    </div>
                  </div>
                  <p style="margin:0;font-size:12.5px;color:#94a3b8;line-height:1.42">${disp.config.bio}</p>
                  <div class="t-tip" style="border-left-color:${disp.config.accentColor}">
                    <b>Como evitar:</b> ${disp.config.counterplayTip}
                  </div>
                  <button class="btn btn-sm" data-edit-teacher="${id}">
                    ${isEditing ? '▲ Fechar Editor' : '✏️ Personalizar Nome / Foto'}
                  </button>
                  ${
                    isEditing
                      ? `
                    <div class="edit-form">
                      <input type="text" id="ed-name-${id}" maxlength="22" placeholder="Nome do professor" value="${this.escapeAttr(disp.name)}"/>
                      <input type="text" id="ed-subj-${id}" maxlength="28" placeholder="Matéria / Cargo" value="${this.escapeAttr(disp.subject)}"/>
                      <input type="text" id="ed-quote-${id}" maxlength="65" placeholder="Frase de ataque opcional" value="${this.escapeAttr(disp.customQuote || '')}"/>
                      <label class="btn btn-sm" style="justify-content:center">
                        📷 Escolher Foto (.jpg / .png)
                        <input type="file" accept="image/*" data-photo-upload="${id}" style="display:none"/>
                      </label>
                      <div style="display:flex;gap:6px">
                        <button class="btn btn-primary btn-sm" style="flex:1" data-save-teacher="${id}">Salvar</button>
                        <button class="btn btn-sm" data-clear-photo="${id}">Limpar</button>
                      </div>
                    </div>
                  `
                      : ''
                  }
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (this.currentTab === 'achievements') {
      this.overlayRoot.innerHTML = `
        <div class="menu-shell">
          <div class="sub-header">
            <h2>🏆 Conquistas & Histórico Escolar</h2>
            <button class="btn btn-sm" data-tab="home">← Voltar</button>
          </div>
          <div class="ach-grid">
            ${ACHIEVEMENTS.map((ach) => {
              const unlocked = save.unlockedAchievements.includes(ach.id);
              return `
                <div class="ach-card ${unlocked ? '' : 'locked'}">
                  <div class="ach-icon">${ach.icon}</div>
                  <div>
                    <b style="font-size:14px;display:block">${ach.title}</b>
                    <span style="font-size:12px;color:#94a3b8">${ach.description}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (this.currentTab === 'settings') {
      const s = save.settings;
      this.overlayRoot.innerHTML = `
        <div class="menu-shell">
          <div class="sub-header">
            <h2>⚙️ Configurações & Acessibilidade</h2>
            <button class="btn btn-sm" data-tab="home">← Voltar</button>
          </div>

          <div class="settings-row">
            <span>Volume Geral (${Math.round(s.masterVolume * 100)}%)</span>
            <input type="range" min="0" max="100" value="${Math.round(s.masterVolume * 100)}" data-range="masterVolume"/>
          </div>
          <div class="settings-row">
            <span>Volume de Efeitos (${Math.round(s.sfxVolume * 100)}%)</span>
            <input type="range" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" data-range="sfxVolume"/>
          </div>
          <div class="settings-row">
            <span>Volume da Chuva & Ambiência (${Math.round(s.ambienceVolume * 100)}%)</span>
            <input type="range" min="0" max="100" value="${Math.round(s.ambienceVolume * 100)}" data-range="ambienceVolume"/>
          </div>
          <div class="settings-row">
            <span>Granulação de Filme VHS</span>
            <button class="btn btn-sm" data-bool="filmGrain">${s.filmGrain ? 'Ligado' : 'Desligado'}</button>
          </div>
          <div class="settings-row">
            <span>Sombras Dinâmicas 3D</span>
            <button class="btn btn-sm" data-bool="highQualityShadows">${s.highQualityShadows ? 'Alta' : 'Desempenho'}</button>
          </div>
          <div class="settings-row">
            <span>Paralaxe Suave do Mouse</span>
            <button class="btn btn-sm" data-bool="mouseParallax">${s.mouseParallax ? 'Ligado' : 'Desligado'}</button>
          </div>
          <div class="settings-row">
            <span>Reduzir Flashes de Luz (Conforto Visual)</span>
            <button class="btn btn-sm" data-bool="reducedFlashes">${s.reducedFlashes ? 'Ativado' : 'Padrão'}</button>
          </div>

          <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-sm" data-unlock-all="1">🔓 Liberar Todas as 5 Noites (Modo Apresentação)</button>
            <button class="btn btn-sm" data-reset-save="1">🗑️ Zerar Progresso da Campanha</button>
          </div>
        </div>
      `;
    }

    this.bindMenuEvents();
  }

  private escapeAttr(str: string): string {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  private bindMenuEvents(): void {
    this.overlayRoot.querySelectorAll('[data-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        this.currentTab = (el as HTMLElement).dataset.tab as MenuTab;
        this.renderCurrentMenuTab();
      });
    });

    this.overlayRoot.querySelectorAll('[data-go-night]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        const num = Number((el as HTMLElement).dataset.goNight);
        const cfg = CAMPAIGN_NIGHTS[num - 1];
        if (cfg) this.showNightBriefing(cfg);
      });
    });

    this.overlayRoot.querySelectorAll('[data-preset]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        const pid = (el as HTMLElement).dataset.preset;
        const found = CUSTOM_NIGHT_PRESETS.find((p) => p.id === pid);
        if (found) {
          this.customAi = { ...found.aiLevels };
          this.customMode = found.mode;
          this.renderCurrentMenuTab();
        }
      });
    });

    this.overlayRoot.querySelector('[data-custom-mode]')?.addEventListener('click', () => {
      this.callbacks.onUiSound();
      this.customMode = this.customMode === 'protocol' ? 'survive6am' : 'protocol';
      this.renderCurrentMenuTab();
    });

    this.overlayRoot.querySelectorAll('[data-ai]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        const [idStr, deltaStr] = ((el as HTMLElement).dataset.ai || '').split(':');
        const id = idStr as TeacherId;
        const delta = Number(deltaStr);
        this.customAi[id] = Math.max(0, Math.min(20, this.customAi[id] + delta));
        this.renderCurrentMenuTab();
      });
    });

    this.overlayRoot.querySelector('[data-start-custom]')?.addEventListener('click', () => {
      this.callbacks.onUiSound();
      const cfg = buildCustomNightConfig(this.customAi, this.customMode);
      this.showNightBriefing(cfg);
    });

    this.overlayRoot.querySelectorAll('[data-edit-teacher]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        const id = (el as HTMLElement).dataset.editTeacher as TeacherId;
        this.editingTeacher = this.editingTeacher === id ? null : id;
        this.renderCurrentMenuTab();
      });
    });

    this.overlayRoot.querySelectorAll('[data-save-teacher]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        const id = (el as HTMLElement).dataset.saveTeacher as TeacherId;
        const nameInput = this.overlayRoot.querySelector(`#ed-name-${id}`) as HTMLInputElement;
        const subjInput = this.overlayRoot.querySelector(`#ed-subj-${id}`) as HTMLInputElement;
        const quoteInput = this.overlayRoot.querySelector(`#ed-quote-${id}`) as HTMLInputElement;

        this.storage.setTeacherOverride(id, {
          name: nameInput?.value ?? '',
          subject: subjInput?.value ?? '',
          customQuote: quoteInput?.value ?? '',
        });
        this.callbacks.onTeacherAppearanceChanged(id);
        this.editingTeacher = null;
        this.renderCurrentMenuTab();
      });
    });

    this.overlayRoot.querySelectorAll('[data-clear-photo]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        const id = (el as HTMLElement).dataset.clearPhoto as TeacherId;
        this.storage.setTeacherOverride(id, null);
        this.callbacks.onTeacherAppearanceChanged(id);
        this.renderCurrentMenuTab();
      });
    });

    this.overlayRoot.querySelector('[data-reset-teachers]')?.addEventListener('click', () => {
      this.callbacks.onUiSound();
      this.storage.resetAllTeachers();
      TEACHER_ORDER.forEach((id) => this.callbacks.onTeacherAppearanceChanged(id));
      this.editingTeacher = null;
      this.renderCurrentMenuTab();
    });

    this.overlayRoot.querySelectorAll('[data-photo-upload]').forEach((el) => {
      el.addEventListener('change', (ev) => {
        const input = ev.target as HTMLInputElement;
        const file = input.files?.[0];
        const id = input.dataset.photoUpload as TeacherId;
        if (!file || !id) return;
        this.resizeAndSavePhoto(id, file);
      });
    });

    this.overlayRoot.querySelectorAll('[data-range]').forEach((el) => {
      el.addEventListener('input', (ev) => {
        const input = ev.target as HTMLInputElement;
        const key = input.dataset.range as 'masterVolume' | 'sfxVolume' | 'ambienceVolume';
        this.storage.updateSettings({ [key]: Number(input.value) / 100 });
        this.callbacks.onSettingsChanged(this.storage.getSettings());
      });
      el.addEventListener('change', () => this.renderCurrentMenuTab());
    });

    this.overlayRoot.querySelectorAll('[data-bool]').forEach((el) => {
      el.addEventListener('click', () => {
        this.callbacks.onUiSound();
        const key = (el as HTMLElement).dataset.bool as
          | 'filmGrain'
          | 'highQualityShadows'
          | 'mouseParallax'
          | 'reducedFlashes';
        const cur = this.storage.getSettings()[key];
        this.storage.updateSettings({ [key]: !cur });
        this.applyVisualSettings();
        this.callbacks.onSettingsChanged(this.storage.getSettings());
        this.renderCurrentMenuTab();
      });
    });

    this.overlayRoot.querySelector('[data-unlock-all]')?.addEventListener('click', () => {
      this.callbacks.onUiSound();
      this.storage.unlockAllNights();
      this.currentTab = 'nights';
      this.renderCurrentMenuTab();
    });

    this.overlayRoot.querySelector('[data-reset-save]')?.addEventListener('click', () => {
      this.callbacks.onUiSound();
      this.storage.resetProgress();
      this.renderCurrentMenuTab();
    });
  }

  private resizeAndSavePhoto(id: TeacherId, file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 192;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(192 / img.width, 192 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (192 - w) / 2, (192 - h) / 2, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

        this.storage.setTeacherOverride(id, { photoDataUrl: dataUrl });
        this.callbacks.onTeacherAppearanceChanged(id);
        this.renderCurrentMenuTab();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  showNightBriefing(config: NightConfig): void {
    const activeTeachers = TEACHER_ORDER.filter((id) => config.aiLevels[id] > 0).map((id) => {
      const d = this.storage.getTeacherDisplay(id);
      return `<span class="brand-kicker" style="border-color:${d.config.accentColor};color:#fff;background:rgba(255,255,255,0.06)">${d.name} (IA ${config.aiLevels[id]})</span>`;
    });

    this.overlayRoot.style.display = 'flex';
    this.overlayRoot.innerHTML = `
      <div class="menu-shell" style="max-width:620px;text-align:center">
        <span class="brand-kicker">00:00 AM · ${config.dayLabel}</span>
        <h1 class="brand-title" style="font-size:clamp(26px,4.5vw,38px)">${config.title}</h1>
        <p class="brand-sub" style="margin:0 auto 14px">${config.subtitle}</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:16px">
          ${activeTeachers.join('')}
        </div>
        <div class="t-tip" style="text-align:left;margin-bottom:20px;font-size:13.5px">
          <b>Orientação da Noite:</b> ${config.briefingTip}
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn" id="brief-cancel">← Voltar</button>
          <button class="btn btn-primary" id="brief-go">Entrar na Sala 04 ▶</button>
        </div>
      </div>
    `;

    this.overlayRoot.querySelector('#brief-cancel')?.addEventListener('click', () => {
      this.callbacks.onUiSound();
      this.showMainMenu('home');
    });

    this.overlayRoot.querySelector('#brief-go')?.addEventListener('click', () => {
      this.callbacks.onUiSound();
      this.overlayRoot.style.display = 'none';
      this.hudRoot.style.display = 'block';
      this.callbacks.onStartNight(config);
    });
  }

  showPauseModal(): void {
    const muted = this.storage.getSettings().muted;
    this.overlayRoot.style.display = 'flex';
    this.overlayRoot.innerHTML = `
      <div class="menu-shell" style="max-width:440px;text-align:center">
        <h2 style="margin:0 0 8px">⏸ Plantão Pausado</h2>
        <p style="margin:0 0 18px;font-size:13.5px;color:#94a3b8">
          A ronda aguarda no corredor. Respire fundo.
        </p>
        <div class="menu-actions">
          <button class="btn btn-primary" id="pz-resume">▶ Continuar Partida (ESC)</button>
          <button class="btn" id="pz-mute">${muted ? '🔇 Som Mutado (Clique p/ Ativar)' : '🔊 Som Ativo (Clique p/ Mutar)'}</button>
          <button class="btn" id="pz-quit">🚪 Sair para o Menu Principal</button>
        </div>
      </div>
    `;

    this.overlayRoot.querySelector('#pz-resume')?.addEventListener('click', () => {
      this.callbacks.onTogglePause();
    });
    this.overlayRoot.querySelector('#pz-mute')?.addEventListener('click', () => {
      const cur = this.storage.getSettings().muted;
      this.storage.updateSettings({ muted: !cur });
      this.callbacks.onSettingsChanged(this.storage.getSettings());
      this.showPauseModal();
    });
    this.overlayRoot.querySelector('#pz-quit')?.addEventListener('click', () => {
      this.callbacks.onQuitToMenu();
    });
  }

  hideOverlay(): void {
    this.overlayRoot.style.display = 'none';
  }

  showEndScreen(payload: GameEndPayload, lastConfig: NightConfig): void {
    this.hudRoot.style.display = 'none';
    this.phoneEl.style.display = 'none';
    this.overlayRoot.style.display = 'flex';

    const nextNight =
      payload.won && payload.nightNumber >= 1 && payload.nightNumber < 5
        ? CAMPAIGN_NIGHTS[payload.nightNumber]
        : null;

    const achHtml =
      payload.newAchievements.length > 0
        ? `
        <div style="margin:14px 0;padding:10px;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.35);border-radius:12px">
          <b style="font-size:12.5px;color:#86efac">🏆 Nova(s) Conquista(s) Desbloqueada(s):</b>
          <div style="margin-top:4px;font-size:13.5px">
            ${payload.newAchievements
              .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
              .filter(Boolean)
              .map((a) => `${a!.icon} <b>${a!.title}</b>`)
              .join(' · ')}
          </div>
        </div>
      `
        : '';

    this.overlayRoot.innerHTML = `
      <div class="menu-shell" style="max-width:580px;text-align:center">
        <span class="brand-kicker" style="${
          payload.won
            ? 'background:rgba(34,197,94,0.18);border-color:#4ade80;color:#86efac'
            : ''
        }">
          ${payload.won ? '✅ TURNO SUPERADO' : '❌ FIM DE PLANTÃO'}
        </span>
        <h1 class="brand-title" style="color:${payload.won ? '#4ade80' : '#f87171'};font-size:clamp(28px,5vw,44px)">
          ${payload.title}
        </h1>
        <p class="brand-sub" style="margin:8px auto 16px;color:#e2e8f0">
          ${payload.description}
        </p>
        ${achHtml}
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">
          ${
            nextNight
              ? `<button class="btn btn-primary" id="end-next">▶ Avançar para ${nextNight.dayLabel}</button>`
              : ''
          }
          <button class="btn ${nextNight ? '' : 'btn-primary'}" id="end-retry">
            ↻ Jogar Novamente
          </button>
          <button class="btn" id="end-menu">Menu Principal</button>
        </div>
      </div>
    `;

    this.overlayRoot.querySelector('#end-next')?.addEventListener('click', () => {
      if (nextNight) this.showNightBriefing(nextNight);
    });
    this.overlayRoot.querySelector('#end-retry')?.addEventListener('click', () => {
      this.overlayRoot.style.display = 'none';
      this.hudRoot.style.display = 'block';
      this.callbacks.onStartNight(lastConfig);
    });
    this.overlayRoot.querySelector('#end-menu')?.addEventListener('click', () => {
      this.showMainMenu('home');
    });
  }

  private buildHudDOM(): void {
    this.hudRoot.innerHTML = `
      <div class="hud-top">
        <div class="hud-box">
          <div class="hud-mission-title" id="hud-night-lbl">NOITE 01</div>
          <div class="hud-mission-val" id="hud-task-lbl">Protocolo: 0/4</div>
          <div class="hud-energy-line">
            <span id="hud-bat-lbl">📱 100%</span>
            <span id="hud-pb-lbl">🔌 100%</span>
          </div>
        </div>

        <div class="hud-box hud-clock-box">
          <div>
            <div class="hud-clock-time" id="hud-clock">00:00 AM</div>
            <div class="hud-clock-sub" id="hud-clock-sub">Prazo do Diário: 06:00</div>
          </div>
          <button class="hud-icon-btn" id="hud-mute-btn" title="Mutar / Ativar Som (M)">🔊</button>
          <button class="hud-icon-btn" id="hud-pause-btn" title="Pausar (ESC)">⏸</button>
        </div>
      </div>

      <div class="hud-center-stack">
        <div class="danger-meter" id="hud-danger">
          <span id="hud-danger-txt">⚠️ Presença na sala!</span>
          <div class="danger-track"><i id="hud-danger-bar"></i></div>
        </div>
        <div class="subtitle-box" id="hud-subtitle"></div>
        <div class="hint-toast" id="hud-hint"></div>
      </div>

      <div class="hud-bottom">
        <div class="hud-tools-row">
          <button class="tool-btn" id="btn-flash">🔦 Lanterna [F]</button>
          <button class="tool-btn" id="btn-door">🔒 Trava Porta [Espaço] <small id="lbl-door-pwr">100%</small></button>
          <button class="tool-btn" id="btn-blinds">🪟 Persiana [E]</button>
        </div>

        <div class="hud-nav-row">
          <button class="nav-btn" id="nav-L">◀ Porta <span class="nav-key">[A]</span></button>
          <button class="nav-btn active" id="nav-C">▲ Quadro <span class="nav-key">[W]</span></button>
          <button class="nav-btn" id="nav-P">
            📱 Celular <span class="nav-key">[S]</span>
            <i class="nav-alert-dot" id="nav-P-dot"></i>
          </button>
          <button class="nav-btn" id="nav-R">Janela ▶ <span class="nav-key">[D]</span></button>
        </div>
      </div>
    `;

    this.hudRoot.querySelector('#nav-L')?.addEventListener('click', () => this.callbacks.onSetView('L'));
    this.hudRoot.querySelector('#nav-C')?.addEventListener('click', () => this.callbacks.onSetView('C'));
    this.hudRoot.querySelector('#nav-P')?.addEventListener('click', () => this.callbacks.onSetView('P'));
    this.hudRoot.querySelector('#nav-R')?.addEventListener('click', () => this.callbacks.onSetView('R'));

    this.hudRoot.querySelector('#btn-flash')?.addEventListener('click', () => this.callbacks.onToggleFlashlight());
    this.hudRoot.querySelector('#btn-door')?.addEventListener('click', () => this.callbacks.onToggleDoor());
    this.hudRoot.querySelector('#btn-blinds')?.addEventListener('click', () => this.callbacks.onToggleBlinds());

    this.hudRoot.querySelector('#hud-pause-btn')?.addEventListener('click', () => this.callbacks.onTogglePause());
    this.hudRoot.querySelector('#hud-mute-btn')?.addEventListener('click', () => {
      const cur = this.storage.getSettings().muted;
      this.storage.updateSettings({ muted: !cur });
      this.callbacks.onSettingsChanged(this.storage.getSettings());
    });
  }

  updateHUD(snap: GameSnapshot): void {
    const q = (sel: string) => this.hudRoot.querySelector(sel) as HTMLElement | null;

    const nightLbl = q('#hud-night-lbl');
    if (nightLbl) nightLbl.textContent = snap.nightConfig.dayLabel;

    const taskLbl = q('#hud-task-lbl');
    if (taskLbl) {
      taskLbl.textContent =
        snap.nightConfig.mode === 'survive6am'
          ? 'Meta: Sobreviver até 06:00'
          : `Protocolo: ${snap.taskIndex}/${snap.totalTasks}`;
    }

    const batLbl = q('#hud-bat-lbl');
    if (batLbl) batLbl.textContent = `📱 ${Math.ceil(snap.phoneBattery)}%`;

    const pbLbl = q('#hud-pb-lbl');
    if (pbLbl) pbLbl.textContent = `🔌 ${Math.ceil(snap.powerbankReserve)}%`;

    const clk = q('#hud-clock');
    if (clk) clk.textContent = snap.clockText;

    const clkSub = q('#hud-clock-sub');
    if (clkSub) {
      clkSub.textContent =
        snap.nightConfig.mode === 'survive6am'
          ? 'Amanhecer às 06:00'
          : 'Fechamento: 06:00 AM';
    }

    const muteBtn = q('#hud-mute-btn');
    if (muteBtn) muteBtn.textContent = this.storage.getSettings().muted ? '🔇' : '🔊';

    // Barra de perigo e vinheta de abafamento/tensão
    const dngBox = q('#hud-danger');
    const dngBar = q('#hud-danger-bar');
    const dngTxt = q('#hud-danger-txt');
    if (dngBox && dngBar && dngTxt) {
      if (snap.dangerLevel > 0.02) {
        dngBox.style.display = 'block';
        dngBar.style.width = `${Math.min(100, snap.dangerLevel * 100)}%`;
        dngTxt.textContent = `⚠️ PERIGO: ${snap.dangerTeacherName} na brecha!`;
      } else if (snap.roomStress > 65) {
        dngBox.style.display = 'block';
        dngBar.style.width = `${snap.roomStress}%`;
        dngTxt.textContent = `😮‍💨 Sala abafando (${Math.round(snap.roomStress)}%) — abra a persiana logo!`;
      } else {
        dngBox.style.display = 'none';
      }
    }

    const redGlow = Math.max(snap.dangerLevel * 0.55, snap.roomStress > 70 ? 0.25 : 0);
    this.vignetteEl.style.boxShadow =
      redGlow > 0.05 ? `inset 0 0 110px rgba(220, 20, 40, ${redGlow})` : 'none';

    // Legenda de falas dos professores
    const subEl = q('#hud-subtitle');
    if (subEl) {
      if (snap.activeSubtitle) {
        subEl.style.display = 'block';
        subEl.style.borderLeftColor = snap.activeSubtitle.color;
        subEl.innerHTML = `<b style="color:${snap.activeSubtitle.color}">${snap.activeSubtitle.speaker}</b>${snap.activeSubtitle.text}`;
      } else {
        subEl.style.display = 'none';
      }
    }

    // Dicas contextuais rápidas
    const hintEl = q('#hud-hint');
    if (hintEl) {
      if (snap.statusHint) {
        hintEl.style.display = 'block';
        hintEl.textContent = snap.statusHint;
      } else {
        hintEl.style.display = 'none';
      }
    }

    // Botões de navegação e ferramentas
    (['L', 'C', 'P', 'R'] as ViewDirection[]).forEach((dir) => {
      q(`#nav-${dir}`)?.classList.toggle('active', snap.view === dir);
    });

    const dot = q('#nav-P-dot');
    if (dot) {
      dot.style.display =
        snap.bellAlert || snap.valdirPopup || snap.unreadMessages > 0 ? 'block' : 'none';
    }

    q('#btn-flash')?.classList.toggle('active', snap.flashlightOn && snap.view !== 'P');
    q('#btn-door')?.classList.toggle('locked-on', snap.doorClosed);
    const pwrEl = q('#lbl-door-pwr');
    if (pwrEl) {
      pwrEl.textContent =
        snap.doorLockCooldown > 0
          ? `(${Math.ceil(snap.doorLockCooldown)}s)`
          : `${Math.round(snap.doorHoldEnergy)}%`;
    }

    const blindsBtn = q('#btn-blinds');
    if (blindsBtn) {
      blindsBtn.classList.toggle('locked-on', snap.blindsClosed);
      blindsBtn.textContent = snap.blindsClosed
        ? '🪟 Persiana: Fechada [E]'
        : '🪟 Persiana: Aberta [E]';
    }

    // Mostra/oculta o smartphone
    const showPhone = snap.view === 'P';
    if ((this.phoneEl.style.display === 'flex') !== showPhone) {
      this.phoneEl.style.display = showPhone ? 'flex' : 'none';
    }
  }
}
