import { useEffect, useState } from 'react';
import { getEntry, readAnalysisData } from '@/storage/entries';
import type { AnalysisData, LibraryEntry } from '@/types';

export interface PlayerData {
  entry: LibraryEntry;
  analysis: AnalysisData;
}

export type LoadResult =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: PlayerData };

export function usePlayerData(entryId: string): LoadResult {
  const [result, setResult] = useState<LoadResult>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entry = await getEntry(entryId);
        if (!entry) {
          if (!cancelled) setResult({ state: 'error', message: 'Entry not found.' });
          return;
        }
        const analysis = await readAnalysisData(entry.analysisDataPath);
        if (!analysis) {
          if (!cancelled) setResult({ state: 'error', message: 'Analysis data missing or corrupt.' });
          return;
        }
        if (!cancelled) setResult({ state: 'ready', data: { entry, analysis } });
      } catch (e) {
        if (!cancelled) setResult({ state: 'error', message: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  return result;
}
