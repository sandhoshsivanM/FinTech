package com.khazana.app

import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
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
                    "isNotificationCaptureAvailable" ->
                        result.success(isNotificationListenerDeclared())
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Not on a restore: the share was already handled before the process died.
        if (savedInstanceState == null) handleShare(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    /**
     * Text shared into Khazana (Messages → Share → Khazana). Treated exactly
     * like a captured SMS: handed to the pipeline, parsed, and the text
     * dropped. Only the share build declares the intent filter, but handling
     * it here is harmless everywhere.
     */
    private fun handleShare(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.take(MAX_SHARED_CHARS) ?: return
        if (text.isNotBlank()) CaptureBus.emit(text, null, "sms", System.currentTimeMillis())
        // Consumed: a rotation or a return to the app must not capture it twice.
        intent.action = null
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    /** False on the share build, whose manifest removes the listener. */
    private fun isNotificationListenerDeclared(): Boolean = try {
        packageManager.getServiceInfo(ComponentName(this, KhazanaNotificationListener::class.java), 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
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

    private companion object {
        /** Longer than any bank alert; the parser refuses anything over 2,000 anyway. */
        const val MAX_SHARED_CHARS = 4000
    }
}
