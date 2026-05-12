import AppKit
import WebKit

final class DetexifyPanelController: NSObject, WKScriptMessageHandler, WKNavigationDelegate, NSWindowDelegate {
    private var panel: NSPanel?
    private var webView: WKWebView?
    private let schemeHandler = WebAppSchemeHandler()
    private var pendingAutoClose: DispatchWorkItem?

    var isVisible: Bool {
        panel?.isVisible ?? false
    }

    func show() {
        pendingAutoClose?.cancel()
        if panel == nil { createPanel() }
        guard let panel else { return }
        center(panel)
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func hide() {
        pendingAutoClose?.cancel()
        clearCanvas()
        panel?.orderOut(nil)
    }

    private func createPanel() {
        let contentRect = NSRect(x: 0, y: 0, width: 980, height: 720)
        let panel = NSPanel(
            contentRect: contentRect,
            styleMask: [.titled, .closable, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.title = ""
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.moveToActiveSpace, .fullScreenAuxiliary]
        panel.delegate = self
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.backgroundColor = .clear
        panel.isOpaque = false

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(schemeHandler, forURLScheme: "detexify")
        configuration.userContentController.addUserScript(consoleBridgeScript)
        configuration.userContentController.add(self, name: "detexifyNative")
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false

        let container = NSVisualEffectView(frame: contentRect)
        container.autoresizingMask = [.width, .height]
        container.material = .hudWindow
        container.blendingMode = .behindWindow
        container.state = .active

        let webView = WKWebView(frame: contentRect, configuration: configuration)
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        container.addSubview(webView)
        panel.contentView = container

        self.panel = panel
        self.webView = webView
        loadWebApp()
    }

    private func loadWebApp() {
        guard let webView else { return }
        webView.load(URLRequest(url: URL(string: "detexify://app/index.html")!))
    }

    private func center(_ panel: NSPanel) {
        guard let screen = NSScreen.main else { return }
        let frame = panel.frame
        let visible = screen.visibleFrame
        panel.setFrameOrigin(NSPoint(
            x: visible.midX - frame.width / 2,
            y: visible.midY - frame.height / 2
        ))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "detexifyNative" else { return }
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }

        switch type {
        case "copy":
            if let text = body["text"] as? String { copy(text) }
        case "hide":
            hide()
        case "console":
            let level = body["level"] as? String ?? "log"
            let text = body["text"] as? String ?? ""
            print("WKWebView console[\(level)]: \(text)")
        default:
            break
        }
    }

    private func clearCanvas() {
        webView?.evaluateJavaScript("window.postMessage({ type: 'clear' }, '*')")
    }

    private func copy(_ text: String) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)

        if AppSettings.autoCloseOnCopy {
            pendingAutoClose?.cancel()
            let workItem = DispatchWorkItem { [weak self] in
                self?.clearCanvas()
                self?.panel?.orderOut(nil)
            }
            pendingAutoClose = workItem
            // Let the in-panel copied pill be the confirmation. It matches the
            // app design and avoids a second, native-looking HUD competing with it.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.95, execute: workItem)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("WKWebView loaded: \(webView.url?.absoluteString ?? "unknown")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("WKWebView navigation failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("WKWebView provisional navigation failed: \(error.localizedDescription)")
    }

    func windowWillClose(_ notification: Notification) {
        clearCanvas()
    }
}

private let consoleBridgeScript = WKUserScript(
    source: """
    (() => {
      const send = (level, args) => {
        try {
          window.webkit.messageHandlers.detexifyNative.postMessage({
            type: 'console',
            level,
            text: Array.from(args).map((arg) => {
              try { return typeof arg === 'string' ? arg : JSON.stringify(arg); }
              catch { return String(arg); }
            }).join(' ')
          });
        } catch {}
      };
      for (const level of ['log', 'info', 'warn', 'error']) {
        const original = console[level];
        console[level] = (...args) => { send(level, args); original.apply(console, args); };
      }
      window.addEventListener('error', (event) => send('error', [event.message, event.filename, event.lineno]));
      window.addEventListener('unhandledrejection', (event) => send('error', ['unhandledrejection', String(event.reason)]));
    })();
    """,
    injectionTime: .atDocumentStart,
    forMainFrameOnly: false
)
