# Dictionary data

This directory is where the bundled JMdict + JMnedict data lives at build time. The dict files (`jmdict.dict`, `jmnedict.dict`) are gitignored — populate them locally via:

```bash
pnpm download-dicts
```

That script:

1. Downloads the latest `jmdict-eng-*.json.tgz` and `jmnedict-all-*.json.tgz` releases from [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) (EDRDG license).
2. Extracts and converts each to the schema below.
3. Writes `jmdict.dict` + `jmnedict.dict` here.

The `.dict` extension is registered as a binary asset in `metro.config.js`, so Metro ships these as native resources rather than inlining them as JS modules. `src/analysis/dict.ts` reads them via `expo-asset`.

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
