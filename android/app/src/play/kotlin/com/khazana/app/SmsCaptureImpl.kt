package com.khazana.app

import android.content.Context

/**
 * The Google Play build reads no SMS: no permission is declared and no SMS code
 * is compiled in. Bank alerts arrive through [KhazanaNotificationListener].
 */
object SmsCaptureImpl : SmsCapture {
    override val isAvailable = false
    override val permissions = emptyArray<String>()
    override fun hasPermission(context: Context) = false
    override fun readInbox(context: Context, sinceMs: Long, limit: Int) =
        emptyList<Map<String, Any?>>()
}
