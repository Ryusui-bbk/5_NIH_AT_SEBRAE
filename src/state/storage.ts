import { TEACHERS } from '../config/teachers';
import {
  CustomTeacherOverride,
  GameSettings,
  SaveData,
  TeacherConfig,
  TeacherId,
} from '../types';

const STORAGE_KEY = 'plantao_noturno_etec_sebrae_v2';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.85,
  sfxVolume: 0.9,
  ambienceVolume: 0.75,
  muted: false,
  filmGrain: true,
  highQualityShadows: true,
  mouseParallax: true,
  reducedFlashes: false,
};

export const DEFAULT_SAVE: SaveData = {
  unlockedNight: 1,
  completedNights: [],
  customNightBestScore: 0,
  unlockedAchievements: [],
  customTeachers: {},
  settings: { ...DEFAULT_SETTINGS },
  stats: {
    nightsWon: 0,
    deaths: 0,
    tasksCompleted: 0,
    repelsCount: 0,
  },
};

export class StorageManager {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_SAVE);
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        unlockedNight: Math.max(1, Math.min(5, parsed.unlockedNight ?? 1)),
        completedNights: Array.isArray(parsed.completedNights) ? parsed.completedNights : [],
        customNightBestScore: parsed.customNightBestScore ?? 0,
        unlockedAchievements: Array.isArray(parsed.unlockedAchievements)
          ? parsed.unlockedAchievements
          : [],
        customTeachers: parsed.customTeachers ?? {},
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        stats: {
          nightsWon: parsed.stats?.nightsWon ?? 0,
          deaths: parsed.stats?.deaths ?? 0,
          tasksCompleted: parsed.stats?.tasksCompleted ?? 0,
          repelsCount: parsed.stats?.repelsCount ?? 0,
        },
      };
    } catch {
      return structuredClone(DEFAULT_SAVE);
    }
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Caso o localStorage estoure por foto grande, mantém em memória sem quebrar o jogo
    }
  }

  getData(): SaveData {
    return this.data;
  }

  getSettings(): GameSettings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<GameSettings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }

  getTeacherDisplay(id: TeacherId): {
    config: TeacherConfig;
    name: string;
    subject: string;
    photoDataUrl?: string;
    customQuote?: string;
  } {
    const config = TEACHERS[id];
    const custom = this.data.customTeachers[id];
    return {
      config,
      name: custom?.name?.trim() || config.defaultName,
      subject: custom?.subject?.trim() || config.subject,
      photoDataUrl: custom?.photoDataUrl,
      customQuote: custom?.customQuote?.trim() || undefined,
    };
  }

  setTeacherOverride(id: TeacherId, override: CustomTeacherOverride | null): void {
    if (!override) {
      delete this.data.customTeachers[id];
    } else {
      this.data.customTeachers[id] = {
        ...this.data.customTeachers[id],
        ...override,
      };
    }
    this.save();
  }

  resetAllTeachers(): void {
    this.data.customTeachers = {};
    this.save();
  }

  unlockAllNights(): void {
    this.data.unlockedNight = 5;
    this.save();
  }

  resetProgress(): void {
    const customTeachers = this.data.customTeachers;
    const settings = this.data.settings;
    this.data = {
      ...structuredClone(DEFAULT_SAVE),
      customTeachers,
      settings,
    };
    this.save();
  }

  recordVictory(nightNumber: number, customScore = 0): string[] {
    const newlyUnlocked: string[] = [];
    this.data.stats.nightsWon++;
    if (nightNumber >= 1 && nightNumber <= 5) {
      if (!this.data.completedNights.includes(nightNumber)) {
        this.data.completedNights.push(nightNumber);
      }
      if (nightNumber < 5 && this.data.unlockedNight < nightNumber + 1) {
        this.data.unlockedNight = nightNumber + 1;
      }
      if (nightNumber === 1) this.tryUnlock('night_1', newlyUnlocked);
      if (nightNumber === 3) this.tryUnlock('night_3', newlyUnlocked);
      if (
        nightNumber === 5 ||
        [1, 2, 3, 4, 5].every((n) => this.data.completedNights.includes(n))
      ) {
        this.tryUnlock('night_5', newlyUnlocked);
      }
    } else if (nightNumber === 6) {
      if (customScore > this.data.customNightBestScore) {
        this.data.customNightBestScore = customScore;
      }
    }
    this.save();
    return newlyUnlocked;
  }

  unlockAchievement(id: string): boolean {
    const added: string[] = [];
    this.tryUnlock(id, added);
    if (added.length > 0) {
      this.save();
      return true;
    }
    return false;
  }

  private tryUnlock(id: string, bucket: string[]): void {
    if (!this.data.unlockedAchievements.includes(id)) {
      this.data.unlockedAchievements.push(id);
      bucket.push(id);
    }
  }

  recordDeath(): void {
    this.data.stats.deaths++;
    this.save();
  }

  recordTaskCompleted(): void {
    this.data.stats.tasksCompleted++;
    this.save();
  }

  recordRepel(): void {
    this.data.stats.repelsCount++;
    this.save();
  }
}
