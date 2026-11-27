import Foundation

struct SearchSuggestions: Sendable {
    var ids: [Int] = []
    var additions: [String] = []
    var categories: [String] = []
}

struct SearchScope: Equatable, Sendable {
    let digest: String
    let store: Int?
}

actor CatalogSearch {
    private struct Posting {
        let row: Int
        let weight: Int
    }
    private struct Document {
        let id: Int
        let category: String
        let title: [String]
        let hasPhoto: Bool
    }
    private var scope: SearchScope?
    private var postings: [String: [Posting]] = [:]
    private var vocabulary: [String] = []
    private var documents: [Document] = []
    private var previousWords: [String] = []
    private var previous = SearchSuggestions()

    // Treat punctuation as separators while retaining decimal package sizes.
    static func words(_ raw: String) -> [String] {
        let chars = Array(raw.lowercased().replacingOccurrences(of: "ё", with: "е"))
        var tokens: [String] = [], token = ""
        func finish() {
            if !token.isEmpty { tokens.append(token); token = "" }
        }
        for (i, c) in chars.enumerated() {
            if (c == "." || c == ",") && i > 0 && i + 1 < chars.count && chars[i-1].isNumber && chars[i+1].isNumber {
                token.append(".")
            } else if c.isLetter || c.isNumber {
                if let last = token.last, last != ".", last.isNumber != c.isNumber { finish() }
                token.append(c)
            } else { finish() }
        }
        finish()
        return tokens
    }

    func prepare(_ key: SearchScope, _ catalog: Catalogue) throws {
        if key == scope { return }
        let departments = Dictionary(uniqueKeysWithValues: catalog.categories.map { ($0.id, Self.words($0.name)) })
        var nextDocuments: [Document] = [], nextPostings: [String: [Posting]] = [:]
        for (i, item) in catalog.items.enumerated() {
            if i.isMultiple(of: 128) { try Task.checkCancellation() }
            guard key.store == nil || item.offers.contains(where: { $0.store == key.store }) else { continue }
            let title = Self.words(item.name)
            var weights: [String: Int] = [:]
            for word in departments[item.cat] ?? [] { weights[word] = 1 }
            for word in Self.words(item.sub) { weights[word] = 2 }
            for word in title { weights[word] = 6 }
            if let first = title.first { weights[first] = 8 }
            let row = nextDocuments.count
            nextDocuments.append(Document(id: item.id, category: item.cat, title: title, hasPhoto: !item.photo.isEmpty))
            for (word, weight) in weights {
                nextPostings[word, default: []].append(Posting(row: row, weight: weight))
            }
        }
        try Task.checkCancellation()
        vocabulary = nextPostings.keys.sorted()
        documents = nextDocuments
        postings = nextPostings
        previousWords = []
        previous = SearchSuggestions()
        scope = key
    }

    // One insertion, deletion, substitution or adjacent transposition.
    static func near(_ a: [Character], _ b: [Character]) -> Bool {
        guard abs(a.count - b.count) <= 1 else { return false }
        var i = 0
        while i < min(a.count, b.count) && a[i] == b[i] { i += 1 }
        if i == min(a.count, b.count) { return true }
        if a.count < b.count { return a[i...].elementsEqual(b.dropFirst(i+1)) }
        if a.count > b.count { return a.dropFirst(i+1).elementsEqual(b[i...]) }
        if a.dropFirst(i+1).elementsEqual(b.dropFirst(i+1)) { return true }
        return i+1 < a.count && a[i] == b[i+1] && a[i+1] == b[i] && a.dropFirst(i+2).elementsEqual(b.dropFirst(i+2))
    }

    private static let keyboard: [Character: Character] = {
        let pairs = zip("qwertyuiop[]asdfghjkl;'zxcvbnm,.", "йцукенгшщзхъфывапролджэячсмитьбю")
        var map: [Character: Character] = [:]
        for (a,b) in pairs { map[a] = b; map[b] = a }
        return map
    }()

    private func prefixMatches(_ word: String) -> ArraySlice<String> {
        var lo = 0, hi = vocabulary.count
        while lo < hi {
            let mid = (lo + hi) / 2
            if vocabulary[mid] < word { lo = mid + 1 } else { hi = mid }
        }
        var end = lo
        while end < vocabulary.count && vocabulary[end].hasPrefix(word) { end += 1 }
        return vocabulary[lo..<end]
    }

    private func matches(_ word: String) throws -> [Int: Int] {
        var rows: [Int: Int] = [:]
        func insert(_ candidate: String, quality: Int) {
            for entry in postings[candidate] ?? [] {
                let score = quality * entry.weight
                if score > rows[entry.row, default: 0] { rows[entry.row] = score }
            }
        }
        for candidate in prefixMatches(word) { insert(candidate, quality: candidate == word ? 12 : 8) }
        if word.count >= 2 && word.allSatisfy({ $0.isLetter }) {
            let switched = String(word.map { Self.keyboard[$0] ?? $0 })
            if switched != word {
                for candidate in prefixMatches(switched) { insert(candidate, quality: candidate == switched ? 7 : 5) }
            }
        }
        if rows.isEmpty && (4...48).contains(word.count) && word.allSatisfy({ $0.isLetter }) {
            let letters = Array(word)
            for (i, candidate) in vocabulary.enumerated() {
                if i.isMultiple(of: 256) { try Task.checkCancellation() }
                if Self.near(letters, Array(candidate)) { insert(candidate, quality: 3) }
            }
        }
        return rows
    }

    func lookup(_ raw: String, scope: SearchScope, catalog: Catalogue) throws -> SearchSuggestions {
        try prepare(scope, catalog)
        let words = Self.words(raw)
        guard !words.isEmpty else { return SearchSuggestions() }
        if previousWords == words { return previous }
        var scores = try matches(words[0])
        for word in words.dropFirst() {
            try Task.checkCancellation()
            if scores.isEmpty { break }
            let next = try matches(word)
            scores = scores.reduce(into: [:]) { found, pair in
                if let value = next[pair.key] { found[pair.key] = pair.value + value }
            }
        }
        let ranked = scores.keys.sorted { lhs, rhs in
            let a = scores[lhs]!, b = scores[rhs]!
            if a != b { return a > b }
            if documents[lhs].hasPhoto != documents[rhs].hasPhoto { return documents[lhs].hasPhoto }
            return lhs < rhs
        }
        var parts: [String: Int] = [:], groups: [String: Int] = [:]
        let skip: Set<String> = ["для","из","со","на","шт","гр","кг","мл","от","по"]
        for (rank, row) in ranked.enumerated() {
            if rank.isMultiple(of: 256) { try Task.checkCancellation() }
            let doc = documents[row]
            groups[doc.category, default: 0] += rank < 12 ? 30 : 1
            if rank < 160 {
                for value in Set(doc.title) where (value.count > 1 || value.first?.isNumber == true)
                    && !skip.contains(value) && !words.contains(where: { value.hasPrefix($0) }) {
                    parts[value, default: 0] += 1
                }
            }
        }
        func top(_ counts: [String: Int]) -> [String] {
            counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(5).map(\.key)
        }
        let result = SearchSuggestions(ids: ranked.map { documents[$0].id }, additions: top(parts), categories: top(groups))
        previousWords = words
        previous = result
        return result
    }
}
