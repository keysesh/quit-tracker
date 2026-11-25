'use client';

import type { Craving, Relapse, SymptomLog } from '../lib/types';
import { SYMPTOMS } from '../lib/withdrawal';
import { hourCounts, peakCravingHour, tagCounts, formatHour } from '../lib/patterns';

const DAY = 86400000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function Patterns({ cravings, relapses, symptoms, now }: {
  cravings: Craving[];
  relapses: Relapse[];
  symptoms: SymptomLog[];
  now: Date;
}) {
  const enough = cravings.length >= 3 || relapses.length > 0 || symptoms.length > 0;
  if (!enough) {
    return (
      <div className="bg-surface border border-line rounded-2xl p-5 text-center">
        <p className="text-[13px] text-muted">Log a few cravings or symptoms and your patterns show up here.</p>
        <p className="text-[12px] text-faint mt-1">When they hit, what sets them off, and whether they&apos;re fading.</p>
      </div>
    );
  }

  // When cravings hit (all time)
  const counts = hourCounts(cravings);
  const max = Math.max(1, ...counts);
  const peak = peakCravingHour(cravings);

  // This week vs last week
  const today0 = startOfDay(now).getTime();
  const weekAgo = today0 - 6 * DAY;
  const twoWeeksAgo = weekAgo - 7 * DAY;
  const inRange = (a: number, b: number) => cravings.filter(c => { const t = new Date(c.timestamp).getTime(); return t >= a && t < b; });
  const thisWeek = inRange(weekAgo, now.getTime() + 1);
  const lastWeek = inRange(twoWeeksAgo, weekAgo);
  const avg = (xs: Craving[]) => xs.length ? xs.reduce((s, c) => s + c.intensity, 0) / xs.length : 0;
  const showWeeks = lastWeek.length > 0;

  // Triggers
  const tags = tagCounts(cravings, relapses).slice(0, 5);

  // Symptom check-ins, last 7 days
  const days = Array.from({ length: 7 }, (_, i) => today0 - (6 - i) * DAY);
  const recent = symptoms.filter(s => new Date(s.timestamp).getTime() >= days[0]);
  const symptomIds = [...new Set(recent.map(s => s.symptomId))].slice(0, 6);

  return (
    <div className="bg-surface border border-line rounded-2xl p-5 space-y-5">
      {cravings.length >= 3 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2">When cravings hit</p>
          <div className="flex items-end gap-[3px] h-14" aria-label="Cravings by hour of day">
            {counts.map((n, h) => (
              <div key={h} className="flex-1 rounded-sm"
                style={{
                  height: `${Math.max(4, (n / max) * 100)}%`,
                  background: n === 0 ? 'var(--surface-2)' : h === peak ? 'var(--warn)' : 'color-mix(in srgb, var(--warn) 45%, transparent)',
                }}
                title={`${formatHour(h)}: ${n}`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-faint mt-1 tabular-nums">
            <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
          </div>
          {peak !== null && (
            <p className="text-[13px] text-muted mt-2">
              Most often around <span className="text-warn font-medium">{formatHour(peak)}</span>. Plan something for that hour.
            </p>
          )}
        </div>
      )}

      {showWeeks && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Cravings, last 7 days</p>
            <p className="text-lg font-bold text-ink tabular-nums mt-1">
              {thisWeek.length}
              <span className={`text-[12px] font-medium ml-2 ${thisWeek.length <= lastWeek.length ? 'text-good' : 'text-warn'}`}>
                {thisWeek.length <= lastWeek.length ? '↓' : '↑'} from {lastWeek.length}
              </span>
            </p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Average strength</p>
            <p className="text-lg font-bold text-ink tabular-nums mt-1">
              {avg(thisWeek).toFixed(1)}
              <span className={`text-[12px] font-medium ml-2 ${avg(thisWeek) <= avg(lastWeek) ? 'text-good' : 'text-warn'}`}>
                {avg(thisWeek) <= avg(lastWeek) ? '↓' : '↑'} from {avg(lastWeek).toFixed(1)}
              </span>
            </p>
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2">Your top triggers</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(([t, n]) => (
              <span key={t} className="text-[12px] px-2.5 py-1 rounded-full bg-surface-2 border border-line text-ink">
                {t} <span className="text-faint tabular-nums">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {symptomIds.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2">Symptoms, last 7 days</p>
          <div className="space-y-1.5">
            {symptomIds.map(id => {
              const name = SYMPTOMS.find(s => s.id === id)?.name ?? id;
              return (
                <div key={id} className="flex items-center gap-2">
                  <span className="text-[12px] text-muted w-28 truncate">{name}</span>
                  <div className="flex-1 grid grid-cols-7 gap-1">
                    {days.map(d => {
                      const hits = recent.filter(s => s.symptomId === id && new Date(s.timestamp).getTime() >= d && new Date(s.timestamp).getTime() < d + DAY);
                      const sev = hits.length ? Math.max(...hits.map(h => h.severity)) : 0;
                      return (
                        <div key={d} className="h-4 rounded"
                          title={`${new Date(d).toLocaleDateString('en-US', { weekday: 'short' })}: ${['none', 'mild', 'noticeable', 'rough'][sev]}`}
                          style={{ background: sev === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--warn) ${25 + sev * 25}%, transparent)` }} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <span className="w-28" />
              <div className="flex-1 grid grid-cols-7 gap-1 text-[10px] text-faint text-center">
                {days.map(d => <span key={d}>{new Date(d).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>)}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-faint mt-2">Darker means rougher. Watch them fade week to week.</p>
        </div>
      )}
    </div>
  );
}
