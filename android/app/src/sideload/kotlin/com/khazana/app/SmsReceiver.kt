package com.khazana.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Live path for bank SMS (sideload build only). Forwards the raw text to
 * [CaptureBus] for on-device parsing; nothing is stored natively.
 *
 * This is the fast path, not the only one. If the app process is not running
 * when an SMS arrives, the message is caught on the next unlock by reading the
 * inbox ([SmsCaptureImpl.readInbox]) — so a missed broadcast loses nothing.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        // A long SMS arrives as several parts; stitch them back together per
        // sender before anything looks at the text.
        parts.groupBy { it.displayOriginatingAddress }.forEach { (sender, msgs) ->
            if (!SmsCapture.isBankLikeSender(sender)) return@forEach
            val body = msgs.joinToString("") { it.displayMessageBody ?: "" }
            if (body.isBlank()) return@forEach
            CaptureBus.emit(body, sender, "sms", msgs.first().timestampMillis)
        }
    }
}
