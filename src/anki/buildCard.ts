import { Directory, File, Paths } from 'expo-file-system';
import { extractAudio } from 'audio-extract';
import { extractThumbnail } from '@/utils/thumbnail';
import { uuid } from '@/utils/uuid';
import type { AnkiSettings, Cue, DictName, LibraryEntry } from '@/types';
import type { DictEntry } from '@/analysis/dict';
import { buildRubyHtml } from './ruby';

export interface CardMedia {
  filename: string;
  base64: string;
  localPath: string;
}

export interface CardAssets {
  fields: Record<string, string>;
  media: CardMedia[];
  imageLocalUri: string;
  audioLocalUri: string;
}

const MAX_AUDIO_DURATION_MS = 30_000;

function katakanaToHiragana(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x30a1 && code <= 0x30f6) {
      out += String.fromCharCode(code - 0x60);
    } else {
      out += s[i];
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderGlosses(entry: DictEntry): string {
  const parts: string[] = [];
  for (const sense of entry.senses) {
    if (sense.glosses.length === 0) continue;
    const pos = sense.pos.length > 0 ? `<i>${escapeHtml(sense.pos.join(', '))}</i> ` : '';
    parts.push(`<li>${pos}${escapeHtml(sense.glosses.join('; '))}</li>`);
  }
  return `<ul>${parts.join('')}</ul>`;
}

function formatSource(entry: LibraryEntry): string {
  const parts: string[] = [];
  if (entry.seriesName) parts.push(entry.seriesName);
  if (entry.episodeNumber != null) parts.push(`E${entry.episodeNumber}`);
  parts.push(entry.title);
  return parts.join(' — ');
}

/**
 * Build a card payload from a cue + a focused dict entry. Extracts a
 * screenshot at the cue's midpoint (pre-retimer times — the video file
 * is the source of truth, not the subtitle clock) and an audio clip with
 * configurable padding around the cue.
 */
export async function buildCardAssets(args: {
  entry: LibraryEntry;
  cue: Cue;
  dict: DictName;
  dictEntry: DictEntry;
  videoUri: string;
  settings: AnkiSettings;
}): Promise<CardAssets> {
  const { entry, cue, dictEntry, videoUri, settings } = args;

  const id = uuid().replace(/-/g, '').slice(0, 12);
  const imageFilename = `pureyaa_${id}.jpg`;
  const audioFilename = `pureyaa_${id}.m4a`;

  const cacheDir = new Directory(Paths.cache, 'anki');
  if (!cacheDir.exists) cacheDir.create({ intermediates: true });

  const imagePath = new File(cacheDir, imageFilename).uri;
  const audioPath = new File(cacheDir, audioFilename).uri;

  // Image at cue midpoint
  const midMs = Math.max(0, Math.floor((cue.startMs + cue.endMs) / 2));
  await extractThumbnail(videoUri, imagePath, midMs);

  // Audio with padding, capped to keep the file sane
  const rawStart = Math.max(0, cue.startMs - settings.audioPaddingBeforeMs);
  const rawEnd = cue.endMs + settings.audioPaddingAfterMs;
  const cappedEnd = Math.min(rawEnd, rawStart + MAX_AUDIO_DURATION_MS);
  await extractAudio(videoUri, { startMs: rawStart, endMs: cappedEnd, outPath: audioPath });

  const imageBase64 = await new File(imagePath).base64();
  const audioBase64 = await new File(audioPath).base64();

  const focusWord = dictEntry.forms[0] ?? dictEntry.readings[0] ?? '';
  const focusReadingRaw = dictEntry.readings[0] ?? '';
  const focusReading = katakanaToHiragana(focusReadingRaw);

  const fields: Record<string, string> = {
    Image: `<img src="${imageFilename}">`,
    Audio: `[sound:${audioFilename}]`,
    JapaneseRuby: buildRubyHtml(cue.tokens),
    JapanesePlain: cue.text,
    English: cue.translation || '',
    GrammarNote: cue.grammarNote || '',
    FocusWord: focusWord,
    FocusReading: focusReading,
    FocusGlosses: renderGlosses(dictEntry),
    Source: formatSource(entry),
  };

  return {
    fields,
    media: [
      { filename: imageFilename, base64: imageBase64, localPath: imagePath },
      { filename: audioFilename, base64: audioBase64, localPath: audioPath },
    ],
    imageLocalUri: imagePath,
    audioLocalUri: audioPath,
  };
}

/**
 * Best-effort cleanup of temp media files after a successful send. Failures
 * are swallowed — the cache directory will be cleared by the OS eventually.
 */
export function cleanupCardAssets(assets: CardAssets): void {
  for (const m of assets.media) {
    try {
      const f = new File(m.localPath);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  }
}
