import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    self.contentViewController = flutterViewController

    // Desktop-sized default window. The Flutter template reuses the nib frame,
    // which is phone-ish and made the app open as a narrow column. Matches the
    // Tauri desktop build's 1280x840 / 960x600 minimum.
    let defaultSize = NSSize(width: 1280, height: 840)
    self.setContentSize(defaultSize)
    self.contentMinSize = NSSize(width: 960, height: 600)
    self.center()

    RegisterGeneratedPlugins(registry: flutterViewController)

    super.awakeFromNib()
  }
}
