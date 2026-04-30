import pako from 'pako';
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

async function downloadTgz(asset: ReleaseAsset): Promise<Uint8Array> {
  const r = await fetch(asset.browser_download_url);
  if (!r.ok) throw new Error(`HTTP ${r.status} downloading ${asset.name}`);
  return new Uint8Array(await r.arrayBuffer());
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
  onProgress?.({ stage: 'downloading-jmdict' });
  const jmdictTgz = await downloadTgz(jmdictAsset);
  onProgress?.({ stage: 'processing-jmdict' });
  const jmdictRaw = JSON.parse(tgzToJsonText(jmdictTgz)) as { words?: unknown[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jmdictBundle = convertJmdict((jmdictRaw.words ?? []) as any[]);
  JMDICT_FILE.write(JSON.stringify(jmdictBundle));

  const jmnedictAsset = findAsset(
    release,
    (n) => n.startsWith('jmnedict-all-') && n.endsWith('.json.tgz'),
  );
  onProgress?.({ stage: 'downloading-jmnedict' });
  const jmnedictTgz = await downloadTgz(jmnedictAsset);
  onProgress?.({ stage: 'processing-jmnedict' });
  const jmnedictRaw = JSON.parse(tgzToJsonText(jmnedictTgz)) as { words?: unknown[] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jmnedictBundle = convertJmnedict((jmnedictRaw.words ?? []) as any[]);
  JMNEDICT_FILE.write(JSON.stringify(jmnedictBundle));

  onProgress?.({ stage: 'done' });
}
