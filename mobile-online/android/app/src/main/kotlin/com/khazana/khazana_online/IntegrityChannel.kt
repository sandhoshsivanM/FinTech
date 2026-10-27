package com.khazana.khazana_online

import android.app.Activity
import android.os.Build
import android.os.Debug
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodChannel
import java.io.File

/**
 * Heuristic root / tamper / hook detection. None of this is proof of a clean
 * device (a determined attacker hides root); it raises the bar, and the
 * server-side Play Integrity check (attestation.dart) is the real arbiter.
 * Returns finding names that match IntegrityFinding in Dart.
 */
class IntegrityChannel(messenger: BinaryMessenger, private val activity: Activity) {
    init {
        MethodChannel(messenger, "khazana/integrity").setMethodCallHandler { call, result ->
            if (call.method == "check") result.success(check()) else result.notImplemented()
        }
    }

    private fun check(): List<String> {
        val found = linkedSetOf<String>()
        if (rooted()) found += "rooted"
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger() || tracerAttached()) found += "debuggerAttached"
        if (hooked()) found += "hookingFramework"
        if (emulator()) found += "emulator"
        return found.toList()
    }

    private fun rooted(): Boolean {
        val paths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/sd/xbin/su", "/vendor/bin/su",
            "/data/local/su", "/data/local/bin/su", "/data/local/xbin/su", "/su/bin/su",
            "/system/app/Superuser.apk", "/system/app/SuperSU.apk", "/sbin/.magisk", "/data/adb/magisk",
            "/data/adb/modules", "/system/etc/init.d/99SuperSUDaemon",
        )
        if (paths.any { File(it).exists() }) return true
        if (Build.TAGS?.contains("test-keys") == true) return true
        // Root managers by package (declared in <queries> in the manifest).
        val pm = activity.packageManager
        val pkgs = listOf("com.topjohnwu.magisk", "eu.chainfire.supersu", "com.noshufou.android.su", "com.koushikdutta.superuser", "me.weishu.kernelsu")
        if (pkgs.any { runCatching { pm.getPackageInfo(it, 0) }.isSuccess }) return true
        // /system mounted read-write.
        return runCatching {
            File("/proc/mounts").readLines().any { l ->
                val p = l.split(" ")
                p.size > 3 && p[1] == "/system" && p[3].split(",").contains("rw")
            }
        }.getOrDefault(false)
    }

    private fun tracerAttached(): Boolean = runCatching {
        File("/proc/self/status").readLines().firstOrNull { it.startsWith("TracerPid:") }
            ?.substringAfter(":")?.trim()?.toIntOrNull()?.let { it != 0 } ?: false
    }.getOrDefault(false)

    private fun hooked(): Boolean {
        val needles = listOf("frida", "gum-js-loop", "libsubstrate", "XposedBridge", "lsposed", "libriru")
        val maps = runCatching { File("/proc/self/maps").readText() }.getOrDefault("")
        if (needles.any { maps.contains(it, ignoreCase = true) }) return true
        return runCatching { Class.forName("de.robv.android.xposed.XposedBridge"); true }.getOrDefault(false)
    }

    private fun emulator(): Boolean =
        Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") ||
            Build.MODEL.contains("Emulator") || Build.MODEL.contains("Android SDK built for") ||
            Build.HARDWARE.contains("goldfish") || Build.HARDWARE.contains("ranchu") ||
            Build.PRODUCT.contains("sdk_gphone") || Build.MANUFACTURER.contains("Genymotion")
}
