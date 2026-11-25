// Nicotine withdrawal: what the body and mind typically go through, keyed to
// hours since the last use. Timings are typical ranges, not promises — people vary.
// Sources: NHS "Withdrawal symptoms when you stop smoking", Smokefree.gov (NCI),
// DSM-5 tobacco-withdrawal criteria, Hughes 2007 (Nicotine Tob Res 9:315).

export type SymptomKind = 'body' | 'mind';

export interface Symptom {
  id: string;
  name: string;
  kind: SymptomKind;
  /** Hours after last use when it typically shows up. */
  startH: number;
  /** Hours when it is typically at its worst. */
  peakH: number;
  /** Hours by which it has usually passed for most people. */
  endH: number;
  /** What it is and why it happens. */
  why: string;
  /** Something practical that helps. */
  helps: string;
  source: string;
}

const D = 24;

export const SYMPTOMS: Symptom[] = [
  // ── Mind ───────────────────────────────────────────────────────
  {
    id: 'cravings', name: 'Cravings', kind: 'mind', startH: 1, peakH: 2.5 * D, endH: 28 * D,
    why: 'Your brain grew extra nicotine receptors and they are asking to be fed. Each one peaks and fades in 3–5 minutes.',
    helps: 'Delay 5 minutes and change what you are doing — the Ride it out game is built for exactly this.',
    source: 'NHS / Smokefree.gov',
  },
  {
    id: 'irritable', name: 'Irritability or anger', kind: 'mind', startH: 4, peakH: 2 * D, endH: 28 * D,
    why: 'Dopamine dips while your brain recalibrates without nicotine, which shortens your fuse.',
    helps: 'Warn the people around you, step away for a few minutes, and cut back on caffeine — it hits harder once you quit.',
    source: 'DSM-5 / NHS',
  },
  {
    id: 'anxious', name: 'Anxiety', kind: 'mind', startH: 4, peakH: 3 * D, endH: 14 * D,
    why: 'Nicotine was relieving its own withdrawal, which felt like calm. That loop is breaking. Most people end up less anxious than when they smoked.',
    helps: 'Slow exhale (longer out than in), a short walk, or naming five things you can see.',
    source: 'Smokefree.gov / Taylor et al. BMJ 2014',
  },
  {
    id: 'restless', name: 'Restlessness', kind: 'mind', startH: 6, peakH: 3 * D, endH: 28 * D,
    why: 'Your hands and routine are missing a ritual they did many times a day.',
    helps: 'Give your hands a job: a fidget toy, gum, a drink with a straw, or a quick round of the game.',
    source: 'DSM-5',
  },
  {
    id: 'foggy', name: 'Trouble concentrating', kind: 'mind', startH: 12, peakH: 3 * D, endH: 14 * D,
    why: 'Nicotine was propping up focus. Your brain is relearning to concentrate without it.',
    helps: 'Short task blocks, a written list, and lighter work for the first few days if you can.',
    source: 'NHS / DSM-5',
  },
  {
    id: 'low', name: 'Low mood', kind: 'mind', startH: 1 * D, peakH: 7 * D, endH: 28 * D,
    why: 'A normal part of the brain readjusting. It usually lifts within a month.',
    helps: 'Daylight, movement and people. If low mood is heavy or lasts past a month, talk to a doctor.',
    source: 'NHS / Hughes 2007',
  },
  {
    id: 'sleep', name: 'Poor sleep or vivid dreams', kind: 'mind', startH: 1 * D, peakH: 3 * D, endH: 14 * D,
    why: 'Your sleep cycles are resetting now that nicotine is not waking you through the night.',
    helps: 'Cut caffeine after noon, keep a fixed bedtime, and get up if you cannot sleep after 20 minutes.',
    source: 'NHS / Smokefree.gov',
  },
  // ── Body ───────────────────────────────────────────────────────
  {
    id: 'headache', name: 'Headaches', kind: 'body', startH: 12, peakH: 2 * D, endH: 10 * D,
    why: 'Blood flow and oxygen levels are changing as your blood vessels relax.',
    helps: 'Water, regular meals, and an ordinary painkiller if you normally take one.',
    source: 'Smokefree.gov',
  },
  {
    id: 'dizzy', name: 'Dizziness', kind: 'body', startH: 12, peakH: 1.5 * D, endH: 4 * D,
    why: 'Your brain is getting more oxygen than it is used to now that carbon monoxide is clearing.',
    helps: 'Stand up slowly and sit down until it passes. It usually lasts only a day or two.',
    source: 'NHS',
  },
  {
    id: 'tired', name: 'Tiredness', kind: 'body', startH: 1 * D, peakH: 3 * D, endH: 21 * D,
    why: 'Nicotine is a stimulant. Without it, your natural energy takes a couple of weeks to come back.',
    helps: 'Short walks and early nights. Energy usually rebounds by week two or three.',
    source: 'Smokefree.gov',
  },
  {
    id: 'hungry', name: 'Hunger', kind: 'body', startH: 1 * D, peakH: 7 * D, endH: 70 * D,
    why: 'Nicotine suppressed appetite and your taste is coming back. This one lasts longest — often around 10 weeks.',
    helps: 'Keep crunchy snacks (fruit, veg, nuts) and water nearby, and eat regular meals so you do not get ravenous.',
    source: 'NHS / Hughes 2007',
  },
  {
    id: 'cough', name: 'Coughing or sore throat', kind: 'body', startH: 2 * D, peakH: 10 * D, endH: 35 * D,
    why: 'The tiny hairs in your airways are waking up and pushing out built-up mucus. A sign of healing.',
    helps: 'Warm drinks, honey, and plenty of water. See a doctor if it lasts beyond a month or you cough blood.',
    source: 'NHS / American Cancer Society',
  },
  {
    id: 'gut', name: 'Constipation or upset stomach', kind: 'body', startH: 2 * D, peakH: 7 * D, endH: 28 * D,
    why: 'Nicotine sped up your gut. It takes a few weeks to find its own rhythm.',
    helps: 'Fibre, water, and moving around. It settles for most people within a month.',
    source: 'NHS',
  },
  {
    id: 'mouth', name: 'Mouth ulcers', kind: 'body', startH: 3 * D, peakH: 14 * D, endH: 30 * D,
    why: 'Common in the first weeks as the lining of your mouth adjusts.',
    helps: 'Salt-water rinses and avoiding very spicy or acidic food. They clear up on their own.',
    source: 'NHS',
  },
];

export type SymptomStage = 'later' | 'starting' | 'peak' | 'easing' | 'passed';

/** Where a symptom typically sits right now, and how strongly (0–1) it tends to be felt. */
export function symptomNow(s: Symptom, hours: number): { stage: SymptomStage; level: number } {
  if (hours < s.startH) return { stage: 'later', level: 0 };
  if (hours >= s.endH) return { stage: 'passed', level: 0 };
  if (hours < s.peakH) {
    const level = 0.3 + 0.7 * ((hours - s.startH) / Math.max(1, s.peakH - s.startH));
    return { stage: level > 0.85 ? 'peak' : 'starting', level };
  }
  const level = 1 - (hours - s.peakH) / Math.max(1, s.endH - s.peakH);
  return { stage: level > 0.85 ? 'peak' : 'easing', level: Math.max(0.08, level) };
}

export interface Phase {
  title: string;
  body: string;
}

/** The overall stage of withdrawal for a given number of hours since last use. */
export function withdrawalPhase(hours: number): Phase {
  if (hours < 24) return {
    title: 'Day one: nicotine is leaving',
    body: 'Cravings, edginess and restlessness start within hours. They come in waves of a few minutes, not all day.',
  };
  if (hours < 72) return {
    title: 'The peak window',
    body: 'Days 1 to 3 are usually the hardest, in both body and mind. It gets easier from here.',
  };
  if (hours < 7 * D) return {
    title: 'Settling down',
    body: 'Physical symptoms are fading. Sleep, mood and focus may still wobble, which is normal this week.',
  };
  if (hours < 28 * D) return {
    title: 'Your brain is rewiring',
    body: 'Most symptoms clear within 2 to 4 weeks. Cravings get shorter and now come mostly from cues like coffee, meals and stress.',
  };
  return {
    title: 'Past withdrawal',
    body: 'Physical withdrawal is over. Remaining cravings are habit cues, so watch for your triggers. Hunger can last a little longer.',
  };
}

export function formatHoursShort(h: number) {
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 14) return `day ${Math.round(d)}`;
  return `week ${Math.round(d / 7)}`;
}
