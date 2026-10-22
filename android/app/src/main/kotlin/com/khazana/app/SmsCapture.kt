package com.khazana.app

import android.content.Context

/**
 * SMS capture, as far as the shared code needs to know. Each build flavor
 * supplies [SmsCaptureImpl]: the `play` one is inert (no permission, no SMS
 * code in the binary), the `sideload` one reads bank SMS.
 */
interface SmsCapture {
    /** Whether this build can read SMS at all (sideload: yes, play: no). */
    val isAvailable: Boolean

    /** The runtime permissions to request, empty when unavailable. */
    val permissions: Array<String>

    fun hasPermission(context: Context): Boolean

    /**
     * Bank SMS received after [sinceMs], oldest first, at most [limit]. Each map
     * carries the same keys [CaptureBus.emit] sends: text, sender, source,
     * postedAt. Runs on the caller's thread — never call it on the main thread.
     */
    fun readInbox(context: Context, sinceMs: Long, limit: Int): List<Map<String, Any?>>

    companion object {
        /**
         * Banks and payment apps send from alphanumeric sender IDs ("VM-HDFCBK",
         * "AD-ICICIB"); people send from phone numbers. Only the former is ever
         * read, so a personal message never leaves the OS — let alone reaches
         * the parser. Play's policy is explicit that budgeting apps may not take
         * non-financial SMS; this is where that is enforced.
         */
        fun isBankLikeSender(address: String?): Boolean =
            address != null && address.any { it.isLetter() }
    }
}
