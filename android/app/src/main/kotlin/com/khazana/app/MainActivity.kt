package com.khazana.app

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * Hosts the notification capture channel. [KhazanaNotificationListener] forwards
 * unparsed raw text to [CaptureBus]; this activity relays it to Flutter over an
 * EventChannel and answers permission queries over a MethodChannel.
 *
 * SMS capture used to live here too. It was removed: RECEIVE_SMS/READ_SMS are
 * Play restricted permissions that a finance app cannot hold, and the incoming
 * bank alerts we want are the same ones the notification listener already sees.
 */
class MainActivity : FlutterActivity() {
    private val methodChannelName = "khazana/capture"
    private val eventChannelName = "khazana/capture/events"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, eventChannelName)
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    CaptureBus.attach(events)
                }

                override fun onCancel(arguments: Any?) {
                    CaptureBus.attach(null)
                }
            })

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, methodChannelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isNotificationAccessGranted" ->
                        result.success(isNotificationAccessGranted())
                    "openNotificationAccessSettings" -> {
                        startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun isNotificationAccessGranted(): Boolean {
        val enabled = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners",
        ) ?: return false
        val target = ComponentName(this, KhazanaNotificationListener::class.java)
        return enabled.split(":").any {
            ComponentName.unflattenFromString(it) == target
        }
    }
}
