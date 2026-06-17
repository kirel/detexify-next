import AppKit
import KeyboardShortcuts

final class HotkeySettingsWindowController: NSWindowController {
    static let shared = HotkeySettingsWindowController()

    private let recorder = HotkeyRecorderButton(for: .toggleDetexify)
    private let resetButton = NSButton(title: "Reset", target: nil, action: nil)
    private let clearButton = NSButton(title: "Clear", target: nil, action: nil)

    private init() {
        let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 460, height: 220))

        let title = NSTextField(labelWithString: "Global hotkey")
        title.font = .boldSystemFont(ofSize: 16)
        title.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = NSTextField(labelWithString: "Use this shortcut to show or hide Detexify Next.")
        subtitle.textColor = .secondaryLabelColor
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let hotkeyControls = NSStackView(views: [recorder, resetButton, clearButton])
        hotkeyControls.orientation = .horizontal
        hotkeyControls.alignment = .centerY
        hotkeyControls.spacing = 8
        hotkeyControls.translatesAutoresizingMaskIntoConstraints = false

        resetButton.translatesAutoresizingMaskIntoConstraints = false
        clearButton.translatesAutoresizingMaskIntoConstraints = false

        let autoCloseCheckbox = NSButton(checkboxWithTitle: "Auto-close after copying", target: nil, action: nil)
        autoCloseCheckbox.translatesAutoresizingMaskIntoConstraints = false
        autoCloseCheckbox.state = AppSettings.autoCloseOnCopy ? .on : .off

        let autoCloseHint = NSTextField(labelWithString: "When enabled, the in-window copied confirmation appears briefly, then the drawing window closes.")
        autoCloseHint.textColor = .secondaryLabelColor
        autoCloseHint.maximumNumberOfLines = 2
        autoCloseHint.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(title)
        contentView.addSubview(subtitle)
        contentView.addSubview(hotkeyControls)
        contentView.addSubview(autoCloseCheckbox)
        contentView.addSubview(autoCloseHint)

        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 24),
            title.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -24),
            title.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 24),

            subtitle.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            subtitle.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 8),

            hotkeyControls.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            hotkeyControls.trailingAnchor.constraint(lessThanOrEqualTo: title.trailingAnchor),
            hotkeyControls.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 18),
            recorder.widthAnchor.constraint(greaterThanOrEqualToConstant: 150),

            autoCloseCheckbox.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            autoCloseCheckbox.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            autoCloseCheckbox.topAnchor.constraint(equalTo: hotkeyControls.bottomAnchor, constant: 24),

            autoCloseHint.leadingAnchor.constraint(equalTo: title.leadingAnchor, constant: 18),
            autoCloseHint.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            autoCloseHint.topAnchor.constraint(equalTo: autoCloseCheckbox.bottomAnchor, constant: 4),
        ])

        let window = NSWindow(
            contentRect: contentView.frame,
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Detexify Next Settings"
        window.contentView = contentView
        window.center()

        super.init(window: window)

        autoCloseCheckbox.target = self
        autoCloseCheckbox.action = #selector(autoCloseChanged(_:))
        resetButton.target = self
        resetButton.action = #selector(resetHotkey)
        clearButton.target = self
        clearButton.action = #selector(clearHotkey)
    }

    override func showWindow(_ sender: Any?) {
        recorder.refresh()
        super.showWindow(sender)
    }

    @objc private func autoCloseChanged(_ sender: NSButton) {
        AppSettings.autoCloseOnCopy = sender.state == .on
    }

    @objc private func resetHotkey() {
        recorder.cancelRecording()
        KeyboardShortcuts.reset(.toggleDetexify)
        recorder.refresh()
    }

    @objc private func clearHotkey() {
        recorder.cancelRecording()
        KeyboardShortcuts.setShortcut(nil, for: .toggleDetexify)
        recorder.refresh()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
