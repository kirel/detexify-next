import Foundation

enum AppSettings {
    static let autoCloseOnCopyKey = "autoCloseOnCopy"

    static var autoCloseOnCopy: Bool {
        get { UserDefaults.standard.bool(forKey: autoCloseOnCopyKey) }
        set { UserDefaults.standard.set(newValue, forKey: autoCloseOnCopyKey) }
    }
}
