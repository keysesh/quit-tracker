// Calendar reminders as .ics files. A home-screen web app can't schedule its own
// notifications without a push server, so we hand the phone's calendar the alarms:
//   ?kind=milestones&start=<ms since epoch>&smoked=1   upcoming recovery milestones
//   ?kind=checkin&hour=21&minute=0&date=YYYYMMDD                     daily symptom check-in
//   ?kind=headsup&hour=19                               daily heads-up 15 min before a craving hour
// Nothing is stored; the file is built from the query and returned.

import type { NextRequest } from 'next/server';
import { milestonesFor } from '../../../lib/milestones';

const CRLF = '\r\n';

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length === 0 ? 75 : 74)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

function utc(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function floating(ymd: string, hour: number, minute: number) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ymd}T${p(hour)}${p(minute)}00`;
}

function calendar(name: string, events: string[][]) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clear//Quit companion//EN', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`,
    ...events.flat(),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

function event(opts: { uid: string; start: string; durationMin: number; title: string; body: string; url: string; rrule?: string }) {
  return [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${opts.start}`,
    `DURATION:PT${opts.durationMin}M`,
    ...(opts.rrule ? [`RRULE:${opts.rrule}`] : []),
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.body)}`,
    `URL:${opts.url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(opts.title)}`, 'TRIGGER:-PT0M', 'END:VALARM',
    'END:VEVENT',
  ];
}

function ics(body: string, filename: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

const bad = (msg: string) => new Response(msg, { status: 400 });

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const app = request.nextUrl.origin + '/';
  const kind = q.get('kind');

  if (kind === 'milestones') {
    const start = Number(q.get('start'));
    const now = Date.now();
    if (!Number.isFinite(start) || start > now + 366 * 864e5 || start < Date.UTC(1990, 0, 1)) return bad('bad start');
    const smoked = q.get('smoked') !== '0';
    const upcoming = milestonesFor(smoked)
      .map(m => ({ m, at: new Date(start + m.minutes * 60000) }))
      .filter(x => x.at.getTime() > now)
      .slice(0, 12);
    if (upcoming.length === 0) return bad('no upcoming milestones');
    const events = upcoming.map(({ m, at }) => event({
      uid: `clear-ms-${start}-${m.minutes}@clear`,
      start: utc(at),
      durationMin: 15,
      title: `Clear · ${m.title}`,
      body: `${m.label} without nicotine. ${m.description}`,
      url: app,
    }));
    return ics(calendar('Clear milestones', events), 'clear-milestones.ics');
  }

  if (kind === 'checkin' || kind === 'headsup') {
    const hour = Number(q.get('hour'));
    const minute = Number(q.get('minute') ?? 0);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return bad('bad time');
    // Floating local time (no Z / TZID): the phone fires it at this clock time wherever it is.
    let h = hour, mi = minute;
    if (kind === 'headsup') { mi = 45; h = (hour + 23) % 24; }
    // The phone's local date, so the first reminder is today in their time zone.
    const date = q.get('date') ?? '';
    const ymd = /^\d{8}$/.test(date) ? date : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const title = kind === 'checkin' ? 'Clear · How are you feeling?' : 'Clear · Craving hour coming up';
    const body = kind === 'checkin'
      ? 'Take 20 seconds to note any withdrawal symptoms and how today went.'
      : 'Your cravings tend to hit around now. Have a plan ready: water, a walk, gum, or the Ride it out game.';
    const ev = event({
      uid: `clear-${kind}@clear`,
      start: floating(ymd, h, mi),
      durationMin: 10,
      title,
      body,
      url: app,
      rrule: 'FREQ=DAILY',
    });
    return ics(calendar(kind === 'checkin' ? 'Clear check-in' : 'Clear heads-up', [ev]), `clear-${kind}.ics`);
  }

  return bad('unknown kind');
}
