package expo.modules.ankibridge

import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.ichi2.anki.api.AddContentApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AnkiBridgeModule : Module() {
  companion object {
    private const val TAG = "AnkiBridge"
    private const val PERMISSION = "com.ichi2.anki.permission.READ_WRITE_DATABASE"
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
  }
}
