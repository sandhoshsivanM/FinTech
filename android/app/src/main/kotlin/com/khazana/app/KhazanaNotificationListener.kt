package com.khazana.app

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Forwards posted notifications (e.g. bank transaction alerts) to [CaptureBus]
 * for on-device parsing. Requires the user to grant notification access in
 * system settings (BIND_NOTIFICATION_LISTENER_SERVICE).
 */
class KhazanaNotificationListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
        val body = if (bigText.isNotEmpty()) bigText else text
        val combined = listOf(title, body).filter { it.isNotEmpty() }.joinToString(". ")
        if (combined.isBlank()) return
        CaptureBus.emit(combined, sbn.packageName, "notification", sbn.postTime)
    }
}
