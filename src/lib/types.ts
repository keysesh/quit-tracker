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
}

export interface QuitProfile {
  quitDate: string;
  cigarettesPerDay: number;
  costPerPack: number;
  cigarettesPerPack: number;
  cravings: Craving[];
}
