import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing material. `key.properties` holds the keystore path and
// passwords and is gitignored — it never enters the repo, and neither does the
// .jks it points at. When it is absent (CI without secrets, a fresh clone, any
// contributor) the release build falls back to debug signing so `flutter run
// --release` still works locally; it just produces something Play will refuse,
// which is the correct failure.
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val hasReleaseKeystore = keystoreProperties.getProperty("storeFile") != null

android {
    namespace = "com.khazana.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        // Required by flutter_local_notifications.
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.khazana.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }

            // R8 full mode. Without it the APK was 77 MB, which on Indian
            // networks is itself a conversion problem before anyone has seen a
            // screen. shrinkResources needs minify on to do anything.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    // One APK per ABI, for sideload and direct distribution only.
    //
    // Explicitly OFF for bundle builds. An App Bundle already carries every ABI
    // and Play splits it per device at install time, so doing both makes the
    // resource shrinker emit one shrunk-resources archive per ABI and the
    // bundle task fails outright with "Multiple shrunk-resources files found"
    // (issuetracker.google.com/402800800). The store artifact is the AAB; these
    // splits exist for the APK we hand a tester.
    val isBundleBuild = gradle.startParameter.taskNames.any {
        it.contains("Bundle", ignoreCase = true)
    }
    splits {
        abi {
            isEnable = !isBundleBuild
            reset()
            include("armeabi-v7a", "arm64-v8a", "x86_64")
            isUniversalApk = true
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
