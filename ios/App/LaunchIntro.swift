import SwiftUI

struct LaunchIntro<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showing = true
    @State private var unfolded = false

    var body: some View {
        ZStack {
            content().accessibilityHidden(showing)
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
                        Text("MayrMarket").font(type(28, 800)).foregroundStyle(.white)
                    }.scaleEffect(unfolded || reduceMotion ? 1 : 0.90)
                }.accessibilityLabel("MayrMarket").transition(.opacity)
            }
        }.task {
            guard showing else { return }
            if !reduceMotion {
                withAnimation(.easeOut(duration: 1.05)) { unfolded = true }
            }
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 180 : 1100))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.22)) { showing = false }
        }
    }
}
