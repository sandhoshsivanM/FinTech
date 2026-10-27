package com.khazana.khazana_online

import android.app.Activity
import android.view.WindowManager
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel

/**
 * Re-asserts FLAG_SECURE for screens that show recovery phrases, keys or
 * balances. Reference counted; release never clears the flag below the app-wide
 * default (MainActivity sets it at start-up), so there is no way to turn it off.
 */
class ScreenChannel(messenger: BinaryMessenger, private val activity: Activity) {
    private var holders = 0

    init {
        MethodChannel(messenger, "khazana/screen").setMethodCallHandler { call, result ->
            when (call.method) {
                "acquire" -> { holders++; secure(); result.success(null) }
                "release" -> { if (holders > 0) holders--; secure(); result.success(null) }
                else -> result.notImplemented()
            }
        }
    }

    private fun secure() =
        activity.window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
}
