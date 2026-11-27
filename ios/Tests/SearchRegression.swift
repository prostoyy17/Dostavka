import Foundation

@main struct SearchRegression {
    static func main() async throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: "App/Resources/market.json"))
        let catalog = try JSONDecoder().decode(Catalogue.self, from: data)
        let engine = CatalogSearch()
        let clock = ContinuousClock()
        let all = SearchScope(digest: "bundled", store: nil)
        let cold = try await clock.measure { try await engine.prepare(all, catalog) }
        print("Search index: \(catalog.items.count) products in \(cold)")
        func ids(_ value: String) async throws -> [Int] {
            try await engine.lookup(value, scope: all, catalog: catalog).ids
        }
        let milk = try await ids("молоко")
        precondition(!milk.isEmpty)
        for alternate in ["vjkjrj", "молко", "молкоо", "молок"] {
            let matches = try await ids(alternate)
            precondition(!Set(matches.prefix(80)).isDisjoint(with: milk), alternate)
        }
        let direct = try await ids("кубанская буренка")
        let reverse = try await ids("БУРЁНКА  кубанская")
        precondition(!direct.isEmpty && direct == reverse)
        precondition(CatalogSearch.words("2,5% 900ГР") == ["2.5", "900", "гр"])
        let decimal = try await ids("кефир 2.5")
        let comma = try await ids("2,5 кефир")
        precondition(!decimal.isEmpty && decimal == comma)
        let missing = try await ids("zzzzzz")
        precondition(missing.isEmpty)
        for store in catalog.stores.indices {
            let key = SearchScope(digest: "bundled", store: store)
            let permitted = Set(catalog.items.filter { $0.offers.contains { $0.store == store } }.map(\.id))
            let found = try await engine.lookup("молоко", scope: key, catalog: catalog)
            precondition(!found.ids.isEmpty && Set(found.ids).isSubset(of: permitted))
            for chip in found.additions {
                let refined = try await engine.lookup("молоко " + chip, scope: key, catalog: catalog)
                precondition(!refined.ids.isEmpty)
            }
        }
        try await engine.prepare(all, catalog)
        for query in ["мо", "мол", "молоко", "молко", "2", "буренка 2,5", "vjkjrj"] {
            let elapsed = try await clock.measure { _ = try await ids(query) }
            print("Warm query \(query): \(elapsed)")
        }
    }
}
