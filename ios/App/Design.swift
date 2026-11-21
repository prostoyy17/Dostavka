import SwiftUI
extension Color {
    init(hex: String) {
        let n = Int(hex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0
        self.init(red: Double(n >> 16) / 255, green: Double((n >> 8) & 255) / 255, blue: Double(n & 255) / 255)
    }
    static func adaptive(_ light: String, _ dark: String) -> Color {
        Color(UIColor { traits in
            UIColor(Color(hex: traits.userInterfaceStyle == .dark ? dark : light))
        })
    }
    static let paper = adaptive("EEEDE8", "000000"), surface = adaptive("FFFFFF", "161618"), soft = adaptive(
        "F4F3EF",
        "1F1F22"
    ), ink = adaptive("0E1433", "FFFFFF"), muted = adaptive("8E92A6", "8E8E93"), accentBlue = adaptive("0033B0", "0033B0"),
    tintSoft = adaptive(
        "E3E9F8",
        "1A2A55"
    ), line = adaptive("E1DFD7", "2A2A2E")
}
func type(_ size: CGFloat, _ weight: Int = 400) -> Font {
    .custom("Onest\(weight)", fixedSize: size)
}
struct Glyph: View {
    let name: String, size: CGFloat
    init(_ name: String, _ size: CGFloat = 22) {
        self.name = name
        self.size = size
    }
    var body: some View {
        Image("icon-" + name).renderingMode(.template).resizable().scaledToFit().frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}
struct CategoryImage: View {
    let icon: String
    var body: some View {
        if let u = Bundle.main.url(forResource: "category-" + icon, withExtension: "webp"),
           let im = UIImage(contentsOfFile: u.path) {
            Image(uiImage: im).resizable().scaledToFit()
        }
    }
}
struct ProductPhoto: View {
    let item: Item, icon: String
    var large = false
    var body: some View {
        let path = large ? item.large : item.photo
        if !path.isEmpty,
           let url = URL(string: path, relativeTo: URL(string: "https://prostoyy17.github.io/Dostavka/"))?.absoluteURL {
            AsyncImage(url: url) { phase in
                if let im = phase.image { im.resizable().scaledToFit() }
                else { CategoryImage(icon: icon).padding(12) }
            }
        } else {
            CategoryImage(icon: icon).padding(12)
        }
    }
}
extension View {
    func tile(_ color: Color = .surface, _ radius: CGFloat = 16) -> some View {
        background(color, in: RoundedRectangle(cornerRadius: radius))
    }
    func primaryAction() -> some View {
        font(type(16, 700)).foregroundStyle(.white).padding(.horizontal, 18).frame(maxWidth: .infinity, minHeight: 48).tile(
            .accentBlue,
            16
        )
    }
}
struct Field: View {
    let label: String
    @Binding var value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) { Text(label).font(type(11, 600)).foregroundStyle(Color.muted)
            TextField(label, text: $value).font(type(16)).accessibilityLabel(label)
        }.padding(.horizontal, 13).frame(minHeight: 49).tile(.surface, 10)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.line))
    }
}
