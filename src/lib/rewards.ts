import type { RecallGrade } from '../types/flashcard';
import { addDays, getLocalDateString } from './spacedRepetition';

const REWARDS_STORAGE_KEY = 'foliorecall_rewards_v1';

export interface RewardProfile {
  totalXp: number;
  cardsReviewedTotal: number;
  dailyStreak: number;
  lastStudyDate: string | null;
  todayDate: string;
  todayCardsReviewed: number;
  dailyGoal: number;
  bestCombo: number;
  soundEnabled: boolean;
  voiceoverEnabled: boolean;
  voicePreference: string; // 'auto' | 'male' | 'female' | exact SpeechSynthesisVoice.name
  voicePitch: VoicePitchPreset;
}

export type VoicePitchPreset = 'deep' | 'natural' | 'bright';

export interface RankInfo {
  level: number;
  title: string;
  minXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  levelSpanXp: number;
  progressPct: number;
  xpToNext: number;
}

export interface CardRewardOutcome {
  id: string;
  grade: RecallGrade;
  totalXp: number;
  baseXp: number;
  comboMultiplier: number;
  comboBonusXp: number;
  scratchpadBonusXp: number;
  newCardBonusXp: number;
  nextCombo: number;
  headline: string;
  subline: string;
}

const RANKS: Array<{ level: number; title: string; minXp: number }> = [
  { level: 1, title: 'Apprentice', minXp: 0 },
  { level: 2, title: 'Reader', minXp: 120 },
  { level: 3, title: 'Scholar', minXp: 320 },
  { level: 4, title: 'Archivist', minXp: 650 },
  { level: 5, title: 'Fellow', minXp: 1100 },
  { level: 6, title: 'Dean', minXp: 1750 },
  { level: 7, title: 'Laureate', minXp: 2600 },
];

export function createDefaultRewardProfile(): RewardProfile {
  return {
    totalXp: 0,
    cardsReviewedTotal: 0,
    dailyStreak: 0,
    lastStudyDate: null,
    todayDate: getLocalDateString(),
    todayCardsReviewed: 0,
    dailyGoal: 20,
    bestCombo: 0,
    soundEnabled: true,
    voiceoverEnabled: true,
    voicePreference: 'auto',
    voicePitch: 'deep',
  };
}

export function loadRewardProfile(): RewardProfile {
  const todayStr = getLocalDateString();
  try {
    const raw = localStorage.getItem(REWARDS_STORAGE_KEY);
    if (!raw) return createDefaultRewardProfile();
    const parsed = JSON.parse(raw) as Partial<RewardProfile>;
    const base = createDefaultRewardProfile();
    const merged: RewardProfile = {
      ...base,
      ...parsed,
    };

    // Roll over daily counter if a new calendar day started
    if (merged.todayDate !== todayStr) {
      merged.todayDate = todayStr;
      merged.todayCardsReviewed = 0;
    }

    // Reset streak if user missed yesterday and hasn't studied today
    if (merged.lastStudyDate) {
      const yesterday = addDays(todayStr, -1);
      if (merged.lastStudyDate !== todayStr && merged.lastStudyDate !== yesterday) {
        merged.dailyStreak = 0;
      }
    }

    return merged;
  } catch {
    return createDefaultRewardProfile();
  }
}

export function saveRewardProfile(profile: RewardProfile): void {
  try {
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage quota failures
  }
}

export function resetRewardProfile(): RewardProfile {
  const fresh = createDefaultRewardProfile();
  saveRewardProfile(fresh);
  return fresh;
}

export function getRankInfo(totalXp: number): RankInfo {
  const safeXp = Math.max(0, Math.floor(totalXp));
  let current = RANKS[0];
  let nextMin = RANKS[1].minXp;

  for (let i = 0; i < RANKS.length; i++) {
    if (safeXp >= RANKS[i].minXp) {
      current = RANKS[i];
      if (i + 1 < RANKS.length) {
        nextMin = RANKS[i + 1].minXp;
      } else {
        // Endless master levels beyond Laureate (every +1000 XP)
        const extraLevels = Math.floor((safeXp - current.minXp) / 1000);
        const level = current.level + extraLevels;
        const minXp = current.minXp + extraLevels * 1000;
        const nextLevelXp = minXp + 1000;
        const xpIntoLevel = safeXp - minXp;
        return {
          level,
          title: extraLevels > 0 ? `Grand Master ${extraLevels + 1}` : current.title,
          minXp,
          nextLevelXp,
          xpIntoLevel,
          levelSpanXp: 1000,
          progressPct: Math.min(100, Math.round((xpIntoLevel / 1000) * 100)),
          xpToNext: Math.max(0, nextLevelXp - safeXp),
        };
      }
    }
  }

  const levelSpanXp = Math.max(1, nextMin - current.minXp);
  const xpIntoLevel = safeXp - current.minXp;
  return {
    level: current.level,
    title: current.title,
    minXp: current.minXp,
    nextLevelXp: nextMin,
    xpIntoLevel,
    levelSpanXp,
    progressPct: Math.min(100, Math.round((xpIntoLevel / levelSpanXp) * 100)),
    xpToNext: Math.max(0, nextMin - safeXp),
  };
}

export function getComboMultiplier(comboCount: number): number {
  if (comboCount >= 8) return 2.0;
  if (comboCount >= 5) return 1.5;
  if (comboCount >= 3) return 1.25;
  return 1.0;
}

export function computeCardReward(params: {
  grade: RecallGrade;
  currentCombo: number;
  usedScratchpad: boolean;
  isNewCard: boolean;
}): CardRewardOutcome {
  const { grade, currentCombo, usedScratchpad, isNewCard } = params;

  const baseByGrade: Record<RecallGrade, number> = {
    again: 5,
    hard: 15,
    good: 25,
    easy: 35,
  };

  const baseXp = baseByGrade[grade];
  const nextCombo = grade === 'again' ? 0 : currentCombo + 1;
  const comboMultiplier = grade === 'again' ? 1.0 : getComboMultiplier(nextCombo);
  const multiplied = Math.round(baseXp * comboMultiplier);
  const comboBonusXp = Math.max(0, multiplied - baseXp);
  const scratchpadBonusXp = usedScratchpad ? 5 : 0;
  const newCardBonusXp = isNewCard && grade !== 'again' ? 5 : 0;
  const totalXp = baseXp + comboBonusXp + scratchpadBonusXp + newCardBonusXp;

  let headline = 'Solid Recall';
  let subline = 'Memory stability strengthened';

  if (grade === 'easy') {
    headline = nextCombo >= 5 ? `${nextCombo}× Mastery Streak!` : 'Effortless Recall!';
    subline = 'Long-term trace locked in';
  } else if (grade === 'good') {
    headline = nextCombo >= 3 ? `${nextCombo}× Recall Combo!` : 'Neural Link Reinforced';
    subline = 'Optimal spacing achieved';
  } else if (grade === 'hard') {
    headline = 'Gritty Retrieval!';
    subline = 'Effortful recall builds stronger memory';
  } else {
    headline = 'Honest Reset';
    subline = '+5 XP for active recall attempt';
  }

  return {
    id: crypto.randomUUID(),
    grade,
    totalXp,
    baseXp,
    comboMultiplier,
    comboBonusXp,
    scratchpadBonusXp,
    newCardBonusXp,
    nextCombo,
    headline,
    subline,
  };
}

export function recordCardReward(
  profile: RewardProfile,
  reward: CardRewardOutcome
): {
  updatedProfile: RewardProfile;
  leveledUp: boolean;
  previousRank: RankInfo;
  newRank: RankInfo;
} {
  const todayStr = getLocalDateString();
  const yesterday = addDays(todayStr, -1);

  const previousRank = getRankInfo(profile.totalXp);
  const nextTotalXp = profile.totalXp + reward.totalXp;
  const newRank = getRankInfo(nextTotalXp);

  let nextStreak = profile.dailyStreak;
  if (profile.lastStudyDate !== todayStr) {
    if (profile.lastStudyDate === yesterday) {
      nextStreak = Math.max(1, profile.dailyStreak + 1);
    } else {
      nextStreak = 1;
    }
  }

  const todayCount =
    profile.todayDate === todayStr ? profile.todayCardsReviewed + 1 : 1;

  const updatedProfile: RewardProfile = {
    ...profile,
    totalXp: nextTotalXp,
    cardsReviewedTotal: profile.cardsReviewedTotal + 1,
    dailyStreak: nextStreak,
    lastStudyDate: todayStr,
    todayDate: todayStr,
    todayCardsReviewed: todayCount,
    bestCombo: Math.max(profile.bestCombo, reward.nextCombo),
  };

  saveRewardProfile(updatedProfile);

  return {
    updatedProfile,
    leveledUp: newRank.level > previousRank.level,
    previousRank,
    newRank,
  };
}

let sharedAudioCtx: AudioContext | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;

async function ensureReadyAudio(): Promise<{
  ctx: AudioContext;
  output: AudioNode;
} | null> {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
    masterCompressor = sharedAudioCtx.createDynamicsCompressor();
    masterCompressor.threshold.setValueAtTime(-14, sharedAudioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(18, sharedAudioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(6, sharedAudioCtx.currentTime);
    masterCompressor.connect(sharedAudioCtx.destination);
  }

  if (sharedAudioCtx.state === 'suspended') {
    await sharedAudioCtx.resume().catch(() => {});
  }

  return {
    ctx: sharedAudioCtx,
    output: masterCompressor ?? sharedAudioCtx.destination,
  };
}

export type RewardSoundKind =
  | 'reveal'
  | 'again'
  | 'hard'
  | 'good'
  | 'easy'
  | 'bonus_xp'
  | 'combo_milestone'
  | 'daily_goal'
  | 'levelup'
  | 'complete'
  | 'sound_on';

export type AnnouncerTier = 'streak' | 'skill' | 'milestone' | 'rank' | 'victory';

export interface AnnouncerCallout {
  id: string;
  tier: AnnouncerTier;
  badge: string;
  displayTitle: string;
  subtitle: string;
  speechText: string;
}

export function evaluateCardAnnouncerCallout(params: {
  reward: CardRewardOutcome;
  leveledUp: boolean;
  newRank: RankInfo;
  hitDailyGoal: boolean;
  dailyGoal: number;
  easyStreak: number;
  usedScratchpad: boolean;
  isComeback: boolean;
  responseSeconds: number;
}): AnnouncerCallout | null {
  const {
    reward,
    leveledUp,
    newRank,
    hitDailyGoal,
    dailyGoal,
    easyStreak,
    usedScratchpad,
    isComeback,
    responseSeconds,
  } = params;

  if (leveledUp) {
    return {
      id: crypto.randomUUID(),
      tier: 'rank',
      badge: `RANK UP · LV.${newRank.level}`,
      displayTitle: `${newRank.title.toUpperCase()}!`,
      subtitle: 'Scholar rank promoted',
      speechText: `Rank up! Promoted to ${newRank.title}!`,
    };
  }

  if (hitDailyGoal) {
    return {
      id: crypto.randomUUID(),
      tier: 'milestone',
      badge: 'DAILY TARGET',
      displayTitle: 'GOAL CRUSHED!',
      subtitle: `${dailyGoal} cards mastered today`,
      speechText: `Daily goal crushed! ${dailyGoal} cards mastered!`,
    };
  }

  const combo = reward.nextCombo;

  if (combo >= 15 && combo % 5 === 0) {
    return {
      id: crypto.randomUUID(),
      tier: 'streak',
      badge: `${combo}× STREAK`,
      displayTitle: 'GODLIKE RECALL!',
      subtitle: '2.0× XP overdrive active',
      speechText: 'Godlike recall!',
    };
  }

  if (combo === 12) {
    return {
      id: crypto.randomUUID(),
      tier: 'streak',
      badge: '12× STREAK',
      displayTitle: 'DOMINATING!',
      subtitle: 'Unbroken recall mastery',
      speechText: 'Dominating!',
    };
  }

  if (combo === 10) {
    return {
      id: crypto.randomUUID(),
      tier: 'streak',
      badge: '10× STREAK',
      displayTitle: 'PRO PLAYER!',
      subtitle: 'Double-digit recall streak',
      speechText: 'Pro player!',
    };
  }

  if (combo === 8) {
    return {
      id: crypto.randomUUID(),
      tier: 'streak',
      badge: '8× STREAK',
      displayTitle: 'UNSTOPPABLE!',
      subtitle: 'Maximum 2.0× XP multiplier',
      speechText: 'Unstoppable!',
    };
  }

  if (combo === 5) {
    return {
      id: crypto.randomUUID(),
      tier: 'streak',
      badge: '5× STREAK',
      displayTitle: 'MEGA STREAK!',
      subtitle: '1.5× XP multiplier unlocked',
      speechText: 'Mega streak!',
    };
  }

  if (combo === 3) {
    return {
      id: crypto.randomUUID(),
      tier: 'streak',
      badge: '3× STREAK',
      displayTitle: 'TRIPLE STREAK!',
      subtitle: '1.25× XP multiplier active',
      speechText: 'Triple streak!',
    };
  }

  if (combo === 2 && (reward.grade === 'easy' || reward.grade === 'good')) {
    return {
      id: crypto.randomUUID(),
      tier: 'streak',
      badge: '2× COMBO',
      displayTitle: 'DOUBLE RECALL!',
      subtitle: 'One more for 1.25× XP',
      speechText: 'Double recall!',
    };
  }

  if (isComeback && (reward.grade === 'good' || reward.grade === 'easy')) {
    return {
      id: crypto.randomUUID(),
      tier: 'skill',
      badge: 'REDEMPTION',
      displayTitle: 'CLUTCH COMEBACK!',
      subtitle: 'Previously missed card conquered',
      speechText: 'Clutch comeback!',
    };
  }

  if (
    reward.grade === 'easy' &&
    (easyStreak >= 3 || (combo >= 2 && responseSeconds <= 7))
  ) {
    return {
      id: crypto.randomUUID(),
      tier: 'skill',
      badge: easyStreak >= 3 ? `${easyStreak}× EASY` : `${responseSeconds}s SPEED`,
      displayTitle: 'PRO PLAYER!',
      subtitle:
        easyStreak >= 3
          ? 'Consecutive effortless recalls'
          : 'Lightning-fast effortless recall',
      speechText: 'Pro player!',
    };
  }

  if (reward.grade === 'easy' && usedScratchpad) {
    return {
      id: crypto.randomUUID(),
      tier: 'skill',
      badge: 'ACTIVE NOTES',
      displayTitle: 'MASTERMIND!',
      subtitle: 'Written recall + effortless grade',
      speechText: 'Mastermind!',
    };
  }

  return null;
}

export function evaluateSessionAnnouncerCallout(params: {
  scorePercent: number;
  totalCards: number;
  bestSessionCombo: number;
}): AnnouncerCallout {
  const { scorePercent, totalCards, bestSessionCombo } = params;

  if (scorePercent === 100 && totalCards >= 3) {
    return {
      id: crypto.randomUUID(),
      tier: 'victory',
      badge: '100% ACCURACY',
      displayTitle: 'FLAWLESS VICTORY!',
      subtitle: `${totalCards} cards · Pro Player performance`,
      speechText: 'Flawless victory! Pro player!',
    };
  }

  if (scorePercent >= 90 && totalCards >= 2) {
    return {
      id: crypto.randomUUID(),
      tier: 'victory',
      badge: `${scorePercent}% SCORE`,
      displayTitle: 'PRO PLAYER!',
      subtitle: `Best streak ${bestSessionCombo}× · Session dominated`,
      speechText: 'Pro player! Session dominated!',
    };
  }

  if (scorePercent >= 75) {
    return {
      id: crypto.randomUUID(),
      tier: 'victory',
      badge: `${scorePercent}% SCORE`,
      displayTitle: 'GREAT RECALL!',
      subtitle: `${totalCards} cards completed`,
      speechText: 'Victory! Great recall!',
    };
  }

  return {
    id: crypto.randomUUID(),
    tier: 'victory',
    badge: 'SESSION DONE',
    displayTitle: 'TRAINING COMPLETE!',
    subtitle: 'Missed cards strengthened for next round',
    speechText: 'Session complete! Keep sharpening!',
  };
}

const MALE_VOICE_KEYWORDS = [
  'google uk english male',
  'male',
  'daniel',
  'alex',
  'ryan',
  'guy',
  'david',
  'george',
  'arthur',
  'oliver',
  'thomas',
  'mark',
  'christopher',
  'andrew',
  'brian',
  'eric',
  'roger',
  'steffan',
  'fred',
  'aaron',
];

const FEMALE_VOICE_KEYWORDS = [
  'google us english',
  'google uk english female',
  'female',
  'aria',
  'jenny',
  'samantha',
  'victoria',
  'karen',
  'serena',
  'kate',
  'libby',
  'sonia',
  'ava',
  'emma',
  'michelle',
  'ana',
  'zira',
  'hazel',
  'susan',
  'moira',
  'tessa',
  'fiona',
];

export function getAvailableAnnouncerVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  try {
    const voices = window.speechSynthesis.getVoices();
    const sorted = [...voices].sort((a, b) => {
      const aEn = a.lang.toLowerCase().startsWith('en') ? 0 : 1;
      const bEn = b.lang.toLowerCase().startsWith('en') ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  } catch {
    return [];
  }
}

export function pickAnnouncerVoice(
  synth: SpeechSynthesis,
  preference: string = 'auto'
): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices || voices.length === 0) return null;

  if (preference && preference !== 'auto' && preference !== 'male' && preference !== 'female') {
    const exact = voices.find((v) => v.name === preference);
    if (exact) return exact;
  }

  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  if (preference === 'male') {
    for (const kw of MALE_VOICE_KEYWORDS) {
      const match = pool.find((v) => v.name.toLowerCase().includes(kw));
      if (match) return match;
    }
  }

  if (preference === 'female') {
    for (const kw of FEMALE_VOICE_KEYWORDS) {
      const match = pool.find((v) => v.name.toLowerCase().includes(kw));
      if (match) return match;
    }
  }

  const autoPreferredKeywords = [
    'natural',
    'google us english',
    'google uk english male',
    'daniel',
    'alex',
    'ryan',
    'guy',
    'david',
    'aria',
    'samantha',
  ];

  for (const kw of autoPreferredKeywords) {
    const match = pool.find((v) => v.name.toLowerCase().includes(kw));
    if (match) return match;
  }

  return pool[0] ?? null;
}

export function playAnnouncerStinger(tier: AnnouncerTier): void {
  void (async () => {
    try {
      const ready = await ensureReadyAudio();
      if (!ready) return;
      const { ctx, output } = ready;
      const now = ctx.currentTime;

      const boom = ctx.createOscillator();
      const boomGain = ctx.createGain();
      boom.type = 'triangle';
      boom.frequency.setValueAtTime(tier === 'rank' || tier === 'victory' ? 140 : 120, now);
      boom.frequency.exponentialRampToValueAtTime(48, now + 0.24);
      boomGain.gain.setValueAtTime(0.001, now);
      boomGain.gain.exponentialRampToValueAtTime(0.24, now + 0.015);
      boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
      boom.connect(boomGain);
      boomGain.connect(output);
      boom.start(now);
      boom.stop(now + 0.28);

      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmer.type = 'sine';
      const baseHz = tier === 'victory' || tier === 'rank' ? 587.33 : 493.88;
      shimmer.frequency.setValueAtTime(baseHz, now + 0.02);
      shimmer.frequency.exponentialRampToValueAtTime(baseHz * 1.5, now + 0.18);
      shimmerGain.gain.setValueAtTime(0.0001, now + 0.02);
      shimmerGain.gain.exponentialRampToValueAtTime(0.11, now + 0.045);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(output);
      shimmer.start(now + 0.02);
      shimmer.stop(now + 0.27);
    } catch {
      // Ignore Web Audio failures silently
    }
  })();
}

function resolveVoicePitchValue(
  preset: VoicePitchPreset,
  tier: AnnouncerTier
): number {
  if (preset === 'natural') return 1.0;
  if (preset === 'bright') return 1.12;
  return tier === 'victory' || tier === 'rank' ? 0.9 : 0.86;
}

export function speakAnnouncerLine(
  text: string,
  options?: {
    tier?: AnnouncerTier;
    withStinger?: boolean;
    delayMs?: number;
    voicePreference?: string;
    voicePitch?: VoicePitchPreset;
  }
): void {
  if (typeof window === 'undefined') return;
  const savedProfile = loadRewardProfile();
  const {
    tier = 'streak',
    withStinger = true,
    delayMs = 95,
    voicePreference = savedProfile.voicePreference,
    voicePitch = savedProfile.voicePitch,
  } = options ?? {};

  if (withStinger) {
    playAnnouncerStinger(tier);
  }

  if (!('speechSynthesis' in window)) return;

  const triggerSpeech = () => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickAnnouncerVoice(synth, voicePreference);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.lang = voice?.lang || 'en-US';
      utterance.pitch = resolveVoicePitchValue(voicePitch, tier);
      utterance.rate = 1.04;
      utterance.volume = 0.95;
      synth.speak(utterance);
    } catch {
      // Ignore speech synthesis errors silently
    }
  };

  if (delayMs > 0) {
    window.setTimeout(triggerSpeech, delayMs);
  } else {
    triggerSpeech();
  }
}

export function stopAnnouncerVoiceover(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

export function playRewardSound(kind: RewardSoundKind, combo: number = 0): void {
  void (async () => {
    try {
      const ready = await ensureReadyAudio();
      if (!ready) return;
      const { ctx, output } = ready;
      const now = ctx.currentTime;

      const playTone = (
        freq: number,
        startOffset: number,
        duration: number,
        gainPeak: number,
        type: OscillatorType = 'sine',
        endFreq?: number
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + startOffset);
        if (endFreq) {
          osc.frequency.exponentialRampToValueAtTime(endFreq, now + startOffset + duration);
        }
        gain.gain.setValueAtTime(0.0001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(gainPeak, now + startOffset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
        osc.connect(gain);
        gain.connect(output);
        osc.start(now + startOffset);
        osc.stop(now + startOffset + duration + 0.03);
      };

      const playBell = (
        freq: number,
        startOffset: number,
        duration: number,
        gainPeak: number
      ) => {
        playTone(freq, startOffset, duration, gainPeak, 'sine');
        playTone(freq * 2, startOffset, duration * 0.65, gainPeak * 0.35, 'triangle');
      };

      const pitchBoost = 1 + Math.min(combo, 10) * 0.022;

      if (kind === 'reveal') {
        // Tactile paper turn + soft wooden tap
        playTone(240, 0, 0.06, 0.09, 'triangle', 360);
        playTone(540, 0.02, 0.05, 0.05, 'sine');
        return;
      }

      if (kind === 'sound_on') {
        playBell(587.33, 0, 0.14, 0.13);
        playBell(880, 0.07, 0.22, 0.14);
        return;
      }

      if (kind === 'again') {
        // Honest effort soft double wood-chime (+5 XP coin)
        playTone(293.66, 0, 0.11, 0.12, 'triangle');
        playBell(392.0, 0.08, 0.16, 0.1);
        return;
      }

      if (kind === 'hard') {
        // Gritty retrieval (+15 XP) warm marimba two-step
        playTone(440 * pitchBoost, 0, 0.14, 0.14, 'triangle');
        playBell(554.37 * pitchBoost, 0.07, 0.22, 0.14);
        return;
      }

      if (kind === 'good') {
        // Solid recall (+25 XP) crisp fifth + bright XP coin sparkle
        playBell(523.25 * pitchBoost, 0, 0.16, 0.16);
        playBell(783.99 * pitchBoost, 0.065, 0.24, 0.17);
        playTone(1046.5 * pitchBoost, 0.13, 0.2, 0.09, 'sine');
        return;
      }

      if (kind === 'easy') {
        // Effortless recall (+35 XP) rising major triad + golden coin shimmer
        playBell(523.25 * pitchBoost, 0, 0.15, 0.16);
        playBell(659.25 * pitchBoost, 0.055, 0.17, 0.16);
        playBell(783.99 * pitchBoost, 0.11, 0.24, 0.18);
        playBell(1046.5 * pitchBoost, 0.17, 0.34, 0.16);
        return;
      }

      if (kind === 'bonus_xp') {
        // High coin-sparkle for Recall Note / New Card XP bonus
        playBell(1174.66, 0, 0.13, 0.12);
        playBell(1567.98, 0.06, 0.22, 0.13);
        return;
      }

      if (kind === 'combo_milestone') {
        // Ascending power streak arpeggio (3x / 5x / 8x+)
        playBell(659.25, 0, 0.12, 0.15);
        playBell(783.99, 0.055, 0.12, 0.15);
        playBell(987.77, 0.11, 0.16, 0.16);
        playBell(1318.51, 0.165, 0.32, 0.18);
        return;
      }

      if (kind === 'daily_goal') {
        // Warm 4-note brass/bell achievement flourish
        playBell(587.33, 0, 0.16, 0.16);
        playBell(739.99, 0.08, 0.16, 0.16);
        playBell(880.0, 0.16, 0.18, 0.17);
        playBell(1174.66, 0.24, 0.4, 0.19);
        return;
      }

      if (kind === 'levelup') {
        // Rank Promotion royal fanfare
        playBell(523.25, 0, 0.16, 0.18);
        playBell(659.25, 0.08, 0.16, 0.18);
        playBell(783.99, 0.16, 0.18, 0.19);
        playBell(1046.5, 0.25, 0.26, 0.2);
        playBell(1318.51, 0.34, 0.48, 0.2);
        return;
      }

      if (kind === 'complete') {
        // Quiz complete warm resolution chord
        playBell(392.0, 0, 0.2, 0.15);
        playBell(523.25, 0.07, 0.22, 0.16);
        playBell(659.25, 0.14, 0.26, 0.17);
        playBell(1046.5, 0.22, 0.46, 0.18);
      }
    } catch {
      // Ignore audio context errors silently
    }
  })();
}

/**
 * Plays layered, staggered sounds for every reward earned on a single card
 * (base grade reward + bonus XP sparkle + combo streak milestone + daily goal + rank up).
 */
export function playCardRewardSequence(params: {
  reward: CardRewardOutcome;
  leveledUp: boolean;
  hitDailyGoal: boolean;
}): void {
  const { reward, leveledUp, hitDailyGoal } = params;

  // 1. Primary per-card recall reward chime
  playRewardSound(reward.grade, reward.nextCombo);

  // 2. Staggered bonus XP coin ping (scratchpad note or new card bonus)
  const hasExtraBonus = reward.scratchpadBonusXp > 0 || reward.newCardBonusXp > 0;
  if (hasExtraBonus) {
    window.setTimeout(() => {
      playRewardSound('bonus_xp', reward.nextCombo);
    }, 180);
  }

  // 3. Combo milestone flourish (3x, 5x, 8x, or every +5 after)
  const isComboMilestone =
    reward.nextCombo === 3 ||
    reward.nextCombo === 5 ||
    reward.nextCombo === 8 ||
    (reward.nextCombo >= 10 && reward.nextCombo % 5 === 0);

  if (isComboMilestone) {
    window.setTimeout(() => {
      playRewardSound('combo_milestone', reward.nextCombo);
    }, hasExtraBonus ? 340 : 210);
  }

  // 4. Daily Goal achieved flourish
  if (hitDailyGoal) {
    window.setTimeout(() => {
      playRewardSound('daily_goal', reward.nextCombo);
    }, 440);
  }

  // 5. Rank Promotion fanfare
  if (leveledUp) {
    window.setTimeout(() => {
      playRewardSound('levelup', reward.nextCombo);
    }, hitDailyGoal ? 700 : 420);
  }
}
