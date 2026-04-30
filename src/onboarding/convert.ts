import type { DictBundle, DictEntry, DictSense } from '@/analysis/dict';

interface RawGloss {
  text: string;
  lang?: string;
}

interface RawSense {
  partOfSpeech?: string[];
  field?: string[];
  misc?: string[];
  gloss?: RawGloss[];
}

interface RawTranslation {
  type?: string[];
  translation?: RawGloss[];
  lang?: string;
}

interface RawWordCommon {
  text: string;
  common?: boolean;
}

interface RawJmdictWord {
  id: string;
  kanji: RawWordCommon[];
  kana: RawWordCommon[];
  sense: RawSense[];
}

interface RawJmnedictWord {
  id: string;
  kanji: RawWordCommon[];
  kana: RawWordCommon[];
  translation?: RawTranslation[];
}

function pickEnglishGloss(glosses: RawGloss[]): string[] {
  const eng = glosses.filter((g) => g.lang === 'eng' || !g.lang);
  return (eng.length > 0 ? eng : glosses).map((g) => g.text);
}

function pickEnglishTranslation(items: RawGloss[]): string[] {
  const eng = items.filter((t) => t.lang === 'eng' || !t.lang);
  return (eng.length > 0 ? eng : items).map((t) => t.text);
}

function pushIndex(index: Record<string, number[]>, key: string, id: number): void {
  if (!key) return;
  const list = index[key];
  if (list) {
    if (!list.includes(id)) list.push(id);
  } else {
    index[key] = [id];
  }
}

export function convertJmdict(words: RawJmdictWord[]): DictBundle {
  const index: Record<string, number[]> = Object.create(null);
  const entries: Record<string, DictEntry> = Object.create(null);

  for (const w of words) {
    const id = Number(w.id);
    if (!Number.isFinite(id)) continue;

    const forms = w.kanji.map((k) => k.text);
    const readings = w.kana.map((k) => k.text);
    const isCommon = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);

    const senses: DictSense[] = w.sense.map((s) => {
      const out: DictSense = {
        pos: s.partOfSpeech ?? [],
        glosses: pickEnglishGloss(s.gloss ?? []),
      };
      if (s.field && s.field.length > 0) out.fields = s.field;
      if (s.misc && s.misc.length > 0) out.misc = s.misc;
      return out;
    });

    const entry: DictEntry = { id, forms, readings, senses };
    if (isCommon) entry.frequency = 'common';

    entries[id] = entry;
    for (const f of forms) pushIndex(index, f, id);
    for (const r of readings) pushIndex(index, r, id);
  }

  return { index, entries };
}

export function convertJmnedict(words: RawJmnedictWord[]): DictBundle {
  const index: Record<string, number[]> = Object.create(null);
  const entries: Record<string, DictEntry> = Object.create(null);

  for (const w of words) {
    const id = Number(w.id);
    if (!Number.isFinite(id)) continue;

    const forms = w.kanji.map((k) => k.text);
    const readings = w.kana.map((k) => k.text);

    const senses: DictSense[] = [];
    const nameTypes = new Set<string>();
    for (const t of w.translation ?? []) {
      const types = t.type ?? [];
      for (const ty of types) nameTypes.add(ty);
      senses.push({
        pos: types,
        glosses: pickEnglishTranslation(t.translation ?? []),
      });
    }

    const entry: DictEntry = { id, forms, readings, senses };
    if (nameTypes.size > 0) entry.nameType = Array.from(nameTypes);

    entries[id] = entry;
    for (const f of forms) pushIndex(index, f, id);
    for (const r of readings) pushIndex(index, r, id);
  }

  return { index, entries };
}
