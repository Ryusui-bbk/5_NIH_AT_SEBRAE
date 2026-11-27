import './ui/styles.css';
import { SoundEngine } from './audio/SoundEngine';
import { CAMPAIGN_NIGHTS } from './config/nights';
import { TEACHER_ORDER } from './config/teachers';
import { GameEngine } from './game/GameEngine';
import { PhoneSystem } from './game/PhoneSystem';
import { ClassroomScene } from './scene/ClassroomScene';
import { FirstPersonPhone3D } from './scene/FirstPersonPhone3D';
import { StorageManager } from './state/storage';
import { GameSnapshot, NightConfig, TeacherId, ViewDirection } from './types';
import { UIManager } from './ui/UIManager';

const appEl = document.getElementById('app')!;
const overlayRoot = document.getElementById('overlay-root')!;
const hudRoot = document.getElementById('hud-root')!;
const grainEl = document.getElementById('fx-grain')!;
const vignetteEl = document.getElementById('fx-vignette')!;
const flashEl = document.getElementById('fx-flash')!;
const phoneEl = document.getElementById('phone-device')!;

const storage = new StorageManager();
const sound = new SoundEngine(storage.getSettings());

let activeNightConfig: NightConfig = CAMPAIGN_NIGHTS[0];
let latestSnapshot: GameSnapshot | null = null;
let inJumpscare = false;

const classroom = new ClassroomScene(appEl, storage.getSettings(), (hotspot) => {
  if (!engine.isRunning() || engine.isPaused() || inJumpscare) return;
  const cur = engine.getSnapshot();
  if (hotspot === 'door') {
    if (cur.view === 'L') {
      engine.toggleDoorLock();
      ui.updateHUD(engine.getSnapshot());
    } else {
      changeView('L');
    }
  } else if (hotspot === 'window') {
    if (cur.view === 'R') {
      engine.toggleBlinds();
      ui.updateHUD(engine.getSnapshot());
    } else {
      changeView('R');
    }
  } else if (hotspot === 'noticeboard') {
    if (cur.view !== 'L') changeView('L');
    if (!engine.getSnapshot().flashlightOn) {
      engine.toggleFlashlight();
      ui.updateHUD(engine.getSnapshot());
    }
  } else if (hotspot === 'desk') {
    changeView('P');
  } else if (hotspot === 'board') {
    if (cur.view !== 'C') changeView('C');
    else {
      engine.toggleFlashlight();
      ui.updateHUD(engine.getSnapshot());
    }
  }
});

// Aplica nomes e fotos customizadas salvas anteriormente nos modelos 3D
for (const id of TEACHER_ORDER) {
  const disp = storage.getTeacherDisplay(id);
  classroom.refreshTeacherAppearance(id, disp.name, disp.photoDataUrl);
}

const phone3D = new FirstPersonPhone3D(appEl, phoneEl);

const phoneSystem = new PhoneSystem({
  container: phoneEl,
  sound,
  storage,
  onTaskCompleted: () => {
    engine.completeCurrentTask();
    if (engine.isRunning()) {
      const snap = engine.getSnapshot();
      latestSnapshot = snap;
      phoneSystem.renderDOM(snap);
    }
  },
  onMistake: (reason) => {
    ui.triggerRedFlash(0.45);
    engine.triggerMistakeNoise(reason);
  },
  onRewindBell: () => {
    engine.rewindSchoolBell();
  },
  onDismissValdir: () => {
    engine.dismissValdirPopup();
    if (engine.isRunning()) {
      const snap = engine.getSnapshot();
      latestSnapshot = snap;
      phoneSystem.renderDOM(snap);
    }
  },
  onReadMessages: () => {
    engine.markMessagesRead();
  },
  getSnapshot: () => engine.getSnapshot(),
});

const engine = new GameEngine({
  sound,
  storage,
  onJumpscare: (teacherId: TeacherId, done: () => void) => {
    inJumpscare = true;
    phone3D.hideImmediately();
    hudRoot.style.display = 'none';
    ui.triggerRedFlash(0.85);
    classroom.triggerJumpscare(teacherId);
    setTimeout(() => {
      classroom.clearJumpscare();
      inJumpscare = false;
      done();
    }, 1650);
  },
  onGameEnd: (payload) => {
    latestSnapshot = null;
    phone3D.hideImmediately();
    ui.showEndScreen(payload, activeNightConfig);
  },
});

function changeView(v: ViewDirection): void {
  const before = engine.isRunning() ? engine.getSnapshot().view : 'C';
  engine.setView(v);
  if (!engine.isRunning()) return;
  const snap = engine.getSnapshot();
  latestSnapshot = snap;
  ui.updateHUD(snap);
  if (snap.view === 'P' && before !== 'P') {
    phoneSystem.renderDOM(snap);
  }
}

const ui = new UIManager({
  overlayRoot,
  hudRoot,
  grainEl,
  vignetteEl,
  flashEl,
  phoneEl,
  storage,
  callbacks: {
    onUiSound: () => {
      sound.init();
      sound.playTap();
    },
    onStartNight: (config: NightConfig) => {
      sound.init();
      activeNightConfig = config;
      classroom.clearJumpscare();
      const snap = engine.startNight(config);
      latestSnapshot = snap;
      classroom.setDailyPin(engine.getDailyPin());
      phoneSystem.resetForNight(config.tasks[0] ?? null);
      phoneSystem.renderDOM(snap);
      ui.updateHUD(snap);
    },
    onSetView: (v) => changeView(v),
    onToggleFlashlight: () => {
      engine.toggleFlashlight();
      if (engine.isRunning()) ui.updateHUD(engine.getSnapshot());
    },
    onToggleNightVision: () => {
      engine.toggleNightVision();
      if (engine.isRunning()) ui.updateHUD(engine.getSnapshot());
    },
    onToggleDoor: () => {
      engine.toggleDoorLock();
      if (engine.isRunning()) ui.updateHUD(engine.getSnapshot());
    },
    onToggleBlinds: () => {
      engine.toggleBlinds();
      if (engine.isRunning()) ui.updateHUD(engine.getSnapshot());
    },
    onTogglePause: () => {
      if (!engine.isRunning()) return;
      const nextPaused = !engine.isPaused();
      engine.setPaused(nextPaused);
      if (nextPaused) {
        phone3D.hideImmediately();
        ui.showPauseModal();
      } else {
        ui.hideOverlay();
      }
    },
    onQuitToMenu: () => {
      engine.stop();
      latestSnapshot = null;
      phone3D.hideImmediately();
      classroom.clearJumpscare();
      ui.showMainMenu('home');
    },
    onSettingsChanged: (s) => {
      sound.updateSettings(s);
      classroom.updateSettings(s);
    },
    onTeacherAppearanceChanged: (id) => {
      const disp = storage.getTeacherDisplay(id);
      classroom.refreshTeacherAppearance(id, disp.name, disp.photoDataUrl);
    },
  },
});

// Atalhos de teclado completos
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && target.tagName === 'INPUT') return;

  if (e.key === 'Escape') {
    if (engine.isRunning()) {
      e.preventDefault();
      const nextPaused = !engine.isPaused();
      engine.setPaused(nextPaused);
      if (nextPaused) {
        phone3D.hideImmediately();
        ui.showPauseModal();
      } else {
        ui.hideOverlay();
      }
    }
    return;
  }

  if (!engine.isRunning() || engine.isPaused() || inJumpscare) return;

  const snap = engine.getSnapshot();
  if (phoneSystem.handleKeyInput(e.key, snap)) {
    e.preventDefault();
    return;
  }

  const k = e.key.toLowerCase();
  if (k === 'a' || k === 'arrowleft') {
    e.preventDefault();
    changeView('L');
  } else if (k === 'd' || k === 'arrowright') {
    e.preventDefault();
    changeView('R');
  } else if (k === 'w' || k === 'arrowup') {
    e.preventDefault();
    changeView('C');
  } else if (k === 's' || k === 'arrowdown' || k === 'tab') {
    e.preventDefault();
    changeView('P');
  } else if (k === 'f') {
    e.preventDefault();
    engine.toggleFlashlight();
    ui.updateHUD(engine.getSnapshot());
  } else if (k === 'n') {
    e.preventDefault();
    engine.toggleNightVision();
    ui.updateHUD(engine.getSnapshot());
  } else if (e.code === 'Space') {
    e.preventDefault();
    engine.toggleDoorLock();
    ui.updateHUD(engine.getSnapshot());
  } else if (k === 'e') {
    e.preventDefault();
    engine.toggleBlinds();
    ui.updateHUD(engine.getSnapshot());
  } else if (k === 'm') {
    e.preventDefault();
    const cur = storage.getSettings().muted;
    storage.updateSettings({ muted: !cur });
    sound.updateSettings(storage.getSettings());
    ui.updateHUD(engine.getSnapshot());
  }
});

// Inicializa no Menu Principal
ui.showMainMenu('home');

// Loop principal 60fps
let lastTime = performance.now();
function animate(now: number): void {
  const dt = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  if (engine.isRunning() && !engine.isPaused()) {
    const prevPopup = latestSnapshot?.valdirPopup ?? false;
    const prevBatZero = (latestSnapshot?.phoneBattery ?? 100) <= 0;

    const snap = engine.update(dt, phoneSystem.isCftvActive());
    latestSnapshot = snap;

    if (engine.isRunning()) {
      const nowBatZero = snap.phoneBattery <= 0;
      if (snap.view === 'P' && (snap.valdirPopup !== prevPopup || nowBatZero !== prevBatZero)) {
        phoneSystem.renderDOM(snap);
      }
      phoneSystem.update(dt, snap, classroom.getMouseNDC());
      ui.updateHUD(snap);
    }
  }

  classroom.update(dt, inJumpscare ? engine.getSnapshot() : latestSnapshot);
  phone3D.update(
    dt,
    engine.isRunning() && !engine.isPaused() && !inJumpscare ? latestSnapshot : null,
    classroom.getMouseNDC(),
    classroom.getPhoneRoomLightState()
  );
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
