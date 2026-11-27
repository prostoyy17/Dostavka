import SwiftUI
import CryptoKit
import CoreText

struct Address: Codable {
    var flat = false, street = "", apt = "", entrance = "", floor = "", code = "", zone = "Ахматовский", comment = "",
        name = "", phone = ""
    var photos: [Data] = []
}
struct Line: Codable, Identifiable { let item: Item, quantity: Double
    var id: Int {
        item.id
    }
    var sum: Int {
        Int((item.price * quantity).rounded())
    }
}
struct Receipt: Codable, Identifiable {
    let id: String, at: Date, lines: [Line], total: Int, address: String, pay: String
}
struct Account: Codable { var name, phone, salt, hash: String }
struct Memory: Codable {
    var favorites: [Int] = [], cart: [Int: Double] = [:], address = Address(), orders: [Receipt] = []
    var searchHistory: [String: [String]]?
    var accounts: [Account] = [], signedIn: String?, store: Int?
}
func rub(_ value: Double) -> String {
    Int(value.rounded()).formatted(.number.locale(Locale(identifier: "ru_RU"))) + " ₽"
}
func amount(_ value: Double, _ kg: Bool) -> String {
    value.formatted(.number.locale(Locale(identifier: "ru_RU"))) + (kg ? " кг" : " шт")
}
let cityZone = TimeZone(identifier: "Europe/Moscow")!
var cityCalendar: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = cityZone
    return c
}
func openAt(_ d: Date) -> Bool {
    let h = cityCalendar.component(.hour, from: d)
    return h >= 9 || h < 1
}
func phoneDigits(_ s: String) -> String {
    String(s.filter(\.isNumber).suffix(10))
}
@MainActor @Observable final class Shop {
    var catalog: Catalogue
    var byID: [Int: Item]
    var departments: [String: Department]
    var memory: Memory {
        didSet {
            if let data = try? JSONEncoder().encode(memory) {
                try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            }
        }
    }
    let file = URL.documentsDirectory.appending(path: "native-market.json")
    var recs: [Item]
    var digest: String
    nonisolated static func startupCatalog() throws -> LiveCatalog.Snapshot {
        if let data = try? Data(contentsOf: LiveCatalog.cacheURL),
           let cached = try? JSONDecoder().decode(LiveCatalog.Snapshot.self, from: data) {
            return cached
        }
        guard let url = Bundle.main.url(forResource: "market", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        let bundled = try JSONDecoder().decode(Catalogue.self, from: Data(contentsOf: url))
        return LiveCatalog.Snapshot(digest: "cd853e38528981f77db2dd90b8c9454aa87b3809d4af6cbc6f66a651993f89ea", catalog: bundled)
    }

    init(snapshot: LiveCatalog.Snapshot) {
        for w in [400, 500, 600, 700, 800] {
            if let u = Bundle.main.url(forResource: "Onest\(w)", withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(u as CFURL, .process, nil)
            }
        }
        let source = snapshot.catalog
        let catalog = Catalogue(items: source.items.filter { !$0.photo.isEmpty }, categories: source.categories, stores: source.stores)
        digest = snapshot.digest
        self.catalog = catalog
        byID = Dictionary(uniqueKeysWithValues: catalog.items.map {
            ($0.id, $0)
        })
        departments = Dictionary(uniqueKeysWithValues: catalog.categories.map {
            ($0.id, $0)
        })
        recs = Array(catalog.items.filter {
            !$0.photo.isEmpty
        }.shuffled().prefix(10))
        memory = (try? JSONDecoder().decode(Memory.self, from: Data(contentsOf: file))) ?? Memory()
        #if DEBUG && targetEnvironment(simulator)
            if ProcessInfo.processInfo.arguments.contains("-RecordShopping") {
                memory = Memory()
                memory.address.street = "Примерная, 1"
                memory.address.name = "Покупатель"
                memory.address.phone = "+7 (000) 000-00-00"
                precondition(UIFont(name: "Onest700", size: 16) != nil)
            }
        #endif
    }
    func refresh() async {
        let current = digest
        guard let update = try? await Task.detached(priority: .utility, operation: {
            try await LiveCatalog.fetch(current: current)
        }).value else { return }
        catalog = update.catalog
        byID = Dictionary(uniqueKeysWithValues: catalog.items.map {
            ($0.id, $0)
        })
        departments = Dictionary(uniqueKeysWithValues: catalog.categories.map {
            ($0.id, $0)
        })
        recs = Array(catalog.items.filter {
            !$0.photo.isEmpty
        }.shuffled().prefix(10))
        if let selected = memory.store,!catalog.stores.indices.contains(selected) {
            memory.store = nil
        }
        digest = update.digest
        Task.detached(priority: .utility) {
            try? JSONEncoder().encode(update).write(to: LiveCatalog.cacheURL, options: .atomic)
        }
    }
    func available(_ p: Item) -> Double {
        let reserved = memory.orders.filter {
            Date().timeIntervalSince($0.at) < 86400
        }.flatMap(\.lines).filter {
            $0.id == p.id
        }.reduce(0) {
            $0 + $1.quantity
        }
        let n = max(0, p.stock - reserved)
        return p.kg && n >= 0.5 ? floor(n * 2) / 2 : n
    }
    func adjust(_ p: Item, _ direction: Int) {
        let q = memory.cart[p.id, default: 0], step = p.kg ? 0.5 : 1
        set(p, q == 0 && direction > 0 ? 1 : q + Double(direction) * step)
    }
    func set(_ p: Item, _ desired: Double) {
        let n = min(max(0, desired), available(p))
        memory.cart[p.id] = n > 0 ? n : nil
    }
    func favorite(_ p: Item) {
        if memory.favorites.contains(p.id) {
            memory.favorites.removeAll {
                $0 == p.id
            }
        } else {
            memory.favorites.insert(p.id, at: 0)
        }
    }
    var lines: [Line] {
        memory.cart.keys.sorted().compactMap { id in
            byID[id].map {
                Line(item: $0, quantity: memory.cart[id] ?? 0)
            }
        }
    }
    var subtotal: Int {
        lines.filter {
            $0.quantity <= available($0.item)
        }.reduce(0) {
            $0 + $1.sum
        }
    }
    var fee: Int {
        subtotal == 0 || subtotal >= 3000 ? 0 : 200
    }
    var total: Int {
        subtotal + fee
    }
    var count: Int {
        lines.reduce(0) {
            $0 + ($1.item.kg ? 1 : Int($1.quantity))
        }
    }
    func storeName(_ p: Item) -> String {
        catalog.stores[p.offers[0].store]
    }
}
