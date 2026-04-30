import type { RetimerState } from '@/types';
import { DEFAULT_RETIMER } from '@/types';

export interface SyncPoint {
  textTimeMs: number;
  audioTimeMs: number;
}

export function computeFromOnePoint(p: SyncPoint): RetimerState {
  return {
    offsetMs: p.audioTimeMs - p.textTimeMs,
    scaleFactor: 1,
    isSynced: true,
  };
}

export function computeFromTwoPoints(p1: SyncPoint, p2: SyncPoint): RetimerState | null {
  const dt = p2.textTimeMs - p1.textTimeMs;
  if (dt <= 0) return null; // point 2 must be meaningfully later
  const scaleFactor = (p2.audioTimeMs - p1.audioTimeMs) / dt;
  const offsetMs = p1.audioTimeMs - p1.textTimeMs * scaleFactor;
  return { offsetMs, scaleFactor, isSynced: true };
}

export function resetRetimer(): RetimerState {
  return { ...DEFAULT_RETIMER };
}
