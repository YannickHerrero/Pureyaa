package expo.modules.ankibridge

import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.ichi2.anki.api.AddContentApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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

    AsyncFunction("requestPermission") { promise: expo.modules.kotlin.Promise ->
      val perms = appContext.permissions
        ?: throw IllegalStateException("Permissions manager not available")
      perms.askForPermissions(
        { result ->
          promise.resolve(result)
        },
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
