'use client';

import { useState, useEffect, useRef } from 'react';
import { milestones } from '../lib/milestones';
import {
  TRIGGERS,
  CRAVING_FEELINGS,
  FEELINGS_BEFORE,
  FEELINGS_AFTER,
} from '../lib/types';
import type { QuitProfile, Craving, Relapse, SymptomLog } from '../lib/types';
import { SYMPTOMS, symptomNow, withdrawalPhase, formatHoursShort } from '../lib/withdrawal';
import type { SymptomKind, SymptomStage } from '../lib/withdrawal';

const STORAGE_KEY = 'quit-tracker-profile';
const THEME_KEY = 'clear-theme';

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

function formatMoney(amount: number) {
  return amount < 1000
    ? '$' + amount.toFixed(2)
    : '$' + Math.round(amount).toLocaleString();
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes < 1) return '<1m';
  const mins = Math.round(totalMinutes);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (d < 365) return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
  const y = Math.floor(d / 365);
  const rd = d % 365;
  return rd > 0 ? `${y}y ${rd}d` : `${y}y`;
}

function formatGap(ms: number) {
  return formatDuration(ms / 60000);
}

function timeAgo(timestamp: string) {
  const ms = Date.now() - new Date(timestamp).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getMilestoneStatus(elapsedMin: number) {
  let idx = milestones.length;
  for (let i = 0; i < milestones.length; i++) {
    if (elapsedMin < milestones[i].minutes) { idx = i; break; }
  }
  const next = idx < milestones.length ? milestones[idx] : null;
  const prev = idx > 0 ? milestones[idx - 1] : null;
  const start = prev ? prev.minutes : 0;
  const range = next ? next.minutes - start : 1;
  const progress = next ? Math.min(1, (elapsedMin - start) / range) : 1;
  return { nextIndex: idx, next, progress, completed: idx };
}

function getDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getDayLabel(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === -1) return 'Yesterday';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (Math.abs(diff) > 365) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatClockTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatMilestoneWhen(reachTime: Date) {
  const now = new Date();
  const diffDays = Math.abs(reachTime.getTime() - now.getTime()) / 86400000;
  if (diffDays > 365) return reachTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${getDayLabel(reachTime)} at ${formatClockTime(reachTime)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateProfile(data: any): QuitProfile {
  return {
    quitDate: data.quitDate,
    bowlsPerDay: data.bowlsPerDay ?? data.cigarettesPerDay ?? 10,
    costPerPouch: data.costPerPouch ?? data.costPerPack ?? 12,
    bowlsPerPouch: data.bowlsPerPouch ?? data.cigarettesPerPack ?? 30,
    cravings: data.cravings ?? [],
    relapses: data.relapses ?? [],
    symptoms: data.symptoms ?? [],
  };
}

/** Slip times that fall inside the journey (after the original quit date), oldest first. */
function slipTimes(relapses: Relapse[], quitMs: number) {
  return relapses
    .map(r => new Date(r.timestamp).getTime())
    .filter(t => t >= quitMs)
    .sort((a, b) => a - b);
}

/** The live timer counts from the most recent slip, or from the quit date if there are none. */
function getStreakStart(profile: QuitProfile) {
  const quitMs = new Date(profile.quitDate).getTime();
  const slips = slipTimes(profile.relapses, quitMs);
  return slips.length > 0 ? slips[slips.length - 1] : quitMs;
}

function computeProgress(cravings: Craving[], relapses: Relapse[], quitDate: string, now: Date) {
  const quitMs = new Date(quitDate).getTime();
  const nowMs = now.getTime();
  const slips = slipTimes(relapses, quitMs);
  const streakStart = slips.length > 0 ? slips[slips.length - 1] : quitMs;

  const cravingTimes = cravings.map(c => new Date(c.timestamp).getTime()).sort((a, b) => a - b);
  const lastCravingMs = cravingTimes.length > 0 ? cravingTimes[cravingTimes.length - 1] : null;
  const sinceLastCraving = lastCravingMs ? nowMs - lastCravingMs : nowMs - streakStart;

  // Longest stretch without smoking: the gaps between quit → slip → slip → now.
  const bounds = [quitMs, ...slips, nowMs];
  let bestStreak = 0;
  for (let i = 1; i < bounds.length; i++) bestStreak = Math.max(bestStreak, bounds[i] - bounds[i - 1]);

  // Smoke-free days: days in the journey with no slip logged. (Cravings don't count against you.)
  const totalDays = Math.max(1, Math.ceil((nowMs - quitMs) / 86400000));
  const daysWithSlips = new Set(slips.map(t => getDayKey(new Date(t)))).size;
  const cleanDays = Math.max(0, totalDays - daysWithSlips);

  const bowlsSmoked = relapses
    .filter(r => new Date(r.timestamp).getTime() >= quitMs)
    .reduce((s, r) => s + (r.amount ?? 1), 0);

  return {
    sinceLastCraving, bestStreak, cleanDays, totalDays, streakStart,
    totalRelapses: slips.length, bowlsSmoked,
    isBest: slips.length > 0 && nowMs - streakStart >= bestStreak,
  };
}

function getResistMessage(intensity: number): { title: string; sub: string } {
  if (intensity <= 2) return {
    title: 'Barely a blip.',
    sub: 'Your brain is already rewiring. These mild ones fade first.',
  };
  if (intensity === 3) return {
    title: 'You pushed through.',
    sub: 'Each craving you beat weakens the next one. This is how recovery works.',
  };
  if (intensity === 4) return {
    title: 'That was a tough one.',
    sub: 'High-intensity cravings rarely last more than 5 minutes. You outlasted it.',
  };
  return {
    title: 'You faced the worst and won.',
    sub: 'Level 5 cravings are the peak. They get rarer from here. Remember this moment.',
  };
}

// Most-common item in a list of chip arrays — used for the small "pattern" hints.
function topTag(entries: (string[] | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const arr of entries) {
    for (const t of arr ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return bestN >= 2 ? best : null;
}

function ProgressRing({ progress, size = 76 }: { progress: number; size?: number }) {
  const r = 31;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, progress)));
  const pct = Math.min(100, Math.round(progress * 100));
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" className="flex-shrink-0">
      <circle cx="38" cy="38" r={r} stroke="var(--ring-track)" strokeWidth="4.5" fill="none" />
      <circle cx="38" cy="38" r={r} stroke="url(#ringGrad)" strokeWidth="4.5" fill="none"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 38 38)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="38" y="38" textAnchor="middle" dominantBaseline="central"
        fill="var(--accent)" fontSize="13" fontWeight="700"
        style={{ fontFamily: 'var(--font-geist-mono)' }}>{pct}%</text>
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function formatHourLabel(h: number) {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

function formatCravingTime(timestamp: string) {
  const d = new Date(timestamp);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}

// ── Small reusable chip ────────────────────────────────────────
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-[13px] border transition-colors active:scale-95 ${
        active
          ? 'bg-accent/12 border-accent/50 text-accent font-medium'
          : 'bg-surface-2 border-line text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

// ── Ride It Out: the craving-distraction game ──────────────────
type Target = { id: string; x: number; y: number; born: number; life: number; tone: string };
const TONE_VAR: Record<string, string> = {
  accent: 'var(--accent)',
  warn: 'var(--warn)',
  good: 'var(--good)',
  cyan: 'var(--accent-2)',
};
const TONES = ['accent', 'warn', 'good', 'cyan'];
const RIDE_SECONDS = 120;

// Game 1 — Pop: dots appear and fade; tap them fast (reflex / motor).
function PopBoard({ onScore }: { onScore: () => void }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [bursts, setBursts] = useState<{ id: string; x: number; y: number }[]>([]);
  const [floats, setFloats] = useState<{ id: string; x: number; y: number }[]>([]);

  useEffect(() => {
    let n = 0;
    const spawn = setInterval(() => {
      setTargets(prev => {
        const now = Date.now();
        const alive = prev.filter(t => now - t.born < t.life);
        if (alive.length >= 4) return alive;
        n++;
        return [...alive, {
          id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
          x: 12 + Math.random() * 76,
          y: 16 + Math.random() * 68,
          born: now,
          life: 1700,
          tone: TONES[n % TONES.length],
        }];
      });
    }, 700);
    const cull = setInterval(() => {
      setTargets(prev => { const now = Date.now(); return prev.filter(t => now - t.born < t.life); });
    }, 250);
    return () => { clearInterval(spawn); clearInterval(cull); };
  }, []);

  const pop = (t: Target) => {
    setTargets(prev => prev.filter(x => x.id !== t.id));
    onScore();
    const bid = `${t.id}-b`;
    setBursts(b => [...b, { id: bid, x: t.x, y: t.y }]);
    setFloats(f => [...f, { id: bid, x: t.x, y: t.y }]);
    setTimeout(() => {
      setBursts(b => b.filter(z => z.id !== bid));
      setFloats(f => f.filter(z => z.id !== bid));
    }, 480);
  };

  return (
    <div className="relative h-[300px] rounded-2xl bg-surface-2 border border-line overflow-hidden select-none">
      {targets.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-[12px] text-faint pointer-events-none">
          Tap the dots as they pop up…
        </p>
      )}
      {targets.map(t => (
        <button
          key={t.id}
          onClick={() => pop(t)}
          className="absolute w-12 h-12 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg active:scale-90"
          style={{ left: `${t.x}%`, top: `${t.y}%`, background: TONE_VAR[t.tone], animation: 'targetIn 0.28s ease-out' }}
          aria-label="pop"
        />
      ))}
      {bursts.map(b => (
        <span key={b.id} className="absolute w-12 h-12 rounded-full border-2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${b.x}%`, top: `${b.y}%`, borderColor: 'var(--accent)', animation: 'burst 0.48s ease-out forwards' }} />
      ))}
      {floats.map(f => (
        <span key={f.id} className="absolute text-accent text-sm font-bold pointer-events-none"
          style={{ left: `${f.x}%`, top: `${f.y}%`, animation: 'floatUp 0.48s ease-out forwards' }}>+1</span>
      ))}
    </div>
  );
}

// Game 2 — Bubble wrap: pop a grid of bubbles; each refills after a moment so you
// never run out (tactile / methodical — a different rhythm from the reflex game).
function BubbleBoard({ onScore }: { onScore: () => void }) {
  const COLS = 6;
  const COUNT = 36;
  const [popped, setPopped] = useState<Record<number, boolean>>({});

  const pop = (i: number) => {
    setPopped(prev => {
      if (prev[i]) return prev;
      onScore();
      const refill = 2200 + Math.random() * 1800;
      setTimeout(() => setPopped(p => { const n = { ...p }; delete n[i]; return n; }), refill);
      return { ...prev, [i]: true };
    });
  };

  return (
    <div className="h-[300px] rounded-2xl bg-surface-2 border border-line p-3 select-none flex items-center">
      <div className="grid gap-2.5 w-full" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
        {Array.from({ length: COUNT }).map((_, i) => {
          const isPopped = !!popped[i];
          const tone = TONES[(i + Math.floor(i / COLS)) % TONES.length];
          return (
            <button
              key={i}
              onClick={() => pop(i)}
              aria-label={isPopped ? 'popped' : 'pop bubble'}
              className="aspect-square w-full rounded-full transition-all duration-200 active:scale-90"
              style={isPopped
                ? { background: 'var(--surface)', boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.18)', transform: 'scale(0.82)' }
                : { background: `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.6), ${TONE_VAR[tone]} 62%)`, boxShadow: '0 2px 6px rgba(0,0,0,0.14)' }}
            />
          );
        })}
      </div>
    </div>
  );
}

// Shell — shared countdown + score. Randomly picks a game for novelty; you can shuffle.
function RideItOut({ onComplete, onQuit }: { onComplete: () => void; onQuit: () => void }) {
  const [timeLeft, setTimeLeft] = useState(RIDE_SECONDS);
  const [score, setScore] = useState(0);
  const [game, setGame] = useState<'pop' | 'bubbles'>(() => (Math.random() < 0.5 ? 'pop' : 'bubbles'));
  const doneRef = useRef(false);

  useEffect(() => {
    const tick = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (timeLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete();
    }
  }, [timeLeft, onComplete]);

  const bump = () => setScore(s => s + 1);
  const switchGame = () => setGame(g => (g === 'pop' ? 'bubbles' : 'pop'));

  const mm = Math.floor(timeLeft / 60);
  const ss = (timeLeft % 60).toString().padStart(2, '0');
  const ridePct = (timeLeft / RIDE_SECONDS) * 100;
  const hint = game === 'pop' ? 'Tap the dots as they appear.' : 'Pop every bubble — they fill back up.';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">Riding it out</p>
          <p className="text-[13px] text-muted mt-0.5">{hint}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-ink tabular-nums leading-none">{mm}:{ss}</p>
          <p className="text-[10px] text-faint mt-1">{score} popped</p>
        </div>
      </div>

      {/* time bar */}
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-3">
        <div className="h-full rounded-full bg-accent transition-all duration-1000 ease-linear" style={{ width: `${ridePct}%` }} />
      </div>

      {game === 'pop' ? <PopBoard key="pop" onScore={bump} /> : <BubbleBoard key="bubbles" onScore={bump} />}

      <div className="flex gap-2 mt-4">
        <button onClick={switchGame}
          className="px-4 py-3.5 rounded-xl bg-surface-2 border border-line text-muted text-sm font-medium hover:text-ink transition-colors active:scale-[0.98] flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" /></svg>
          Switch
        </button>
        <button onClick={onQuit}
          className="flex-1 py-3.5 rounded-xl bg-surface-2 border border-line text-ink text-sm font-medium hover:bg-surface transition-colors active:scale-[0.98]">
          I&apos;m good now — I made it
        </button>
      </div>
      <p className="text-[11px] text-faint text-center mt-2.5">
        Either way this counts as a craving you didn&apos;t give in to.
      </p>
    </div>
  );
}

function HourlyChart({ cravings, onDelete }: { cravings: Craving[]; onDelete?: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currentHour = new Date().getHours();

  const hours = Array.from({ length: 24 }, (_, i) => {
    const matched = cravings.filter(c => new Date(c.timestamp).getHours() === i);
    return { hour: i, cravings: matched, count: matched.length };
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const row = el.querySelector('[data-current]');
    if (row) row.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, []);

  return (
    <div ref={scrollRef} className="max-h-[340px] overflow-y-auto -mx-1 px-1 space-y-0">
      {hours.map(h => {
        const isCurrent = h.hour === currentHour;
        const isPast = h.hour < currentHour;
        const hasCravings = h.count > 0;

        return (
          <div
            key={h.hour}
            {...(isCurrent ? { 'data-current': '' } : {})}
            className={`flex gap-3 py-1.5 border-b border-line last:border-0 ${
              isCurrent ? 'bg-accent/5 -mx-1 px-1 rounded-lg' : ''
            }`}
          >
            <div className="w-12 flex-shrink-0 pt-0.5">
              <span className={`text-[11px] font-medium tabular-nums ${
                isCurrent ? 'text-accent' : isPast ? 'text-muted' : 'text-faint'
              }`}>
                {formatHourLabel(h.hour)}
              </span>
            </div>

            <div className={`flex-1 min-h-[20px] ${!hasCravings && !isCurrent ? 'opacity-50' : ''}`}>
              {hasCravings ? (
                <div className="space-y-1">
                  {h.cravings.map(c => (
                    <div key={c.id} className="flex items-center justify-between group">
                      {selectedId === c.id ? (
                        <div className="flex items-center gap-3">
                          <button onClick={() => { onDelete?.(c.id); setSelectedId(null); }}
                            className="text-[11px] text-danger font-medium">Delete</button>
                          <button onClick={() => setSelectedId(null)}
                            className="text-[11px] text-faint hover:text-muted">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span className="text-[11px] text-muted tabular-nums flex items-center gap-1.5">
                            {formatCravingTime(c.timestamp)}
                            {c.distracted && (
                              <span className="text-[9px] text-accent" title="Rode it out">◆</span>
                            )}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(lv => (
                                <div key={lv} className={`w-1.5 h-1.5 rounded-full ${
                                  lv <= c.intensity ? 'bg-warn' : 'bg-surface-2'
                                }`} />
                              ))}
                            </div>
                            {onDelete && (
                              <button onClick={() => setSelectedId(c.id)}
                                className="text-faint/60 hover:text-danger transition-colors text-[14px] leading-none ml-1 px-1" aria-label="Delete craving">
                                ×
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center h-5">
                  <div className="h-px flex-1 bg-line" />
                </div>
              )}
            </div>

            {hasCravings && selectedId === null && (
              <div className="w-5 flex-shrink-0 flex items-start justify-end pt-0.5">
                <span className="text-[11px] font-semibold text-warn tabular-nums">{h.count}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DailyChart({ cravings, quitDate }: { cravings: Craving[]; quitDate: string }) {
  const now = new Date();
  const quit = new Date(quitDate);
  const daysSinceQuit = Math.max(1, Math.ceil((now.getTime() - quit.getTime()) / 86400000));
  const daysToShow = Math.min(daysSinceQuit, 14);

  const days = Array.from({ length: daysToShow }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const matched = cravings.filter(c => {
      const t = new Date(c.timestamp);
      return t >= date && t < nextDay;
    });

    const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });

    return {
      label: dayLabel,
      count: matched.length,
      avgIntensity: matched.length > 0 ? matched.reduce((s, c) => s + c.intensity, 0) / matched.length : 0,
      isToday: i === 0,
    };
  });

  const max = Math.max(...days.map(d => d.count), 1);

  return (
    <div className="space-y-1.5">
      {days.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[11px] text-muted tabular-nums w-16 flex-shrink-0 text-right">{d.label}</span>
          {d.count === 0 && !d.isToday ? (
            <div className="flex-1 h-3.5 flex items-center">
              <span className="text-[10px] text-good flex items-center gap-1">
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5.2L4.2 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                clean
              </span>
            </div>
          ) : (
            <div className="flex-1 h-3.5 bg-surface-2 rounded-full overflow-hidden">
              {d.count > 0 && (
                <div
                  className={`h-full rounded-full transition-all ${
                    d.avgIntensity >= 4 ? 'bg-warn' : d.avgIntensity >= 2 ? 'bg-warn/70' : 'bg-warn/45'
                  }`}
                  style={{ width: `${Math.max(8, (d.count / max) * 100)}%` }}
                />
              )}
            </div>
          )}
          <span className={`text-[11px] tabular-nums w-4 text-right ${
            d.count > 0 ? 'text-warn' : d.count === 0 && !d.isToday ? 'text-good' : 'text-faint'
          }`}>
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Withdrawal guide: what body and mind typically feel at this point ──
const STAGE_LABEL: Record<SymptomStage, string> = {
  later: 'Later',
  starting: 'Building',
  peak: 'Peak now',
  easing: 'Easing',
  passed: 'Usually passed',
};
const STAGE_CLASS: Record<SymptomStage, string> = {
  later: 'text-faint border-line',
  starting: 'text-warn border-warn/40',
  peak: 'text-warn border-warn/60 bg-warn/10',
  easing: 'text-accent border-accent/40',
  passed: 'text-good border-good/40',
};
const SEVERITY = [
  { v: 1, l: 'Mild' },
  { v: 2, l: 'Noticeable' },
  { v: 3, l: 'Rough' },
];

function WithdrawalGuide({ hours, logs, onLog, onDelete }: {
  hours: number;
  logs: SymptomLog[];
  onLog: (symptomId: string, severity: number) => void;
  onDelete: (id: string) => void;
}) {
  const [kind, setKind] = useState<SymptomKind>('mind');
  const [openId, setOpenId] = useState<string | null>(null);
  const [showPassed, setShowPassed] = useState(false);
  const [justLogged, setJustLogged] = useState<string | null>(null);

  const phase = withdrawalPhase(hours);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayLogs = logs.filter(l => new Date(l.timestamp) >= todayStart);

  const rows = SYMPTOMS.filter(s => s.kind === kind).map(s => ({ s, ...symptomNow(s, hours) }));
  const order: Record<SymptomStage, number> = { peak: 0, starting: 1, easing: 2, later: 3, passed: 4 };
  const active = rows.filter(r => r.stage !== 'passed')
    .sort((a, b) => order[a.stage] - order[b.stage] || b.level - a.level || a.s.startH - b.s.startH);
  const passed = rows.filter(r => r.stage === 'passed');
  const visible = showPassed ? [...active, ...passed] : active;

  const log = (symptomId: string, severity: number) => {
    onLog(symptomId, severity);
    setJustLogged(symptomId);
    setTimeout(() => setJustLogged(j => (j === symptomId ? null : j)), 1800);
  };

  return (
    <div className="bg-surface border border-line rounded-2xl p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">{formatHoursShort(hours)} · what to expect</p>
      <p className="font-display text-[15px] font-semibold text-ink mt-1">{phase.title}</p>
      <p className="text-[12px] text-muted mt-1.5 leading-relaxed">{phase.body}</p>

      {todayLogs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-line">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted mb-2">Noted today</p>
          <div className="flex flex-wrap gap-1.5">
            {todayLogs.map(l => {
              const s = SYMPTOMS.find(x => x.id === l.symptomId);
              return (
                <button key={l.id} onClick={() => onDelete(l.id)} title="Tap to remove"
                  className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 border border-line text-muted flex items-center gap-1.5">
                  {s?.name ?? l.symptomId}
                  <span className="text-faint">{SEVERITY.find(v => v.v === l.severity)?.l.toLowerCase()}</span>
                  <span className="text-faint">×</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex bg-surface-2 rounded-lg p-0.5 mt-4 mb-3">
        {(['mind', 'body'] as const).map(k => (
          <button key={k} onClick={() => { setKind(k); setOpenId(null); }}
            className={`flex-1 py-1.5 rounded-md text-[11px] uppercase tracking-[0.12em] transition-all ${
              kind === k ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'
            }`}>{k === 'mind' ? 'Mental' : 'Physical'}</button>
        ))}
      </div>

      <div className="divide-y divide-line">
        {visible.map(({ s, stage, level }) => {
          const open = openId === s.id;
          const count = logs.filter(l => l.symptomId === s.id).length;
          return (
            <div key={s.id} className="py-2.5">
              <button onClick={() => setOpenId(open ? null : s.id)} className="w-full flex items-center gap-3 text-left">
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-medium ${stage === 'passed' || stage === 'later' ? 'text-muted' : 'text-ink'}`}>{s.name}</p>
                  {(stage === 'starting' || stage === 'peak' || stage === 'easing') && (
                    <div className="h-1 rounded-full bg-surface-2 mt-1.5 overflow-hidden max-w-[140px]">
                      <div className="h-full rounded-full bg-warn/70" style={{ width: `${Math.round(level * 100)}%` }} />
                    </div>
                  )}
                  {stage === 'later' && (
                    <p className="text-[10px] text-faint mt-0.5">Can start around {formatHoursShort(s.startH)}</p>
                  )}
                </div>
                {count > 0 && <span className="text-[10px] text-faint tabular-nums">{count}×</span>}
                <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STAGE_CLASS[stage]}`}>
                  {STAGE_LABEL[stage]}
                </span>
              </button>

              {open && (
                <div className="mt-3 space-y-2.5" style={{ animation: 'popIn 0.2s ease-out' }}>
                  <p className="text-[12px] text-muted leading-relaxed">{s.why}</p>
                  <p className="text-[12px] text-ink leading-relaxed"><span className="text-accent font-medium">What helps: </span>{s.helps}</p>
                  <p className="text-[10px] text-faint">
                    Typically starts {formatHoursShort(s.startH)}, worst around {formatHoursShort(s.peakH)}, mostly gone by {formatHoursShort(s.endH)} · {s.source}
                  </p>
                  {justLogged === s.id ? (
                    <p className="text-[12px] text-accent font-medium py-2">Noted. It&apos;s temporary, and it means your body is healing.</p>
                  ) : (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.15em] text-muted mb-1.5">Feeling this now?</p>
                      <div className="grid grid-cols-3 gap-2">
                        {SEVERITY.map(v => (
                          <button key={v.v} onClick={() => log(s.id, v.v)}
                            className="py-2 rounded-lg bg-surface-2 border border-line text-[12px] text-ink active:scale-95 transition-transform">
                            {v.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {passed.length > 0 && (
        <button onClick={() => setShowPassed(p => !p)} className="w-full text-[11px] text-accent mt-2 pt-2">
          {showPassed ? 'Hide' : `Show ${passed.length} that have usually passed by now`}
        </button>
      )}
      <p className="text-[10px] text-faint mt-3 leading-relaxed">
        Typical timings. Everyone is different. Chest pain, trouble breathing, or low mood that feels heavy are reasons to see a doctor.
      </p>
    </div>
  );
}

// ── Recent slips: shows the granular relapse detail back to you ──
function RelapseList({ relapses, onDelete }: { relapses: Relapse[]; onDelete: (id: string) => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const sorted = [...relapses].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);
  return (
    <div className="space-y-2.5">
      {sorted.map(r => {
        const tags = [...(r.triggers ?? []), ...(r.feelingsBefore ?? [])];
        return (
          <div key={r.id} className="bg-surface-2 border border-line rounded-xl p-3.5 group">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-ink">{timeAgo(r.timestamp)}</span>
                {typeof r.amount === 'number' && (
                  <span className="text-[11px] text-muted">· {r.amount} {r.amount === 1 ? 'bowl' : 'bowls'}</span>
                )}
              </div>
              {confirmId === r.id ? (
                <div className="flex items-center gap-3">
                  <button onClick={() => { onDelete(r.id); setConfirmId(null); }} className="text-[11px] text-danger font-medium">Delete</button>
                  <button onClick={() => setConfirmId(null)} className="text-[11px] text-faint">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(r.id)} aria-label="Delete slip"
                  className="text-faint/60 hover:text-danger transition-colors text-[15px] leading-none px-1">×</button>
              )}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-surface text-muted border border-line">{t}</span>
                ))}
              </div>
            )}
            {r.feelingsAfter && r.feelingsAfter.length > 0 && (
              <p className="text-[11px] text-faint mt-2">After: {r.feelingsAfter.join(', ')}</p>
            )}
            {r.note && <p className="text-[12px] text-muted mt-2 leading-relaxed">“{r.note}”</p>}
          </div>
        );
      })}
    </div>
  );
}

const pad = (n: number) => n.toString().padStart(2, '0');

export default function QuitTracker() {
  const [profile, setProfile] = useState<QuitProfile | null>(null);
  const [now, setNow] = useState(new Date());
  const [loaded, setLoaded] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [installHint, setInstallHint] = useState<false | 'ios' | 'other'>(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [flow, setFlow] = useState<'craving' | 'relapse'>('craving');
  const [gameOn, setGameOn] = useState(false);
  const [logged, setLogged] = useState<null | 'craving' | 'relapse'>(null);
  const [wasDistracted, setWasDistracted] = useState(false);

  const [settingsSheet, setSettingsSheet] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [intensity, setIntensity] = useState(3);
  const [cravingTab, setCravingTab] = useState<'hourly' | 'daily'>('hourly');
  const [confirmReset, setConfirmReset] = useState(false);

  // craving detail
  const [showCravingDetail, setShowCravingDetail] = useState(false);
  const [cravingTriggers, setCravingTriggers] = useState<string[]>([]);
  const [cravingFeelings, setCravingFeelings] = useState<string[]>([]);

  // relapse detail
  const [relAmount, setRelAmount] = useState(1);
  const [relTriggers, setRelTriggers] = useState<string[]>([]);
  const [relBefore, setRelBefore] = useState<string[]>([]);
  const [relAfter, setRelAfter] = useState<string[]>([]);
  const [relNote, setRelNote] = useState('');
  const [relWhen, setRelWhen] = useState(''); // '' = just now; else datetime-local value
  const [slipSummary, setSlipSummary] = useState<null | { prevStreakMs: number; bestMs: number; affectsTimer: boolean; hadPrior: boolean }>(null);

  const [formDate, setFormDate] = useState('');
  const [formBowls, setFormBowls] = useState(10);
  const [formCost, setFormCost] = useState(12);
  const [formPerPouch, setFormPerPouch] = useState(30);

  const [editDate, setEditDate] = useState('');
  const [editBowls, setEditBowls] = useState(10);
  const [editCost, setEditCost] = useState(12);
  const [editPerPouch, setEditPerPouch] = useState(30);

  const [celebratingMs, setCelebratingMs] = useState<typeof milestones[0] | null>(null);
  const prevCompletedRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setProfile(migrateProfile(JSON.parse(saved)));
    } catch { /* empty */ }
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    setLoaded(true);

    // PWA: register the offline service worker (skip on localhost to avoid dev caching).
    if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
    }

    // Show an "add to home screen" hint on mobile when not already installed.
    try {
      const nav = navigator as Navigator & { standalone?: boolean };
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
      const dismissed = localStorage.getItem('clear-install-dismissed') === '1';
      if (!standalone && !dismissed) {
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua);
        if (isIOS || /Android/.test(ua)) setInstallHint(isIOS ? 'ios' : 'other');
      }
    } catch { /* empty */ }
  }, []);

  useEffect(() => {
    if (profile) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [profile]);

  const dismissInstall = () => {
    setInstallHint(false);
    try { localStorage.setItem('clear-install-dismissed', '1'); } catch { /* empty */ }
  };

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch { /* empty */ }
      return next;
    });
  };

  const completedCount = profile
    ? getMilestoneStatus((now.getTime() - getStreakStart(profile)) / 60000).completed
    : 0;

  useEffect(() => {
    if (!profile) return;
    if (prevCompletedRef.current === null) {
      prevCompletedRef.current = completedCount;
    } else if (completedCount > prevCompletedRef.current) {
      const justReached = milestones[completedCount - 1];
      setCelebratingMs(justReached);
      const timer = setTimeout(() => setCelebratingMs(null), 5000);
      prevCompletedRef.current = completedCount;
      return () => clearTimeout(timer);
    } else if (completedCount < prevCompletedRef.current) {
      // A slip restarted the timer: re-sync without celebrating.
      prevCompletedRef.current = completedCount;
      setCelebratingMs(null);
    }
  }, [completedCount, profile]);

  const toggle = (list: string[], setter: (v: string[]) => void, val: string) => {
    setter(list.includes(val) ? list.filter(x => x !== val) : [...list, val]);
  };

  if (!loaded) return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <div className="max-w-md mx-auto w-full flex flex-col min-h-screen">
        <header className="flex items-center px-6 pb-1" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
          <h1 className="font-display text-lg font-bold tracking-tight bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            CLEAR
          </h1>
        </header>
        <main className="flex-1 px-6 pb-28 space-y-6">
          <section className="pt-6 pb-2 text-center">
            <div className="flex items-baseline justify-center gap-1">
              {[3, 2.8, 2.8, 2.8].map((w, i) => (
                <div key={i} className="flex flex-col items-center" style={{ minWidth: `${w}rem` }}>
                  <div className="h-10 w-11 rounded-lg bg-surface-2 animate-pulse" />
                  <div className="h-1.5 w-6 rounded bg-surface-2 mt-2" />
                </div>
              ))}
            </div>
          </section>
          <section>
            <div className="bg-surface border border-line rounded-2xl p-5">
              <div className="flex items-center gap-4">
                <div className="w-[76px] h-[76px] rounded-full bg-surface-2 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-2 w-20 rounded bg-surface-2" />
                  <div className="h-4 w-36 rounded bg-surface-2 animate-pulse" />
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );

  const handleStart = () => {
    setProfile({
      quitDate: formDate ? new Date(formDate).toISOString() : new Date().toISOString(),
      bowlsPerDay: formBowls,
      costPerPouch: formCost,
      bowlsPerPouch: formPerPouch,
      cravings: [],
      relapses: [],
      symptoms: [],
    });
  };

  const handleQuitNow = () => {
    const d = new Date();
    setFormDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  };

  const resetSheet = () => {
    setSheetOpen(false);
    setGameOn(false);
    setLogged(null);
    setWasDistracted(false);
    setFlow('craving');
    setIntensity(3);
    setShowCravingDetail(false);
    setCravingTriggers([]);
    setCravingFeelings([]);
    setRelAmount(1);
    setRelTriggers([]);
    setRelBefore([]);
    setRelAfter([]);
    setRelNote('');
    setRelWhen('');
    setSlipSummary(null);
  };

  const logCraving = (distracted: boolean) => {
    if (!profile) return;
    const c: Craving = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      intensity,
      triggers: cravingTriggers.length ? cravingTriggers : undefined,
      feelings: cravingFeelings.length ? cravingFeelings : undefined,
      distracted: distracted || undefined,
    };
    setProfile({ ...profile, cravings: [...profile.cravings, c] });
    setWasDistracted(distracted);
    setGameOn(false);
    setLogged('craving');
    setTimeout(resetSheet, 2800);
  };

  const logRelapse = () => {
    if (!profile) return;
    const nowD = new Date();
    const picked = relWhen ? new Date(relWhen) : nowD;
    const when = isNaN(picked.getTime()) || picked > nowD ? nowD : picked;
    const before = computeProgress(profile.cravings, profile.relapses, profile.quitDate, nowD);
    const prevStart = getStreakStart(profile);
    setSlipSummary({
      prevStreakMs: Math.max(0, when.getTime() - prevStart),
      bestMs: before.bestStreak,
      affectsTimer: when.getTime() >= prevStart,
      hadPrior: before.totalRelapses > 0,
    });
    const r: Relapse = {
      id: Date.now().toString(),
      timestamp: when.toISOString(),
      amount: relAmount,
      triggers: relTriggers.length ? relTriggers : undefined,
      feelingsBefore: relBefore.length ? relBefore : undefined,
      feelingsAfter: relAfter.length ? relAfter : undefined,
      note: relNote.trim() ? relNote.trim() : undefined,
    };
    setProfile({ ...profile, relapses: [...profile.relapses, r] });
    setLogged('relapse');
  };

  const deleteCraving = (id: string) => {
    if (!profile) return;
    setProfile({ ...profile, cravings: profile.cravings.filter(c => c.id !== id) });
  };

  const logSymptom = (symptomId: string, severity: number) => {
    if (!profile) return;
    const l: SymptomLog = { id: `${Date.now()}-${symptomId}`, timestamp: new Date().toISOString(), symptomId, severity };
    setProfile({ ...profile, symptoms: [...profile.symptoms, l] });
  };

  const deleteSymptom = (id: string) => {
    if (!profile) return;
    setProfile({ ...profile, symptoms: profile.symptoms.filter(l => l.id !== id) });
  };

  const undoLastSlip = () => {
    if (!profile || profile.relapses.length === 0) return;
    const last = [...profile.relapses].sort((a, b) => Number(b.id) - Number(a.id))[0];
    setProfile({ ...profile, relapses: profile.relapses.filter(r => r.id !== last.id) });
    resetSheet();
  };

  const deleteRelapse = (id: string) => {
    if (!profile) return;
    setProfile({ ...profile, relapses: profile.relapses.filter(r => r.id !== id) });
  };

  const openSettings = () => {
    if (profile) {
      const d = new Date(profile.quitDate);
      setEditDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      setEditBowls(profile.bowlsPerDay);
      setEditCost(profile.costPerPouch);
      setEditPerPouch(profile.bowlsPerPouch);
    }
    setConfirmReset(false);
    setSettingsSheet(true);
  };

  const saveSettings = () => {
    if (!profile) return;
    setProfile({
      ...profile,
      quitDate: editDate ? new Date(editDate).toISOString() : profile.quitDate,
      bowlsPerDay: editBowls,
      costPerPouch: editCost,
      bowlsPerPouch: editPerPouch,
    });
    setSettingsSheet(false);
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
    setSettingsSheet(false);
    setConfirmReset(false);
    setFormDate(''); setFormBowls(10); setFormCost(12); setFormPerPouch(30);
  };

  const inputClass = 'w-full bg-surface-2 border border-line rounded-xl px-4 py-3 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/30 transition-all placeholder:text-faint';

  // ── ONBOARDING ──────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 relative overflow-hidden"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
        <div className="absolute top-1/3 left-1/2 w-[420px] h-[420px] pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, var(--glow) 0%, transparent 65%)', animation: 'breathe 6s ease-in-out infinite' }} />

        <button onClick={toggleTheme}
          className="absolute top-5 right-5 p-2.5 rounded-full bg-surface border border-line text-muted hover:text-ink transition-colors z-10"
          style={{ top: 'max(1.25rem, env(safe-area-inset-top))' }}
          aria-label="Toggle theme">
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
          )}
        </button>

        <div className="text-center mb-9 relative" style={{ animation: 'fadeIn 0.6s ease-out' }}>
          <h1 className="font-display text-5xl font-bold tracking-tight bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            CLEAR
          </h1>
          <p className="text-muted mt-3 text-sm tracking-wide">Your private companion for staying tobacco-free.</p>
        </div>

        <div className="w-full max-w-sm bg-surface border border-line rounded-3xl p-7 space-y-5 shadow-xl shadow-black/[0.03] relative"
          style={{ animation: 'fadeIn 0.6s ease-out 0.15s both' }}>
          <div>
            <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">When did you quit?</label>
            <input type="datetime-local" value={formDate} onChange={e => setFormDate(e.target.value)} className={inputClass} />
            <div className="flex items-center justify-between mt-2">
              <button onClick={handleQuitNow} className="text-xs text-accent hover:opacity-80 transition-opacity font-medium">
                I&apos;m quitting right now
              </button>
              {!formDate && <span className="text-[10px] text-faint">Defaults to now</span>}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">Tobacco bowls per day</label>
            <input type="number" value={formBowls} min={1} max={100}
              onChange={e => setFormBowls(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">Cost / pouch</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                <input type="number" value={formCost} min={1} step={0.5}
                  onChange={e => setFormCost(Math.max(1, Number(e.target.value) || 1))} className={inputClass + ' pl-8'} />
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">Bowls / pouch</label>
              <input type="number" value={formPerPouch} min={1}
                onChange={e => setFormPerPouch(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
            </div>
          </div>

          <button onClick={handleStart}
            className="btn-primary w-full py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98] transition-all mt-1">
            Begin My Journey
          </button>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ───────────────────────────────────────────────
  const prog = computeProgress(profile.cravings, profile.relapses, profile.quitDate, now);
  const streakStart = prog.streakStart;
  const elapsed = now.getTime() - streakStart;
  const time = formatElapsed(elapsed);
  const elapsedMin = elapsed / 60000;
  const elapsedHours = elapsed / 3600000;
  const { nextIndex, next: nextMs, progress, completed } = getMilestoneStatus(elapsedMin);

  const journeyMs = now.getTime() - new Date(profile.quitDate).getTime();
  const elapsedDays = Math.max(0, journeyMs) / 86400000;
  const bowlsAvoided = Math.max(0, Math.floor(elapsedDays * profile.bowlsPerDay) - prog.bowlsSmoked);
  const saved = (bowlsAvoided / profile.bowlsPerPouch) * profile.costPerPouch;
  const minSaved = bowlsAvoided * 7;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCravings = profile.cravings.filter(c => new Date(c.timestamp) >= todayStart);

  const remaining = nextMs ? nextMs.minutes - elapsedMin : 0;
  const quitTime = streakStart;

  const milestonesWithTime = milestones.map((m, i) => ({ ...m, idx: i, reachTime: new Date(quitTime + m.minutes * 60000) }));
  const nextMsTime = nextMs ? new Date(quitTime + nextMs.minutes * 60000) : null;
  const visibleMilestones = showAll
    ? milestonesWithTime
    : milestonesWithTime.slice(Math.max(0, nextIndex - 3), Math.min(milestonesWithTime.length, nextIndex + 5));

  const totalDays = Math.max(1, Math.ceil(elapsedDays));
  const avgCravingsPerDay = totalDays > 0 ? (profile.cravings.length / totalDays).toFixed(1) : '0';

  const resistMsg = getResistMessage(intensity);

  const lastCravingText = profile.cravings.length > 0
    ? `Last craving: ${timeAgo(profile.cravings[profile.cravings.length - 1].timestamp)}`
    : 'No cravings logged yet';

  const cravingPattern = topTag(profile.cravings.map(c => c.triggers));
  const relapsePattern = topTag(profile.relapses.map(r => r.triggers));

  const editPreview = editDate ? (() => {
    const ms = now.getTime() - new Date(editDate).getTime();
    if (ms < 0) return 'Timer starts when this time arrives';
    const t = formatElapsed(ms);
    const journey = `Journey: ${t.days}d ${t.hours}h ${t.minutes}m`;
    return prog.totalRelapses > 0 ? `${journey}. The timer counts from your last slip.` : `Timer will show: ${t.days}d ${t.hours}h ${t.minutes}m`;
  })() : null;

  return (
    <div className="min-h-screen bg-canvas flex flex-col relative">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[340px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, var(--glow) 0%, transparent 70%)' }} />

      <div className="max-w-md mx-auto w-full flex flex-col min-h-screen relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 pb-1"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
          <h1 className="font-display text-lg font-bold tracking-tight bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            CLEAR
          </h1>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme}
              className="p-2 text-muted hover:text-ink transition-colors" aria-label="Toggle theme">
              {theme === 'dark' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
              )}
            </button>
            <button onClick={openSettings} className="p-2 -mr-2 text-muted hover:text-ink transition-colors" aria-label="Settings">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                <circle cx="9" cy="3.5" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="9" cy="14.5" r="1.5" />
              </svg>
            </button>
          </div>
        </header>

        <main className="flex-1 px-6 pb-32 space-y-6">
          {/* Timer */}
          <section className="pt-6 pb-2 text-center" style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="flex items-baseline justify-center">
              {([
                { v: time.days, l: 'days' },
                { v: time.hours, l: 'hrs' },
                { v: time.minutes, l: 'min' },
                { v: time.seconds, l: 'sec' },
              ] as const).map((u, i) => (
                <div key={u.l} className="flex items-baseline">
                  {i > 0 && <span className="text-lg text-faint mx-1">:</span>}
                  <div className="flex flex-col items-center" style={{ minWidth: i === 0 ? '3rem' : '2.8rem' }}>
                    <span className="font-mono text-[2.5rem] font-bold tabular-nums tracking-tighter text-ink leading-none">
                      {i === 0 ? u.v : pad(u.v)}
                    </span>
                    <span className="text-[8px] uppercase tracking-[0.2em] text-faint mt-1.5">{u.l}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-accent tracking-[0.25em] uppercase mt-5 font-medium">
              {prog.totalRelapses > 0 ? 'tobacco-free since last slip' : 'tobacco-free'}
            </p>
            {prog.totalRelapses > 0 && (
              <p className="text-[11px] text-faint mt-1.5">
                {prog.isBest
                  ? 'Your longest streak yet'
                  : `Best streak ${formatGap(prog.bestStreak)}`}
                {' · '}{prog.totalRelapses} {prog.totalRelapses === 1 ? 'slip' : 'slips'} since {new Date(profile.quitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            )}
          </section>

          {/* Celebration / Next Milestone */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.1s both' }}>
            {celebratingMs ? (
              <div className="bg-accent/8 border border-accent/25 rounded-2xl p-5 text-center"
                style={{ animation: 'celebrate 2s ease-in-out infinite' }}>
                <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">Milestone reached</p>
                <p className="font-display text-[18px] font-semibold text-ink mt-2">{celebratingMs.title}</p>
                <p className="text-[12px] text-muted mt-2 max-w-[280px] mx-auto leading-relaxed">{celebratingMs.description}</p>
              </div>
            ) : nextMs ? (
              <div className="bg-surface border border-line rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <ProgressRing progress={progress} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium">Next milestone</p>
                    <p className="font-display text-[15px] font-semibold text-ink mt-1 truncate">{nextMs.title}</p>
                    <p className="text-xs text-muted mt-1.5">
                      {formatMilestoneWhen(nextMsTime!)} · {formatDuration(remaining)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-surface border border-line rounded-2xl p-6 text-center">
                <p className="text-accent font-semibold">Every milestone reached</p>
                <p className="text-xs text-muted mt-1">Your body has fully recovered.</p>
              </div>
            )}
          </section>

          {/* Stats */}
          <section className="grid grid-cols-3 gap-2.5" style={{ animation: 'fadeIn 0.5s ease-out 0.2s both' }}>
            {([
              { v: bowlsAvoided.toLocaleString(), l: 'bowls skipped', c: 'text-accent' },
              { v: formatMoney(saved), l: 'saved', c: 'text-good' },
              { v: formatDuration(minSaved), l: 'time back', c: 'text-accent-2' },
            ] as const).map(s => (
              <div key={s.l} className="bg-surface border border-line rounded-xl p-3.5 text-center">
                <p className={`text-xl font-bold tabular-nums ${s.c}`}>{s.v}</p>
                <p className="text-[9px] uppercase tracking-[0.12em] text-muted mt-1.5">{s.l}</p>
              </div>
            ))}
          </section>

          {/* Withdrawal: body + mind */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.22s both' }}>
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted font-medium mb-3">How you might feel</h2>
            <WithdrawalGuide hours={elapsedHours} logs={profile.symptoms} onLog={logSymptom} onDelete={deleteSymptom} />
          </section>

          {/* Progress Card */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.25s both' }}>
            <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted font-medium mb-3">Progress</h2>
            <div className="bg-surface border border-line rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-ink tabular-nums">{formatGap(prog.sinceLastCraving)}</p>
                  <p className="text-[9px] uppercase tracking-[0.1em] text-muted mt-1">since craving</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-accent tabular-nums">{formatGap(prog.bestStreak)}</p>
                  <p className="text-[9px] uppercase tracking-[0.1em] text-muted mt-1">best streak</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-accent-2 tabular-nums">{prog.cleanDays}<span className="text-faint font-normal text-sm">/{prog.totalDays}</span></p>
                  <p className="text-[9px] uppercase tracking-[0.1em] text-muted mt-1">smoke-free days</p>
                </div>
              </div>
              {cravingPattern && (
                <p className="text-[11px] text-muted mt-4 pt-4 border-t border-line text-center">
                  Cravings hit most often around <span className="text-accent font-medium">{cravingPattern.toLowerCase()}</span>.
                </p>
              )}
            </div>
          </section>

          {/* Craving Timeline */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.3s both' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted font-medium">Cravings</h2>
              <div className="flex bg-surface-2 rounded-lg p-0.5">
                <button onClick={() => setCravingTab('hourly')}
                  className={`px-3 py-1 rounded-md text-[10px] uppercase tracking-[0.12em] transition-all ${
                    cravingTab === 'hourly' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'
                  }`}>Hourly</button>
                <button onClick={() => setCravingTab('daily')}
                  className={`px-3 py-1 rounded-md text-[10px] uppercase tracking-[0.12em] transition-all ${
                    cravingTab === 'daily' ? 'bg-surface text-accent shadow-sm' : 'text-muted hover:text-ink'
                  }`}>Daily</button>
              </div>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <span className="text-xl font-bold text-warn tabular-nums">{todayCravings.length}</span>
                  <span className="text-[12px] text-muted ml-2">today</span>
                </div>
                <div className="text-right">
                  <span className="text-[12px] text-muted">{profile.cravings.length} total</span>
                  <span className="text-faint mx-1.5">·</span>
                  <span className="text-[12px] text-muted">{avgCravingsPerDay}/day avg</span>
                </div>
              </div>

              {profile.cravings.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-[12px] text-muted">No cravings logged yet.</p>
                  <p className="text-[11px] text-faint mt-1">Tap + when one hits — you can ride it out.</p>
                </div>
              ) : cravingTab === 'hourly' ? (
                <HourlyChart cravings={todayCravings} onDelete={deleteCraving} />
              ) : (
                <DailyChart cravings={profile.cravings} quitDate={profile.quitDate} />
              )}
            </div>
          </section>

          {/* Recent slips (granular relapse detail) */}
          {profile.relapses.length > 0 && (
            <section style={{ animation: 'fadeIn 0.5s ease-out 0.32s both' }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted font-medium">Recent slips</h2>
                {relapsePattern && (
                  <span className="text-[11px] text-muted">most common: <span className="text-warn">{relapsePattern.toLowerCase()}</span></span>
                )}
              </div>
              <RelapseList relapses={profile.relapses} onDelete={deleteRelapse} />
            </section>
          )}

          {/* Milestone Timeline */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.35s both' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted font-medium">
                Milestones · {completed}/{milestones.length}
              </h2>
              <button onClick={() => setShowAll(!showAll)} className="text-[11px] text-accent hover:opacity-80 transition-opacity">
                {showAll ? 'Show less' : 'See all'}
              </button>
            </div>

            <div className="relative">
              {visibleMilestones.map((m, i) => {
                const done = elapsedMin >= m.minutes;
                const current = m.idx === nextIndex;
                const upcoming = !done && !current;

                const prevDay = i > 0 ? getDayKey(visibleMilestones[i - 1].reachTime) : null;
                const thisDay = getDayKey(m.reachTime);
                const showDayHeader = thisDay !== prevDay;
                const hasNextInDay = i < visibleMilestones.length - 1 &&
                  getDayKey(visibleMilestones[i + 1].reachTime) === thisDay;

                return (
                  <div key={m.minutes}>
                    {showDayHeader && (
                      <div className={`flex items-center gap-2.5 mb-3 ${i > 0 ? 'mt-4' : ''}`}>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-accent font-medium whitespace-nowrap">
                          {getDayLabel(m.reachTime)}
                        </span>
                        <div className="flex-1 h-px bg-line" />
                      </div>
                    )}

                    <div className="flex gap-3.5 relative">
                      {hasNextInDay && (
                        <div className={`absolute left-[7px] top-[20px] w-px h-[calc(100%-8px)] ${done ? 'bg-accent/30' : 'bg-line'}`} />
                      )}

                      <div className="flex-shrink-0 mt-[5px] relative">
                        {done ? (
                          <div className="w-[15px] h-[15px] rounded-full bg-accent/20 flex items-center justify-center">
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5.2L4.2 7.5L8 3" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        ) : current ? (
                          <div className="w-[15px] h-[15px] rounded-full bg-accent shadow-[0_0_10px_var(--glow)]"
                            style={{ animation: 'shimmer 2s ease-in-out infinite' }} />
                        ) : (
                          <div className="w-[15px] h-[15px] rounded-full border border-line" />
                        )}
                      </div>

                      <div className={`pb-5 flex-1 min-w-0 ${upcoming ? 'opacity-45' : ''}`}>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-[11px] tabular-nums font-medium ${done ? 'text-muted' : current ? 'text-accent' : 'text-faint'}`}>
                            {formatClockTime(m.reachTime)}
                          </span>
                          <span className="text-[9px] text-faint">{m.label}</span>
                        </div>
                        <p className={`text-sm font-medium mt-0.5 ${current ? 'text-accent' : 'text-ink'}`}>{m.title}</p>
                        <p className="text-[12px] text-muted mt-1 leading-relaxed max-w-[280px]">{m.description}</p>
                        <p className="text-[9px] text-faint mt-1.5 uppercase tracking-wider">{m.source}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {/* Install hint */}
        {installHint && (
          <div className="fixed left-0 right-0 z-30 px-6" style={{ bottom: 'max(1.75rem, env(safe-area-inset-bottom))' }}>
            <div className="max-w-md mx-auto">
              <div className="flex items-start gap-3 bg-surface border border-line rounded-2xl p-3.5 pr-2 shadow-lg shadow-black/10 mr-16">
                <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M8 11l4 4 4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">Add Clear to your home screen</p>
                  <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                    {installHint === 'ios'
                      ? 'Tap Share, then “Add to Home Screen” — opens full-screen and works offline.'
                      : 'Open your browser menu, then “Install app” — opens full-screen and works offline.'}
                  </p>
                </div>
                <button onClick={dismissInstall} className="p-1.5 text-faint hover:text-ink flex-shrink-0" aria-label="Dismiss">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FAB */}
        <div className="fixed z-40" style={{ bottom: 'max(1.75rem, env(safe-area-inset-bottom))', right: '1.5rem' }}>
          {profile.cravings.length === 0 && !sheetOpen && (
            <span className="absolute right-[4.25rem] top-1/2 -translate-y-1/2 text-[11px] text-accent whitespace-nowrap font-medium"
              style={{ animation: 'fadeIn 1s ease-out 2s both' }}>
              Craving? Tap here
            </span>
          )}
          <button onClick={() => setSheetOpen(true)}
            className="btn-primary w-15 h-15 rounded-full flex items-center justify-center shadow-lg shadow-accent/25 active:scale-95 transition-transform"
            style={{ width: '3.5rem', height: '3.5rem' }} aria-label="Log a craving">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </div>

      {/* Log Bottom Sheet */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${sheetOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={resetSheet} />
        <div className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out ${sheetOpen ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="bg-canvas-2 border-t border-line rounded-t-3xl p-6 max-h-[90vh] overflow-y-auto max-w-md mx-auto"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
            <div className="w-10 h-1 bg-line rounded-full mx-auto mb-5" />

            {logged === 'craving' ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-accent/12 flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <p className="font-display text-lg font-semibold text-ink">
                  {wasDistracted ? 'You rode it out.' : resistMsg.title}
                </p>
                <p className="text-[13px] text-muted mt-2 max-w-[280px] mx-auto leading-relaxed">
                  {wasDistracted
                    ? 'The craving passed and you’re still here. That’s exactly how they lose their grip.'
                    : resistMsg.sub}
                </p>
              </div>
            ) : logged === 'relapse' ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" /></svg>
                </div>
                <p className="font-display text-lg font-semibold text-ink">Progress isn&apos;t a straight line.</p>
                {slipSummary && slipSummary.affectsTimer ? (
                  <p className="text-[13px] text-muted mt-2 max-w-[290px] mx-auto leading-relaxed">
                    Your timer starts fresh from this slip. The {formatGap(slipSummary.prevStreakMs)} before it still happened
                    {slipSummary.hadPrior && slipSummary.prevStreakMs >= slipSummary.bestMs ? ', and it was your longest yet' : ''}.
                  </p>
                ) : (
                  <p className="text-[13px] text-muted mt-2 max-w-[290px] mx-auto leading-relaxed">
                    Logged in your history. It was before your current streak, so your timer keeps running.
                  </p>
                )}
                <p className="text-[12px] text-faint mt-2 max-w-[290px] mx-auto leading-relaxed">
                  {bowlsAvoided > 0 ? `${bowlsAvoided.toLocaleString()} bowls skipped overall still count. ` : ''}
                  Withdrawal is shorter after a short slip, and the next few hours matter most.
                </p>
                <div className="flex gap-2 mt-6">
                  <button onClick={undoLastSlip}
                    className="px-4 py-3 rounded-xl bg-surface-2 border border-line text-muted text-sm hover:text-ink transition-colors">
                    Undo
                  </button>
                  <button onClick={resetSheet}
                    className="btn-primary flex-1 py-3 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform">
                    Start again now
                  </button>
                </div>
              </div>
            ) : gameOn ? (
              <RideItOut onComplete={() => logCraving(true)} onQuit={() => logCraving(true)} />
            ) : (
              <>
                {/* Tabs */}
                <div className="flex bg-surface-2 rounded-xl p-1 mb-6">
                  <button onClick={() => setFlow('craving')}
                    className={`flex-1 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                      flow === 'craving' ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                    }`}>Craving</button>
                  <button onClick={() => setFlow('relapse')}
                    className={`flex-1 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                      flow === 'relapse' ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                    }`}>I slipped</button>
                </div>

                {flow === 'craving' ? (
                  <div style={{ animation: 'popIn 0.2s ease-out' }}>
                    <div className="text-center mb-5">
                      <p className="text-[12px] text-muted">{formatDuration(elapsedMin)} tobacco-free · {lastCravingText}</p>
                    </div>

                    <h3 className="text-center text-[15px] font-medium text-ink mb-5">How strong is it?</h3>
                    <div className="flex justify-center gap-3 mb-2">
                      {[1, 2, 3, 4, 5].map(lv => (
                        <button key={lv} onClick={() => setIntensity(lv)}
                          className={`w-13 h-13 rounded-full border-2 text-base font-semibold transition-all active:scale-95 ${
                            lv <= intensity ? 'bg-warn/12 border-warn text-warn' : 'border-line text-faint hover:border-muted'
                          }`}
                          style={{ width: '3.25rem', height: '3.25rem' }}>{lv}</button>
                      ))}
                    </div>
                    <div className="flex justify-between px-2 mb-6">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-faint">mild</span>
                      <span className="text-[10px] uppercase tracking-[0.15em] text-faint">severe</span>
                    </div>

                    {/* optional detail */}
                    <button onClick={() => setShowCravingDetail(s => !s)}
                      className="w-full flex items-center justify-center gap-1.5 text-[12px] text-muted hover:text-ink transition-colors mb-4">
                      {showCravingDetail ? 'Hide detail' : 'Add what set it off'}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${showCravingDetail ? 'rotate-180' : ''}`}>
                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    {showCravingDetail && (
                      <div className="space-y-4 mb-5" style={{ animation: 'popIn 0.2s ease-out' }}>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">Trigger</p>
                          <div className="flex flex-wrap gap-2">
                            {TRIGGERS.map(t => (
                              <Chip key={t} active={cravingTriggers.includes(t)} onClick={() => toggle(cravingTriggers, setCravingTriggers, t)}>{t}</Chip>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">How it feels</p>
                          <div className="flex flex-wrap gap-2">
                            {CRAVING_FEELINGS.map(f => (
                              <Chip key={f} active={cravingFeelings.includes(f)} onClick={() => toggle(cravingFeelings, setCravingFeelings, f)}>{f}</Chip>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <button onClick={() => setGameOn(true)}
                      className="btn-primary w-full py-4 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l14 9-14 9V3z" /></svg>
                      Ride it out
                    </button>
                    <p className="text-[11px] text-faint text-center mt-2">A quick game to outlast the peak — no breathing, promise.</p>

                    <button onClick={() => logCraving(false)}
                      className="w-full py-3 mt-3 rounded-xl bg-surface-2 border border-line text-ink text-sm font-medium hover:bg-surface transition-colors active:scale-[0.98]">
                      Just log it
                    </button>
                  </div>
                ) : (
                  <div style={{ animation: 'popIn 0.2s ease-out' }}>
                    <div className="text-center mb-5">
                      <h3 className="text-[15px] font-medium text-ink">It happened. Let&apos;s capture it.</h3>
                      <p className="text-[12px] text-muted mt-1.5">No judgment — this is data that helps you next time.</p>
                    </div>

                    {/* when */}
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">When?</p>
                    <div className="flex gap-2 mb-2">
                      <Chip active={!relWhen} onClick={() => setRelWhen('')}>Just now</Chip>
                      <Chip active={!!relWhen} onClick={() => {
                        const d = new Date(Date.now() - 60 * 60000);
                        setRelWhen(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                      }}>Earlier</Chip>
                    </div>
                    {relWhen && (
                      <input type="datetime-local" value={relWhen} onChange={e => setRelWhen(e.target.value)}
                        max={new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                        className={inputClass + ' mb-2'} />
                    )}
                    <p className="text-[11px] text-faint mb-5">Your timer restarts from this time. Your history and money saved stay.</p>

                    {/* amount */}
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">How many bowls?</p>
                    <div className="flex items-center justify-center gap-5 mb-5">
                      <button onClick={() => setRelAmount(a => Math.max(1, a - 1))}
                        className="w-11 h-11 rounded-full bg-surface-2 border border-line text-ink text-xl font-medium active:scale-90 transition-transform">−</button>
                      <span className="font-mono text-3xl font-bold text-ink tabular-nums w-12 text-center">{relAmount}</span>
                      <button onClick={() => setRelAmount(a => Math.min(50, a + 1))}
                        className="w-11 h-11 rounded-full bg-surface-2 border border-line text-ink text-xl font-medium active:scale-90 transition-transform">+</button>
                    </div>

                    <div className="space-y-4 mb-5">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">What set it off?</p>
                        <div className="flex flex-wrap gap-2">
                          {TRIGGERS.map(t => (
                            <Chip key={t} active={relTriggers.includes(t)} onClick={() => toggle(relTriggers, setRelTriggers, t)}>{t}</Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">How were you feeling?</p>
                        <div className="flex flex-wrap gap-2">
                          {FEELINGS_BEFORE.map(f => (
                            <Chip key={f} active={relBefore.includes(f)} onClick={() => toggle(relBefore, setRelBefore, f)}>{f}</Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">And now?</p>
                        <div className="flex flex-wrap gap-2">
                          {FEELINGS_AFTER.map(f => (
                            <Chip key={f} active={relAfter.includes(f)} onClick={() => toggle(relAfter, setRelAfter, f)}>{f}</Chip>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted mb-2">Anything else? <span className="normal-case tracking-normal text-faint">(optional)</span></p>
                        <textarea value={relNote} onChange={e => setRelNote(e.target.value)} rows={2}
                          placeholder="What was going on…"
                          className={inputClass + ' resize-none'} />
                      </div>
                    </div>

                    <button onClick={logRelapse}
                      className="btn-primary w-full py-4 rounded-xl font-semibold text-sm active:scale-[0.98] transition-transform">
                      Log it &amp; keep going
                    </button>
                    <p className="text-[11px] text-faint text-center mt-2.5">One slip doesn&apos;t erase what you&apos;ve already done.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings Sheet */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${settingsSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50" onClick={() => { setSettingsSheet(false); setConfirmReset(false); }} />
        <div className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out ${settingsSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="bg-canvas-2 border-t border-line rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto max-w-md mx-auto"
            style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
            <div className="w-10 h-1 bg-line rounded-full mx-auto mb-6" />
            <h3 className="font-display text-base font-semibold text-ink text-center mb-6">Settings</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">Original quit date</label>
                <input type="datetime-local" value={editDate} onChange={e => setEditDate(e.target.value)} className={inputClass} />
                {editPreview && <p className="text-[10px] text-faint mt-1.5">{editPreview}</p>}
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">Tobacco bowls per day</label>
                <input type="number" value={editBowls} min={1} max={100}
                  onChange={e => setEditBowls(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">Cost / pouch</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                    <input type="number" value={editCost} min={1} step={0.5}
                      onChange={e => setEditCost(Math.max(1, Number(e.target.value) || 1))} className={inputClass + ' pl-8'} />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2 block">Bowls / pouch</label>
                  <input type="number" value={editPerPouch} min={1}
                    onChange={e => setEditPerPouch(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button onClick={saveSettings}
                className="btn-primary w-full py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98] transition-all">
                Save Changes
              </button>

              {confirmReset ? (
                <div className="bg-danger/8 border border-danger/20 rounded-xl p-4">
                  <p className="text-[12px] text-muted text-center mb-3">
                    This permanently deletes all your data — craving history, slips, everything.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setConfirmReset(false)}
                      className="py-2.5 rounded-lg bg-surface-2 border border-line text-muted text-sm hover:bg-surface transition-colors">Never mind</button>
                    <button onClick={reset}
                      className="py-2.5 rounded-lg bg-danger/15 border border-danger/25 text-danger text-sm font-medium hover:bg-danger/20 transition-colors">Yes, delete all</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmReset(true)}
                  className="w-full py-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium hover:bg-danger/15 transition-colors">
                  Start Over
                </button>
              )}

              <button onClick={() => { setSettingsSheet(false); setConfirmReset(false); }}
                className="w-full py-3.5 rounded-xl bg-surface-2 border border-line text-muted text-sm hover:bg-surface transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
