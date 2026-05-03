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

export interface Relapse {
  id: string;
  timestamp: string;
}

export interface QuitProfile {
  quitDate: string;
  bowlsPerDay: number;
  costPerPouch: number;
  bowlsPerPouch: number;
  cravings: Craving[];
  relapses: Relapse[];
}
