import type { Cue, RetimerState } from '@/types';

export function effectiveStartMs(cue: Cue, r: RetimerState): number {
  return cue.startMs * r.scaleFactor + r.offsetMs;
}

export function effectiveEndMs(cue: Cue, r: RetimerState): number {
  return cue.endMs * r.scaleFactor + r.offsetMs;
}

export function findCueAt(cues: Cue[], timeMs: number, r: RetimerState): Cue | null {
  for (const c of cues) {
    if (timeMs >= effectiveStartMs(c, r) && timeMs <= effectiveEndMs(c, r)) return c;
  }
  return null;
}

export function findCueIndexAt(cues: Cue[], timeMs: number, r: RetimerState): number {
  for (let i = 0; i < cues.length; i++) {
    if (timeMs >= effectiveStartMs(cues[i], r) && timeMs <= effectiveEndMs(cues[i], r)) return i;
  }
  return -1;
}

export function formatHMS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = sec.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
