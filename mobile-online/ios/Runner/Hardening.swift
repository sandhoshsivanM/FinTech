import Flutter
import UIKit
import Security
import MachO

/// Native side of lib/security: Secure Enclave device key, jailbreak/tamper
/// probes, and app-switcher / screen-capture cover. Channel names and finding
/// names match the Dart side.
final class Hardening {
  private let cover = ScreenCover()

  func register(with messenger: FlutterBinaryMessenger) {
    FlutterMethodChannel(name: "khazana/device_key", binaryMessenger: messenger)
      .setMethodCallHandler { call, result in SecureEnclaveKey.handle(call, result) }
    FlutterMethodChannel(name: "khazana/integrity", binaryMessenger: messenger)
      .setMethodCallHandler { call, result in
        call.method == "check" ? result(IntegrityProbe.check()) : result(FlutterMethodNotImplemented)
      }
    FlutterMethodChannel(name: "khazana/screen", binaryMessenger: messenger)
      .setMethodCallHandler { call, result in
        // The cover is always on; acquire/release exist for parity with Android.
        switch call.method {
        case "acquire", "release": result(nil)
        default: result(FlutterMethodNotImplemented)
        }
      }
    cover.start()
  }
}

// MARK: Secure Enclave key (P-256, non-exportable)

enum SecureEnclaveKey {
  private static func tag(_ alias: String) -> Data { Data(alias.utf8) }

  private static func load(_ alias: String) -> SecKey? {
    let q: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: tag(alias),
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecReturnRef as String: true,
    ]
    var item: CFTypeRef?
    return SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess ? (item as! SecKey) : nil
  }

  private static func point(_ priv: SecKey) -> Data? {
    guard let pub = SecKeyCopyPublicKey(priv),
          let data = SecKeyCopyExternalRepresentation(pub, nil) as Data? else { return nil }
    return data // 0x04 || X || Y
  }

  static func handle(_ call: FlutterMethodCall, _ result: FlutterResult) {
    let args = call.arguments as? [String: Any]
    let alias = args?["alias"] as? String
    switch call.method {
    case "level":
      result(isSimulator ? "none" : "secure_enclave")
    case "publicKey":
      guard let alias = alias, let key = load(alias), let p = point(key) else { return result(nil) }
      result(FlutterStandardTypedData(bytes: p))
    case "create":
      guard let alias = alias else { return result(FlutterError(code: "args", message: nil, details: nil)) }
      if isSimulator {
        return result(FlutterError(code: "unavailable", message: "no Secure Enclave on the simulator", details: nil))
      }
      let del: [String: Any] = [kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: tag(alias)]
      SecItemDelete(del as CFDictionary)
      var err: Unmanaged<CFError>?
      // Usable only while the device is unlocked, never migrates to another
      // device or a backup. Biometric gating is NOT set here (every request is
      // signed); step-up for sensitive actions is a separate key (see PR notes).
      guard let access = SecAccessControlCreateWithFlags(
        nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, .privateKeyUsage, &err) else {
        return result(FlutterError(code: "unavailable", message: "access control", details: nil))
      }
      let attrs: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs as String: [
          kSecAttrIsPermanent as String: true,
          kSecAttrApplicationTag as String: tag(alias),
          kSecAttrAccessControl as String: access,
        ],
      ]
      guard let key = SecKeyCreateRandomKey(attrs as CFDictionary, &err), let p = point(key) else {
        return result(FlutterError(code: "unavailable", message: "Secure Enclave refused the key", details: nil))
      }
      result(["publicKey": FlutterStandardTypedData(bytes: p), "level": "secure_enclave"])
    case "sign":
      guard let alias = alias, let key = load(alias),
            let msg = (args?["message"] as? FlutterStandardTypedData)?.data else {
        return result(FlutterError(code: "unavailable", message: "no key", details: nil))
      }
      var err: Unmanaged<CFError>?
      guard let sig = SecKeyCreateSignature(key, .ecdsaSignatureMessageX962SHA256, msg as CFData, &err) as Data? else {
        return result(FlutterError(code: "keychain", message: "sign failed", details: nil))
      }
      result(FlutterStandardTypedData(bytes: sig)) // DER
    case "delete":
      if let alias = alias {
        let del: [String: Any] = [kSecClass as String: kSecClassKey, kSecAttrApplicationTag as String: tag(alias)]
        SecItemDelete(del as CFDictionary)
      }
      result(nil)
    default:
      result(FlutterMethodNotImplemented)
    }
  }
}

var isSimulator: Bool {
  #if targetEnvironment(simulator)
  return true
  #else
  return false
  #endif
}

// MARK: Jailbreak / tamper probes (heuristic; server attestation is the arbiter)

enum IntegrityProbe {
  static func check() -> [String] {
    var found: [String] = []
    if jailbroken() { found.append("rooted") }
    if debuggerAttached() { found.append("debuggerAttached") }
    if hooked() { found.append("hookingFramework") }
    if isSimulator { found.append("emulator") }
    return found
  }

  private static func jailbroken() -> Bool {
    if isSimulator { return false }
    let paths = [
      "/Applications/Cydia.app", "/Applications/Sileo.app", "/Applications/Zebra.app",
      "/Library/MobileSubstrate/MobileSubstrate.dylib", "/bin/bash", "/usr/sbin/sshd", "/etc/apt",
      "/private/var/lib/apt/", "/usr/libexec/sftp-server", "/var/jb", "/usr/bin/ssh",
    ]
    if paths.contains(where: { FileManager.default.fileExists(atPath: $0) }) { return true }
    // A sandboxed app cannot write outside its container.
    let probe = "/private/khazana_\(UUID().uuidString)"
    do {
      try "x".write(toFile: probe, atomically: true, encoding: .utf8)
      try? FileManager.default.removeItem(atPath: probe)
      return true
    } catch { return false }
  }

  private static func debuggerAttached() -> Bool {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    guard sysctl(&mib, 4, &info, &size, nil, 0) == 0 else { return true } // cannot tell: assume yes
    return (info.kp_proc.p_flag & P_TRACED) != 0
  }

  private static func hooked() -> Bool {
    if getenv("DYLD_INSERT_LIBRARIES") != nil { return true }
    let needles = ["frida", "substrate", "substitute", "libhooker", "cycript", "ellekit"]
    for i in 0..<_dyld_image_count() {
      guard let name = _dyld_get_image_name(i) else { continue }
      let n = String(cString: name).lowercased()
      if needles.contains(where: { n.contains($0) }) { return true }
    }
    return false
  }
}

// MARK: Cover in the app switcher, and while recording / mirroring

final class ScreenCover {
  private var cover: UIView?

  func start() {
    let nc = NotificationCenter.default
    nc.addObserver(self, selector: #selector(show), name: UIApplication.willResignActiveNotification, object: nil)
    nc.addObserver(self, selector: #selector(refresh), name: UIApplication.didBecomeActiveNotification, object: nil)
    nc.addObserver(self, selector: #selector(refresh), name: UIScreen.capturedDidChangeNotification, object: nil)
  }

  private var window: UIWindow? {
    UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.windows.first { $0.isKeyWindow } }.first
  }

  @objc private func show() {
    guard cover == nil, let w = window else { return }
    let blur = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
    blur.frame = w.bounds
    blur.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    w.addSubview(blur)
    cover = blur
  }

  @objc private func refresh() {
    // Stay covered while the screen is being recorded or mirrored.
    if UIScreen.main.isCaptured { show(); return }
    cover?.removeFromSuperview()
    cover = nil
  }
}
