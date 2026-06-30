package com.fintechos.fintech_os

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Forwards incoming SMS (bank transaction texts) to [CaptureBus] for on-device
 * parsing. Requires the RECEIVE_SMS runtime permission.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return
        val sender = messages.first().displayOriginatingAddress
        val body = messages.joinToString("") { it.messageBody.orEmpty() }
        val timestamp = messages.first().timestampMillis
        if (body.isBlank()) return
        CaptureBus.emit(body, sender, "sms", timestamp)
    }
}
