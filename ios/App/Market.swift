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
    @AppStorage("favoriteProducts") private var saved = Data()
    private var favorites: Set<Int> {
        (try? JSONDecoder().decode(Set<Int>.self, from: saved)) ?? []
    }
    private func toggleFavorite(_ item: Product) {
        var next = favorites
        if next.contains(item.id) { next.remove(item.id) } else { next.insert(item.id) }
        if let encoded = try? JSONEncoder().encode(next) { saved = encoded }
    }
    private var filtered: [Product] {
        products.filter { (store == "Все магазины" || $0.store == store) &&
            (query.isEmpty || $0.name.localizedCaseInsensitiveContains(query)) }
    }
    private func add(_ item: Product) {
        withAnimation(.snappy) { cart[item.id, default: 0] += 1 }
    }
    private var count: Int { cart.values.reduce(0, +) }
    private var subtotal: Int {
        Int(products.reduce(0) { $0 + $1.price * Double(cart[$1.id, default: 0]) }.rounded())
    }
    var body: some View {
        TabView(selection: $tab) {
            Tab("Каталог", systemImage: "square.grid.2x2.fill", value: 0) {
                NavigationStack {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                Label("Грозный", systemImage: "location.fill")
                                Spacer()
                                Label("60–90 мин", systemImage: "clock")
                            }.font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                            Button { chooseStore = true } label: {
                                HStack {
                                    Text(store).font(.largeTitle.bold()).tracking(-1.4)
                                    Image(systemName: "chevron.down.circle.fill").font(.title3)
                                        .symbolRenderingMode(.hierarchical)
                                }
                            }.buttonStyle(.plain).accessibilityIdentifier("stores")
                            HStack {
                                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                                TextField("Найти товар", text: $query)
                                    .submitLabel(.search)
                                if !query.isEmpty {
                                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                                        .accessibilityLabel("Очистить поиск")
                                }
                            }.padding(14).background(.white, in: Capsule())
                            if filtered.isEmpty {
                                ContentUnavailableView.search(text: query)
                            } else { grid(filtered) }
                        }.padding(16)
                    }.scrollDismissesKeyboard(.interactively).background(paper)
                }
            }
            Tab("Избранное", systemImage: "heart.fill", value: 1) {
                NavigationStack {
                    ScrollView {
                        if favorites.isEmpty {
                            ContentUnavailableView("Пока пусто", systemImage: "heart",
                                description: Text("Нажмите сердечко у товара, чтобы сохранить его."))
                                .padding(.top, 72)
                        } else { grid(products.filter { favorites.contains($0.id) }).padding(16) }
                    }.background(paper).navigationTitle("Избранное")
                }
            }
            Tab("Корзина", systemImage: "basket.fill", value: 2) {
                NavigationStack {
                    ScrollView {
                        if count == 0 {
                            ContentUnavailableView("Корзина пуста", systemImage: "basket",
                                description: Text("Добавьте товары из каталога.")).padding(.top, 72)
                        } else {
                            VStack(spacing: 12) {
                                ForEach(products.filter { cart[$0.id, default: 0] > 0 }) { item in
                                    HStack(alignment: .center, spacing: 12) {
                                        Packshot(item: item).frame(width: 76, height: 92)
                                        VStack(alignment: .leading, spacing: 6) {
                                            Text(item.store).font(.caption).foregroundStyle(.secondary)
                                            Text(item.name).font(.headline)
                                            HStack {
                                                Text(item.rubles).fontWeight(.bold)
                                                Spacer()
                                                Button { cart[item.id, default: 0] -= 1 } label: {
                                                    Image(systemName: "minus")
                                                }.accessibilityLabel("Уменьшить количество")
                                                Text("\(cart[item.id, default: 0]) шт").monospacedDigit()
                                                Button { add(item) } label: { Image(systemName: "plus") }
                                                    .accessibilityLabel("Увеличить количество")
                                            }.font(.subheadline).buttonStyle(.glass)
                                        }
                                    }.padding(14).background(.white, in: RoundedRectangle(cornerRadius: 24))
                                }
                                HStack {
                                    Text("Сумма товаров").font(.headline)
                                    Spacer()
                                    Text("\(subtotal) ₽").font(.title.bold()).monospacedDigit()
                                }.padding(20).background(blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 24))
                            }.padding(16)
                        }
                    }.background(paper).navigationTitle("Корзина")
                }
            }.badge(count)
        }.tint(blue).foregroundStyle(ink)
        .sheet(isPresented: $chooseStore) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Выбор магазина").font(.title.bold()).padding(.bottom, 10)
                ForEach(["Все магазины", "Musafir Market", "Вкусдом"], id: \.self) { option in
                    Button {
                        store = option
                        chooseStore = false
                    } label: {
                        HStack(spacing: 12) {
                            if option != "Все магазины",
                               let path = Bundle.main.path(forResource: option == "Вкусдом" ? "vkusdom-mark" : "musafir-clear", ofType: "png"),
                               let image = UIImage(contentsOfFile: path) {
                                Image(uiImage: image).resizable().scaledToFit().frame(width: 62, height: 38)
                            }
                            Text(option).font(.headline)
                            Spacer()
                            Image(systemName: option == store ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(option == store ? blue : .gray)
                        }.padding(.horizontal, 14).frame(minHeight: 62)
                            .background(option == store ? blue.opacity(0.08) : Color(.secondarySystemBackground),
                                        in: RoundedRectangle(cornerRadius: 20))
                    }.buttonStyle(.plain).accessibilityLabel(option)
                }
            }.padding(20).presentationDetents([.height(320), .large]).presentationDragIndicator(.visible)
        }
        .sheet(item: $detail) { item in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ZStack(alignment: .topTrailing) {
                        Packshot(item: item).frame(maxWidth: .infinity).frame(height: 220)
                        heart(item)
                    }
                    Text(item.store).font(.subheadline.weight(.medium)).foregroundStyle(.secondary)
                    Text(item.name).font(.title.bold())
                    Text(item.rubles).font(.title2.bold())
                }.padding(24)
            }.safeAreaInset(edge: .bottom) {
                Button { add(item); detail = nil } label: {
                    Label("Добавить в корзину", systemImage: "basket")
                        .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }.buttonStyle(.glassProminent).padding(.horizontal, 20).accessibilityIdentifier("add")
            }.presentationDetents([.fraction(0.62), .large]).presentationDragIndicator(.visible)
        }
    }
    private func heart(_ item: Product) -> some View {
        Button { toggleFavorite(item) } label: {
            Image(systemName: favorites.contains(item.id) ? "heart.fill" : "heart")
                .foregroundStyle(favorites.contains(item.id) ? blue : ink)
                .frame(width: 30, height: 32)
        }.buttonStyle(.glass)
            .accessibilityLabel(favorites.contains(item.id) ? "Убрать из избранного" : "В избранное")
            .accessibilityIdentifier("heart-\(item.id)")
    }
    private func grid(_ items: [Product]) -> some View {
        LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], alignment: .leading, spacing: 18) {
            ForEach(items) { item in
                VStack(alignment: .leading, spacing: 5) {
                    ZStack {
                        Button { detail = item } label: {
                            Packshot(item: item).padding(12)
                                .frame(maxWidth: .infinity).frame(height: 164)
                                .background(.white, in: RoundedRectangle(cornerRadius: 24))
                        }.buttonStyle(.plain).accessibilityLabel(item.name)
                            .accessibilityIdentifier("product-\(item.id)")
                    }.overlay(alignment: .topTrailing) { heart(item).padding(6) }
                    .overlay(alignment: .bottomTrailing) {
                        Button { add(item) } label: {
                            Image(systemName: "plus").fontWeight(.bold).frame(width: 28, height: 30)
                        }.buttonStyle(.glassProminent).padding(6)
                            .accessibilityLabel("Добавить \(item.name) в корзину")
                    }
                    Text(item.rubles).font(.title3.bold())
                    Button(item.name) { detail = item }.buttonStyle(.plain)
                        .font(.subheadline).lineLimit(2).multilineTextAlignment(.leading)
                    Text(item.store).font(.caption).foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
        }
    }
}
