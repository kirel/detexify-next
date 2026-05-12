import Foundation
import WebKit

final class WebAppSchemeHandler: NSObject, WKURLSchemeHandler {
    private let rootURL: URL?

    override init() {
        self.rootURL = Bundle.module.url(forResource: "WebApp", withExtension: nil, subdirectory: "Resources")
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            fail(urlSchemeTask, "Missing request URL")
            return
        }

        guard let rootURL else {
            fail(urlSchemeTask, "Bundled WebApp resource directory was not found")
            return
        }

        let relativePath = sanitizedPath(for: requestURL)
        let fileURL = rootURL.appendingPathComponent(relativePath, isDirectory: false)

        do {
            let data = try Data(contentsOf: fileURL)
            let response = HTTPURLResponse(
                url: requestURL,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Content-Type": mimeType(for: fileURL.pathExtension),
                    "Content-Length": "\(data.count)",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-cache",
                ]
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            let body = "Not found: \(relativePath)".data(using: .utf8)!
            let response = HTTPURLResponse(
                url: requestURL,
                statusCode: 404,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "text/plain; charset=utf-8"]
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(body)
            urlSchemeTask.didFinish()
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // No streaming work to cancel.
    }

    private func sanitizedPath(for url: URL) -> String {
        let rawPath = url.path == "/" || url.path.isEmpty ? "/index.html" : url.path
        let parts = rawPath
            .split(separator: "/")
            .filter { $0 != "." && $0 != ".." }
        return parts.joined(separator: "/")
    }

    private func fail(_ task: WKURLSchemeTask, _ message: String) {
        let data = message.data(using: .utf8)!
        let response = HTTPURLResponse(
            url: task.request.url ?? URL(string: "detexify://app/error")!,
            statusCode: 500,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "text/plain; charset=utf-8"]
        )!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "svg": return "image/svg+xml"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        default: return "application/octet-stream"
        }
    }
}
