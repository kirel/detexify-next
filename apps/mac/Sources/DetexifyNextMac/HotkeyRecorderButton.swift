import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts

final class HotkeyRecorderButton: NSButton {
    private let shortcutName: KeyboardShortcuts.Name
    private var eventMonitor: Any?
    private var isRecording = false
    private var titleResetWorkItem: DispatchWorkItem?

    init(for shortcutName: KeyboardShortcuts.Name) {
        self.shortcutName = shortcutName
        super.init(frame: .zero)

        bezelStyle = .rounded
        setButtonType(.momentaryPushIn)
        target = self
        action = #selector(startRecording)
        translatesAutoresizingMaskIntoConstraints = false
        focusRingType = .default
        refresh()
    }

    deinit {
        stopMonitoring()
    }

    override var acceptsFirstResponder: Bool { true }

    func refresh() {
        titleResetWorkItem?.cancel()
        title = formattedShortcut(KeyboardShortcuts.getShortcut(for: shortcutName))
    }

    func cancelRecording() {
        guard isRecording else { return }
        isRecording = false
        stopMonitoring()
        KeyboardShortcuts.enable(shortcutName)
        refresh()
    }

    @objc private func startRecording() {
        titleResetWorkItem?.cancel()
        isRecording = true
        title = "Press shortcut"
        window?.makeFirstResponder(self)
        KeyboardShortcuts.disable(shortcutName)
        startMonitoring()
    }

    private func startMonitoring() {
        stopMonitoring()
        eventMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseDown, .rightMouseDown]) { [weak self] event in
            self?.handle(event)
        }
    }

    private func stopMonitoring() {
        if let eventMonitor {
            NSEvent.removeMonitor(eventMonitor)
            self.eventMonitor = nil
        }
    }

    private func handle(_ event: NSEvent) -> NSEvent? {
        guard isRecording else { return event }

        switch event.type {
        case .keyDown:
            return handleKeyDown(event)
        case .leftMouseDown, .rightMouseDown:
            if clickIsInsideButton(event) {
                return event
            }
            cancelRecording()
            return event
        default:
            return event
        }
    }

    private func handleKeyDown(_ event: NSEvent) -> NSEvent? {
        if event.keyCode == UInt16(kVK_Escape) {
            cancelRecording()
            return nil
        }

        guard
            let shortcut = KeyboardShortcuts.Shortcut(event: event),
            shortcut.modifiers.intersection(.deviceIndependentFlagsMask).isEmpty == false
        else {
            temporarilyShow("Use modifiers + key")
            return nil
        }

        KeyboardShortcuts.setShortcut(shortcut, for: shortcutName)
        isRecording = false
        stopMonitoring()
        KeyboardShortcuts.enable(shortcutName)
        refresh()
        return nil
    }

    private func clickIsInsideButton(_ event: NSEvent) -> Bool {
        guard let window else { return false }
        let pointInWindow = event.locationInWindow
        let pointInView = convert(pointInWindow, from: nil)
        return bounds.contains(pointInView) && event.window === window
    }

    private func temporarilyShow(_ message: String) {
        titleResetWorkItem?.cancel()
        title = message
        let workItem = DispatchWorkItem { [weak self] in
            guard let self, isRecording else { return }
            title = "Press shortcut"
        }
        titleResetWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: workItem)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

private func formattedShortcut(_ shortcut: KeyboardShortcuts.Shortcut?) -> String {
    guard let shortcut else { return "Not set" }
    return formattedModifiers(shortcut.modifiers) + formattedKey(carbonKeyCode: shortcut.carbonKeyCode)
}

private func formattedModifiers(_ modifiers: NSEvent.ModifierFlags) -> String {
    let flags = modifiers.intersection(.deviceIndependentFlagsMask)
    var result = ""
    if flags.contains(.control) { result += "⌃" }
    if flags.contains(.option) { result += "⌥" }
    if flags.contains(.shift) { result += "⇧" }
    if flags.contains(.command) { result += "⌘" }
    return result
}

private func formattedKey(carbonKeyCode: Int) -> String {
    switch carbonKeyCode {
    case kVK_Space:
        return "Space"
    case kVK_Return:
        return "Return"
    case kVK_Tab:
        return "Tab"
    case kVK_Escape:
        return "Esc"
    case kVK_Delete:
        return "Delete"
    case kVK_ForwardDelete:
        return "Forward Delete"
    case kVK_Home:
        return "Home"
    case kVK_End:
        return "End"
    case kVK_PageUp:
        return "Page Up"
    case kVK_PageDown:
        return "Page Down"
    case kVK_LeftArrow:
        return "←"
    case kVK_RightArrow:
        return "→"
    case kVK_UpArrow:
        return "↑"
    case kVK_DownArrow:
        return "↓"
    default:
        if let functionKey = functionKeyTitles[carbonKeyCode] {
            return functionKey
        }
        return characterForKeyCode(carbonKeyCode)?.uppercased() ?? "Key \(carbonKeyCode)"
    }
}

private let functionKeyTitles = [
    kVK_F1: "F1",
    kVK_F2: "F2",
    kVK_F3: "F3",
    kVK_F4: "F4",
    kVK_F5: "F5",
    kVK_F6: "F6",
    kVK_F7: "F7",
    kVK_F8: "F8",
    kVK_F9: "F9",
    kVK_F10: "F10",
    kVK_F11: "F11",
    kVK_F12: "F12",
    kVK_F13: "F13",
    kVK_F14: "F14",
    kVK_F15: "F15",
    kVK_F16: "F16",
    kVK_F17: "F17",
    kVK_F18: "F18",
    kVK_F19: "F19",
    kVK_F20: "F20",
]

private func characterForKeyCode(_ keyCode: Int) -> String? {
    guard
        let source = TISCopyCurrentASCIICapableKeyboardLayoutInputSource()?.takeRetainedValue(),
        let layoutDataPointer = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData)
    else {
        return nil
    }

    let layoutData = unsafeBitCast(layoutDataPointer, to: CFData.self)
    let keyboardLayout = unsafeBitCast(CFDataGetBytePtr(layoutData), to: UnsafePointer<UCKeyboardLayout>.self)
    var deadKeyState: UInt32 = 0
    var characters = [UniChar](repeating: 0, count: 4)
    var length = 0

    let status = UCKeyTranslate(
        keyboardLayout,
        UInt16(keyCode),
        UInt16(kUCKeyActionDisplay),
        0,
        UInt32(LMGetKbdType()),
        OptionBits(kUCKeyTranslateNoDeadKeysBit),
        &deadKeyState,
        characters.count,
        &length,
        &characters
    )

    guard status == noErr, length > 0 else { return nil }
    return String(utf16CodeUnits: characters, count: length)
}
