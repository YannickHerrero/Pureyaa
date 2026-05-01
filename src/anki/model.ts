import type { AnkiClient, CreateModelSpec } from './client';

export const PUREYAA_MODEL_NAME = 'Pureyaa Sentence';

export const PUREYAA_FIELDS = [
  'Image',
  'Audio',
  'JapaneseRuby',
  'JapanesePlain',
  'English',
  'GrammarNote',
  'FocusWord',
  'FocusReading',
  'FocusGlosses',
  'Source',
] as const;

export type PureyaaField = (typeof PUREYAA_FIELDS)[number];

const PRODUCTION_FRONT = `
{{Image}}
<div class="jp">{{JapaneseRuby}}</div>
{{Audio}}
`.trim();

const PRODUCTION_BACK = `
{{FrontSide}}
<hr>
<div class="en">{{English}}</div>
{{#GrammarNote}}<div class="grammar">{{GrammarNote}}</div>{{/GrammarNote}}
<div class="focus">
  <span class="word">{{FocusWord}}</span>
  <span class="reading">{{FocusReading}}</span>
  <div class="glosses">{{FocusGlosses}}</div>
</div>
<div class="source">{{Source}}</div>
`.trim();

const CSS = `
.card { font-family: sans-serif; color: #1f2937; background: #fff; padding: 16px; }
.jp { font-size: 28px; line-height: 1.6; text-align: center; }
.en { color: #4b5563; font-size: 16px; margin-top: 12px; text-align: center; }
.grammar { color: #b45309; font-size: 14px; font-style: italic; margin-top: 8px; }
.focus { margin-top: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; }
.focus .word { font-weight: 600; font-size: 20px; }
.focus .reading { color: #6b7280; margin-left: 8px; }
.focus .glosses { margin-top: 6px; }
.source { color: #9ca3af; font-size: 12px; margin-top: 16px; text-align: right; }
img { max-width: 100%; border-radius: 4px; }
`.trim();

export const PUREYAA_MODEL_SPEC: CreateModelSpec = {
  modelName: PUREYAA_MODEL_NAME,
  inOrderFields: [...PUREYAA_FIELDS],
  css: CSS,
  cardTemplates: [
    { Name: 'Production', Front: PRODUCTION_FRONT, Back: PRODUCTION_BACK },
  ],
};

/**
 * Idempotent: if the Pureyaa Sentence model already exists in Anki, this is
 * a no-op. Otherwise creates it with our field schema and one card template.
 */
export async function ensurePureyaaModel(client: AnkiClient): Promise<void> {
  const exists = await client.findModelByName(PUREYAA_MODEL_NAME);
  if (exists) return;
  await client.createModel(PUREYAA_MODEL_SPEC);
}
