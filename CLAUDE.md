# Pureyaa — working notes for AI assistants

Japanese language-learning app that mines anime subtitles into Anki cards.
Android is the primary target; iOS is supported with one feature gap
(Anki, see §3 and §7). Expo SDK 55, React Native 0.83, Hermes, New
Architecture.

## 1. Working style for this repo

- **Many small atomic commits — the more the better.** Each commit should
  leave the tree compiling. Intermediate states with broken types are
  acceptable only if the next commit fixes them and they land back-to-back.
- **Always state JS-only vs requires-rebuild** when finishing a task.
  EAS builds cost real money — the user needs to know whether to reload
  the dev client or kick off a paid build.
- **Don't touch pre-existing diffs in the working tree** that weren't
  part of your task (e.g., random `eas.json` / `expo-env.d.ts`
  modifications already there at session start).
- **Type-check before committing** with `npx tsc --noEmit`. Two known
  pre-existing errors to filter from output:
  - `app/player/[id].tsx` around line 177 — `usePlayerData` typing
  - `kuromoji-react-native` missing declaration file
  
  Anything else is yours.

## 2. AI service architecture (single OpenRouter key)

- **One key for all AI**: OpenRouter handles Claude analysis
  (`anthropic/claude-sonnet-4.5`), Whisper subtitle generation
  (`openai/whisper-large-v3-turbo`), and TTS
  (`openai/gpt-4o-audio-preview`). Stored in `expo-secure-store`
  under `pureyaa.openrouterApiKey`.
- **WaniKani is separate** (account-bound, kanji-only). Stored under
  `pureyaa.wanikaniApiKey`. Bulk-fetched + cached locally on key save
  so card creation is offline.
- **OpenRouter API quirks** — partially OpenAI-compatible but diverges
  in two important places:
  - `/audio/transcriptions` is **not** multipart. It expects JSON with
    `input_audio: { data: <base64>, format: "<ext>" }`. Multipart
    payloads get parsed as JSON server-side and fail with "no number
    after minus sign in JSON at position 1".
  - `response_format: 'srt'` is silently dropped. Use
    `response_format: 'verbose_json'` + `timestamp_granularities:
    ['segment']` and build the SRT in JS from the segments array.
  - TTS goes through `/chat/completions` with
    `model=openai/gpt-4o-audio-preview`,
    `modalities=['text','audio']`, `audio={voice, format:'mp3'}`.
    Audio comes back as base64 in `choices[0].message.audio.data`.

## 3. Anki integration

- **Direct AddContentApi via local Kotlin module** at
  `modules/anki-bridge/`. JitPack dep
  `com.github.ankidroid:Anki-Android:api-v1.1.0`. No HTTP, no
  AnkiconnectAndroid (Play Protect kept uninstalling it).
- **Note type lives in Kotlin** (`AnkiBridgeModule.kt` companion
  object: `PUREYAA_FIELDS`, `PRODUCTION_FRONT`, `PRODUCTION_BACK`,
  `PUREYAA_CSS`). `ensurePureyaaModel` only **installs** when missing —
  it doesn't update.
- **Workflow for template iteration**: edit templates/CSS in AnkiDroid
  live (instant preview), then port back into `AnkiBridgeModule.kt`
  so fresh installs get the right thing. Field schema is the one piece
  you don't want to drift.
- **11 fields must stay in lockstep across three files**:
  1. `PUREYAA_FIELDS` array in `AnkiBridgeModule.kt`
  2. `FIELD_ORDER` in `src/anki/send.ts`
  3. The `fields` object in `src/anki/buildCard.ts`
  
  Order is positional, not by name. Adding/removing/renaming a field
  requires touching all three or `addNote` will mismatch field count
  and reject silently.
- **AddContentApi gotchas** verified against the v1.1.0 Java source:
  - `preferredName` must NOT include the file extension. The API
    derives the extension from the URI's content type.
  - `mimeType` must be the literal string `"audio"` or `"image"` —
    not full MIME like `"image/jpeg"`. The provider does an
    `equals()` check; anything else returns null and the bridge throws.
  - Use the **returned reference string** from `addMediaFromUri` as
    the card field value, not a hardcoded `<img src="filename">`.
    AnkiDroid may rename for collisions.

## 4. SAF URI persistence

- **`expo-document-picker` doesn't auto-persist** URIs. Without
  persistence, every cold start invalidates the saved `videoUri` and
  the entry shows "file unavailable".
- **Every DocumentPicker that returns a content:// URI we plan to
  keep** must be followed by `await AnkiBridge.persistUriPermission(uri)`
  (the local Kotlin helper that wraps `takePersistableUriPermission`).
- **expo-router URL-encodes route params**, so URIs round-tripped
  through `router.push({ params })` come out the other side with
  slightly different encoding. The transient session grant tolerates
  fuzzy matching but the persistent grant is exact-match. **Re-persist
  on the receiving side** immediately before saving the entry.

## 5. Media + time handling

- **Cue times are subtitle clock; the video file is video clock.**
  Always apply the retimer via `effectiveStartMs(cue, retimerState)` /
  `effectiveEndMs(cue, retimerState)` (in `src/utils/time.ts`) before
  passing times to native extractors (`extractThumbnail`,
  `extractAudio`). Forgetting this puts media seconds off the spoken
  line whenever the user has any sync offset.
- Native module `modules/audio-extract/` (Kotlin MediaExtractor +
  MediaCodec): AAC remux fast path, Opus → ogg, anything else
  transcodes to AAC. Drain-encoder-first pipeline order avoids
  deadlocks; channelCount > 6 fails with a clear error before
  `encoder.configure` would throw a generic one.

## 6. Cross-platform conventions (Android + iOS)

- **`src/featureFlags.ts`** is the single-source-of-truth for
  per-platform UI gating. `ANKI_AVAILABLE = Platform.OS === 'android'`
  is the only flag right now. UI surfaces wrap their Anki-specific
  blocks in `{ANKI_AVAILABLE && ...}`.
- **`anki-bridge` and `audio-extract` JS shims** detect iOS via
  `Platform.OS` and substitute proxies that throw clearly when methods
  are called. `anki-bridge` has no iOS native module by design;
  `audio-extract` does (Phase 3 of the iOS port).
- **`file-access` is cross-platform** with platform-specific handle
  formats: on Android the handle == the URI string; on iOS it's a
  base64 security-scoped bookmark. Always wrap reads in `withSession()`
  (no-op on Android, scope-managed on iOS).
- **`uriExists` branches per-platform.** Android uses
  `new File(uri).exists` directly; iOS resolves the bookmark via
  `FileAccess.beginSession` first.
- **Cross-platform toasts** via `src/ui/Toast.tsx` (`showToast()`).
  Backed by `ToastAndroid` on Android, an animated bottom pill via
  `<ToastHost />` on iOS. Don't import `ToastAndroid` directly.

## 7. Other project facts

- **Anki integration is Android-only.** AnkiMobile on iOS only exposes
  a URL scheme that doesn't accept inline media or programmatic note
  types — too crippled for our note design. iOS users get analysis,
  playback, dict popup, saved words, Whisper subtitle generation.
  See §6 for how this is gated in code.
- **Whisper track-picker for dual-audio rips is intentionally
  deferred.** Would need `listAudioTracks` methods (Kotlin and Swift)
  + a rebuild. Current behavior picks the first audio track, which
  works for monolingual rips. Symptom of the missing feature: a JP/EN
  dual audio file transcribes the dub.
- **iOS audio-extract uses AVAssetExportSession** with the AppleM4A
  preset — always re-encodes to AAC regardless of source codec. The
  Kotlin module has codec-specific fast paths (AAC remux, Opus → ogg);
  the Swift module trades that complexity for simplicity since the
  cost is negligible for our typical file sizes.
- **Hermes property limit (196k)**: the dict bundle uses `Map<>` at
  runtime; the on-disk format is array-of-pairs to avoid the per-object
  property cap. Don't switch to plain object literals for large maps.
