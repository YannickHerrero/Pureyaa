# Pureyaa

A Japanese immersion video player for personal use. Pair a video file with an `.srt` subtitle, run a one-time analysis, then watch with tap-to-define dictionary popups for every word.

Built with Expo / React Native. Targets Android — designed and tested on a Samsung Galaxy Z Fold 7 inner screen in portrait.

> **Status:** MVP. Personal-use scope. The bundle is large (dictionaries are loaded locally) and there is no cloud sync.

## What it does

- **Phase 1 — Analysis (one-time per video).** Pick a video and its `.srt`. The app:
  1. Parses the SRT and tokenizes every cue with kuromoji.
  2. Resolves each token (and longer compound spans, up to 5) against bundled JMDict + JMnedict, longest-first.
  3. Sends the cue list in one streaming call to Claude (Haiku / Sonnet / Opus) and gets back a translation + optional grammar note for every line.
  4. Persists the enriched analysis next to the library entry.
- **Phase 2 — Playback (no network).** Plays the video with the original subtitles on top. Each token is tappable: tapping pauses the video and opens a Yomitan-style popup with the dictionary entry. Save words to a global Saved Words list.

## Features

- Three-tab navigation: **Library**, **Saved Words**, **Settings**.
- Subtitle modes: **JP only** (default, with tap-to-reveal translation), **JP + EN**, **EN only**.
- Tap a token → pause + popup with longest-match definitions and shorter alternatives stacked underneath. Star to save.
- Playback controls: play/pause, scrub bar, prev / replay / next subtitle line.
- Optional auto-pause at the end of every subtitle line.
- Subtitle retimer: 1-point (constant offset) or 2-point (linear correction). Stored on the entry; the original `.srt` file is never modified.
- Library: series grouping, search by title, sort by date / recently watched / alphabetical.
- Long-press for entry/series context menus (rename, change thumbnail, move between series, delete).
- Saved Words: jump back to the source cue and auto-pause there.
- Watched badge once playback exceeds 70%.

## Architecture

```
app/                      # expo-router file-based routes
  (tabs)/                 # bottom tab navigator
    library.tsx           # Library
    saved.tsx             # Saved Words
    settings.tsx          # Settings
  add/index.tsx           # Add-to-library flow
  player/[id].tsx         # Video player
src/
  types/                  # shared TS types (LibraryEntry, AnalysisData, ...)
  storage/                # AsyncStorage + filesystem persistence
  analysis/               # SRT parser, tokenizer, dict matcher, Claude client, orchestrator
  player/                 # video + subtitle components
  utils/                  # filename detection, time math, retimer math, etc.
assets/dict/              # bundled JMDict / JMnedict (you must provide)
```

## Prerequisites

- Node 20+
- Android device or emulator (target API 31+)
- An [Anthropic API key](https://console.anthropic.com/) — provided by the user in Settings, stored in `expo-secure-store`. No env vars.
- Bundled dictionary data — see [Dictionary data](#dictionary-data) below.

## Setup

```bash
npm install
npx expo prebuild --platform android   # only needed if you customize native config
npx expo run:android                   # or `npm run start` and use the dev client
```

Open the app, go to **Settings**, paste your Anthropic API key, pick a model, and use **Test connection** to confirm it works.

## Dictionary data

The repo ships with empty placeholders. Populate them in one step:

```bash
npm run download-dicts
```

This downloads the latest [scriptin/jmdict-simplified](https://github.com/scriptin/jmdict-simplified) releases (full English JMdict + JMnedict), converts them to the schema in `src/analysis/dict.ts`, and writes them in place. The dict files become ~100 MB combined; the script marks them `--skip-worktree` so the diffs don't show in `git status`. Schema details and the EDRDG license note live in [`assets/dict/README.md`](./assets/dict/README.md).

## Privacy + scope

- The app talks to the Claude API only during the **analysis phase**, once per library entry. Playback is entirely offline.
- Only the cue text (one line per cue, no timing) is sent. Filenames and on-device file paths are never transmitted.
- The API key is stored in the OS keychain via `expo-secure-store`.

## Out of scope (for now)

Anki export · embedded `.mkv` subtitle extraction · `.ass` / `.vtt` formats · resume from last position · pitch accent · KANJIDIC · multi-token drag selection · A-B loop · playback speed · per-video subtitle mode override · cloud sync · cover-screen layout · furigana.

## License

MIT — see [LICENSE](./LICENSE).

## Acknowledgements

- [JMDict / JMnedict](https://www.edrdg.org/jmdict/edict.html) — © Electronic Dictionary Research and Development Group, used under the [EDRDG license](https://www.edrdg.org/edrdg/licence.html).
- [kuromoji](https://github.com/atilika/kuromoji) — Apache 2.0.
- [Yomitan](https://github.com/yomidevs/yomitan) — for inspiring the popup UX.
