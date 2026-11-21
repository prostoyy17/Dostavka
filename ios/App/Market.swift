import UIKit
import WebKit

@main
final class MayrMarket: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = MarketScene.self
        return configuration
    }
}

final class MarketScene: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = Storefront()
        window.makeKeyAndVisible()
        self.window = window
    }
}

final class Storefront: UIViewController, WKNavigationDelegate {
    private let storefront = URL(string: "https://prostoyy17.github.io/Dostavka/")!
    private let browser = WKWebView()
    private var backgroundObservation: NSKeyValueObservation?
    private var darkBackground = false

    override var preferredStatusBarStyle: UIStatusBarStyle { darkBackground ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 238/255, green: 237/255, blue: 232/255, alpha: 1)
        browser.navigationDelegate = self
        browser.allowsBackForwardNavigationGestures = true
        browser.scrollView.contentInsetAdjustmentBehavior = .never
        browser.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(browser)
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            browser.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            browser.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        backgroundObservation = browser.observe(\.underPageBackgroundColor, options: [.new]) { [weak self] webView, _ in
            guard let self, let color = webView.underPageBackgroundColor else { return }
            self.view.backgroundColor = color
            var brightness: CGFloat = 1
            color.getHue(nil, saturation: nil, brightness: &brightness, alpha: nil)
            self.darkBackground = brightness < 0.5
            self.setNeedsStatusBarAppearanceUpdate()
        }
        loadStore()
    }

    private func loadStore() { browser.load(URLRequest(url: storefront)) }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard action.targetFrame?.isMainFrame != false, let url = action.request.url else {
            decisionHandler(.allow)
            return
        }
        if url.scheme == storefront.scheme && url.host == storefront.host && url.path.hasPrefix(storefront.path) {
            if action.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(action.request)
            } else { decisionHandler(.allow) }
        } else {
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, ["http", "https", "tel", "mailto"].contains(url.scheme ?? "") {
                UIApplication.shared.open(url)
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled, presentedViewController == nil else { return }
        let alert = UIAlertController(title: "Магазин недоступен", message: "Проверьте подключение к интернету.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Повторить", style: .default) { [weak self] _ in self?.loadStore() })
        present(alert, animated: true)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    #if DEBUG && targetEnvironment(simulator)
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView.url?.host == storefront.host,
              let script = ProcessInfo.processInfo.environment["MAYR_WALKTHROUGH"] else { return }
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, contentWorld: .page) { result in
            let output: String
            switch result {
            case .success(let value): output = value as? String ?? "Missing recording result"
            case .failure(let error): output = String(describing: error)
            }
            try? output.write(to: URL.documentsDirectory.appending(path: "walkthrough.json"), atomically: true, encoding: .utf8)
        }
    }
    #endif
}
