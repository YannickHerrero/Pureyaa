import pako from 'pako';
import { serializeBundle } from '@/analysis/dict';
import { convertJmdict, convertJmnedict } from './convert';
import { extractFirstFile } from './tar';
import { DICT_DIR, JMDICT_FILE, JMNEDICT_FILE } from './state';

export type InstallStage =
  | 'fetching-release'
  | 'downloading-jmdict'
  | 'processing-jmdict'
  | 'downloading-jmnedict'
  | 'processing-jmnedict'
  | 'done';

export interface InstallProgress {
  stage: InstallStage;
  current?: number;
  total?: number;
  unit?: 'bytes' | 'items';
}

const RELEASE_API =
  'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

async function fetchRelease(): Promise<Release> {
  const r = await fetch(RELEASE_API, {
    headers: { accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching latest release`);
  return r.json() as Promise<Release>;
}

function findAsset(release: Release, predicate: (name: string) => boolean): ReleaseAsset {
  const a = release.assets.find((x) => predicate(x.name));
  if (!a) throw new Error(`no matching asset in release ${release.tag_name}`);
  return a;
}

// XHR is used (instead of fetch) because RN's fetch buffers the whole body
// before resolving — there's no way to observe per-chunk progress. XHR's
// `onprogress` event gives us byte counts during download.
function downloadTgzWithProgress(
  asset: ReleaseAsset,
  onProgress: (received: number, total: number) => void,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'arraybuffer';
    xhr.open('GET', asset.browser_download_url);
    xhr.onprogress = (e) => {
      const total = e.lengthComputable ? e.total : asset.size;
      onProgress(e.loaded, total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(new Uint8Array(xhr.response as ArrayBuffer));
      } else {
        reject(new Error(`HTTP ${xhr.status} downloading ${asset.name}`));
      }
    };
    xhr.onerror = () => reject(new Error(`Network error downloading ${asset.name}`));
    xhr.send();
  });
}

function tgzToJsonText(compressed: Uint8Array): string {
  const tar = pako.ungzip(compressed);
  const { data } = extractFirstFile(tar);
  return new TextDecoder().decode(data);
}

export async function installDictionaries(
  onProgress?: (p: InstallProgress) => void,
): Promise<void> {
  if (!DICT_DIR.exists) DICT_DIR.create({ intermediates: true });

  onProgress?.({ stage: 'fetching-release' });
  const release = await fetchRelease();

  const jmdictAsset = findAsset(
    release,
    (n) =>
      n.startsWith('jmdict-eng-') && !n.includes('-common-') && n.endsWith('.json.tgz'),
  );
  const jmdictTgz = await downloadTgzWithProgress(jmdictAsset, (received, total) => {
    onProgress?.({ stage: 'downloading-jmdict', current: received, total, unit: 'bytes' });
  });
  onProgress?.({ stage: 'processing-jmdict' });
  const jmdictRaw = JSON.parse(tgzToJsonText(jmdictTgz)) as { words?: unknown[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jmdictBundle = await convertJmdict((jmdictRaw.words ?? []) as any[], (current, total) => {
    onProgress?.({ stage: 'processing-jmdict', current, total, unit: 'items' });
  });
  JMDICT_FILE.write(JSON.stringify(serializeBundle(jmdictBundle)));

  const jmnedictAsset = findAsset(
    release,
    (n) => n.startsWith('jmnedict-all-') && n.endsWith('.json.tgz'),
  );
  const jmnedictTgz = await downloadTgzWithProgress(jmnedictAsset, (received, total) => {
    onProgress?.({ stage: 'downloading-jmnedict', current: received, total, unit: 'bytes' });
  });
  onProgress?.({ stage: 'processing-jmnedict' });
  const jmnedictRaw = JSON.parse(tgzToJsonText(jmnedictTgz)) as { words?: unknown[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jmnedictBundle = await convertJmnedict((jmnedictRaw.words ?? []) as any[], (current, total) => {
    onProgress?.({ stage: 'processing-jmnedict', current, total, unit: 'items' });
  });
  JMNEDICT_FILE.write(JSON.stringify(serializeBundle(jmnedictBundle)));

  onProgress?.({ stage: 'done' });
}
