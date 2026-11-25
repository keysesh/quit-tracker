import { Milestone } from "./types";

// Recovery milestones after the last use. Kept to claims the cited bodies actually make;
// "smokeOnly" milestones (carbon monoxide, lungs, smoking-disease risk) are hidden for
// vapes and nicotine pouches, where they don't apply.
// Sources: NHS Better Health "Quit smoking: what happens when you quit", CDC "Benefits of
// Quitting", American Cancer Society "Benefits of Quitting Smoking Over Time",
// Benowitz 2009 (nicotine half-life ~2h), Cosgrove et al. 2009 Arch Gen Psychiatry
// (nicotine receptor levels normalize 6–12 weeks after quitting).

export const milestones: Milestone[] = [
  {
    minutes: 20, label: "20 minutes", title: "Heart rate drops",
    description: "Your heart rate and blood pressure start coming down toward normal.",
    category: "cardiovascular", source: "American Cancer Society",
  },
  {
    minutes: 120, label: "2 hours", title: "Nicotine halved",
    description: "Nicotine's half-life is about two hours, so half of it is already gone. The first cravings usually show up around now. They mean withdrawal has started, not that something is wrong.",
    category: "metabolic", source: "Benowitz 2009",
  },
  {
    minutes: 240, label: "4 hours", title: "First withdrawal wave",
    description: "Irritability, restlessness and trouble focusing can start now. Each wave lasts minutes, not hours.",
    category: "neurological", source: "NHS",
  },
  {
    minutes: 480, label: "8 hours", title: "Nicotine down over 90%",
    description: "After four half-lives, more than 90% of the nicotine in your blood is gone.",
    category: "metabolic", source: "Benowitz 2009",
  },
  {
    minutes: 481, label: "8 hours", title: "Oxygen recovering", smokeOnly: true,
    description: "Carbon monoxide in your blood has halved and your oxygen levels are returning to normal.",
    category: "respiratory", source: "NHS",
  },
  {
    minutes: 720, label: "12 hours", title: "Carbon monoxide back to normal", smokeOnly: true,
    description: "The carbon monoxide level in your blood drops to normal, so your blood carries oxygen properly again.",
    category: "respiratory", source: "CDC",
  },
  {
    minutes: 2880, label: "48 hours", title: "Taste and smell sharpening",
    description: "Damaged nerve endings start to regrow, so taste and smell begin to improve. Food may start tasting different.",
    category: "neurological", source: "American Cancer Society",
  },
  {
    minutes: 2881, label: "48 hours", title: "Lungs clearing out", smokeOnly: true,
    description: "Carbon monoxide is gone and your lungs are clearing out mucus and debris. Coughing more is a sign they're cleaning house.",
    category: "respiratory", source: "NHS",
  },
  {
    minutes: 4320, label: "3 days", title: "Nicotine out of your system",
    description: "Nicotine is gone from your body. Withdrawal usually peaks around now and eases from here. You're on the far side of the hardest stretch.",
    category: "neurological", source: "NHS / Smokefree.gov",
  },
  {
    minutes: 4321, label: "3 days", title: "Breathing gets easier", smokeOnly: true,
    description: "Your bronchial tubes relax and energy starts to come back. A deep breath gets easier.",
    category: "respiratory", source: "NHS",
  },
  {
    minutes: 10080, label: "1 week", title: "Cravings start to ease",
    description: "For most people cravings are now less frequent and shorter, and come mostly from cues like coffee, meals or stress.",
    category: "neurological", source: "Smokefree.gov",
  },
  {
    minutes: 20160, label: "2 weeks", title: "Circulation improving",
    description: "Between 2 and 12 weeks, blood flow improves throughout your body. Walking and exercise start to feel easier.",
    category: "cardiovascular", source: "NHS / CDC",
  },
  {
    minutes: 40320, label: "4 weeks", title: "Withdrawal mostly over",
    description: "Most withdrawal symptoms have passed by now. The NHS says people who make it to 28 days are five times more likely to stay quit for good.",
    category: "neurological", source: "NHS",
  },
  {
    minutes: 60480, label: "6 weeks", title: "Brain receptors resetting",
    description: "Over 6 to 12 weeks, the extra nicotine receptors your brain grew drop back toward non-smoker levels. The chemical pull is fading.",
    category: "neurological", source: "Cosgrove et al. 2009",
  },
  {
    minutes: 129600, label: "3 months", title: "Lung function improving", smokeOnly: true,
    description: "Lung function measurably improves. Climbing stairs and exercising get easier.",
    category: "respiratory", source: "CDC",
  },
  {
    minutes: 388800, label: "9 months", title: "Coughing and breathlessness ease", smokeOnly: true,
    description: "Coughing, wheezing and shortness of breath have decreased. The tiny hairs that clean your lungs work properly again, so you get fewer infections.",
    category: "respiratory", source: "American Cancer Society",
  },
  {
    minutes: 525600, label: "1 year", title: "Heart disease risk halved", smokeOnly: true,
    description: "Your risk of coronary heart disease is about half that of someone who still smokes.",
    category: "cardiovascular", source: "American Cancer Society",
  },
  {
    minutes: 2628000, label: "5 years", title: "Several cancer risks halved", smokeOnly: true,
    description: "Your risk of cancers of the mouth, throat, esophagus and bladder is cut in half. Stroke risk can now match a non-smoker's.",
    category: "cancer", source: "American Cancer Society",
  },
  {
    minutes: 5256000, label: "10 years", title: "Lung cancer risk halved", smokeOnly: true,
    description: "Your risk of dying from lung cancer is about half that of a person who still smokes. Kidney and larynx cancer risk drops too.",
    category: "cancer", source: "American Cancer Society",
  },
  {
    minutes: 7884000, label: "15 years", title: "Heart disease risk like a non-smoker's", smokeOnly: true,
    description: "Your risk of coronary heart disease is now close to that of someone who never smoked.",
    category: "cardiovascular", source: "American Cancer Society",
  },
];

const nicotineOnly = milestones.filter(m => !m.smokeOnly);

/** Same array instance every call, so it is safe in React dependency lists. */
export function milestonesFor(smoked: boolean): Milestone[] {
  return smoked ? milestones : nicotineOnly;
}
