# Dictionary data

The placeholder files in this directory are empty. The app builds and runs against them, but no dictionary lookups will resolve until you replace them with real data.

## Schema

```jsonc
// jmdict.json (and same for jmnedict.json)
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
          "examples": [{ "jpn": "ご飯を食べる。", "eng": "I eat rice." }]
        }
      ],
      "frequency": "ichi1",
      "nameType": []
    }
  }
}
```

The `nameType` field is only populated for JMnedict (e.g. `["person"]`, `["place"]`, `["organization"]`).

## Sourcing

- **JMDict / JMnedict** — official XML release at <https://www.edrdg.org/jmdict/edict.html>. Convert with your tool of choice; many community converters exist.
- License: [EDRDG license](https://www.edrdg.org/edrdg/licence.html). Attribution required.

## Why the files aren't bundled

A real JMDict bundle is on the order of 50–100 MB; JMnedict adds another ~30 MB. We don't want them in git history — keep them locally in this directory.
