# R8 / ProGuard rules for the release build.
#
# Flutter's own consumer rules cover the engine and the plugins that ship them.
# What follows is the set that is ours, or that a plugin gets wrong.

# --- SQLCipher / sqlite3 -----------------------------------------------------
# sqlcipher_flutter_libs loads the native library through JNI, so the classes
# are referenced by name from C and R8 cannot see the edge. Stripping them
# yields an UnsatisfiedLinkError on first vault open — i.e. the app never gets
# past the unlock screen in release, and never in debug.
-keep class net.sqlcipher.** { *; }
-keep class net.zetetic.** { *; }
-dontwarn net.sqlcipher.**

# --- flutter_local_notifications --------------------------------------------
# Scheduled notifications are rehydrated from GSON-serialised JSON held by the
# OS across reboots. The generic signatures must survive or every pending
# reminder fails to deserialise after an update.
-keep class com.dexterous.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn com.dexterous.**

# --- Our own platform-channel surface ---------------------------------------
# Referenced from the manifest and from Dart by name, never from Kotlin code
# R8 can trace.
-keep class com.khazana.app.MainActivity { *; }
-keep class com.khazana.app.KhazanaNotificationListener { *; }
-keep class com.khazana.app.CaptureBus { *; }

# --- Play Core ---------------------------------------------------------------
# Flutter's deferred-components hooks reference these even when the app uses no
# deferred components; without the -dontwarn the release build fails on missing
# classes we deliberately do not ship.
-dontwarn com.google.android.play.core.**

# --- Keep line numbers for crash triage -------------------------------------
# We ship no telemetry, so the only crash report we ever see is the one a user
# exports from Settings by hand. That log is worth far more with line numbers
# than the few KB it costs.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
