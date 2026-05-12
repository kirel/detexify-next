import AppKit
import KeyboardShortcuts

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    private lazy var panelController = DetexifyPanelController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureStatusItem()
        KeyboardShortcuts.onKeyUp(for: .toggleDetexify) { [weak self] in
            self?.togglePanel()
        }
    }

    private func configureStatusItem() {
        statusItem.button?.title = "∂"
        statusItem.button?.target = self
        statusItem.button?.action = #selector(statusItemClicked)

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Open Detexify", action: #selector(openPanel), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings…", action: #selector(openHotkeySettings), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))
        for item in menu.items { item.target = self }
        statusItem.menu = menu
    }

    @objc private func statusItemClicked() {
        togglePanel()
    }

    @objc private func openPanel() {
        panelController.show()
    }

    private func togglePanel() {
        if panelController.isVisible {
            panelController.hide()
        } else {
            panelController.show()
        }
    }

    @objc private func openHotkeySettings() {
        HotkeySettingsWindowController.shared.showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
