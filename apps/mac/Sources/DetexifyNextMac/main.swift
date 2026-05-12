import AppKit
import KeyboardShortcuts

extension KeyboardShortcuts.Name {
    static let toggleDetexify = Self("toggleDetexify", default: .init(.space, modifiers: [.option, .command]))
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
