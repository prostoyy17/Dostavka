import Foundation
import CryptoKit

// The website publishes JSON inside a JavaScript assignment. The app reads the data only.
enum LiveCatalog {
    static let cacheURL = URL.cachesDirectory.appending(path: "market-feed.json")
    struct Snapshot: Codable { let digest: String
        let catalog: Catalogue
    }
    static func fetch(current: String) async throws -> Snapshot? {
        async let rawCatalog = download("catalog")
        async let rawPhotos = download("photos")
        let (catalog, photos) = try await (rawCatalog, rawPhotos)
        var hasher = SHA256()
        hasher.update(data: catalog)
        hasher.update(data: photos)
        let hash = hasher.finalize().map {
            String(format: "%02x", $0)
        }.joined()
        if hash == current {
            return nil
        }
        guard let text = String(data: catalog, encoding: .utf8),
              let start = text.range(of: "window.CATALOG = "),
              let end = text.lastIndex(of: "}") else { throw URLError(.cannotParseResponse) }
        let data = Data(text[start.upperBound ... end].utf8)
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let meta = obj["meta"] as? [String: Any], let storeRows = meta["stores"] as? [[String: Any]],
              let cats = obj["cats"], let rows = obj["items"] as? [[Any]] else { throw URLError(.cannotParseResponse) }
        let stores = storeRows.compactMap {
            $0["name"] as? String
        }
        guard stores.count == storeRows.count,!stores.isEmpty else { throw URLError(.cannotParseResponse) }
        let departments = try JSONDecoder().decode([Department].self, from: JSONSerialization.data(withJSONObject: cats))
        var categories: [String: Department] = [:]
        for d in departments {
            categories[d.id] = d
        }
        var replacements: [String: String] = [:]
        let photoText = String(decoding: photos, as: UTF8.self)
        let matcher = try NSRegularExpression(pattern: #"(?m)^\s*"(\d+:\d+)"\s*:\s*("(?:[^"\\]|\\.)*")"#)
        let ns = photoText as NSString
        for match in matcher.matches(in: photoText, range: NSRange(location: 0, length: ns.length)) {
            replacements[ns.substring(with: match.range(at: 1))] = try JSONDecoder().decode(
                String.self,
                from: Data(ns.substring(with: match.range(at: 2)).utf8)
            )
        }
        var items: [Item] = [], ids = Set<Int>()
        for r in rows {
            guard r.count >= 9, let stock = r[7] as? Double else { throw URLError(.cannotParseResponse) }
            if stock <= 0 {
                continue
            }
            guard let id = r[0] as? Int, ids.insert(id).inserted, let name = r[1] as? String, let price = r[2] as? Double,
                  let cat = r[3] as? String, let dep = categories[cat],
                  let offers = r[8] as? [[Any]] else { throw URLError(.cannotParseResponse) }
            var sources: [Offer] = [], photo = r[5] as? String ?? ""
            for o in offers {
                guard o.count >= 3, let store = o[0] as? Int, stores.indices.contains(store), let sku = o[1] as? Int,
                      let rate = o[2] as? Double else { throw URLError(.cannotParseResponse) }
                sources.append(Offer(store: store, price: rate))
                if photo.isEmpty {
                    photo = replacements["\(store):\(sku)"] ?? ""
                }
            }
            guard !sources.isEmpty else { throw URLError(.cannotParseResponse) }
            let sub = (r[4] as? Int).flatMap {
                dep.subs.indices.contains($0) ? dep.subs[$0] : nil
            } ?? ""
            let large = r.count > 9 ? r[9] as? String : nil
            items.append(Item(id: id, name: name, price: price, cat: cat, sub: sub, photo: photo, large: large.flatMap {
                    $0.isEmpty ? nil : $0
                } ?? photo, kg: (r[6] as? NSNumber)?.boolValue ?? false, stock: stock, offers: sources,
                old: r.count > 10 ? (r[10] as? Double ?? 0) : 0))
        }
        return Snapshot(digest: hash, catalog: Catalogue(items: items, categories: departments, stores: stores))
    }
    private static func download(_ name: String) async throws -> Data {
        var request = URLRequest(url: URL(string: "https://prostoyy17.github.io/Dostavka/data/" + name + ".js")!)
        request.cachePolicy = .reloadRevalidatingCacheData
        request.timeoutInterval = 20
        let (data, meta) = try await URLSession.shared.data(for: request)
        guard (meta as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return data
    }
}
