export interface Milestone {
  minutes: number;
  label: string;
  title: string;
  description: string;
  category: "cardiovascular" | "respiratory" | "neurological" | "cancer" | "metabolic";
  source: string;
}

export interface Craving {
  id: string;
  timestamp: string;
  intensity: number;
  /** What set it off (see TRIGGERS). Optional — older entries won't have it. */
  triggers?: string[];
  /** How it felt in the body/mind (see CRAVING_FEELINGS). */
  feelings?: string[];
  /** Free-text note. */
  note?: string;
  /** True if the user rode it out with the distraction game instead of just logging. */
  distracted?: boolean;
}

export interface Relapse {
  id: string;
  timestamp: string;
  /** How many bowls this slip was. */
  amount?: number;
  /** What set it off (see TRIGGERS). */
  triggers?: string[];
  /** How they felt right before (see FEELINGS_BEFORE). */
  feelingsBefore?: string[];
  /** How they feel now, after (see FEELINGS_AFTER). */
  feelingsAfter?: string[];
  /** Free-text note. */
  note?: string;
}

/** A body/mind withdrawal symptom the user said they were feeling (see withdrawal.ts). */
export interface SymptomLog {
  id: string;
  timestamp: string;
  symptomId: string;
  /** 1 = mild, 2 = noticeable, 3 = rough. */
  severity: number;
}

export interface QuitProfile {
  /** When the journey started (first quit). The live timer counts from the last slip after this. */
  quitDate: string;
  bowlsPerDay: number;
  costPerPouch: number;
  bowlsPerPouch: number;
  cravings: Craving[];
  relapses: Relapse[];
  symptoms: SymptomLog[];
}

// ── Granular capture vocabularies ──────────────────────────────
// Kept short and recognizable so a chip picker stays fast to tap.

export const TRIGGERS = [
  "Stress",
  "After eating",
  "Coffee",
  "Alcohol",
  "Others smoking",
  "Boredom",
  "Driving",
  "On my phone",
  "Work",
  "Just woke up",
  "Anxiety",
  "Habit",
] as const;

export const CRAVING_FEELINGS = [
  "Restless",
  "Anxious",
  "Irritable",
  "Tense",
  "Foggy",
  "Antsy",
  "Low",
  "Wired",
] as const;

export const FEELINGS_BEFORE = [
  "Stressed",
  "Anxious",
  "Bored",
  "Restless",
  "Angry",
  "Sad",
  "Tired",
  "Celebrating",
  "Lonely",
  "Overwhelmed",
] as const;

export const FEELINGS_AFTER = [
  "Guilt",
  "Relief",
  "Disappointed",
  "Frustrated",
  "Calmer",
  "Numb",
  "Determined",
  "Ashamed",
] as const;
