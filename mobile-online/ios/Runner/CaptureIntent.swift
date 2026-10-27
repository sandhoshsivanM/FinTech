// "Add bank SMS to Khazana": an App Intent for a Shortcuts Personal Automation
// on "Message received", so bank SMS reaches Khazana on iPhone (which has no SMS
// API). The message text is held in memory only: it is handed to a short-lived
// headless Flutter engine, parsed by the shared Dart parser, and dropped. Only
// the parsed amount, date and merchant are stored (in the Keychain, by Dart).
// Never log or persist `message` here.
import AppIntents
import Flutter

private let channelName = "khazana_online/capture_intent"
private let entrypoint = "captureIntentMain"
private let entryLibrary = "package:khazana_online/capture/shortcut_entry.dart"

/// Runs one parse at a time (two messages can arrive together) and gives up
/// after 20 seconds so an automation can never hang.
@MainActor
final class CaptureBridge {
  static let shared = CaptureBridge()
  private var busy = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  private func acquire() async {
    if !busy { busy = true; return }
    await withCheckedContinuation { waiters.append($0) }
  }

  private func release() {
    if waiters.isEmpty { busy = false } else { waiters.removeFirst().resume() }
  }

  /// Returns "added", "duplicate", "ignored" or "error".
  func ingest(text: String) async -> String {
    await acquire()
    defer { release() }

    let engine = FlutterEngine(name: "khazana_capture_intent", project: nil, allowHeadlessExecution: true)
    var pending: String? = text
    var finished = false

    return await withCheckedContinuation { (cont: CheckedContinuation<String, Never>) in
      func finish(_ result: String) {
        if finished { return }
        finished = true
        pending = nil
        engine.destroyContext()
        cont.resume(returning: result)
      }

      let channel = FlutterMethodChannel(name: channelName, binaryMessenger: engine.binaryMessenger)
      channel.setMethodCallHandler { call, reply in
        switch call.method {
        case "take":
          reply(pending.map { ["text": $0] })
          pending = nil
        case "done":
          reply(nil)
          let args = call.arguments as? [String: Any]
          finish(args?["result"] as? String ?? "error")
        default:
          reply(FlutterMethodNotImplemented)
        }
      }

      guard engine.run(withEntrypoint: entrypoint, libraryURI: entryLibrary) else {
        finish("error")
        return
      }
      GeneratedPluginRegistrant.register(with: engine)

      DispatchQueue.main.asyncAfter(deadline: .now() + 20) { finish("error") }
    }
  }
}

struct AddBankSmsIntent: AppIntent {
  static var title: LocalizedStringResource = "Add bank SMS to Khazana"
  static var description = IntentDescription(
    "Reads a bank message on this iPhone and adds it to your Khazana review inbox. Only the amount, date and merchant are kept."
  )
  // Runs in the background: the automation never opens the app.
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Message", description: "The text of the bank SMS")
  var message: String

  static var parameterSummary: some ParameterSummary {
    Summary("Add \(\.$message) to Khazana")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let result = await CaptureBridge.shared.ingest(text: message)
    switch result {
    case "added": return .result(dialog: "Added to your Khazana review inbox.")
    case "duplicate": return .result(dialog: "Already in Khazana.")
    case "ignored": return .result(dialog: "Not a bank transaction. Skipped.")
    default: return .result(dialog: "Khazana could not read that message.")
    }
  }
}

struct KhazanaShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddBankSmsIntent(),
      phrases: ["Add bank SMS to \(.applicationName)"],
      shortTitle: "Add bank SMS",
      systemImageName: "tray.and.arrow.down"
    )
  }
}
