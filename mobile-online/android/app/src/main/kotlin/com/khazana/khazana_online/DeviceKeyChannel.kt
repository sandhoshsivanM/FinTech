package com.khazana.khazana_online

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.ProviderException
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

/**
 * The DPoP device key, generated and kept inside Android Keystore: StrongBox
 * (dedicated secure element) when the device has one, else the TEE. The private
 * key is non-exportable; Dart gets only the public point and signatures.
 * There is deliberately NO software-key path in this file: if the Keystore key
 * is not hardware-backed we refuse it ("unavailable") and Dart decides, visibly.
 */
class DeviceKeyChannel(messenger: BinaryMessenger) : MethodChannel.MethodCallHandler {
    init {
        MethodChannel(messenger, "khazana/device_key").setMethodCallHandler(this)
    }

    private val ks: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "level" -> result.success(if (hasStrongBox()) "strongbox" else "tee")
                "publicKey" -> result.success(publicPoint(call.argument<String>("alias")!!))
                "create" -> {
                    val alias = call.argument<String>("alias")!!
                    val (point, level) = create(alias)
                    result.success(mapOf("publicKey" to point, "level" to level))
                }
                "sign" -> result.success(sign(call.argument<String>("alias")!!, call.argument<ByteArray>("message")!!))
                "delete" -> {
                    ks.deleteEntry(call.argument<String>("alias")!!)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        } catch (e: Unavailable) {
            result.error("unavailable", e.message, null)
        } catch (e: Exception) {
            result.error("keystore", e.javaClass.simpleName, null) // no key material in messages
        }
    }

    private class Unavailable(msg: String) : Exception(msg)

    private fun hasStrongBox(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
            appContext?.packageManager?.hasSystemFeature("android.hardware.strongbox_keystore") == true

    companion object {
        var appContext: android.content.Context? = null
    }

    private fun spec(alias: String, strongBox: Boolean): KeyGenParameterSpec {
        val b = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) b.setIsStrongBoxBacked(true)
        return b.build()
    }

    private fun generate(alias: String, strongBox: Boolean) {
        val g = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        g.initialize(spec(alias, strongBox))
        g.generateKeyPair()
    }

    private fun create(alias: String): Pair<ByteArray, String> {
        ks.deleteEntry(alias)
        var level = "strongbox"
        try {
            if (!hasStrongBox()) throw StrongBoxUnavailableException("no strongbox")
            generate(alias, true)
        } catch (e: StrongBoxUnavailableException) {
            level = "tee"
            generate(alias, false)
        } catch (e: ProviderException) {
            // Some devices throw a generic ProviderException when StrongBox is absent.
            level = "tee"
            generate(alias, false)
        }
        if (!isHardwareBacked(alias)) {
            ks.deleteEntry(alias)
            throw Unavailable("keystore key is not hardware-backed")
        }
        return Pair(publicPoint(alias)!!, level)
    }

    private fun isHardwareBacked(alias: String): Boolean {
        val key = ks.getKey(alias, null) as? PrivateKey ?: return false
        val info = java.security.KeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
            .getKeySpec(key, android.security.keystore.KeyInfo::class.java)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            info.securityLevel != KeyProperties.SECURITY_LEVEL_SOFTWARE
        } else {
            @Suppress("DEPRECATION")
            info.isInsideSecureHardware
        }
    }

    private fun publicPoint(alias: String): ByteArray? {
        val cert = ks.getCertificate(alias) ?: return null
        val pub = cert.publicKey as ECPublicKey
        fun fixed(v: java.math.BigInteger): ByteArray {
            val raw = v.toByteArray().let { if (it.size > 32 && it[0] == 0.toByte()) it.copyOfRange(1, it.size) else it }
            return ByteArray(32 - raw.size) + raw
        }
        return byteArrayOf(4) + fixed(pub.w.affineX) + fixed(pub.w.affineY)
    }

    private fun sign(alias: String, message: ByteArray): ByteArray {
        val key = ks.getKey(alias, null) as? PrivateKey ?: throw Unavailable("no key")
        return Signature.getInstance("SHA256withECDSA").run {
            initSign(key)
            update(message)
            sign() // DER
        }
    }
}
