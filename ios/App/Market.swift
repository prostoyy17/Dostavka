import SwiftUI

struct Product: Identifiable, Hashable, Decodable {
    let id: Int
    let name: String
    let price: Double
    let store: String
    var rubles: String { "\(Int(price.rounded())) ₽" }
}

private let paper = Color(red: 0.94, green: 0.93, blue: 0.91)
private let blue = Color(red: 0.02, green: 0.19, blue: 0.66)
private let ink = Color(red: 0.07, green: 0.09, blue: 0.18)

struct Packshot: View {
    let item: Product
    var body: some View {
        if let path = Bundle.main.path(forResource: String(item.id), ofType: "jpg"),
           let image = UIImage(contentsOfFile: path) {
            Image(uiImage: image).resizable().scaledToFit().padding(12)
        }
    }
}

@main struct MayrMarket: App {
    var body: some Scene { WindowGroup { Market().preferredColorScheme(.light) } }
}

struct Market: View {
    let products: [Product] = {
        guard let url = Bundle.main.url(forResource: "products", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let list = try? JSONDecoder().decode([Product].self, from: data) else {
            fatalError("Missing bundled catalog")
        }
        return list
    }()
    @State private var store = "Все магазины"
    @State private var query = ""
    @State private var chooseStore = false
    @State private var detail: Product?
    @State private var cart: [Int: Int] = [:]
    @State private var tab = 0
    var filtered: [Product] {
        products.filter { (store == "Все магазины" || $0.store == store) &&
            (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }
    }
    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Button { chooseStore = true } label: {
                            Label(store, systemImage: "chevron.down").labelStyle(.titleAndIcon)
                                .font(.title2.bold()).foregroundStyle(ink)
                        }.accessibilityIdentifier("stores")
                        Text("Доставка по Грозному").font(.subheadline).foregroundStyle(.secondary)
                        HStack {
                            Image(systemName: "magnifyingglass")
                            TextField("Найти товар", text: $query)
                        }.padding(13).background(.white, in: RoundedRectangle(cornerRadius: 15))
                        Text("Каталог").font(.largeTitle.bold())
                        LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], alignment: .leading, spacing: 20) {
                            ForEach(filtered) { item in
                                Button { detail = item } label: {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Packshot(item: item).frame(maxWidth: .infinity).frame(height: 140)
                                            .background(.white, in: RoundedRectangle(cornerRadius: 20))
                                        Text(item.rubles).font(.title3.bold())
                                        Text(item.name).font(.subheadline).lineLimit(2)
                                        Text(item.store).font(.caption).foregroundStyle(.secondary)
                                    }
                                }.buttonStyle(.plain).accessibilityIdentifier("product-\(item.id)")
                            }
                        }
                    }.padding(16)
                }.background(paper).foregroundStyle(ink)
            }.tabItem { Label("Главная", systemImage: "house.fill") }.tag(0)
            NavigationStack {
                List {
                    ForEach(products.filter { cart[$0.id, default: 0] > 0 }) { item in
                        HStack {
                            Packshot(item: item).frame(width: 72, height: 78)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(item.name).font(.headline)
                                Text("\(item.store) · \(item.rubles)").font(.caption)
                                Stepper("\(cart[item.id, default: 0]) шт", value: Binding(
                                    get: { cart[item.id, default: 0] },
                                    set: { cart[item.id] = $0 }), in: 0...99)
                            }
                        }
                    }
                    if cart.values.reduce(0,+) > 0 {
                        HStack {
                            Text("Товары"); Spacer()
                            Text("\(Int(products.reduce(0.0) { $0 + $1.price * Double(cart[$1.id, default: 0]) }.rounded())) ₽")
                        }.font(.headline)
                    } else { Text("Корзина пуста") }
                }.scrollContentBackground(.hidden).background(paper).navigationTitle("Корзина")
            }.tabItem { Label("Корзина", systemImage: "cart.fill") }.badge(cart.values.reduce(0,+)).tag(1)
        }.tint(blue)
        .sheet(isPresented: $chooseStore) {
            VStack(alignment: .leading, spacing: 18) {
                Text("Выбор магазина").font(.title.bold())
                ForEach(["Все магазины", "Musafir Market", "Вкусдом"], id: \.self) { option in
                    Button {
                        store = option
                        chooseStore = false
                    } label: {
                        HStack { Text(option); Spacer(); Image(systemName: option == store ? "checkmark.circle.fill" : "circle") }
                            .padding(12).background(paper, in: RoundedRectangle(cornerRadius: 14))
                    }
                }
            }.padding(20).presentationDetents([.medium]).presentationDragIndicator(.visible)
        }
        .sheet(item: $detail) { item in
            VStack(alignment: .leading, spacing: 14) {
                Packshot(item: item).frame(maxWidth: .infinity).frame(height: 215)
                Text(item.store).foregroundStyle(.secondary)
                Text(item.name).font(.title2.bold())
                Text(item.rubles).font(.largeTitle.bold())
                Button {
                    cart[item.id, default: 0] += 1
                    detail = nil
                } label: {
                    Text("Добавить в корзину").font(.headline).frame(maxWidth: .infinity).padding(6)
                }.buttonStyle(.borderedProminent).accessibilityIdentifier("add")
            }.padding(22).presentationDetents([.fraction(0.67), .large]).presentationDragIndicator(.visible)
        }
    }
}
