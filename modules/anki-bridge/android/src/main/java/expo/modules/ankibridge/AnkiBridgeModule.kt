package expo.modules.ankibridge

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.ichi2.anki.api.AddContentApi
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.interfaces.permissions.Permissions
import java.io.File
import java.util.UUID

class AnkiBridgeModule : Module() {
  companion object {
    private const val TAG = "AnkiBridge"
    private const val PERMISSION = "com.ichi2.anki.permission.READ_WRITE_DATABASE"
    private const val PUREYAA_MODEL_NAME = "Pureyaa Sentence"

    private val PUREYAA_FIELDS = arrayOf(
      "Image",
      "Audio",
      "SentenceFront",
      "SentenceBack",
      "English",
      "GrammarNote",
      "FocusWord",
      "FocusReading",
      "FocusGlosses",
      "KanjiList",
      "Source",
    )

    // Front: just the sentence, plain text, focus word underlined.
    // No image, no audio, no furigana — minimal recall surface.
    private val PRODUCTION_FRONT = """
      <div class="sentence sentence-front">{{SentenceFront}}</div>
    """.trimIndent()

    // Back: image → sentence with furigana → audio (autoplay) → translation
    // → grammar → focus block → kanji list → source. We don't use {{FrontSide}}
    // because the back has its own ordering with the ruby version of the sentence.
    private val PRODUCTION_BACK = """
      <div class="image-wrap">{{Image}}</div>
      <div class="sentence sentence-back">{{SentenceBack}}</div>
      <div class="audio-row">{{Audio}}</div>
      <hr>
      <div class="english">{{English}}</div>
      {{#GrammarNote}}<div class="grammar">{{GrammarNote}}</div>{{/GrammarNote}}
      <div class="focus-block">
        <span class="focus-word">{{FocusWord}}</span>
        <span class="focus-reading">{{FocusReading}}</span>
        <div class="focus-glosses">{{FocusGlosses}}</div>
      </div>
      {{#KanjiList}}<div class="kanji-section">{{KanjiList}}</div>{{/KanjiList}}
      <div class="source">{{Source}}</div>
    """.trimIndent()

    // Adaptive theme: light by default, .nightMode override for AnkiDroid dark.
    private val PUREYAA_CSS = """
      .card {
        font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic Pro', 'Yu Gothic', YuGothic, Meiryo, sans-serif;
        color: #1f2937;
        background: #fff;
        padding: 16px;
        line-height: 1.6;
      }

      .sentence-front {
        font-size: 32px;
        line-height: 1.7;
        text-align: center;
        padding: 24px 8px;
      }
      .sentence-back {
        font-size: 26px;
        line-height: 1.9;
        text-align: center;
        padding: 12px 8px;
      }

      .focus {
        border-bottom: 2px solid #3b82f6;
        padding-bottom: 1px;
      }

      .image-wrap { text-align: center; margin-bottom: 12px; }
      .image-wrap img { max-width: 100%; max-height: 240px; border-radius: 6px; }

      .audio-row { text-align: center; margin: 8px 0; }

      hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }

      .english { font-size: 18px; text-align: center; color: #4b5563; }

      .grammar {
        font-size: 14px;
        font-style: italic;
        color: #b45309;
        margin-top: 8px;
        padding: 8px 12px;
        background: #fffbeb;
        border-radius: 4px;
      }

      .focus-block { margin-top: 16px; padding: 12px 14px; background: #f9fafb; border-radius: 6px; }
      .focus-word { font-size: 22px; font-weight: 600; }
      .focus-reading { margin-left: 10px; color: #6b7280; font-size: 18px; }
      .focus-glosses { margin-top: 6px; font-size: 15px; color: #1f2937; }
      .focus-glosses ul { margin: 0; padding-left: 20px; }
      .focus-glosses i { color: #6b7280; font-style: italic; }

      .kanji-section { margin-top: 16px; }
      .kanji-list { display: flex; flex-direction: column; gap: 6px; }
      .kanji-row {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 6px 10px;
        background: #f3f4f6;
        border-radius: 4px;
      }
      .kanji-char { font-size: 24px; font-weight: 500; min-width: 1.6em; }
      .kanji-meanings { flex: 1; font-size: 15px; color: #1f2937; }
      .kanji-readings { font-size: 13px; color: #6b7280; white-space: nowrap; }

      .source { text-align: right; margin-top: 16px; font-size: 11px; color: #9ca3af; }

      ruby rt { font-size: 0.5em; color: #6b7280; }

      .nightMode .card { color: #e5e7eb; background: #1a1a1a; }
      .nightMode .focus { border-bottom-color: #60a5fa; }
      .nightMode hr { border-top-color: #374151; }
      .nightMode .english { color: #d1d5db; }
      .nightMode .grammar { color: #fbbf24; background: #2d2310; }
      .nightMode .focus-block { background: #262626; }
      .nightMode .focus-reading { color: #9ca3af; }
      .nightMode .focus-glosses { color: #e5e7eb; }
      .nightMode .focus-glosses i { color: #9ca3af; }
      .nightMode .kanji-row { background: #262626; }
      .nightMode .kanji-meanings { color: #e5e7eb; }
      .nightMode .kanji-readings { color: #9ca3af; }
      .nightMode .source { color: #6b7280; }
      .nightMode ruby rt { color: #9ca3af; }
    """.trimIndent()
  }

  override fun definition() = ModuleDefinition {
    Name("AnkiBridge")

    Function("isAnkiDroidInstalled") {
      val context = appContext.reactContext ?: return@Function false
      AddContentApi.getAnkiDroidPackageName(context) != null
    }

    AsyncFunction("hasPermission") {
      val context = appContext.reactContext ?: error("No Android context available")
      ContextCompat.checkSelfPermission(context, PERMISSION) == PackageManager.PERMISSION_GRANTED
    }

    AsyncFunction("requestPermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        PERMISSION,
      )
    }

    // SAF helper — not Anki-specific, but lives here so we don't have to
    // ship a second native module just to call one ContentResolver method.
    // expo-document-picker returns a content:// URI that is only readable
    // for the current process; without this call the URI is dead after
    // the app restarts and the user has to re-pick the file every time.
    AsyncFunction("persistUriPermission") { uriString: String ->
      val context = appContext.reactContext ?: error("No Android context available")
      val uri = Uri.parse(uriString)
      try {
        context.contentResolver.takePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
        Log.d(TAG, "persisted URI permission for $uri")
      } catch (e: SecurityException) {
        // Not a persistable URI (e.g. ACTION_GET_CONTENT instead of
        // ACTION_OPEN_DOCUMENT). Don't fail the caller — the URI may
        // still work for the current session.
        Log.w(TAG, "could not persist URI permission for $uri: ${e.message}")
      }
    }

    AsyncFunction("getDeckNames") {
      val api = openApi()
      val decks: Map<Long, String>? = api.deckList
      decks?.values?.toList() ?: emptyList<String>()
    }

    AsyncFunction("getModelNames") {
      val api = openApi()
      val models: Map<Long, String>? = api.modelList
      models?.values?.toList() ?: emptyList<String>()
    }

    AsyncFunction("ensureDeck") { name: String ->
      val api = openApi()
      val decks: Map<Long, String>? = api.deckList
      val existing = decks?.entries?.find { it.value == name }?.key
      if (existing != null) {
        Log.d(TAG, "deck '$name' exists (id=$existing)")
        return@AsyncFunction existing
      }
      val id = api.addNewDeck(name) ?: error("Failed to create deck '$name'")
      Log.d(TAG, "created deck '$name' (id=$id)")
      id
    }

    AsyncFunction("ensurePureyaaModel") {
      val api = openApi()
      val models: Map<Long, String>? = api.modelList
      val existing = models?.entries?.find { it.value == PUREYAA_MODEL_NAME }?.key
      if (existing != null) {
        Log.d(TAG, "model '$PUREYAA_MODEL_NAME' exists (id=$existing)")
        return@AsyncFunction existing
      }
      val id = api.addNewCustomModel(
        PUREYAA_MODEL_NAME,
        PUREYAA_FIELDS,
        arrayOf("Production"),
        arrayOf(PRODUCTION_FRONT),
        arrayOf(PRODUCTION_BACK),
        PUREYAA_CSS,
        null,
        // Sort by FocusWord (index 6) so the browser groups cards that mine
        // the same target word together — easier to spot duplicates than
        // the HTML-laden SentenceFront/Back fields.
        6,
      ) ?: error("Failed to create model '$PUREYAA_MODEL_NAME'")
      Log.d(TAG, "created model '$PUREYAA_MODEL_NAME' (id=$id)")
      id
    }

    AsyncFunction("storeMedia") { base64: String, filename: String, mimeType: String ->
      val context = appContext.reactContext ?: error("No Android context available")
      val api = openApi()

      // Write the bytes to our cache via a FileProvider-shareable path so
      // AnkiDroid can read them across the process boundary.
      val cacheDir = File(context.cacheDir, "anki").apply { mkdirs() }
      val tempFile = File(cacheDir, "${UUID.randomUUID()}_$filename")
      tempFile.writeBytes(Base64.decode(base64, Base64.DEFAULT))

      val authority = "${context.packageName}.ankifileprovider"
      val uri = FileProvider.getUriForFile(context, authority, tempFile)

      val ankiPackage = AddContentApi.getAnkiDroidPackageName(context)
        ?: error("AnkiDroid is not installed.")
      context.grantUriPermission(ankiPackage, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)

      try {
        val savedName = api.addMediaFromUri(uri, filename, mimeType)
          ?: error("AnkiDroid rejected media '$filename'")
        Log.d(TAG, "stored media '$filename' as '$savedName' (${tempFile.length()} bytes)")
        savedName
      } finally {
        if (tempFile.exists()) tempFile.delete()
      }
    }

    AsyncFunction("addNote") { deckName: String, modelName: String, fields: List<String>, tags: List<String> ->
      val api = openApi()
      val decks: Map<Long, String>? = api.deckList
      val models: Map<Long, String>? = api.modelList
      val deckId = decks?.entries?.find { it.value == deckName }?.key
        ?: error("Deck '$deckName' not found in AnkiDroid.")
      val modelId = models?.entries?.find { it.value == modelName }?.key
        ?: error("Note type '$modelName' not found in AnkiDroid.")
      val noteId = api.addNote(
        modelId,
        deckId,
        fields.toTypedArray(),
        tags.toSet(),
      ) ?: error("AnkiDroid rejected addNote (likely a field/template mismatch).")
      Log.d(TAG, "added note id=$noteId in deck='$deckName' model='$modelName'")
      noteId
    }
  }

  private fun openApi(): AddContentApi {
    val context = appContext.reactContext ?: error("No Android context available")
    if (AddContentApi.getAnkiDroidPackageName(context) == null) {
      error("AnkiDroid is not installed.")
    }
    if (ContextCompat.checkSelfPermission(context, PERMISSION) != PackageManager.PERMISSION_GRANTED) {
      error("AnkiDroid permission not granted. Open Settings and tap \"Connect AnkiDroid\".")
    }
    return AddContentApi(context)
  }
}
