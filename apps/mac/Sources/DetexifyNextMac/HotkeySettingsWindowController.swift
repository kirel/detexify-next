import AppKit
import KeyboardShortcuts

final class HotkeySettingsWindowController: NSWindowController {
    static let shared = HotkeySettingsWindowController()

    private init() {
        let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 460, height: 220))

        let title = NSTextField(labelWithString: "Global hotkey")
        title.font = .boldSystemFont(ofSize: 16)
        title.translatesAutoresizingMaskIntoConstraints = false

        let subtitle = NSTextField(labelWithString: "Use this shortcut to show or hide Detexify Next.")
        subtitle.textColor = .secondaryLabelColor
        subtitle.translatesAutoresizingMaskIntoConstraints = false

        let recorder = KeyboardShortcuts.RecorderCocoa(for: .toggleDetexify)
        recorder.translatesAutoresizingMaskIntoConstraints = false

        let autoCloseCheckbox = NSButton(checkboxWithTitle: "Auto-close after copying", target: nil, action: nil)
        autoCloseCheckbox.translatesAutoresizingMaskIntoConstraints = false
        autoCloseCheckbox.state = AppSettings.autoCloseOnCopy ? .on : .off

        let autoCloseHint = NSTextField(labelWithString: "When enabled, the in-window copied confirmation appears briefly, then the drawing window closes.")
        autoCloseHint.textColor = .secondaryLabelColor
        autoCloseHint.maximumNumberOfLines = 2
        autoCloseHint.translatesAutoresizingMaskIntoConstraints = false

        contentView.addSubview(title)
        contentView.addSubview(subtitle)
        contentView.addSubview(recorder)
        contentView.addSubview(autoCloseCheckbox)
        contentView.addSubview(autoCloseHint)

        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 24),
            title.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -24),
            title.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 24),

            subtitle.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            subtitle.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 8),

            recorder.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            recorder.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 18),

            autoCloseCheckbox.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            autoCloseCheckbox.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            autoCloseCheckbox.topAnchor.constraint(equalTo: recorder.bottomAnchor, constant: 24),

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
    }

    @objc private func autoCloseChanged(_ sender: NSButton) {
        AppSettings.autoCloseOnCopy = sender.state == .on
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}
