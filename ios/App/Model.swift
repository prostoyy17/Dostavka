import SwiftUI
import CryptoKit
import CoreText

struct Offer: Codable { let store: Int; let price: Double }
struct Item: Identifiable, Codable {
    let id: Int, name: String, price: Double, cat: String, sub: String, photo: String, large: String
    let kg: Bool, stock: Double, offers: [Offer], old: Double
}
struct Department: Codable, Identifiable { let id, name, icon, color: String; let subs: [String] }
struct Catalogue: Decodable { let items: [Item], categories: [Department], stores: [String] }
struct Address: Codable {
    var flat = false, street = "", apt = "", entrance = "", floor = "", code = "", zone = "Ахматовский", comment = "", name = "", phone = ""
    var photos: [Data] = []
}
struct Line: Codable, Identifiable { let item: Item, quantity: Double; var id: Int { item.id }; var sum: Int { Int((item.price * quantity).rounded()) } }
struct Receipt: Codable, Identifiable {
    let id: String, at: Date, lines: [Line], total: Int, address: String, pay: String
}
struct Account: Codable { var name, phone, salt, hash: String }
struct Memory: Codable {
    var favorites: [Int] = [], cart: [Int:Double] = [:], address = Address(), orders: [Receipt] = []
    var accounts: [Account] = [], signedIn: String?, store: Int?
}
func rub(_ value: Double) -> String { Int(value.rounded()).formatted(.number.locale(Locale(identifier:"ru_RU"))) + " ₽" }
func amount(_ value: Double, _ kg: Bool) -> String { value.formatted(.number.locale(Locale(identifier:"ru_RU"))) + (kg ? " кг" : " шт") }
let cityZone = TimeZone(identifier: "Europe/Moscow")!
var cityCalendar: Calendar { var c = Calendar(identifier:.gregorian); c.timeZone = cityZone; return c }
func openAt(_ d: Date) -> Bool { let h = cityCalendar.component(.hour, from:d); return h >= 9 || h < 1 }
func phoneDigits(_ s: String) -> String { String(s.filter(\.isNumber).suffix(10)) }
@MainActor @Observable final class Shop {
    let catalog: Catalogue
    let byID: [Int:Item], departments: [String:Department]
    var memory: Memory { didSet { if let data = try? JSONEncoder().encode(memory) { try? data.write(to: file, options: [.atomic,.completeFileProtectionUntilFirstUserAuthentication]) } } }
    let file = URL.documentsDirectory.appending(path:"native-market.json")
    let recs: [Item]
    init() {
        for w in [400,500,600,700,800] { if let u = Bundle.main.url(forResource:"Onest\(w)",withExtension:"ttf") { CTFontManagerRegisterFontsForURL(u as CFURL,.process,nil) } }
        let url = Bundle.main.url(forResource:"market",withExtension:"json")!
        let catalog = try! JSONDecoder().decode(Catalogue.self,from:Data(contentsOf:url))
        self.catalog = catalog
        byID = Dictionary(uniqueKeysWithValues:catalog.items.map{($0.id,$0)})
        departments = Dictionary(uniqueKeysWithValues:catalog.categories.map{($0.id,$0)})
        recs = Array(catalog.items.filter{ !$0.photo.isEmpty }.shuffled().prefix(10))
        memory = (try? JSONDecoder().decode(Memory.self,from:Data(contentsOf:file))) ?? Memory()
    }
    func available(_ p:Item)->Double {
        let reserved = memory.orders.filter{Date().timeIntervalSince($0.at)<86400}.flatMap(\.lines).filter{$0.id == p.id}.reduce(0){$0+$1.quantity}
        let n=max(0,p.stock-reserved)
        return p.kg && n>=0.5 ? floor(n*2)/2 : n
    }
    func adjust(_ p:Item,_ direction:Int) {
        let q = memory.cart[p.id,default:0], step = p.kg ? 0.5 : 1
        set(p,q == 0 && direction>0 ? 1 : q + Double(direction)*step)
    }
    func set(_ p:Item,_ desired:Double) {
        let n = min(max(0,desired),available(p))
        memory.cart[p.id] = n>0 ? n : nil
    }
    func favorite(_ p:Item) {
        if memory.favorites.contains(p.id) { memory.favorites.removeAll{$0==p.id} } else {memory.favorites.insert(p.id,at:0)}
    }
    var lines:[Line] { memory.cart.keys.sorted().compactMap{ id in byID[id].map{Line(item:$0,quantity:memory.cart[id] ?? 0)} } }
    var subtotal:Int { lines.filter{$0.quantity <= available($0.item)}.reduce(0){$0+$1.sum} }
    var fee:Int { subtotal == 0 || subtotal >= 3000 ? 0 : 200 }
    var total:Int { subtotal+fee }
    var count:Int {lines.reduce(0){$0+($1.item.kg ? 1 : Int($1.quantity))}}
    func storeName(_ p:Item)->String {catalog.stores[p.offers[0].store]}
}
