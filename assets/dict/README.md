# Dictionary data

This directory holds the bundled JMdict + JMnedict data the app reads at runtime. The repo ships **tiny placeholders** (`{"index":{},"entries":{}}`) so the project builds without doing anything; populate them with real data via:

```bash
npm run download-dicts
```

That script:

1. Downloads the latest `jmdict-eng-*.json.tgz` and `jmnedict-all-*.json.tgz` releases from [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) (EDRDG license).
2. Extracts and converts each to the schema below.
3. Overwrites `jmdict.json` + `jmnedict.json` here.
4. Marks both files with `git update-index --skip-worktree` so the ~100 MB diffs don't show in `git status`.

If you ever want to update the placeholders (e.g. on a different machine), run `git update-index --no-skip-worktree assets/dict/{jmdict,jmnedict}.json` first.

## Schema (input to `src/analysis/dict.ts`)

```jsonc
{
  "index": {
    // form (kanji or kana) → entry ids that contain this form
    "食べる": [1234567],
    "たべる": [1234567]
  },
  "entries": {
    "1234567": {
      "id": 1234567,
      "forms": ["食べる"],
      "readings": ["たべる"],
      "senses": [
        {
          "pos": ["v1", "vt"],
          "glosses": ["to eat"],
          "fields": ["food"],
          "misc": ["uk"]
        }
      ],
      "frequency": "common",      // jmdict only — set when any kanji/kana is "common"
      "nameType": ["person"]      // jmnedict only — copied from translation.type
    }
  }
}
```

## License

JMdict / JMnedict are © Electronic Dictionary Research and Development Group (EDRDG), used under the [EDRDG license](https://www.edrdg.org/edrdg/licence.html). Attribution required.
