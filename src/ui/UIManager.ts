import { ACHIEVEMENTS } from '../config/achievements';
import {
  buildCustomNightConfig,
  CAMPAIGN_NIGHTS,
  CUSTOM_NIGHT_PRESETS,
} from '../config/nights';
import { TEACHER_ORDER } from '../config/teachers';
import { GameEndPayload } from '../game/GameEngine';
import { getSlasherPortraitDataUrl } from '../scene/ProceduralTextures';
import { StorageManager } from '../state/storage';
import {
  GameSettings,
  GameSnapshot,
  NightConfig,
  TeacherId,
  ViewDirection,
} from '../types';
import { ICONS } from './icons';

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
    onToggleNightVision: () => void;
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

      this.overlayRoot.innerHTML = `
        <div class="title-screen">
          <div class="vhs-topline">
            <span class="rec-indicator"><i class="rec-dot"></i> REC · CÂMERA INTERNA · SALA 04</span>
            <span>ETEC SEBRAE // ARQUIVO NOTURNO</span>
          </div>

          <div class="title-main-block">
            <div class="title-code">BLOCO B · SEXTA-FEIRA · 23H59</div>
            <h1 class="horror-logo">PLANTÃO<br/>NOTURNO</h1>
            <div class="horror-rule"></div>
            <p class="horror-synopsis">
              Os portões magnéticos fecharam com você ainda na recuperação.
              O Diário de Classe mantém os docentes em ronda pelos corredores — e a regra mais antiga continua valendo: celular guardado quando alguém estiver olhando.
            </p>

            <nav class="horror-nav">
              <button class="horror-nav-item primary" data-go-night="${nextNightNum}">
                <span>Iniciar Plantão</span>
                <span class="horror-nav-meta">[NOITE 0${nextNightNum}]</span>
              </button>
              <button class="horror-nav-item" data-tab="nights">
                <span>Selecionar Turno</span>
                <span class="horror-nav-meta">${save.completedNights.length}/5</span>
              </button>
              <button class="horror-nav-item" data-tab="custom">
                <span>Conselho de Classe</span>
                <span class="horror-nav-meta">IA 0–20</span>
              </button>
              <button class="horror-nav-item" data-tab="dossie">
                <span>Arquivos dos Docentes</span>
                <span class="horror-nav-meta">FICHAS / FOTOS</span>
              </button>
              <button class="horror-nav-item" data-tab="achievements">
                <span>Histórico Escolar</span>
                <span class="horror-nav-meta">${save.unlockedAchievements.length}/${ACHIEVEMENTS.length}</span>
              </button>
              <button class="horror-nav-item" data-tab="settings">
                <span>Opções de Sistema</span>
                <span class="horror-nav-meta">ÁUDIO / VÍDEO</span>
              </button>
            </nav>
          </div>

          <div class="vhs-bottomline">
            <span>TURNOS VENCIDOS: ${String(save.stats.nightsWon).padStart(2, '0')} · RETENÇÕES: ${String(save.stats.deaths).padStart(2, '0')} · RECORDE CONSELHO: ${save.customNightBestScore}</span>
            <span>[WASD] VISÃO & CELULAR · [N] VISÃO IR · [F] LANTERNA · [ESPAÇO] PORTA · [E] PERSIANA</span>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'nights') {
      this.overlayRoot.innerHTML = `
        <div class="dossier-backdrop">
          <div class="dossier-frame">
            <div class="dossier-header">
              <div>
                <div class="dossier-kicker">SECRETARIA ACADÊMICA // ESCALA DE PLANTÃO</div>
                <h2 class="dossier-title">Seleção de Turno (Noites 01 a 05)</h2>
              </div>
              <button class="btn-sharp btn-compact" data-tab="home">[ VOLTAR ]</button>
            </div>

            <div class="shift-grid">
              ${CAMPAIGN_NIGHTS.map((n) => {
                const unlocked = n.nightNumber <= save.unlockedNight;
                const completed = save.completedNights.includes(n.nightNumber);
                const activeNames = TEACHER_ORDER.filter((id) => n.aiLevels[id] > 0)
                  .map((id) => this.storage.getTeacherDisplay(id).name)
                  .join(', ');
                return `
                  <div class="shift-card ${unlocked ? '' : 'locked'}">
                    <div>
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <span class="stamp ${completed ? 'ok' : unlocked ? 'amber' : ''}">
                          ${completed ? 'CONCLUÍDA' : unlocked ? 'DISPONÍVEL' : 'BLOQUEADA'}
                        </span>
                        <span style="font-family:var(--font-mono);font-size:11px;color:var(--ash)">${n.dayLabel}</span>
                      </div>
                      <h3>${n.title.split('—')[1]?.trim() || n.title}</h3>
                      <p>${n.subtitle}</p>
                      <p style="margin-top:8px;font-family:var(--font-mono);font-size:11px;color:var(--bone)">
                        RONDA: ${activeNames}
                      </p>
                    </div>
                    ${
                      unlocked
                        ? `<button class="btn-sharp btn-crimson btn-compact" data-go-night="${n.nightNumber}">Iniciar ${n.dayLabel}</button>`
                        : `<button class="btn-sharp btn-compact" disabled>Requer Noite 0${n.nightNumber - 1}</button>`
                    }
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'custom') {
      const sum = Object.values(this.customAi).reduce((a, b) => a + b, 0);
      this.overlayRoot.innerHTML = `
        <div class="dossier-backdrop">
          <div class="dossier-frame">
            <div class="dossier-header">
              <div>
                <div class="dossier-kicker">SESSÃO EXTRAORDINÁRIA // NÍVEL DE AGRESSIVIDADE</div>
                <h2 class="dossier-title">Conselho de Classe</h2>
              </div>
              <button class="btn-sharp btn-compact" data-tab="home">[ VOLTAR ]</button>
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
              ${CUSTOM_NIGHT_PRESETS.map(
                (pr) =>
                  `<button class="btn-sharp btn-compact" data-preset="${pr.id}" title="${pr.description}">${pr.name}</button>`
              ).join('')}
              <button class="btn-sharp btn-compact" style="border-color:var(--amber);color:var(--amber)" data-custom-mode="toggle">
                REGRA: ${
                  this.customMode === 'protocol' ? 'PROTOCOLO (6 ETAPAS)' : 'SOBREVIVER ATÉ 06:00'
                }
              </button>
            </div>

            <div class="mugshot-grid">
              ${TEACHER_ORDER.map((id, idx) => {
                const disp = this.storage.getTeacherDisplay(id);
                const portraitSrc = disp.photoDataUrl || getSlasherPortraitDataUrl(disp.config);
                const avatarInner = `<img src="${portraitSrc}" alt="${disp.name}"/>`;
                return `
                  <div class="mugshot-card">
                    <span style="font-family:var(--font-mono);font-size:10px;color:var(--ash)">DOC-0${idx + 1}</span>
                    <div class="mugshot-frame">${avatarInner}</div>
                    <div>
                      <div style="font-family:var(--font-serif);font-size:15px;color:var(--bone)">${disp.name}</div>
                      <div style="font-size:11px;color:var(--ash)">${disp.subject}</div>
                    </div>
                    <div class="ai-counter">
                      <button data-ai="${id}:-5" title="-5">«</button>
                      <button data-ai="${id}:-1" title="-1">&lt;</button>
                      <b style="color:${this.customAi[id] > 0 ? 'var(--bone)' : 'var(--ash)'}">${String(this.customAi[id]).padStart(2, '0')}</b>
                      <button data-ai="${id}:1" title="+1">&gt;</button>
                      <button data-ai="${id}:5" title="+5">»</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <span style="font-family:var(--font-mono);font-size:12px;color:var(--ash)">
                SOMA DE IA: <b style="color:var(--bone)">${sum}/100</b> · RECORDE REGISTRADO: <b style="color:var(--bone)">${save.customNightBestScore} PTS</b>
              </span>
              <button class="btn-sharp btn-crimson" data-start-custom="1">
                Iniciar Sessão do Conselho
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'dossie') {
      this.overlayRoot.innerHTML = `
        <div class="dossier-backdrop">
          <div class="dossier-frame">
            <div class="dossier-header">
              <div>
                <div class="dossier-kicker">ARQUIVO CONFIDENCIAL // CORPO DOCENTE</div>
                <h2 class="dossier-title">Fichas Funcionais & Customização</h2>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn-sharp btn-compact" data-reset-teachers="1">Restaurar Padrão</button>
                <button class="btn-sharp btn-compact" data-tab="home">[ VOLTAR ]</button>
              </div>
            </div>

            <p style="margin:0 0 14px;font-size:13px;color:var(--ash)">
              Relatório de comportamento noturno. Você pode alterar nomes, disciplinas, bordões ou anexar fotografias reais que serão aplicadas aos modelos e crachás 3D.
            </p>

            <div class="personnel-grid">
              ${TEACHER_ORDER.map((id, idx) => {
                const disp = this.storage.getTeacherDisplay(id);
                const isEditing = this.editingTeacher === id;
                const portraitSrc = disp.photoDataUrl || getSlasherPortraitDataUrl(disp.config);
                const avatarInner = `<img src="${portraitSrc}" alt="${disp.name}"/>`;
                return `
                  <div class="personnel-card">
                    <div class="personnel-top">
                      <div class="mugshot-frame" style="width:62px;height:62px;font-size:22px">${avatarInner}</div>
                      <div>
                        <div style="font-family:var(--font-mono);font-size:10px;color:var(--ash)">REGISTRO #0${idx + 1} · ${disp.config.originLabel.toUpperCase()}</div>
                        <div style="font-family:var(--font-serif);font-size:17px;color:var(--bone);margin:2px 0">${disp.name}</div>
                        <div style="font-size:12px;color:var(--ash)">${disp.subject}</div>
                      </div>
                    </div>
                    <p style="margin:0;font-size:12.5px;color:var(--ash);line-height:1.45">${disp.config.bio}</p>
                    <div class="personnel-note">
                      <b style="font-family:var(--font-mono);font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:var(--amber)">Contramedida:</b><br/>
                      ${disp.config.counterplayTip}
                    </div>
                    <button class="btn-sharp btn-compact" data-edit-teacher="${id}">
                      ${isEditing ? 'Fechar Ficha' : 'Editar Ficha / Anexar Foto'}
                    </button>
                    ${
                      isEditing
                        ? `
                      <div class="edit-drawer">
                        <input type="text" id="ed-name-${id}" maxlength="22" placeholder="Nome do docente" value="${this.escapeAttr(disp.name)}"/>
                        <input type="text" id="ed-subj-${id}" maxlength="28" placeholder="Disciplina / Setor" value="${this.escapeAttr(disp.subject)}"/>
                        <input type="text" id="ed-quote-${id}" maxlength="65" placeholder="Fala personalizada de abordagem" value="${this.escapeAttr(disp.customQuote || '')}"/>
                        <label class="btn-sharp btn-compact">
                          ${ICONS.upload} Selecionar Fotografia (.jpg / .png)
                          <input type="file" accept="image/*" data-photo-upload="${id}" style="display:none"/>
                        </label>
                        <div style="display:flex;gap:6px">
                          <button class="btn-sharp btn-crimson btn-compact" style="flex:1" data-save-teacher="${id}">Salvar Alterações</button>
                          <button class="btn-sharp btn-compact" data-clear-photo="${id}">Padrão</button>
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
        </div>
      `;
    } else if (this.currentTab === 'achievements') {
      this.overlayRoot.innerHTML = `
        <div class="dossier-backdrop">
          <div class="dossier-frame">
            <div class="dossier-header">
              <div>
                <div class="dossier-kicker">SISTEMA NSA // REGISTRO DE MENÇÕES</div>
                <h2 class="dossier-title">Histórico Escolar & Conquistas</h2>
              </div>
              <button class="btn-sharp btn-compact" data-tab="home">[ VOLTAR ]</button>
            </div>

            <div class="records-grid">
              ${ACHIEVEMENTS.map((ach) => {
                const unlocked = save.unlockedAchievements.includes(ach.id);
                return `
                  <div class="record-item ${unlocked ? '' : 'locked'}">
                    <div class="record-stamp">${unlocked ? ach.icon : '---'}</div>
                    <div>
                      <div style="font-family:var(--font-serif);font-size:15px;color:var(--bone)">${ach.title}</div>
                      <div style="font-size:12px;color:var(--ash);margin-top:2px;line-height:1.38">${ach.description}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'settings') {
      const s = save.settings;
      this.overlayRoot.innerHTML = `
        <div class="dossier-backdrop">
          <div class="dossier-frame" style="max-width:680px">
            <div class="dossier-header">
              <div>
                <div class="dossier-kicker">PAINEL TÉCNICO // CALIBRAÇÃO</div>
                <h2 class="dossier-title">Opções de Sistema</h2>
              </div>
              <button class="btn-sharp btn-compact" data-tab="home">[ VOLTAR ]</button>
            </div>

            <div class="opt-row">
              <span>VOLUME MESTRE (${Math.round(s.masterVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(s.masterVolume * 100)}" data-range="masterVolume"/>
            </div>
            <div class="opt-row">
              <span>VOLUME DE EFEITOS (${Math.round(s.sfxVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" data-range="sfxVolume"/>
            </div>
            <div class="opt-row">
              <span>AMBIÊNCIA & CHUVA (${Math.round(s.ambienceVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(s.ambienceVolume * 100)}" data-range="ambienceVolume"/>
            </div>
            <div class="opt-row">
              <span>RUÍDO ANALÓGICO VHS</span>
              <button class="btn-sharp btn-compact" data-bool="filmGrain">${s.filmGrain ? 'ATIVO' : 'INATIVO'}</button>
            </div>
            <div class="opt-row">
              <span>SOMBRAS DINÂMICAS 3D</span>
              <button class="btn-sharp btn-compact" data-bool="highQualityShadows">${s.highQualityShadows ? 'ALTA' : 'DESEMPENHO'}</button>
            </div>
            <div class="opt-row">
              <span>PARALAXE DE VISÃO (MOUSE)</span>
              <button class="btn-sharp btn-compact" data-bool="mouseParallax">${s.mouseParallax ? 'ATIVO' : 'INATIVO'}</button>
            </div>
            <div class="opt-row">
              <span>REDUZIR CLARÕES DE LUZ</span>
              <button class="btn-sharp btn-compact" data-bool="reducedFlashes">${s.reducedFlashes ? 'ATIVADO' : 'PADRÃO'}</button>
            </div>

            <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn-sharp btn-compact" data-unlock-all="1">Liberar Todos os Turnos (Apresentação)</button>
              <button class="btn-sharp btn-compact" data-reset-save="1">Apagar Registro Salvo</button>
            </div>
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
      return `<span class="stamp amber">${d.name} [IA ${config.aiLevels[id]}]</span>`;
    });

    this.overlayRoot.style.display = 'flex';
    this.overlayRoot.innerHTML = `
      <div class="briefing-blackout">
        <div class="briefing-inner">
          <p class="briefing-clock">12:00 AM</p>
          <h2 class="briefing-night">${config.title}</h2>
          <div class="horror-rule" style="margin:6px auto"></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">
            ${activeTeachers.join('')}
          </div>
          <div class="personnel-note" style="text-align:left;max-width:480px;margin:8px 0">
            <b style="font-family:var(--font-mono);font-size:10.5px;color:var(--amber);text-transform:uppercase">Anotação no Caderno:</b><br/>
            ${config.briefingTip}
          </div>
          <div style="display:flex;gap:10px;margin-top:8px">
            <button class="btn-sharp" id="brief-cancel">[ Cancelar ]</button>
            <button class="btn-sharp btn-crimson" id="brief-go">Entrar na Sala 04</button>
          </div>
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
      <div class="dossier-backdrop">
        <div class="dossier-frame" style="max-width:400px;text-align:center">
          <div class="dossier-kicker">GRAVAÇÃO INTERROMPIDA</div>
          <h2 class="dossier-title" style="margin-bottom:18px">PAUSA</h2>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn-sharp btn-crimson" id="pz-resume">Retomar Plantão [ESC]</button>
            <button class="btn-sharp" id="pz-mute">
              ${muted ? ICONS.soundOff : ICONS.soundOn}
              <span>Áudio: ${muted ? 'Silenciado' : 'Ativo'}</span>
            </button>
            <button class="btn-sharp" id="pz-quit">Encerrar e Voltar ao Menu</button>
          </div>
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
        <div style="margin:12px 0;padding:10px;border:1px solid var(--phosphor);background:rgba(89,179,119,0.08);font-family:var(--font-mono);font-size:12px">
          <div style="color:var(--phosphor);margin-bottom:4px">REGISTRO ADICIONADO AO HISTÓRICO:</div>
          ${payload.newAchievements
            .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
            .filter(Boolean)
            .map((a) => `[${a!.icon}] ${a!.title}`)
            .join(' · ')}
        </div>
      `
        : '';

    this.overlayRoot.innerHTML = `
      <div class="briefing-blackout">
        <div class="dossier-frame" style="max-width:540px;text-align:center">
          <span class="stamp ${payload.won ? 'ok' : 'danger'}">
            ${payload.won ? 'BOLETIM DE ENCERRAMENTO // DEFERIDO' : 'TERMO DE RETENÇÃO // MENÇÃO I'}
          </span>
          <h1 class="horror-logo" style="font-size:clamp(28px,5vw,42px);margin-top:14px;color:${
            payload.won ? 'var(--bone)' : 'var(--crimson)'
          }">
            ${payload.title}
          </h1>
          <div class="horror-rule" style="margin:14px auto"></div>
          <p style="font-size:14px;line-height:1.6;color:var(--bone);margin:0 0 14px">
            ${payload.description}
          </p>
          ${achHtml}
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px">
            ${
              nextNight
                ? `<button class="btn-sharp btn-crimson" id="end-next">Avançar para ${nextNight.dayLabel}</button>`
                : ''
            }
            <button class="btn-sharp ${nextNight ? '' : 'btn-crimson'}" id="end-retry">
              Tentar Novamente
            </button>
            <button class="btn-sharp" id="end-menu">Menu Inicial</button>
          </div>
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

  private renderSegBar(pct: number, segments = 5): string {
    const filled = Math.ceil((Math.max(0, pct) / 100) * segments);
    const isLow = pct <= 22;
    let html = '<span class="seg-bar">';
    for (let i = 0; i < segments; i++) {
      const cls = i < filled ? (isLow ? 'low' : 'on') : '';
      html += `<i class="${cls}"></i>`;
    }
    html += '</span>';
    return html;
  }

  private buildHudDOM(): void {
    this.hudRoot.innerHTML = `
      <div class="hud-topbar">
        <div class="hud-telemetry">
          <div class="hud-tel-row" id="hud-task-lbl">PROTOCOLO [0/4]</div>
          <div class="hud-tel-row">
            ${ICONS.battery}
            <span>CEL</span>
            <span id="hud-bat-segs"></span>
            <span id="hud-bat-lbl">100%</span>
          </div>
          <div class="hud-tel-row">
            ${ICONS.bolt}
            <span>CARGA</span>
            <span id="hud-pb-segs"></span>
            <span id="hud-pb-lbl">100%</span>
          </div>
        </div>

        <div class="hud-right-cluster">
          <div class="fnaf-clock">
            <div class="fnaf-clock-time" id="hud-clock">12:00 AM</div>
            <div class="fnaf-clock-night" id="hud-night-lbl">NOITE 01 · LIMITE 06:00</div>
          </div>
          <div class="hud-sys-btns">
            <button class="hud-sq-btn" id="hud-mute-btn" title="Áudio [M]">${ICONS.soundOn}</button>
            <button class="hud-sq-btn" id="hud-pause-btn" title="Pausar [ESC]">${ICONS.pause}</button>
          </div>
        </div>
      </div>

      <div class="camcorder-reticle" id="hud-nvg-reticle">
        <i class="cam-corner tl"></i>
        <i class="cam-corner tr"></i>
        <i class="cam-corner bl"></i>
        <i class="cam-corner br"></i>
        <i class="cam-center-cross"></i>
        <div class="cam-nvg-tag">● REC // IR-NVG · CAM 04 · 1080i</div>
      </div>

      <div class="danger-strip" id="hud-danger">
        <div class="danger-strip-label" id="hud-danger-txt">PRESENÇA DETECTADA</div>
        <div class="danger-strip-bar"><i id="hud-danger-bar"></i></div>
      </div>

      <div class="hud-Feed">
        <div class="cinema-subtitle" id="hud-subtitle"></div>
        <div class="tactical-hint" id="hud-hint"></div>
      </div>

      <div class="hud-bottom-rig">
        <div class="rig-actions">
          <button class="rig-tool" id="btn-nvg" title="Visão Noturna Infravermelha estilo Filmadora [N]">
            ${ICONS.nvg}
            <span>Visão IR</span>
            <span class="keycap">N</span>
          </button>
          <button class="rig-tool" id="btn-flash">
            ${ICONS.flashlight}
            <span>Lanterna</span>
            <span class="keycap">F</span>
          </button>
          <button class="rig-tool" id="btn-door">
            ${ICONS.lock}
            <span>Trava</span>
            <b id="lbl-door-pwr">100%</b>
            <span class="keycap">ESPAÇO</span>
          </button>
          <button class="rig-tool" id="btn-blinds">
            ${ICONS.blinds}
            <span id="lbl-blinds-state">Persiana</span>
            <span class="keycap">E</span>
          </button>
        </div>

        <div class="rig-views">
          <button class="rig-view-btn" id="nav-L">
            <span>&lsaquo; Porta</span>
            <span class="keycap">A</span>
          </button>
          <button class="rig-view-btn active" id="nav-C">
            <span>Quadro</span>
            <span class="keycap">W</span>
          </button>
          <button class="rig-view-btn" id="nav-P">
            ${ICONS.phone}
            <span>Celular</span>
            <span class="keycap">S</span>
            <i class="ping-dot" id="nav-P-dot"></i>
          </button>
          <button class="rig-view-btn" id="nav-R">
            <span>Janela &rsaquo;</span>
            <span class="keycap">D</span>
          </button>
        </div>
      </div>
    `;

    this.hudRoot.querySelector('#nav-L')?.addEventListener('click', () => this.callbacks.onSetView('L'));
    this.hudRoot.querySelector('#nav-C')?.addEventListener('click', () => this.callbacks.onSetView('C'));
    this.hudRoot.querySelector('#nav-P')?.addEventListener('click', () => this.callbacks.onSetView('P'));
    this.hudRoot.querySelector('#nav-R')?.addEventListener('click', () => this.callbacks.onSetView('R'));

    this.hudRoot.querySelector('#btn-nvg')?.addEventListener('click', () => this.callbacks.onToggleNightVision());
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

    const clk = q('#hud-clock');
    if (clk) {
      // Converte "00:xx AM" para "12:xx AM" no estilo clássico de relógio da meia-noite
      const displayClock = snap.clockText.startsWith('00:')
        ? '12:' + snap.clockText.slice(3)
        : snap.clockText;
      clk.textContent = displayClock;
    }

    const nightLbl = q('#hud-night-lbl');
    if (nightLbl) {
      nightLbl.textContent =
        snap.nightConfig.mode === 'survive6am'
          ? `${snap.nightConfig.dayLabel} · ATÉ 06:00`
          : `${snap.nightConfig.dayLabel} · PRAZO 06:00`;
    }

    const taskLbl = q('#hud-task-lbl');
    if (taskLbl) {
      taskLbl.textContent =
        snap.nightConfig.mode === 'survive6am'
          ? 'META // SOBREVIVER ATÉ 06:00'
          : `PROTOCOLO // ETAPA ${snap.taskIndex}/${snap.totalTasks}`;
    }

    const batPct = Math.ceil(snap.phoneBattery);
    const pbPct = Math.ceil(snap.powerbankReserve);

    const batSegs = q('#hud-bat-segs');
    if (batSegs) batSegs.innerHTML = this.renderSegBar(batPct, 5);
    const batLbl = q('#hud-bat-lbl');
    if (batLbl) batLbl.textContent = `${batPct}%`;

    const pbSegs = q('#hud-pb-segs');
    if (pbSegs) pbSegs.innerHTML = this.renderSegBar(pbPct, 4);
    const pbLbl = q('#hud-pb-lbl');
    if (pbLbl) pbLbl.textContent = `${pbPct}%`;

    const muteBtn = q('#hud-mute-btn');
    if (muteBtn) {
      muteBtn.innerHTML = this.storage.getSettings().muted ? ICONS.soundOff : ICONS.soundOn;
    }

    // Linha superior sutil de perigo / abafamento
    const dngBox = q('#hud-danger');
    const dngBar = q('#hud-danger-bar');
    const dngTxt = q('#hud-danger-txt');
    if (dngBox && dngBar && dngTxt) {
      if (snap.dangerLevel > 0.02) {
        dngBox.style.display = 'block';
        dngBar.style.width = `${Math.min(100, snap.dangerLevel * 100)}%`;
        dngTxt.textContent = `AMEAÇA NA SALA // ${snap.dangerTeacherName}`;
      } else if (snap.roomStress > 65) {
        dngBox.style.display = 'block';
        dngBar.style.width = `${snap.roomStress}%`;
        dngTxt.textContent = `AR RAREFEITO (${Math.round(snap.roomStress)}%) — ABRA A PERSIANA`;
      } else {
        dngBox.style.display = 'none';
      }
    }

    const redGlow = Math.max(snap.dangerLevel * 0.55, snap.roomStress > 70 ? 0.25 : 0);
    this.vignetteEl.style.boxShadow =
      redGlow > 0.05 ? `inset 0 0 120px rgba(185, 18, 28, ${redGlow})` : 'none';

    // Legenda estilo cinema
    const subEl = q('#hud-subtitle');
    if (subEl) {
      if (snap.activeSubtitle) {
        subEl.style.display = 'block';
        subEl.innerHTML = `<span style="color:${snap.activeSubtitle.color}">${snap.activeSubtitle.speaker}:</span>"${snap.activeSubtitle.text}"`;
      } else {
        subEl.style.display = 'none';
      }
    }

    const hintEl = q('#hud-hint');
    if (hintEl) {
      if (snap.statusHint) {
        hintEl.style.display = 'block';
        hintEl.textContent = snap.statusHint;
      } else {
        hintEl.style.display = 'none';
      }
    }

    (['L', 'C', 'P', 'R'] as ViewDirection[]).forEach((dir) => {
      q(`#nav-${dir}`)?.classList.toggle('active', snap.view === dir);
    });

    const dot = q('#nav-P-dot');
    if (dot) {
      dot.style.display =
        snap.bellAlert || snap.valdirPopup || snap.unreadMessages > 0 ? 'block' : 'none';
    }

    const nvOn = Boolean(snap.nightVisionOn && snap.view !== 'P' && snap.phoneBattery > 0);
    q('#btn-nvg')?.classList.toggle('nvg-on', nvOn);
    q('#hud-nvg-reticle')?.classList.toggle('active', nvOn);

    q('#btn-flash')?.classList.toggle('lit', snap.flashlightOn && snap.view !== 'P');
    q('#btn-door')?.classList.toggle('engaged', snap.doorClosed);
    const pwrEl = q('#lbl-door-pwr');
    if (pwrEl) {
      pwrEl.textContent =
        snap.doorLockCooldown > 0
          ? `AGUARDE ${Math.ceil(snap.doorLockCooldown)}S`
          : `${Math.round(snap.doorHoldEnergy)}%`;
    }

    q('#btn-blinds')?.classList.toggle('engaged', snap.blindsClosed);
    const blindsTxt = q('#lbl-blinds-state');
    if (blindsTxt) {
      blindsTxt.textContent = snap.blindsClosed ? 'Persiana [Fechada]' : 'Persiana';
    }

    const showPhone = snap.view === 'P';
    if ((this.phoneEl.style.display === 'flex') !== showPhone) {
      this.phoneEl.style.display = showPhone ? 'flex' : 'none';
    }
  }
}
