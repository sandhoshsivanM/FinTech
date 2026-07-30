package com.khazana.app

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

/**
 * Hosts the SMS / notification capture channels. The notification-listener and
 * SMS broadcast receivers forward parsed-free raw text to [CaptureBus]; this
 * activity relays it to Flutter over an EventChannel and answers permission
 * queries over a MethodChannel.
 */
class MainActivity : FlutterActivity() {
    private val methodChannelName = "khazana/capture"
    private val eventChannelName = "khazana/capture/events"
    private val smsRequestCode = 7011
    private var pendingSmsResult: MethodChannel.Result? = null

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
                    "hasSmsPermission" -> result.success(hasSmsPermission())
                    "requestSmsPermission" -> {
                        if (hasSmsPermission()) {
                            result.success(true)
                        } else {
                            pendingSmsResult = result
                            ActivityCompat.requestPermissions(
                                this,
                                arrayOf(
                                    Manifest.permission.RECEIVE_SMS,
                                    Manifest.permission.READ_SMS,
                                ),
                                smsRequestCode,
                            )
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun hasSmsPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED

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

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == smsRequestCode) {
            val granted = grantResults.isNotEmpty() &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingSmsResult?.success(granted)
            pendingSmsResult = null
        }
    }
}
