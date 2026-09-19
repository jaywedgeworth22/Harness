import Cocoa
import WebKit

/// Tiny WKWebView shell so the Dock icon owns a real window.
/// Second Dock click focuses this window (GitHub.app pattern), instead of
/// spawning another Chrome --app instance.
private let harnessURLString =
    ProcessInfo.processInfo.environment["DSH_WEB_URL"] ?? "http://127.0.0.1:3080/"

private func pingHarness() -> Bool {
    guard let url = URL(string: harnessURLString) else { return false }
    // 8s: a 2s ping under CPU load false-negatives, then ensure-web.sh
    // pm2-restarts a healthy dsh-web and WebKit reports "Load failed".
    var req = URLRequest(url: url, timeoutInterval: 8)
    req.httpMethod = "GET"
    let sem = DispatchSemaphore(value: 0)
    var ok = false
    URLSession.shared.dataTask(with: req) { _, resp, _ in
        if let http = resp as? HTTPURLResponse, (200..<500).contains(http.statusCode) {
            ok = true
        }
        sem.signal()
    }.resume()
    _ = sem.wait(timeout: .now() + 8.5)
    return ok
}

private func ensureServer() {
    if pingHarness() { return }
    let script = NSHomeDirectory() + "/apps/harness-runtime/ensure-web.ts"
    guard FileManager.default.isExecutableFile(atPath: script) else { return }
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/bin/bash")
    proc.arguments = [script]
    proc.standardOutput = FileHandle.nullDevice
    proc.standardError = FileHandle.nullDevice
    try? proc.run()
    proc.waitUntilExit()
    for _ in 0..<20 {
        if pingHarness() { return }
        Thread.sleep(forTimeInterval: 0.4)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        ensureServer()
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let width = min(1280, screen.width * 0.88)
        let height = min(860, screen.height * 0.88)
        let rect = NSRect(
            x: screen.midX - width / 2,
            y: screen.midY - height / 2,
            width: width,
            height: height
        )
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Harness"
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.setFrameAutosaveName("DshHarnessMain")
        window.tabbingMode = .disallowed

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        webView = WKWebView(frame: window.contentView?.bounds ?? .zero, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        window.contentView = webView
        loadHarness()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }

    private func showWindow() {
        if pingHarness() {
            loadHarness()
        } else {
            ensureServer()
            loadHarness()
        }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func loadHarness() {
        guard let url = URL(string: harnessURLString) else { return }
        webView.load(URLRequest(url: url))
    }
}

private let heldDelegate = AppDelegate()

let app = NSApplication.shared
app.setActivationPolicy(.regular)
app.delegate = heldDelegate
app.run()
