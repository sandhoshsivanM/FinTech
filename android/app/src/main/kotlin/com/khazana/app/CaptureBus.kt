package com.khazana.app

import android.os.Handler
import android.os.Looper
import io.flutter.plugin.common.EventChannel

/**
 * Bridges the background capture services to the Flutter EventChannel. Events
 * that arrive while no Dart listener is attached are buffered (bounded) and
 * flushed on the next attach, so a captured message isn't lost between app
 * foregrounds. Only the transient raw text is carried — nothing is persisted
 * natively.
 */
object CaptureBus {
    private val main = Handler(Looper.getMainLooper())
    private var sink: EventChannel.EventSink? = null
    private val buffer = ArrayDeque<Map<String, Any?>>()
    private const val MAX_BUFFER = 50

    @Synchronized
    fun attach(s: EventChannel.EventSink?) {
        sink = s
        if (s != null) {
            while (buffer.isNotEmpty()) {
                val ev = buffer.removeFirst()
                main.post { sink?.success(ev) }
            }
        }
    }

    @Synchronized
    fun emit(text: String, sender: String?, source: String, postedAt: Long) {
        val ev = mapOf<String, Any?>(
            "text" to text,
            "sender" to sender,
            "source" to source,
            "postedAt" to postedAt,
        )
        val s = sink
        if (s == null) {
            if (buffer.size >= MAX_BUFFER) buffer.removeFirst()
            buffer.addLast(ev)
        } else {
            main.post { s.success(ev) }
        }
    }
}
