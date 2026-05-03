'use client';

import { useState, useEffect } from 'react';
import { milestones } from '../lib/milestones';
import type { QuitProfile, Craving } from '../lib/types';

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

  const [formDate, setFormDate] = useState('');
  const [formCigs, setFormCigs] = useState(20);
  const [formCost, setFormCost] = useState(8);
  const [formPack, setFormPack] = useState(20);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setProfile(JSON.parse(saved));
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

  if (!loaded) return <div className="min-h-screen bg-[#07070B]" />;

  const handleStart = () => {
    setProfile({
      quitDate: formDate ? new Date(formDate).toISOString() : new Date().toISOString(),
      cigarettesPerDay: formCigs,
      costPerPack: formCost,
      cigarettesPerPack: formPack,
      cravings: [],
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
    setTimeout(() => { setLogged(false); setCravingSheet(false); setIntensity(3); }, 1200);
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setProfile(null);
    setSettingsSheet(false);
    setFormDate(''); setFormCigs(20); setFormCost(8); setFormPack(20);
  };

  // ── ONBOARDING ──────────────────────────────────────────────
  if (!profile) {
    const inputClass = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400/20 transition-all";

    return (
      <div className="min-h-screen bg-[#07070B] flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-1/3 left-1/2 w-[400px] h-[400px] rounded-full bg-teal-400/[0.03] pointer-events-none"
          style={{ animation: 'breathe 6s ease-in-out infinite' }} />

        <div className="text-center mb-10" style={{ animation: 'fadeIn 0.6s ease-out' }}>
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            CLEAR
          </h1>
          <p className="text-white/35 mt-3 text-sm tracking-wide">Track your journey to breathe free</p>
        </div>

        <div className="w-full max-w-sm bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-3xl p-7 space-y-5"
          style={{ animation: 'fadeIn 0.6s ease-out 0.15s both' }}>

          <div>
            <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">When did you quit?</label>
            <input type="datetime-local" value={formDate} onChange={e => setFormDate(e.target.value)}
              className={inputClass} style={{ colorScheme: 'dark' }} />
            <button onClick={handleQuitNow}
              className="mt-2 text-xs text-teal-400/60 hover:text-teal-400 transition-colors">
              I&apos;m quitting right now
            </button>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Cigarettes per day</label>
            <input type="number" value={formCigs} min={1} max={100}
              onChange={e => setFormCigs(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Cost / pack</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/25 text-sm">$</span>
                <input type="number" value={formCost} min={1} step={0.5}
                  onChange={e => setFormCost(Math.max(1, Number(e.target.value) || 1))}
                  className={inputClass + ' pl-8'} />
              </div>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.15em] text-white/30 mb-2 block">Cigs / pack</label>
              <input type="number" value={formPack} min={1}
                onChange={e => setFormPack(Math.max(1, Number(e.target.value) || 1))} className={inputClass} />
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
  const cigsAvoided = Math.floor(elapsedDays * profile.cigarettesPerDay);
  const saved = (cigsAvoided / profile.cigarettesPerPack) * profile.costPerPack;
  const minSaved = cigsAvoided * 7;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCravings = profile.cravings.filter(c => new Date(c.timestamp) >= todayStart);
  const recent = [...profile.cravings].reverse().slice(0, 5);

  const remaining = nextMs ? nextMs.minutes - elapsedMin : 0;

  const visible = showAll
    ? milestones
    : milestones.slice(Math.max(0, nextIndex - 2), Math.min(milestones.length, nextIndex + 3));
  const vStart = showAll ? 0 : Math.max(0, nextIndex - 2);

  return (
    <div className="min-h-screen bg-[#07070B] flex flex-col relative">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-teal-400/[0.025] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md mx-auto w-full flex flex-col min-h-screen relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between px-6 pt-5 pb-1">
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
            CLEAR
          </h1>
          <button onClick={() => setSettingsSheet(true)}
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
            <p className="text-[10px] text-teal-400/40 tracking-[0.25em] uppercase mt-5">smoke-free</p>
          </section>

          {/* Next Milestone */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.1s both' }}>
            {nextMs ? (
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-center gap-4">
                  <ProgressRing progress={progress} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-teal-400/60 font-medium">Next milestone</p>
                    <p className="text-[15px] font-semibold text-white mt-1 truncate">{nextMs.title}</p>
                    <p className="text-xs text-white/25 mt-1.5">
                      {nextMs.label} · {formatDuration(remaining)} remaining
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 text-center">
                <div className="text-3xl mb-2">&#10024;</div>
                <p className="text-teal-400 font-semibold">Every milestone reached</p>
                <p className="text-xs text-white/25 mt-1">Your body has fully recovered.</p>
              </div>
            )}
          </section>

          {/* Stats */}
          <section className="grid grid-cols-3 gap-2.5" style={{ animation: 'fadeIn 0.5s ease-out 0.2s both' }}>
            {([
              { v: cigsAvoided.toLocaleString(), l: 'not smoked', c: 'text-teal-400' },
              { v: formatMoney(saved), l: 'saved', c: 'text-emerald-400' },
              { v: formatDuration(minSaved), l: 'time back', c: 'text-cyan-400' },
            ] as const).map(s => (
              <div key={s.l} className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-xl p-3.5 text-center">
                <p className={`text-xl font-bold tabular-nums ${s.c}`}>{s.v}</p>
                <p className="text-[8px] uppercase tracking-[0.15em] text-white/20 mt-1.5">{s.l}</p>
              </div>
            ))}
          </section>

          {/* Milestone Timeline */}
          <section style={{ animation: 'fadeIn 0.5s ease-out 0.3s both' }}>
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
              {visible.map((m, i) => {
                const ri = vStart + i;
                const done = elapsedMin >= m.minutes;
                const current = ri === nextIndex;
                const upcoming = !done && !current;

                return (
                  <div key={m.minutes} className="flex gap-3.5 relative">
                    {i < visible.length - 1 && (
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

                    <div className={`pb-5 ${upcoming ? 'opacity-30' : ''}`}>
                      <p className="text-[9px] uppercase tracking-[0.15em] text-white/25">{m.label}</p>
                      <p className={`text-sm font-medium mt-0.5 ${current ? 'text-teal-400' : 'text-white/70'}`}>
                        {m.title}
                      </p>
                      <p className="text-[11px] text-white/25 mt-1 leading-relaxed max-w-[280px]">{m.description}</p>
                      <p className="text-[8px] text-white/10 mt-1.5 uppercase tracking-wider">{m.source}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Cravings Summary */}
          {profile.cravings.length > 0 && (
            <section style={{ animation: 'fadeIn 0.5s ease-out 0.4s both' }}>
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-white/25 font-medium mb-3">Cravings</h2>
              <div className="bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <div>
                    <span className="text-xl font-bold text-amber-400 tabular-nums">{todayCravings.length}</span>
                    <span className="text-[11px] text-white/25 ml-2">today</span>
                  </div>
                  <span className="text-[11px] text-white/20">{profile.cravings.length} total</span>
                </div>
                <div className="space-y-2.5">
                  {recent.map(c => (
                    <div key={c.id} className="flex items-center justify-between">
                      <span className="text-[11px] text-white/25 tabular-nums">{timeAgo(c.timestamp)}</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(lv => (
                          <div key={lv} className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            lv <= c.intensity ? 'bg-amber-400' : 'bg-white/[0.06]'}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>

        {/* FAB */}
        <button onClick={() => setCravingSheet(true)}
          className="fixed bottom-7 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-cyan-400
            flex items-center justify-center shadow-lg shadow-teal-400/20
            active:scale-95 transition-transform z-40 hover:shadow-teal-400/35">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#07070B" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Craving Bottom Sheet */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        cravingSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60" onClick={() => { setCravingSheet(false); setIntensity(3); }} />
        <div className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out ${
          cravingSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="bg-[#101018] border-t border-white/[0.06] rounded-t-3xl p-6 pb-10">
            {logged ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-teal-400/10 flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#2DD4BF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-white font-semibold">Logged</p>
                <p className="text-xs text-white/25 mt-1">You resisted. That&apos;s strength.</p>
              </div>
            ) : (
              <>
                <div className="w-10 h-1 bg-white/[0.08] rounded-full mx-auto mb-7" />
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
                <div className="flex justify-between px-2 mb-8">
                  <span className="text-[8px] uppercase tracking-[0.2em] text-white/15">mild</span>
                  <span className="text-[8px] uppercase tracking-[0.2em] text-white/15">severe</span>
                </div>
                <button onClick={logCraving}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-400 to-cyan-400 text-[#07070B] font-semibold text-sm
                    active:scale-[0.98] transition-transform">
                  Log Craving
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings Sheet */}
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        settingsSheet ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/60" onClick={() => setSettingsSheet(false)} />
        <div className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out ${
          settingsSheet ? 'translate-y-0' : 'translate-y-full'}`}>
          <div className="bg-[#101018] border-t border-white/[0.06] rounded-t-3xl p-6 pb-10">
            <div className="w-10 h-1 bg-white/[0.08] rounded-full mx-auto mb-6" />
            <div className="space-y-2.5">
              <button onClick={reset}
                className="w-full py-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium
                  hover:bg-red-500/15 transition-colors">
                Start Over
              </button>
              <button onClick={() => setSettingsSheet(false)}
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
