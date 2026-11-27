export type ViewDirection = 'C' | 'L' | 'R' | 'P';

export type TeacherId = 'marcos' | 'helena' | 'ricardo' | 'valdir' | 'celia';

export type TaskType = 'shortener' | 'captcha' | 'memory' | 'wifi' | 'pin' | 'dial190';

export type PhoneAppId = 'resgate' | 'cftv' | 'zap';

export type CameraId = 'cam1' | 'cam2' | 'cam3' | 'cam4';

export interface TeacherQuotes {
  stalk: string[];
  near: string[];
  attack: string[];
  retreat: string[];
  jumpscare: string;
}

export interface TeacherConfig {
  id: TeacherId;
  defaultName: string;
  subject: string;
  role: string;
  accentColor: string;
  suitColor: number;
  secondaryColor: number;
  hairColor: number;
  skinColor: number;
  hasGlasses?: boolean;
  isFemale?: boolean;
  propType: 'ruler' | 'clipboard' | 'tablet' | 'ledger' | 'bell';
  originLabel: string;
  mechanicSummary: string;
  counterplayTip: string;
  bio: string;
  quotes: TeacherQuotes;
}

export interface CustomTeacherOverride {
  name?: string;
  subject?: string;
  photoDataUrl?: string;
  customQuote?: string;
}

export interface TeacherRuntimeState {
  id: TeacherId;
  aiLevel: number;
  /** 0 = Sala dos Professores, 1 = Distante, 2 = Próximo, 3 = Na Brecha/Ataque */
  stage: number;
  side: 'L' | 'R' | 'C';
  moveTimer: number;
  attackProgress: number;
  repelProgress: number;
  enterAnim: number;
  popupActive: boolean;
  /** 0..100 para Inspetora Célia (Sinal Escolar) */
  bellCharge: number;
  lastMoveTime: number;
}

export interface VeteranoMessage {
  sender: string;
  time: string;
  text: string;
}

export interface NightConfig {
  nightNumber: number;
  title: string;
  subtitle: string;
  dayLabel: string;
  aiLevels: Record<TeacherId, number>;
  tasks: TaskType[];
  graceSeconds: number;
  /** Duração de 1 hora no relógio da madrugada (00h -> 06h = 6 horas) */
  hourDurationSeconds: number;
  batteryDrainMultiplier: number;
  veteranoMessages: VeteranoMessage[];
  briefingTip: string;
  /** Modo de vitória: 'protocol' = concluir tarefas antes das 06h; 'survive6am' = sobreviver até 06h */
  mode?: 'protocol' | 'survive6am';
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface GameSettings {
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  muted: boolean;
  filmGrain: boolean;
  highQualityShadows: boolean;
  mouseParallax: boolean;
  reducedFlashes: boolean;
}

export interface PlayerStats {
  nightsWon: number;
  deaths: number;
  tasksCompleted: number;
  repelsCount: number;
}

export interface SaveData {
  unlockedNight: number;
  completedNights: number[];
  customNightBestScore: number;
  unlockedAchievements: string[];
  customTeachers: Partial<Record<TeacherId, CustomTeacherOverride>>;
  settings: GameSettings;
  stats: PlayerStats;
}

export interface GameSnapshot {
  running: boolean;
  paused: boolean;
  nightConfig: NightConfig;
  elapsedSeconds: number;
  currentHour: number; // 0..6 (0 = 12 AM / 00:00, 6 = 06:00)
  clockText: string;
  view: ViewDirection;
  flashlightOn: boolean;
  nightVisionOn: boolean;
  doorClosed: boolean;
  doorLockCooldown: number;
  doorHoldEnergy: number; // 0..100
  blindsClosed: boolean;
  roomStress: number; // 0..100 (sobe se trancar tudo ao mesmo tempo por muito tempo)
  phoneBattery: number; // 0..100
  powerbankReserve: number; // 0..100
  noiseLevel: number; // 0..1
  lightningFlash: number; // 0..1 (clarão de relâmpago lá fora na chuva)
  dangerLevel: number; // 0..1
  dangerTeacherName: string | null;
  activeSubtitle: { speaker: string; text: string; color: string } | null;
  statusHint: string;
  dailyGatePin: string;
  taskIndex: number;
  totalTasks: number;
  unreadMessages: number;
  bellAlert: boolean;
  valdirPopup: boolean;
  teachers: Record<TeacherId, TeacherRuntimeState>;
}
