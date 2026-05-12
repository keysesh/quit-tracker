'use client';

import { useState, useEffect, useRef } from 'react';
import { milestones } from '../lib/milestones';
import type { QuitProfile, Craving, Relapse } from '../lib/types';

const STORAGE_KEY = 'quit-tracker-profile';

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
  if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
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
  };
}

function computeProgress(cravings: Craving[], relapses: Relapse[], quitDate: string, now: Date) {
  const quitMs = new Date(quitDate).getTime();
  const nowMs = now.getTime();

  const cravingTimes = cravings.map(c => new Date(c.timestamp).getTime()).sort((a, b) => a - b);
  const lastCravingMs = cravingTimes.length > 0 ? cravingTimes[cravingTimes.length - 1] : null;
  const sinceLastCraving = lastCravingMs ? nowMs - lastCravingMs : nowMs - quitMs;

  let longestGap = sinceLastCraving;
  if (cravingTimes.length > 0) {
    longestGap = Math.max(longestGap, cravingTimes[0] - quitMs);
    for (let i = 1; i < cravingTimes.length; i++) {
      longestGap = Math.max(longestGap, cravingTimes[i] - cravingTimes[i - 1]);
    }
  }

  const totalDays = Math.max(1, Math.ceil((nowMs - quitMs) / 86400000));
  const daysWithCravings = new Set(
    cravings.map(c => {
      const d = new Date(c.timestamp);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  ).size;
  const cleanDays = totalDays - daysWithCravings;

  const sortedRelapses = [...relapses].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const lastRelapseMs = sortedRelapses.length > 0 ? new Date(sortedRelapses[0].timestamp).getTime() : null;
  const daysSinceRelapse = lastRelapseMs
    ? Math.floor((nowMs - lastRelapseMs) / 86400000)
    : Math.floor((nowMs - quitMs) / 86400000);

  return { sinceLastCraving, longestGap, cleanDays, totalDays, daysSinceRelapse, totalRelapses: relapses.length };
}

function getResistMessage(intensity: number): { title: string; sub: string } {
  if (intensity <= 2) return {
    title: "Barely a blip.",
    sub: "Your brain is already rewiring. These mild ones fade first.",
  };
  if (intensity === 3) return {
    title: "You pushed through.",
    sub: "Each craving you beat weakens the next one. This is how recovery works.",
  };
  if (intensity === 4) return {
    title: "That was a tough one.",
    sub: "High-intensity cravings rarely last more than 5 minutes. You outlasted it.",
  };
  return {
    title: "You faced the worst and won.",
    sub: "Level 5 cravings are the peak. They get rarer from here. Remember this moment.",
  };
}

function ProgressRing({ progress, size = 76 }: { progress: number; size?: number }) {
  const r = 31;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(1, Math.max(0, progress)));
  const pct = Math.min(100, Math.round(progress * 100));
  return (
    <svg width={size} height={size} viewBox="0 0 76 76" className="flex-shrink-0">
      <circle cx="38" cy="38" r={r} stroke="rgba(255,255,255,0.04)" strokeWidth="4.5" fill="none" />
      <circle cx="38" cy="38" r={r} stroke="url(#ringGrad)" strokeWidth="4.5" fill="none"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 38 38)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="38" y="38" textAnchor="middle" dominantBaseline="central"
        fill="#2DD4BF" fontSize="13" fontWeight="700"
        style={{ fontFamily: 'var(--font-geist-mono)' }}>{pct}%</text>
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="100%" stopColor="#22D3EE" />
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
            className={`flex gap-3 py-1.5 border-b border-white/[0.03] last:border-0 ${
              isCurrent ? 'bg-teal-400/[0.04] -mx-1 px-1 rounded-lg' : ''
            }`}
          >
            <div className="w-12 flex-shrink-0 pt-0.5">
              <span className={`text-[10px] font-medium tabular-nums ${
                isCurrent ? 'text-teal-400' : isPast ? 'text-white/25' : 'text-white/10'
              }`}>
                {formatHourLabel(h.hour)}
              </span>
            </div>

            <div className={`flex-1 min-h-[20px] ${!hasCravings && !isCurrent ? 'opacity-40' : ''}`}>
              {hasCravings ? (
                <div className="space-y-1">
                  {h.cravings.map(c => (
                    <div key={c.id} className="flex items-center justify-between group">
                      {selectedId === c.id ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => { onDelete?.(c.id); setSelectedId(null); }}
                            className="text-[9px] text-red-400/70 hover:text-red-400 font-medium">delete</button>
                          <button onClick={() => setSelectedId(null)}
                            className="text-[9px] text-white/20 hover:text-white/30">cancel</button>
                        </div>
                      ) : (
                        <>
                          <span className="text-[10px] text-white/30 tabular-nums">
                            {formatCravingTime(c.timestamp)}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(lv => (
                                <div key={lv} className={`w-1.5 h-1.5 rounded-full ${
                                  lv <= c.intensity ? 'bg-amber-400' : 'bg-white/[0.06]'
                                }`} />
                              ))}
                            </div>
                            {onDelete && (
                              <button onClick={() => setSelectedId(c.id)}
                                className="text-white/0 group-hover:text-white/15 transition-colors text-[10px] leading-none ml-1">
                                x
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
                  <div className="h-px flex-1 bg-white/[0.03]" />
                </div>
              )}
            </div>

            {hasCravings && selectedId === null && (
              <div className="w-5 flex-shrink-0 flex items-start justify-end pt-0.5">
                <span className="text-[10px] font-semibold text-amber-400/70 tabular-nums">{h.count}</span>
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
          <span className="text-[10px] text-white/25 tabular-nums w-16 flex-shrink-0 text-right">{d.label}</span>
          {d.count === 0 && !d.isToday ? (
            <div className="flex-1 h-3.5 flex items-center">
              <span className="text-[8px] text-teal-400/30 flex items-center gap-1">
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5.2L4.2 7.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                clean
              </span>
            </div>
          ) : (
            <div className="flex-1 h-3.5 bg-white/[0.02] rounded-full overflow-hidden">
              {d.count > 0 && (
                <div
                  className={`h-full rounded-full transition-all ${
                    d.avgIntensity >= 4 ? 'bg-amber-400/70' : d.avgIntensity >= 2 ? 'bg-amber-400/45' : 'bg-amber-400/25'
                  }`}
                  style={{ width: `${Math.max(8, (d.count / max) * 100)}%` }}
                />
              )}
            </div>
          )}
          <span className={`text-[10px] tabular-nums w-4 text-right ${
            d.count > 0 ? 'text-amber-400/70' : d.count === 0 && !d.isToday ? 'text-teal-400/25' : 'text-white/10'
          }`}>
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

const pad = (n: number) => n.toString().padStart(2, '0');

export default function QuitTracker() {
  const [profile, setProfile] = useState<QuitProfile | null>(null);
  const [now, setNow] = useState(new Date());
  const [loaded, setLoaded] = useState(false);
  const [cravingSheet, setCravingSheet] = useState(false);
  const [settingsSheet, setSettingsSheet] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [intensity, setIntensity] = useState(3);
  const [logged, setLogged] = useState(false);
  const [cravingTab, setCravingTab] = useState<'hourly' | 'daily'>('hourly');
  const [confirmReset, setConfirmReset] = useState(false);
  const [relapsedState, setRelapsedState] = useState(false);

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
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (profile) localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [profile]);

  const completedCount = profile
    ? getMilestoneStatus((now.getTime() - new Date(profile.quitDate).getTime()) / 60000).completed
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
    }
  }, [completedCount, profile]);

  if (!loaded) return (
    <div className="min-h-screen bg-[#07070B] flex flex-col">
      <div className="max-w-md mx-auto w-full flex flex-col min-h-screen">
        <header className="flex items-center px-6 pb-1"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            CLEAR
          </h1>
        </header>
        <main className="flex-1 px-6 pb-28 space-y-6">
          <section className="pt-6 pb-2 text-center">
            <div className="flex items-baseline justify-center gap-1">
              {[3, 2.8, 2.8, 2.8].map((w, i) => (
                <div key={i} className="flex flex-col items-center" style={{ minWidth: `${w}rem` }}>
                  <div className="h-10 w-11 rounded-lg bg-white/[0.04] animate-pulse" />
                  <div className="h-1.5 w-6 rounded bg-white/[0.03] mt-2" />
                </div>
              ))}
            </div>
            <div className="h-2 w-24 rounded bg-white/[0.03] mx-auto mt-5" />
          </section>
          <section>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center gap-4">
                <div className="w-[76px] h-[76px] rounded-full bg-white/[0.04] animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2.5">
                  <div className="h-2 w-20 rounded bg-white/[0.04]" />
                  <div className="h-4 w-36 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-2.5 w-28 rounded bg-white/[0.03]" />
                </div>
              </div>
            </div>
          </section>
          <section className="grid grid-cols-3 gap-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 text-center">
                <div className="h-6 w-12 rounded bg-white/[0.04] mx-auto animate-pulse" />
                <div className="h-1.5 w-16 rounded bg-white/[0.03] mx-auto mt-2" />
              </div>
            ))}
          </section>
          <section>
            <div className="h-2 w-16 rounded bg-white/[0.03] mb-3" />
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="text-center">
                    <div className="h-5 w-10 rounded bg-white/[0.04] mx-auto animate-pulse" />
                    <div className="h-1.5 w-12 rounded bg-white/[0.03] mx-auto mt-2" />
                  </div>
                ))}
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
    });
  };

  const handleQuitNow = () => {
    const d = new Date();
    setFormDate(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  };

  const logCraving = () => {
    if (!profile) return;
    const c: Craving = { id: Date.now().toString(), timestamp: new Date().toISOString(), intensity };
    setProfile({ ...profile, cravings: [...profile.cravings, c] });
    setLogged(true);
    setTimeout(() => { setLogged(false); setCravingSheet(false); setIntensity(3); }, 2400);
  };

  const logRelapse = () => {
    if (!profile) return;
    const r: Relapse = { id: Date.now().toString(), timestamp: new Date().toISOString() };
    setProfile({ ...profile, relapses: [...profile.relapses, r] });
    setRelapsedState(true);
    setTimeout(() => { setRelapsedState(false); setCravingSheet(false); }, 3000);
  };

  const deleteCraving = (id: string) => {
    if (!profile) return;
    setProfile({ ...profile, cravings: profile.cravings.filter(c => c.id !== id) });
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

  // ── ONBOARDING ──────────────────────────────────────────────
  if (!profile) {
    const inputClass = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400/20 transition-all";

    return (
      <div className="min-h-screen bg-[#07070B] flex flex-col items-center justify-center p-6 relative overflow-hidden"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
        <div className="absolute top-1/3 left-1/2 w-[400px] h-[400px] pointer-events-none"
          style={{ background: 'radial-gradient(circle at center, rgba(45,212,191,0.04) 0%, transparent 65%)', animation: 'breathe 6s ease-in-out infinite' }} />

        <div className="text-center mb-10" style={{ animation: 'fadeIn 0.6s ease-out' }}>
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            CLEAR
          </h1>
          <p className="text-white/35 mt-3 text-sm tracking-wide">Quit the tobacco. Keep the ritual.</p>
        </div>

        <div className="w-full max-w-sm bg-white/[0.03] border border-white/[0.06] rounded-3xl p-7 space-y-5"
          style={{ animation: 'fadeIn 0.6s ease-out 0.15s both' }}>

          <div>
            <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">When did you quit?</label>
            <input type="datetime-local" value={formDate} onChange={e => setFormDate(e.target.value)}
              className={inputClass} style={{ colorScheme: 'dark' }} />
            <div className="flex items-center justify-between mt-2">
              <button onClick={handleQuitNow}
                className="text-xs text-teal-400/60 hover:text-teal-400 transition-colors">
                I&apos;m quitting right now
              </button>
              {!formDate && (
                <span className="text-[9px] text-white/15">Defaults to now</span>
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Tobacco bowls per day</label>
            <input type="number" value={formBowls} min={1} max={100}
              onChange={e => setFormBowls(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Cost / pouch</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 text-sm">$</span>
                <input type="number" value={formCost} min={1} step={0.5}
                  onChange={e => setFormCost(Math.max(1, Number(e.target.value) || 1))}
                  className={inputClass + ' pl-8'} />
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Bowls / pouch</label>
              <input type="number" value={formPerPouch} min={1}
                onChange={e => setFormPerPouch(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
            </div>
          </div>

          <button onClick={handleStart}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-400 to-cyan-400 text-[#07070B] font-semibold text-sm
              hover:shadow-lg hover:shadow-teal-400/20 active:scale-[0.98] transition-all mt-1">
            Begin My Journey
          </button>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ───────────────────────────────────────────────
  const elapsed = now.getTime() - new Date(profile.quitDate).getTime();
  const time = formatElapsed(elapsed);
  const elapsedMin = elapsed / 60000;
  const { nextIndex, next: nextMs, progress, completed } = getMilestoneStatus(elapsedMin);

  const elapsedDays = elapsed / 86400000;
  const bowlsAvoided = Math.floor(elapsedDays * profile.bowlsPerDay);
  const saved = (bowlsAvoided / profile.bowlsPerPouch) * profile.costPerPouch;
  const minSaved = bowlsAvoided * 7;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCravings = profile.cravings.filter(c => new Date(c.timestamp) >= todayStart);

  const remaining = nextMs ? nextMs.minutes - elapsedMin : 0;
  const quitTime = new Date(profile.quitDate).getTime();

  const milestonesWithTime = milestones.map((m, i) => ({
    ...m,
    idx: i,
    reachTime: new Date(quitTime + m.minutes * 60000),
  }));

  const nextMsTime = nextMs ? new Date(quitTime + nextMs.minutes * 60000) : null;

  const visibleMilestones = showAll
    ? milestonesWithTime
    : milestonesWithTime.slice(Math.max(0, nextIndex - 3), Math.min(milestonesWithTime.length, nextIndex + 5));

  const totalDays = Math.max(1, Math.ceil(elapsedDays));
  const avgCravingsPerDay = totalDays > 0 ? (profile.cravings.length / totalDays).toFixed(1) : '0';

  const prog = computeProgress(profile.cravings, profile.relapses, profile.quitDate, now);
  const resistMsg = getResistMessage(intensity);

  // Craving sheet context
  const lastCravingText = profile.cravings.length > 0
    ? `Last craving: ${timeAgo(profile.cravings[profile.cravings.length - 1].timestamp)}`
    : 'No cravings logged yet';

  // Settings preview
  const editPreview = editDate ? (() => {
    const ms = Date.now() - new Date(editDate).getTime();
    if (ms < 0) return 'Timer starts when this time arrives';
    const t = formatElapsed(ms);
    return `Timer will show: ${t.days}d ${t.hours}h ${t.minutes}m`;
  })() : null;

  return (
    <div className="min-h-screen bg-[#07070B] flex flex-col relative">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(45,212,191,0.03) 0%, transparent 70%)' }} />

      <div className="max-w-md mx-auto w-full flex flex-col min-h-screen relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 pb-1"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            CLEAR
          </h1>
          <button onClick={openSettings}
            className="p-2 -mr-2 text-white/20 hover:text-white/40 transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
              <circle cx="9" cy="3.5" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="9" cy="14.5" r="1.5" />
            </svg>
          </button>
        </header>

        <main className="flex-1 px-6 pb-28 space-y-6">
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
                  {i > 0 && <span className="text-lg text-white/[0.06] mx-1">:</span>}
                  <div className="flex flex-col items-center" style={{ minWidth: i === 0 ? '3rem' : '2.8rem' }}>
                    <span className="font-mono text-[2.5rem] font-bold tabular-nums tracking-tighter text-white leading-none">
                      {i === 0 ? u.v : pad(u.v)}
                    </span>
                    <span className="text-[8px] uppercase tracking-[0.2em] text-white/20 mt-1.5">{u.l}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-teal-400/40 tracking-[0.25em] uppercase mt-5">tobacco-free</p>
            {prog.totalRelapses > 0 && (
              <p className="text-[9px] text-white/15 mt-1">
                {prog.daysSinceRelapse}d since last slip · {prog.totalRelapses} total
              </p>
            )}
          </section>

          {/* Celebration / Next Milestone */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.1s both' }}>
            {celebratingMs ? (
              <div className="bg-teal-400/[0.06] border border-teal-400/20 rounded-2xl p-5 text-center"
                style={{ animation: 'celebrate 2s ease-in-out infinite' }}>
                <p className="text-[9px] uppercase tracking-[0.2em] text-teal-400 font-medium">Milestone reached</p>
                <p className="text-[17px] font-semibold text-white mt-2">{celebratingMs.title}</p>
                <p className="text-[11px] text-white/30 mt-2 max-w-[280px] mx-auto">{celebratingMs.description}</p>
              </div>
            ) : nextMs ? (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <ProgressRing progress={progress} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-teal-400/60 font-medium">Next milestone</p>
                    <p className="text-[15px] font-semibold text-white mt-1 truncate">{nextMs.title}</p>
                    <p className="text-xs text-white/25 mt-1.5">
                      {formatMilestoneWhen(nextMsTime!)} · {formatDuration(remaining)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center">
                <p className="text-teal-400 font-semibold">Every milestone reached</p>
                <p className="text-xs text-white/25 mt-1">Your body has fully recovered.</p>
              </div>
            )}
          </section>

          {/* Stats */}
          <section className="grid grid-cols-3 gap-2.5" style={{ animation: 'fadeIn 0.5s ease-out 0.2s both' }}>
            {([
              { v: bowlsAvoided.toLocaleString(), l: 'bowls skipped', c: 'text-teal-400' },
              { v: formatMoney(saved), l: 'saved', c: 'text-emerald-400' },
              { v: formatDuration(minSaved), l: 'time back', c: 'text-cyan-400' },
            ] as const).map(s => (
              <div key={s.l} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 text-center">
                <p className={`text-xl font-bold tabular-nums ${s.c}`}>{s.v}</p>
                <p className="text-[8px] uppercase tracking-[0.15em] text-white/20 mt-1.5">{s.l}</p>
              </div>
            ))}
          </section>

          {/* Progress Card (replaces Recent) */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.25s both' }}>
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium mb-3">Progress</h2>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-lg font-bold text-white tabular-nums">{formatGap(prog.sinceLastCraving)}</p>
                  <p className="text-[8px] uppercase tracking-[0.12em] text-white/20 mt-1">since last</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-teal-400 tabular-nums">{formatGap(prog.longestGap)}</p>
                  <p className="text-[8px] uppercase tracking-[0.12em] text-white/20 mt-1">best gap</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-cyan-400 tabular-nums">{prog.cleanDays}<span className="text-white/15 font-normal text-sm">/{prog.totalDays}</span></p>
                  <p className="text-[8px] uppercase tracking-[0.12em] text-white/20 mt-1">clean days</p>
                </div>
              </div>
            </div>
          </section>

          {/* Craving Timeline */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.3s both' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium">Cravings</h2>
              <div className="flex bg-white/[0.03] rounded-lg p-0.5">
                <button
                  onClick={() => setCravingTab('hourly')}
                  className={`px-3 py-1 rounded-md text-[9px] uppercase tracking-[0.15em] transition-all ${
                    cravingTab === 'hourly' ? 'bg-white/[0.06] text-teal-400' : 'text-white/20 hover:text-white/30'
                  }`}
                >Hourly</button>
                <button
                  onClick={() => setCravingTab('daily')}
                  className={`px-3 py-1 rounded-md text-[9px] uppercase tracking-[0.15em] transition-all ${
                    cravingTab === 'daily' ? 'bg-white/[0.06] text-teal-400' : 'text-white/20 hover:text-white/30'
                  }`}
                >Daily</button>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <span className="text-xl font-bold text-amber-400 tabular-nums">{todayCravings.length}</span>
                  <span className="text-[11px] text-white/25 ml-2">today</span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-white/20">{profile.cravings.length} total</span>
                  <span className="text-white/[0.06] mx-1.5">·</span>
                  <span className="text-[11px] text-white/20">{avgCravingsPerDay}/day avg</span>
                </div>
              </div>

              {profile.cravings.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-[11px] text-white/15">No cravings logged yet.</p>
                  <p className="text-[10px] text-white/10 mt-1">Tap + when a craving hits.</p>
                </div>
              ) : cravingTab === 'hourly' ? (
                <HourlyChart cravings={todayCravings} onDelete={deleteCraving} />
              ) : (
                <DailyChart cravings={profile.cravings} quitDate={profile.quitDate} />
              )}
            </div>
          </section>

          {/* Milestone Timeline */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.35s both' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium">
                Milestones · {completed}/{milestones.length}
              </h2>
              <button onClick={() => setShowAll(!showAll)}
                className="text-[10px] text-teal-400/50 hover:text-teal-400 transition-colors">
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
                        <span className="text-[10px] uppercase tracking-[0.2em] text-teal-400/40 font-medium whitespace-nowrap">
                          {getDayLabel(m.reachTime)}
                        </span>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                      </div>
                    )}

                    <div className="flex gap-3.5 relative">
                      {hasNextInDay && (
                        <div className={`absolute left-[7px] top-[20px] w-px h-[calc(100%-8px)] ${
                          done ? 'bg-teal-400/15' : 'bg-white/[0.04]'}`} />
                      )}

                      <div className="flex-shrink-0 mt-[5px] relative">
                        {done ? (
                          <div className="w-[15px] h-[15px] rounded-full bg-teal-400/15 flex items-center justify-center">
                            <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5.2L4.2 7.5L8 3" stroke="#2DD4BF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        ) : current ? (
                          <div className="w-[15px] h-[15px] rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.5)]"
                            style={{ animation: 'shimmer 2s ease-in-out infinite' }} />
                        ) : (
                          <div className="w-[15px] h-[15px] rounded-full border border-white/[0.08]" />
                        )}
                      </div>

                      <div className={`pb-5 flex-1 min-w-0 ${upcoming ? 'opacity-30' : ''}`}>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-[10px] tabular-nums font-medium ${
                            done ? 'text-white/20' : current ? 'text-teal-400/80' : 'text-white/15'
                          }`}>
                            {formatClockTime(m.reachTime)}
                          </span>
                          <span className="text-[8px] text-white/10">{m.label}</span>
                        </div>
                        <p className={`text-sm font-medium mt-0.5 ${current ? 'text-teal-400' : 'text-white/70'}`}>
                          {m.title}
                        </p>
                        <p className="text-[11px] text-white/25 mt-1 leading-relaxed max-w-[280px]">{m.description}</p>
                        <p className="text-[8px] text-white/10 mt-1.5 uppercase tracking-wider">{m.source}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>

        {/* FAB + hint */}
        <div className="fixed z-40" style={{ bottom: 'max(1.75rem, env(safe-area-inset-bottom))', right: '1.5rem' }}>
          {profile.cravings.length === 0 && !cravingSheet && (
            <span className="absolute right-[4.25rem] top-1/2 -translate-y-1/2 text-[10px] text-teal-400/40 whitespace-nowrap"
              style={{ animation: 'fadeIn 1s ease-out 2s both' }}>
              Log a craving
            </span>
          )}
          <button onClick={() => setCravingSheet(true)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-cyan-400
              flex items-center justify-center shadow-lg shadow-teal-400/20
              active:scale-95 transition-transform hover:shadow-teal-400/35">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#07070B" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Craving Bottom Sheet */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        cravingSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60" onClick={() => { setCravingSheet(false); setIntensity(3); setRelapsedState(false); setLogged(false); }} />
        <div className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out ${
          cravingSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="bg-[#101018] border-t border-white/[0.06] rounded-t-3xl p-6"
            style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
            {logged ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-teal-400/10 flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#2DD4BF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-white font-semibold">{resistMsg.title}</p>
                <p className="text-xs text-white/25 mt-2 max-w-[260px] mx-auto leading-relaxed">{resistMsg.sub}</p>
              </div>
            ) : relapsedState ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 4v6h6M23 20v-6h-6" />
                    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                  </svg>
                </div>
                <p className="text-white font-semibold">Progress isn&apos;t a straight line.</p>
                <p className="text-xs text-white/25 mt-2 max-w-[260px] mx-auto leading-relaxed">
                  {bowlsAvoided > 0 ? `${bowlsAvoided} bowls skipped still count. ` : ''}
                  Your body starts healing again immediately. Back on track.
                </p>
              </div>
            ) : (
              <>
                <div className="w-10 h-1 bg-white/[0.08] rounded-full mx-auto mb-5" />

                {/* Context */}
                <div className="text-center mb-5">
                  <p className="text-[11px] text-white/20">
                    {formatDuration(elapsedMin)} tobacco-free · {lastCravingText}
                  </p>
                  {nextMs && nextMsTime && (
                    <p className="text-[10px] text-teal-400/30 mt-1">
                      Next: {nextMs.title} at {formatClockTime(nextMsTime)}
                    </p>
                  )}
                </div>

                <h3 className="text-center text-sm font-medium text-white/50 mb-7">How intense is this craving?</h3>
                <div className="flex justify-center gap-3 mb-2">
                  {[1, 2, 3, 4, 5].map(lv => (
                    <button key={lv} onClick={() => setIntensity(lv)}
                      className={`w-12 h-12 rounded-full border-2 text-sm font-semibold transition-all
                        ${lv <= intensity
                          ? 'bg-amber-400/15 border-amber-400/80 text-amber-400'
                          : 'border-white/[0.08] text-white/15 hover:border-white/20'}`}>
                      {lv}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between px-2 mb-6">
                  <span className="text-[8px] uppercase tracking-[0.2em] text-white/15">mild</span>
                  <span className="text-[8px] uppercase tracking-[0.2em] text-white/15">severe</span>
                </div>
                <button onClick={logCraving}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-400 to-cyan-400 text-[#07070B] font-semibold text-sm
                    active:scale-[0.98] transition-transform">
                  Log Craving
                </button>

                <div className="flex items-center gap-2 mt-4">
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-[9px] text-white/10">or</span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>

                <button onClick={logRelapse}
                  className="w-full py-2.5 mt-3 text-[12px] text-white/20 hover:text-white/30 transition-colors">
                  I slipped
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings Sheet */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        settingsSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60" onClick={() => { setSettingsSheet(false); setConfirmReset(false); }} />
        <div className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out ${
          settingsSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="bg-[#101018] border-t border-white/[0.06] rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
            <div className="w-10 h-1 bg-white/[0.08] rounded-full mx-auto mb-6" />

            <h3 className="text-sm font-medium text-white/50 text-center mb-6">Settings</h3>

            {(() => {
              const inputClass = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400/20 transition-all";

              return (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Quit date</label>
                    <input type="datetime-local" value={editDate} onChange={e => setEditDate(e.target.value)}
                      className={inputClass} style={{ colorScheme: 'dark' }} />
                    {editPreview && (
                      <p className="text-[9px] text-white/15 mt-1.5">{editPreview}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Tobacco bowls per day</label>
                    <input type="number" value={editBowls} min={1} max={100}
                      onChange={e => setEditBowls(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Cost / pouch</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 text-sm">$</span>
                        <input type="number" value={editCost} min={1} step={0.5}
                          onChange={e => setEditCost(Math.max(1, Number(e.target.value) || 1))}
                          className={inputClass + ' pl-8'} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Bowls / pouch</label>
                      <input type="number" value={editPerPouch} min={1}
                        onChange={e => setEditPerPouch(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="space-y-2.5">
              <button onClick={saveSettings}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-400 to-cyan-400 text-[#07070B] font-semibold text-sm
                  hover:shadow-lg hover:shadow-teal-400/20 active:scale-[0.98] transition-all">
                Save Changes
              </button>

              {confirmReset ? (
                <div className="bg-red-500/[0.05] border border-red-500/10 rounded-xl p-4">
                  <p className="text-[11px] text-white/30 text-center mb-3">
                    This will permanently delete all your data including craving history and relapses.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setConfirmReset(false)}
                      className="py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-white/40 text-sm
                        hover:bg-white/[0.05] transition-colors">
                      Never mind
                    </button>
                    <button onClick={reset}
                      className="py-2.5 rounded-lg bg-red-500/15 border border-red-500/20 text-red-400 text-sm font-medium
                        hover:bg-red-500/20 transition-colors">
                      Yes, delete all
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmReset(true)}
                  className="w-full py-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium
                    hover:bg-red-500/15 transition-colors">
                  Start Over
                </button>
              )}

              <button onClick={() => { setSettingsSheet(false); setConfirmReset(false); }}
                className="w-full py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/40 text-sm
                  hover:bg-white/[0.05] transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
