import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Required for local notifications to present while Khazana is in the
    // foreground, and for a tap to route back into the app at all. Without it
    // iOS silently swallows both. Set before the registrant so the plugin sees
    // a delegate already in place.
    //
    // Note there is no UIBackgroundModes entry in Info.plist and there should
    // not be: nothing runs in the background here. Reminders are handed to
    // UNUserNotificationCenter in advance and fired by the OS, and an unused
    // background mode is an App Review question with no good answer.
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate =
        self as? UNUserNotificationCenterDelegate
    }
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
