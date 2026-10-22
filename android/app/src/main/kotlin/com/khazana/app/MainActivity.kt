package com.khazana.app

import android.content.ComponentName
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

/**
 * Hosts the capture channels. [KhazanaNotificationListener] (every build) and
 * `SmsReceiver` (sideload build) forward unparsed raw text to [CaptureBus];
 * this activity relays it to Flutter over an EventChannel and answers
 * permission and inbox queries over a MethodChannel.
 *
 * SMS support is supplied per build flavor through [SmsCaptureImpl]: the Play
 * build's implementation is inert and its manifest declares no SMS permission.
 */
class MainActivity : FlutterActivity() {
    private val methodChannelName = "khazana/capture"
    private val eventChannelName = "khazana/capture/events"
    private val smsPermissionRequest = 4107

    private val sms: SmsCapture = SmsCaptureImpl
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var pendingPermissionResult: MethodChannel.Result? = null

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
                    "isSmsCaptureAvailable" -> result.success(sms.isAvailable)
                    "isSmsPermissionGranted" -> result.success(sms.hasPermission(this))
                    "requestSmsPermission" -> requestSmsPermission(result)
                    "readSmsSince" -> {
                        val since = (call.argument<Number>("sinceMs"))?.toLong() ?: 0L
                        val limit = (call.argument<Number>("limit"))?.toInt() ?: 2000
                        // A content-provider query over months of SMS can take
                        // seconds; off the main thread, or the UI freezes.
                        io.execute {
                            val rows = try {
                                sms.readInbox(this, since, limit)
                            } catch (e: SecurityException) {
                                emptyList()
                            }
                            main.post { result.success(rows) }
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun requestSmsPermission(result: MethodChannel.Result) {
        if (!sms.isAvailable) return result.success(false)
        if (sms.hasPermission(this)) return result.success(true)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return result.success(true)
        // One request at a time; a second tap while the dialog is up just waits.
        pendingPermissionResult?.success(false)
        pendingPermissionResult = result
        requestPermissions(sms.permissions, smsPermissionRequest)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != smsPermissionRequest) return
        pendingPermissionResult?.success(sms.hasPermission(this))
        pendingPermissionResult = null
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
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
