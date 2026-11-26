import Foundation

struct Offer: Codable { let store: Int
    let price: Double
}
struct Item: Identifiable, Codable {
    let id: Int, name: String, price: Double, cat: String, sub: String, photo: String, large: String
    let kg: Bool, stock: Double, offers: [Offer], old: Double
}
struct Department: Codable, Identifiable { let id, name, icon, color: String
    let subs: [String]
}
struct Catalogue: Codable { let items: [Item], categories: [Department], stores: [String] }
