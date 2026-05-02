import { Directory, File, Paths } from 'expo-file-system';
import { extractAudio } from 'audio-extract';
import { extractThumbnail } from '@/utils/thumbnail';
import { uuid } from '@/utils/uuid';
import { getOpenRouterApiKey } from '@/storage/settings';
import { effectiveStartMs, effectiveEndMs } from '@/utils/time';
import type { AnkiSettings, Cue, DictName, LibraryEntry } from '@/types';
import type { DictEntry } from '@/analysis/dict';
import { buildPlainSentenceHtml, buildRubyHtml } from './ruby';
import { buildKanjiListHtml } from './kanjiList';
import { synthesizeJapanese } from './tts';

export interface CardMedia {
  filename: string;
  base64: string;
  /** Empty string for TTS audio that lives only in memory. */
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
 * screenshot at the cue's midpoint and an audio clip with configurable
 * padding around the cue. Cue times come in subtitle clock; the retimer
 * is applied to convert to video-clock times for the native extractors.
 */
export async function buildCardAssets(args: {
  entry: LibraryEntry;
  cue: Cue;
  dict: DictName;
  dictEntry: DictEntry;
  /** Token range of the focus word inside `cue.tokens`, inclusive on both ends. */
  tokenSpan: [number, number];
  videoUri: string;
  settings: AnkiSettings;
}): Promise<CardAssets> {
  const { entry, cue, dictEntry, tokenSpan, videoUri, settings } = args;

  const id = uuid().replace(/-/g, '').slice(0, 12);
  const imageFilename = `pureyaa_${id}.jpg`;
  // Native module replaces this extension to match the actual codec
  // (e.g. .ogg for Opus). We use the returned path to know the real one.
  const audioRequestedFilename = `pureyaa_${id}.m4a`;

  const cacheDir = new Directory(Paths.cache, 'anki');
  if (!cacheDir.exists) cacheDir.create({ intermediates: true });

  const imagePath = new File(cacheDir, imageFilename).uri;
  const audioRequestedPath = new File(cacheDir, audioRequestedFilename).uri;

  // Image at cue midpoint, in video-clock time so it lines up with the
  // frame the user was looking at when the line played.
  const cueStartV = effectiveStartMs(cue, entry.retimerState);
  const cueEndV = effectiveEndMs(cue, entry.retimerState);
  const midMs = Math.max(0, Math.floor((cueStartV + cueEndV) / 2));
  console.log(`[buildCard] image: midMs=${midMs} → ${imagePath}`);
  try {
    await extractThumbnail(videoUri, imagePath, midMs);
    console.log(`[buildCard] image extracted ok`);
  } catch (e) {
    console.error(`[buildCard] image extraction failed: ${(e as Error).message}`);
    throw new Error(`Image extraction failed: ${(e as Error).message}`);
  }

  // Audio: dispatch on audioMode
  let audioPath: string | null = null;
  let audioFilename: string | null = null;
  let audioBase64: string | null = null;

  if (settings.audioMode === 'original') {
    const rawStart = Math.max(0, cueStartV - settings.audioPaddingBeforeMs);
    const rawEnd = cueEndV + settings.audioPaddingAfterMs;
    const cappedEnd = Math.min(rawEnd, rawStart + MAX_AUDIO_DURATION_MS);
    console.log(
      `[buildCard] audio (original): startMs=${rawStart} endMs=${cappedEnd} ` +
        `(cue sub ${cue.startMs}..${cue.endMs}, video ${cueStartV}..${cueEndV}, ` +
        `padding ${settings.audioPaddingBeforeMs}/${settings.audioPaddingAfterMs}) ` +
        `\n  videoUri=${videoUri}\n  outPath=${audioRequestedPath}`,
    );
    try {
      audioPath = await extractAudio(videoUri, {
        startMs: rawStart,
        endMs: cappedEnd,
        outPath: audioRequestedPath,
      });
      console.log(`[buildCard] audio extracted ok → ${audioPath}`);
    } catch (e) {
      const err = e as Error;
      console.error(
        `[buildCard] audio extraction failed: name=${err.name} message=${err.message}`,
      );
      if (err.stack) console.error(err.stack);
      throw new Error(`Audio extraction failed: ${err.message}`);
    }
    audioFilename = audioPath.split('/').pop() ?? audioRequestedFilename;
    audioBase64 = await new File(audioPath).base64();
  } else if (settings.audioMode === 'tts') {
    console.log(`[buildCard] audio (tts): voice=${settings.ttsVoice} text="${cue.text}"`);
    const apiKey = await getOpenRouterApiKey();
    if (!apiKey) {
      throw new Error('OpenRouter API key not set. Add it in Settings.');
    }
    try {
      const tts = await synthesizeJapanese({
        text: cue.text,
        voiceName: settings.ttsVoice,
        apiKey,
        outputId: id,
      });
      audioFilename = tts.filename;
      audioBase64 = tts.base64;
      console.log(`[buildCard] tts ok → ${tts.filename} (${tts.base64.length} base64 chars)`);
    } catch (e) {
      console.error(`[buildCard] tts failed: ${(e as Error).message}`);
      throw new Error(`TTS failed: ${(e as Error).message}`);
    }
  } else {
    console.log('[buildCard] audio: skipped (audioMode is none)');
  }

  const imageBase64 = await new File(imagePath).base64();

  const focusWord = dictEntry.forms[0] ?? dictEntry.readings[0] ?? '';
  const focusReadingRaw = dictEntry.readings[0] ?? '';
  const focusReading = katakanaToHiragana(focusReadingRaw);

  const sentenceFront = buildPlainSentenceHtml(cue.tokens, tokenSpan);
  const sentenceBack = buildRubyHtml(cue.tokens, tokenSpan);
  const kanjiList = await buildKanjiListHtml(cue.text);

  const fields: Record<string, string> = {
    Image: `<img src="${imageFilename}">`,
    Audio: audioFilename ? `[sound:${audioFilename}]` : '',
    SentenceFront: sentenceFront,
    SentenceBack: sentenceBack,
    English: cue.translation || '',
    GrammarNote: cue.grammarNote || '',
    FocusWord: focusWord,
    FocusReading: focusReading,
    FocusGlosses: renderGlosses(dictEntry),
    KanjiList: kanjiList,
    Source: formatSource(entry),
  };

  const media: CardMedia[] = [
    { filename: imageFilename, base64: imageBase64, localPath: imagePath },
  ];
  if (audioFilename && audioBase64) {
    media.push({
      filename: audioFilename,
      base64: audioBase64,
      // TTS audio lives only in memory; localPath stays empty so cleanup
      // is a no-op for it.
      localPath: audioPath ?? '',
    });
  }

  return {
    fields,
    media,
    imageLocalUri: imagePath,
    audioLocalUri: audioPath ?? '',
  };
}

/**
 * Best-effort cleanup of temp media files after a successful send. Failures
 * are swallowed — the cache directory will be cleared by the OS eventually.
 */
export function cleanupCardAssets(assets: CardAssets): void {
  for (const m of assets.media) {
    if (!m.localPath) continue; // TTS audio has no on-disk file
    try {
      const f = new File(m.localPath);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  }
}
