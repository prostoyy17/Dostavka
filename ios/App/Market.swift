import SwiftUI

@main struct MayrMarket: App {
    @State private var shop = Shop()
    var body: some Scene {
        WindowGroup {
            Market(shop: shop).environment(\.locale, Locale(identifier: "ru_RU")).environment(\.timeZone, cityZone)
        }
    }
}
enum Page: String { case catalog, search, favorites, cart, account, address, settings, about, orders, login, checkout }
enum Panel: Equatable { case stores, product(Int), filters, sort, subs, receipt(String) }
struct UndoNotice: Identifiable {
    let id = UUID()
    let message: String
    let restore: () -> Void
}

struct Market: View {
    @State var notice: UndoNotice?

    func removeOne(_ item: Item) {
        let previous = shop.memory.cart[item.id] ?? 0
        shop.adjust(item, -1)
        if previous > 0 && shop.memory.cart[item.id] == nil {
            notice = UndoNotice(message: "Удалено из корзины") { shop.set(item, previous) }
        }
    }

    let shop: Shop
    @State var page = Page.catalog
    @State var panel: Panel?
    @State var draftStore: Int?
    @State var category = "all"
    @State var query = ""
    @State var sub = ""
    @State var order = "Популярные"
    @State var photoOnly = false
    @State var kgOnly = false
    @State var limit = 60
    @State var favoriteSort = "Недавно добавленные"
    @State var path: [Page] = []
    @AppStorage("native-dark") var dark = false
    @State var rows: [Item] = []
    @State var categoryRows: [String: [Item]] = [:]
    @State var scopeCategories: Set<String> = []
    @State var scopeSubs: [String: Set<String>] = [:]
    struct BrowseSelection {
        let category: String, sub: String, order: String
        let photoOnly: Bool, kgOnly: Bool
    }
    @State var browseSelection: BrowseSelection?
    func openSearch() {
        browseSelection = BrowseSelection(category: category, sub: sub, order: order, photoOnly: photoOnly, kgOnly: kgOnly)
        category = "all"
        sub = ""
        query = ""
        order = "Популярные"
        photoOnly = false
        kgOnly = false
        go(.search)
    }
    func updateScope() {
        var groups: [String: Set<String>] = [:]
        for item in shop.catalog.items where matchesStore(item) {
            groups[item.cat, default: []].insert(item.sub)
        }
        scopeCategories = Set(groups.keys)
        scopeSubs = groups
        filter()
    }
    func matchesStore(_ item: Item) -> Bool {
        guard let store = shop.memory.store else { return true }
        return item.offers.contains { $0.store == store }
    }
    @FocusState var searching: Bool
    func go(_ p: Page) {
        searching = false
        panel = nil
        path.append(page)
        page = p
    }
    func back() {
        if page == .search, let saved = browseSelection {
            query = ""
            category = saved.category
            sub = saved.sub
            order = saved.order
            photoOnly = saved.photoOnly
            kgOnly = saved.kgOnly
            browseSelection = nil
            searching = false
        }
        page = path.popLast() ?? .catalog
        if page == .catalog { filter() }
        panel = nil
    }
    var home: Bool {
        shop.memory.store == nil && category == "all" && query.isEmpty
    }
    var selectedName: String {
        shop.memory.store.flatMap {
            shop.catalog.stores.indices.contains($0) ? shop.catalog.stores[$0] : nil
        } ?? "Все магазины"
    }
    var body: some View {
        ZStack(alignment: .bottom) {
            (page == .checkout ? Color.surface : Color.paper).ignoresSafeArea()
            Group {
                switch page {
                case .checkout: Checkout(shop: shop, back: back) { id in page = .orders
                        path = [.account]
                        panel = .receipt(id)
                    }
                case .address: AddressPage(shop: shop, back: back)
                case .login: LoginPage(shop: shop, back: back)
                default:
                    GeometryReader { viewport in ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            if [.orders, .about, .settings].contains(page) {
                                backButton
                            }
                            switch page {
                            case .catalog: catalogView
                            case .search: searchView
                            case .favorites: favoritesView
                            case .cart: cartView
                            case .account, .settings, .about, .orders: accountView
                            default: EmptyView()
                            }
                        }.frame(minHeight: page == .account ? max(0, viewport.size.height - 125) : nil).padding(
                            .horizontal,
                            16
                        ).padding(.top, page == .catalog ? 6 : 24).padding(.bottom, 102).frame(
                            maxWidth: .infinity,
                            alignment: .leading
                        )
                    }.id(page).scrollDismissesKeyboard(.interactively) }
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity).accessibilityHidden(panel != nil)
            if ![.checkout, .login, .search].contains(page) && !searching {
                tabbar.accessibilityHidden(panel != nil)
            }
            if let notice, panel == nil {
                HStack {
                    Text(notice.message)
                    Button("Вернуть") { notice.restore(); self.notice = nil }
                        .foregroundStyle(Color(hex: "9CB7FF"))
                }
                .font(type(14, 600)).padding(12).foregroundStyle(.white)
                .background(Color(hex: "0E1433"), in: Capsule()).padding(.bottom, 86)
                .task(id: notice.id) {
                    try? await Task.sleep(for: .seconds(4))
                    if !Task.isCancelled && self.notice?.id == notice.id { self.notice = nil }
                }
            }
            if let panel {
                Color.black.opacity(0.49).ignoresSafeArea().onTapGesture {
                    self.panel = nil
                }
                sheetBody(panel)
                    .padding(.bottom, 4).background(Color.surface).clipShape(UnevenRoundedRectangle(
                        topLeadingRadius: 28,
                        topTrailingRadius: 28
                    ))
                    .background(alignment: .bottom) {
                        Color.surface.frame(height: 50).offset(y: 48)
                    }
                    .transition(.move(edge: .bottom))
            }
        }.font(type(15)).foregroundStyle(Color.ink).buttonStyle(.plain)
            .preferredColorScheme(dark ? .dark : .light)
            .animation(.easeOut(duration: 0.2), value: panel)
            .onAppear {
                if categoryRows.isEmpty {
                    for p in shop.catalog.items where !p.photo.isEmpty && (categoryRows[p.cat]?.count ?? 0) < 12 {
                        categoryRows[p.cat, default: []].append(p)
                    }
                }
                updateScope()
            }
            .task {
                await shop.refresh()
            }
            .onChange(of: shop.digest) { _, _ in
                categoryRows = [:]
                for p in shop.catalog.items where !p.photo.isEmpty && (categoryRows[p.cat]?.count ?? 0) < 12 {
                    categoryRows[p.cat, default: []].append(p)
                }
                updateScope()
            }
            .onChange(of: query) { _, _ in
                if page == .search { filter() }
            }
    }
    var backButton: some View {
        Button(action: back) {
            Glyph("back", 26).frame(width: 32, height: 40)
        }.accessibilityLabel("Назад")
    }
    var tabbar: some View {
        HStack(spacing: 4) {
            tab(.catalog, "Главная", "house", 0)
            tab(.favorites, "Избранное", "heart", shop.memory.favorites.count)
            tab(.cart, shop.count > 0 ? rub(Double(shop.total)) : "Корзина", "cart", shop.count)
            tab(.account, "Аккаунт", "user", 0)
        }.padding(6).background(.ultraThinMaterial, in: Capsule()).background(Color.surface.opacity(0.65), in: Capsule())
            .padding(
                .horizontal,
                14
            ).padding(.bottom, 10)
    }
    func tab(_ target: Page, _ title: String, _ icon: String, _ badge: Int) -> some View {
        let active = page == target || (target == .account && [.about, .settings, .orders, .address].contains(page))
        return Button { page = target
            path = []
            panel = nil
        } label: {
            VStack(spacing: 2) {
                Glyph(icon, 21).overlay(alignment: .topTrailing) {
                    if badge > 0 {
                        Text("\(badge)").font(type(10, 700)).foregroundStyle(.white).padding(.horizontal, 4).background(
                            .red,
                            in: Capsule()
                        ).offset(x: 10, y: -4)
                    }
                }
                Text(title).font(type(11, 700)).lineLimit(1)
            }.foregroundStyle(active ? Color.accentBlue : Color.muted).frame(maxWidth: .infinity, minHeight: 52).background(
                active ? Color.tintSoft : .clear,
                in: Capsule()
            )
        }.accessibilityIdentifier("tab-" + target.rawValue)
    }
    func header(_ title: String) -> some View {
        Text(title).font(type(30, 800)).tracking(-1)
    }
    func filter() {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if page == .search && term.isEmpty {
            rows = []
            return
        }
        let words = term.lowercased().replacingOccurrences(of: "ё", with: "е").split(separator: " ")
        var list = shop.catalog.items.filter { p in
            guard matchesStore(p), (category == "all" || p.cat == category), sub.isEmpty || sub == p.sub, !photoOnly || !p.photo.isEmpty, !kgOnly || p.kg else { return false }
            if words.isEmpty { return true }
            let hay = (p.name + " " + p.sub + " " + (shop.departments[p.cat]?.name ?? "")).lowercased().replacingOccurrences(
                of: "ё",
                with: "е"
            )
            return words.allSatisfy {
                    hay.contains($0)
                }
        }
        switch order { case "Сначала дешевле": list.sort {
                $0.price < $1.price
            }
        case "Сначала дороже": list.sort {
                $0.price > $1.price
            }
        case "По названию": list.sort {
                $0.name.localizedCompare($1.name) == .orderedAscending
            }
        default: list = list.filter {
                !$0.photo.isEmpty
            } + list.filter {
                $0.photo.isEmpty
            }}
        rows = list
        limit = 60
    }
    func chooseCat(_ id: String) {
        category = id
        sub = ""
        filter()
    }
    @ViewBuilder var catalogView: some View {
        VStack(alignment: .leading, spacing: 5) {
            Button {
                draftStore = shop.memory.store
                panel = .stores
            } label: {
                HStack(spacing: 8) {
                    Text(selectedName).font(type(21, 800))
                    Text("Сменить").font(type(12, 700)).foregroundStyle(Color.accentBlue)
                    Glyph("down", 12)
                }.frame(minHeight: 34).contentShape(Rectangle())
            }.accessibilityIdentifier("stores")
            Button { go(.address) } label: {
                HStack(spacing: 6) {
                    Circle().fill(.green).frame(width: 8, height: 8)
                    Text(shop.memory.address.street.isEmpty ? "Указать адрес" : shop.memory.address.street)
                        .lineLimit(1).truncationMode(.tail)
                    Text("· 60–90 мин").fixedSize()
                }.font(type(14)).contentShape(Rectangle())
            }
        }
        Button(action: openSearch) {
            HStack(spacing: 12) {
                Glyph("search", 20)
                Text("Найти товар")
                Spacer()
            }.foregroundStyle(Color.muted).padding(.horizontal, 16).frame(height: 48).tile()
        }.accessibilityIdentifier("open-search")
        ScrollView(.horizontal) { HStack(alignment: .top, spacing: 8) {
            circle("all", "Все товары", "cart", "ffffff")
            ForEach(shop.catalog.categories.filter { scopeCategories.contains($0.id) }) { c in
                circle(c.id, c.name, c.icon, c.color)
            }
        }}.scrollIndicators(.hidden)
        if home {
            Text("Рекомендации для вас").font(type(24, 800)).tracking(-0.6)
            grid(shop.recs)
            ForEach(shop.catalog.categories) { c in
                if let items = categoryRows[c.id], !items.isEmpty {
                    HStack { Text(c.name).font(type(22, 800))
                        Spacer()
                        Button("Все") {
                            chooseCat(c.id)
                        }
                    }
                    ScrollView(.horizontal) {
                        LazyHStack(alignment: .top, spacing: 12) {
                            ForEach(items) { p in
                                card(p).frame(width: 150)
                            }
                        }
                    }.scrollIndicators(.hidden)
                }
            }
        } else {
            header(!query.isEmpty ? "Поиск «\(query)»" : shop.departments[category]?.name ?? selectedName)
            resultsView
        }
    }
    @ViewBuilder var searchView: some View {
        HStack(spacing: 8) {
            backButton
            HStack(spacing: 8) {
                Glyph("search", 20).foregroundStyle(Color.muted)
                TextField("Найти товар", text: $query).focused($searching).submitLabel(.search)
                    .onSubmit { searching = false }
                if !query.isEmpty {
                    Button { query = ""; searching = true } label: { Glyph("x", 16).frame(width: 32, height: 40) }
                        .accessibilityLabel("Очистить поиск")
                }
            }.padding(.horizontal, 12).frame(height: 48).tile()
        }.onAppear { searching = true }
        Text("Поиск · " + selectedName).font(type(14, 600)).foregroundStyle(Color.muted)
        if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { resultsView }
    }
    @ViewBuilder var resultsView: some View {
        if !rows.isEmpty || photoOnly || kgOnly || !sub.isEmpty {
            HStack(spacing: 5) {
                if category != "all", !(scopeSubs[category] ?? []).subtracting([""]).isEmpty {
                    pill(sub.isEmpty ? "Подраздел" : sub, "down", .subs)
                }
                pill(photoOnly || kgOnly ? "Фильтры •" : "Фильтры", "filter", .filters)
                if rows.count > 1 { pill(order, "sort", .sort) }
            }
        }
        if rows.isEmpty {
            Text("Ничего не найдено").foregroundStyle(Color.muted)
            if photoOnly || kgOnly || !sub.isEmpty {
                Button("Сбросить фильтры") {
                    sub = ""; kgOnly = false; photoOnly = false; filter()
                }
            }
        } else {
            grid(Array(rows.prefix(limit)))
            if rows.count > limit {
                Button("Показать ещё \(min(60, rows.count - limit))") { limit += 60 }.primaryAction()
            }
        }
    }
    func circle(_ id: String, _ name: String, _ icon: String, _ color: String) -> some View {
        Button {
            chooseCat(id)
        } label: { VStack(spacing: 6) {
            CategoryImage(icon: icon).frame(width: 44, height: 44).frame(width: 70, height: 70).background(
                Color(hex: color),
                in: Circle()
            ).overlay(Circle().strokeBorder(id == category ? Color.accentBlue : .clear, lineWidth: 3))
            Text(name).font(type(12, 600)).lineLimit(2).multilineTextAlignment(.center)
                .foregroundStyle(id == category ? Color.accentBlue : Color.ink)
        }.frame(width: 76) }.accessibilityIdentifier("cat-" + id)
    }
    func pill(_ name: String, _ icon: String, _ target: Panel) -> some View {
        Button {
            searching = false
            panel = target
        } label: { HStack(spacing: 5) { Glyph(icon, 14)
            Text(name).font(type(12, 600)).lineLimit(1)
            Glyph("down", 10)
        }.frame(maxWidth: .infinity, minHeight: 40).tile(.surface, 24) }.accessibilityLabel(name)
    }
    func grid(_ items: [Item]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible())], alignment: .leading, spacing: 22) {
            ForEach(items) {
                card($0)
            }
        }
    }
    func card(_ p: Item) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Color.white.aspectRatio(1, contentMode: .fit).overlay {
                GeometryReader { box in
                    ProductPhoto(item: p, icon: shop.departments[p.cat]?.icon ?? "basket").frame(
                        width: box.size.width * 0.82,
                        height: box.size.height * 0.82
                    ).position(x: box.size.width / 2, y: box.size.height / 2)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 22)).onTapGesture {
                panel = .product(p.id)
            }
            .accessibilityElement().accessibilityLabel(p.name).accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("open-\(p.id)")
            .overlay(alignment: .topTrailing) {
                Button {
                    shop.favorite(p)
                } label: {
                    Glyph(shop.memory.favorites.contains(p.id) ? "heart" : "heart-o", 24)
                        .foregroundStyle(shop.memory.favorites.contains(p.id) ? .red : Color.muted).frame(
                            width: 36,
                            height: 36
                        )
                }.padding(6).accessibilityLabel("В избранное")
            }
            .overlay(alignment: .bottomTrailing) {
                qty(p).padding(10)
            }
            .overlay(alignment: .topLeading) {
                if p.old > p.price {
                    Text("−\(Int(((1 - p.price / p.old) * 100).rounded()))%").font(type(12, 700)).foregroundStyle(.white)
                        .padding(4).tile(
                            .red,
                            8
                        ).padding(8)
                }
            }
            HStack { Text(rub(p.price)).font(type(19, 800))
                if p.old > p.price {
                    Text(rub(p.old)).strikethrough().font(type(12)).foregroundStyle(Color.muted)
                }
            }.padding(.top, 8)
            Button(p.name) {
                panel = .product(p.id)
            }.font(type(14)).lineLimit(2).multilineTextAlignment(.leading)
            HStack(alignment: .top, spacing: 3) {
                Text(shop.storeName(p) + (p.kg ? " · за 1 кг" : "")).foregroundStyle(Color.muted)
                if shop.available(p) <= 5 {
                    Text("осталось " + amount(shop.available(p), p.kg)).foregroundStyle(Color(hex: "D98A00"))
                }
            }.font(type(12))
            Spacer(minLength: 0)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    func qty(_ p: Item, _ full: Bool = false) -> some View {
        let q = shop.memory.cart[p.id, default: 0]
        return HStack(spacing: 4) {
            if q > 0 {
                Button {
                    removeOne(p)
                } label: {
                    Glyph("minus", 16).frame(width: full ? 46 : 32, height: 44)
                        .background(full ? Color.white.opacity(0.18) : .clear, in: RoundedRectangle(cornerRadius: 10)).contentShape(Rectangle())
                }.accessibilityLabel("Меньше")
                if full { Spacer(minLength: 0) }
                Text(p.kg ? amount(q, true) : "\(Int(q))").font(type(13, 700))
                if full { Spacer(minLength: 0) }
            }
            Button {
                shop.adjust(p, 1)
            } label: { HStack { Glyph("plus", 16)
                if full && q == 0 {
                    Text("В корзину").font(type(15, 700))
                }
            }.padding(.horizontal, full ? 8 : 0).frame(minWidth: full ? 46 : (q == 0 ? 42 : 32), minHeight: 44)
                .background(full && q > 0 ? Color.white.opacity(0.18) : .clear, in: RoundedRectangle(cornerRadius: 10)).contentShape(Rectangle()) }
                .opacity(q >= shop.available(p) ? 0.45 : 1).disabled(q >= shop.available(p)).accessibilityIdentifier("add-\(p.id)").accessibilityLabel(q == 0 ? "В корзину" : "Больше")
        }.padding(.horizontal, full ? 4 : 0).frame(maxWidth: full ? .infinity : nil, minHeight: full ? 48 : 42).foregroundStyle(.white).background(
            Color.accentBlue,
            in: RoundedRectangle(cornerRadius: full ? 14 : 24)
        )
    }
}
