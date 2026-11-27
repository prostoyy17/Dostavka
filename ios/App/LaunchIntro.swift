import SwiftUI

struct LaunchIntro: View {
    @State private var shop: Shop?
    @State private var failed = false
    @State private var attempt = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showing = true
    @State private var unfolded = false

    var body: some View {
        ZStack {
            if let shop { Market(shop: shop).accessibilityHidden(showing) }
            if showing {
                ZStack {
                    LinearGradient(colors: [Color(hex: "001746"), Color(hex: "073BC2")],
                                   startPoint: .topLeading, endPoint: .bottomTrailing).ignoresSafeArea()
                    ForEach(0..<3) { i in
                        RoundedRectangle(cornerRadius: 44)
                            .stroke(.white.opacity(0.22 - Double(i) * 0.05), lineWidth: 1.5)
                            .frame(width: 146, height: 146)
                            .scaleEffect(unfolded ? CGFloat(i + 2) * 1.45 : 0.65)
                            .rotationEffect(.degrees(unfolded ? Double(i * 15 + 8) : -16))
                    }
                    VStack(spacing: 16) {
                        Image("LaunchMark").resizable().frame(width: 76, height: 76)
                            .clipShape(RoundedRectangle(cornerRadius: 22))
                            .shadow(color: .black.opacity(0.2), radius: 18, y: 8)
                        Text("MayrMarket").font(.system(size: 28, weight: .heavy, design: .rounded)).foregroundStyle(.white)
                        if failed {
                            Text("Не удалось открыть каталог").foregroundStyle(.white)
                            Button("Повторить") { attempt += 1 }.buttonStyle(.borderedProminent)
                        }
                    }.scaleEffect(unfolded || reduceMotion ? 1 : 0.90)
                }.transition(.opacity)
            }
        }.task(id: attempt) {
            guard showing else { return }
            failed = false
            let loading = Task.detached(priority: .userInitiated) { try Shop.startupCatalog() }
            // Present the initial frame before unfolding the rings.
            try? await Task.sleep(for: .milliseconds(90))
            if !reduceMotion {
                withAnimation(.easeInOut(duration: 1.1)) { unfolded = true }
            }
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 100 : 1250))
            do {
                let snapshot = try await loading.value
                guard !Task.isCancelled else { return }
                shop = Shop(snapshot: snapshot)
                withAnimation(.easeOut(duration: 0.28)) { showing = false }
            } catch { failed = true }
        }
    }
}
