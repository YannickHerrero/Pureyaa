#!/usr/bin/env node
// Download JMdict + JMnedict from scriptin/jmdict-simplified releases and
// convert them to the schema expected by src/analysis/dict.ts.
//
// Outputs:
//   assets/dict/jmdict.dict
//   assets/dict/jmnedict.dict
//
// Both are gitignored. The .dict extension is registered as a binary
// asset in metro.config.js so Metro ships them as native resources
// rather than inlining them as JS modules.
//
// Run with: node scripts/download-dicts.mjs
//
// Source: https://github.com/scriptin/jmdict-simplified
// Format docs: https://scriptin.github.io/jmdict-simplified/
// License: EDRDG — see https://www.edrdg.org/edrdg/licence.html

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TMP = join(ROOT, 'tmp', 'dicts');
const OUT = join(ROOT, 'assets', 'dict');

mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const RELEASE_API = 'https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest';

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'user-agent': 'pureyaa-download-dicts', accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${url}`);
  return r.json();
}

async function downloadTo(url, dest) {
  const r = await fetch(url, { headers: { 'user-agent': 'pureyaa-download-dicts' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} downloading ${url}`);
  if (!r.body) throw new Error('empty body');
  await pipeline(r.body, createWriteStream(dest));
}

function extractTgz(tgzPath, destDir) {
  mkdirSync(destDir, { recursive: true });
  execFileSync('tar', ['-xzf', tgzPath, '-C', destDir]);
}

function findJsonInDir(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (files.length !== 1) {
    throw new Error(`expected exactly one .json in ${dir}, got ${files.length}: ${files.join(', ')}`);
  }
  return join(dir, files[0]);
}

function pickEnglishGloss(senseGlosses) {
  const eng = senseGlosses.filter((g) => g.lang === 'eng' || !g.lang);
  return (eng.length > 0 ? eng : senseGlosses).map((g) => g.text);
}

function pickEnglishTranslation(translationItems) {
  const eng = translationItems.filter((t) => t.lang === 'eng' || !t.lang);
  return (eng.length > 0 ? eng : translationItems).map((t) => t.text);
}

function pushIndex(index, key, id) {
  if (!key) return;
  const list = index[key];
  if (list) {
    if (!list.includes(id)) list.push(id);
  } else {
    index[key] = [id];
  }
}

function convertJmdict(words) {
  const index = Object.create(null);
  const entries = Object.create(null);

  for (const w of words) {
    const id = Number(w.id);
    if (!Number.isFinite(id)) continue;

    const forms = w.kanji.map((k) => k.text);
    const readings = w.kana.map((k) => k.text);
    const isCommon =
      w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);

    const senses = w.sense.map((s) => {
      const out = {
        pos: s.partOfSpeech ?? [],
        glosses: pickEnglishGloss(s.gloss ?? []),
      };
      if (s.field && s.field.length > 0) out.fields = s.field;
      if (s.misc && s.misc.length > 0) out.misc = s.misc;
      return out;
    });

    const entry = {
      id,
      forms,
      readings,
      senses,
    };
    if (isCommon) entry.frequency = 'common';

    entries[id] = entry;
    for (const f of forms) pushIndex(index, f, id);
    for (const r of readings) pushIndex(index, r, id);
  }

  return { index, entries };
}

function convertJmnedict(words) {
  const index = Object.create(null);
  const entries = Object.create(null);

  for (const w of words) {
    const id = Number(w.id);
    if (!Number.isFinite(id)) continue;

    const forms = w.kanji.map((k) => k.text);
    const readings = w.kana.map((k) => k.text);

    const senses = [];
    const nameTypes = new Set();
    for (const t of w.translation ?? []) {
      const types = t.type ?? [];
      for (const ty of types) nameTypes.add(ty);
      senses.push({
        pos: types,
        glosses: pickEnglishTranslation(t.translation ?? []),
      });
    }

    const entry = {
      id,
      forms,
      readings,
      senses,
    };
    if (nameTypes.size > 0) entry.nameType = Array.from(nameTypes);

    entries[id] = entry;
    for (const f of forms) pushIndex(index, f, id);
    for (const r of readings) pushIndex(index, r, id);
  }

  return { index, entries };
}

async function processOne({ assetMatch, kind, outFile }) {
  console.log(`\n→ ${kind}`);
  const release = await fetchJson(RELEASE_API);
  const asset = release.assets.find((a) => assetMatch(a.name));
  if (!asset) {
    throw new Error(`no asset matching ${kind} in release ${release.tag_name}`);
  }
  console.log(`  asset: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`);

  const tgzPath = join(TMP, asset.name);
  if (!safeExists(tgzPath) || statSync(tgzPath).size !== asset.size) {
    console.log('  downloading…');
    await downloadTo(asset.browser_download_url, tgzPath);
  } else {
    console.log('  cached');
  }

  const extractDir = join(TMP, kind);
  rmSync(extractDir, { recursive: true, force: true });
  console.log('  extracting…');
  extractTgz(tgzPath, extractDir);

  const jsonPath = findJsonInDir(extractDir);
  console.log('  parsing JSON…');
  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const words = raw.words ?? [];
  console.log(`  ${words.length.toLocaleString()} words`);

  console.log('  converting…');
  const converted = kind === 'jmdict' ? convertJmdict(words) : convertJmnedict(words);

  const outPath = join(OUT, outFile);
  console.log(`  writing ${outFile}…`);
  writeFileSync(outPath, JSON.stringify(converted));
  const sizeMb = statSync(outPath).size / 1024 / 1024;
  console.log(`  done — ${sizeMb.toFixed(1)} MB, ${Object.keys(converted.entries).length.toLocaleString()} entries, ${Object.keys(converted.index).length.toLocaleString()} index keys`);
}

function safeExists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

await processOne({
  assetMatch: (n) => n.startsWith('jmdict-eng-') && !n.includes('-common-') && n.endsWith('.json.tgz'),
  kind: 'jmdict',
  outFile: 'jmdict.dict',
});

await processOne({
  assetMatch: (n) => n.startsWith('jmnedict-all-') && n.endsWith('.json.tgz'),
  kind: 'jmnedict',
  outFile: 'jmnedict.dict',
});

console.log('Output dir:', OUT);
