package expo.modules.ankibridge

import android.content.Intent
import android.content.pm.PackageManager
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
      "JapaneseRuby",
      "JapanesePlain",
      "English",
      "GrammarNote",
      "FocusWord",
      "FocusReading",
      "FocusGlosses",
      "Source",
    )

    private val PRODUCTION_FRONT = """
      {{Image}}
      <div class="jp">{{JapaneseRuby}}</div>
      {{Audio}}
    """.trimIndent()

    private val PRODUCTION_BACK = """
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
    """.trimIndent()

    private val PUREYAA_CSS = """
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

    AsyncFunction("getDeckNames") {
      val api = openApi()
      api.deckList?.values?.toList() ?: emptyList()
    }

    AsyncFunction("getModelNames") {
      val api = openApi()
      api.modelList?.values?.toList() ?: emptyList()
    }

    AsyncFunction("ensureDeck") { name: String ->
      val api = openApi()
      val existing = api.deckList?.entries?.find { it.value == name }?.key
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
      val existing = api.modelList?.entries?.find { it.value == PUREYAA_MODEL_NAME }?.key
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
        // sort by JapanesePlain (index 3) so the browser sorts cards by sentence
        3,
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
      val deckId = api.deckList?.entries?.find { it.value == deckName }?.key
        ?: error("Deck '$deckName' not found in AnkiDroid.")
      val modelId = api.modelList?.entries?.find { it.value == modelName }?.key
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
