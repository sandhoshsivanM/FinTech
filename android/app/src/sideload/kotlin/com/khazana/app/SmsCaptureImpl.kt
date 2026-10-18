package com.khazana.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Telephony

/**
 * Reads bank SMS for the sideload build.
 *
 * The SMS inbox is also what makes capture reliable: alerts that arrive while
 * the app is closed or the vault is locked are still sitting in the inbox, so
 * the app catches up from it on the next unlock instead of keeping its own
 * (unencrypted) queue of raw messages.
 */
object SmsCaptureImpl : SmsCapture {
    override val isAvailable = true

    override val permissions =
        arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)

    override fun hasPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        return permissions.all {
            context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
        }
    }

    override fun readInbox(
        context: Context,
        sinceMs: Long,
        limit: Int,
    ): List<Map<String, Any?>> {
        if (!hasPermission(context)) return emptyList()
        val out = ArrayList<Map<String, Any?>>()
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
        )
        // Oldest first, so the balance chain is checked in the order the bank
        // wrote it. Parameterised selection: never build SQL from values.
        context.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            projection,
            "${Telephony.Sms.DATE} > ?",
            arrayOf(sinceMs.toString()),
            "${Telephony.Sms.DATE} ASC",
        )?.use { cursor ->
            val iAddress = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val iBody = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val iDate = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
            while (cursor.moveToNext() && out.size < limit) {
                val address = cursor.getString(iAddress)
                if (!SmsCapture.isBankLikeSender(address)) continue
                val body = cursor.getString(iBody) ?: continue
                out.add(
                    mapOf(
                        "text" to body,
                        "sender" to address,
                        "source" to "sms",
                        "postedAt" to cursor.getLong(iDate),
                    ),
                )
            }
        }
        return out
    }
}
