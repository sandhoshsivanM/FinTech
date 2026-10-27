package com.khazana.khazana_online

import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        // Screen protection is ON from the first frame, for the whole app:
        // no screenshots, no screen recording, blank recents thumbnail.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        super.onCreate(savedInstanceState)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        DeviceKeyChannel.appContext = applicationContext
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        DeviceKeyChannel(messenger)
        IntegrityChannel(messenger, this)
        ScreenChannel(messenger, this)
    }
}
