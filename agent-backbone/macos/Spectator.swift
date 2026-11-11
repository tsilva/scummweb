import AppKit
import WebKit

func emit(_ payload: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: payload) {
        FileHandle.standardOutput.write(data + Data([10]))
    }
}

final class Spectator: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var titleObservation: NSKeyValueObservation?
    var lastGameSize: NSSize?
    var footerHeight: Double = 24
    let viewerURL: URL
    let width: Double
    let height: Double

    init(url: URL, width: Double, height: Double) {
        self.viewerURL = url
        self.width = width
        self.height = height
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let iconURL = Bundle.main.url(forResource: "AgentSCUMM", withExtension: "icns"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }

        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu(title: "AgentSCUMM")
        appMenu.addItem(withTitle: "Hide AgentSCUMM", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit AgentSCUMM", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let windowItem = NSMenuItem()
        menu.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        NSApp.mainMenu = menu
        NSApp.windowsMenu = windowMenu

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "gameSize")
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "AgentSCUMM"
        titleObservation = webView.observe(\.title, options: [.initial, .new]) { [weak self] view, _ in
            self?.window.title = view.title.flatMap { $0.isEmpty ? nil : $0 } ?? "AgentSCUMM"
        }
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.contentMinSize = NSSize(width: 320, height: 320 * height / width + footerHeight)
        window.backgroundColor = .black
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        webView.load(URLRequest(url: viewerURL))

        // A crashed/killed MCP parent must not leave an orphan spectator behind.
        FileHandle.standardInput.readabilityHandler = { handle in
            if handle.availableData.isEmpty {
                handle.readabilityHandler = nil
                DispatchQueue.main.async { NSApp.terminate(nil) }
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "gameSize", message.frameInfo.isMainFrame,
              message.frameInfo.request.url == viewerURL,
              let size = message.body as? [String: Double],
              let width = size["width"], let height = size["height"],
              width.isFinite, height.isFinite, (1...1920).contains(width), (1...1920).contains(height) else { return }
        let ratio = width / height
        let gameSize = NSSize(width: width, height: height)
        if lastGameSize != gameSize {
            footerHeight = min(max(size["footerHeight"] ?? 24, 0), 100)
            lastGameSize = gameSize
            window.contentMinSize = NSSize(width: 320, height: 320 / ratio + footerHeight)
            let available = window.screen?.visibleFrame.size ?? NSSize(width: 1920, height: 1080)
            let titleHeight = window.frame.height - window.contentView!.bounds.height
            let targetWidth = min(window.contentView!.bounds.width, available.width, (available.height - titleHeight - footerHeight) * ratio)
            window.setContentSize(NSSize(width: targetWidth, height: targetWidth / ratio + footerHeight))
            if let visible = window.screen?.visibleFrame {
                let frame = window.frame
                window.setFrameOrigin(NSPoint(x: min(max(frame.minX, visible.minX), visible.maxX - frame.width),
                                              y: min(max(frame.minY, visible.minY), visible.maxY - frame.height)))
            }
            emit(["event": "geometry", "gameWidth": width, "gameHeight": height,
                  "contentWidth": webView.bounds.width, "contentHeight": webView.bounds.height, "footerHeight": footerHeight])
        }
    }

    func windowWillResize(_ sender: NSWindow, to frameSize: NSSize) -> NSSize {
        guard let game = lastGameSize else { return frameSize }
        let ratio = game.width / game.height
        var content = sender.contentRect(forFrameRect: NSRect(origin: .zero, size: frameSize)).size
        let current = webView.bounds.size
        if abs(content.width - current.width) >= abs(content.height - current.height) * ratio {
            content.height = content.width / ratio + footerHeight
        } else {
            content.width = max(1, content.height - footerHeight) * ratio
        }
        return sender.frameRect(forContentRect: NSRect(origin: .zero, size: content)).size
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url == viewerURL ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        emit(["event": "ready", "bundleIdentifier": Bundle.main.bundleIdentifier ?? "",
              "activationPolicy": NSApp.activationPolicy().rawValue,
              "iconLoaded": Bundle.main.url(forResource: "AgentSCUMM", withExtension: "icns")
                .flatMap { NSImage(contentsOf: $0) } != nil])
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        emit(["event": "error", "message": error.localizedDescription])
        NSApp.terminate(nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        emit(["event": "error", "message": error.localizedDescription])
        NSApp.terminate(nil)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        emit(["event": "error", "message": "Spectator renderer exited"])
        NSApp.terminate(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let arguments = CommandLine.arguments
guard arguments.count == 4,
      let url = URL(string: arguments[1]), url.scheme == "http", url.host == "127.0.0.1",
      url.port != nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
      url.path.range(of: "^/[0-9a-f]{48}/?$", options: .regularExpression) != nil,
      let width = Double(arguments[2]), let height = Double(arguments[3]),
      (320...1920).contains(width), (320...2100).contains(height) else {
    fputs("AgentSCUMM is opened by the MCP server's session tool (start or open_viewer).\n", stderr)
    exit(1)
}
let app = NSApplication.shared
let spectator = Spectator(url: url, width: width, height: height)
app.delegate = spectator
app.run()
