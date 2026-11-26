import SwiftUI

struct SearchSuggestions {
    var additions: [String] = []
    var categories: [String] = []

    init() {}

    init(term: String, items: [Item], index: [Int: String]) {
        let words = term.lowercased().replacingOccurrences(of: "ё", with: "е").split(whereSeparator: { $0.isWhitespace })
        guard !words.isEmpty else { return }
        var parts: [String: Int] = [:]
        var groups: [String: Int] = [:]
        let skip: Set<String> = ["для", "из", "со", "на", "шт", "гр", "кг", "мл", "от", "по"]
        var sampled = 0
        for item in items {
            guard let text = index[item.id], words.allSatisfy({ text.contains($0) }) else { continue }
            groups[item.cat, default: 0] += 1
            guard sampled < 350 else { continue }
            sampled += 1
            let tokens = item.name.lowercased().replacingOccurrences(of: "ё", with: "е")
                .split(whereSeparator: { $0.isWhitespace })
            var seen = Set<String>()
            for token in tokens {
                let value = String(token.trimmingCharacters(in: .punctuationCharacters.subtracting(CharacterSet(charactersIn: "%"))))
                guard value.count > 1 || value.first?.isNumber == true,
                      value.contains(where: { $0.isLetter || $0.isNumber }),
                      !skip.contains(value), !words.contains(where: { value.contains($0) }),
                      seen.insert(value).inserted else { continue }
                parts[value, default: 0] += 1
            }
        }
        func ranked(_ counts: [String: Int], limit: Int) -> [String] {
            counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }.prefix(limit).map(\.key)
        }
        additions = ranked(parts, limit: 5)
        categories = ranked(groups, limit: 5)
    }
}

extension Market {
    private var term: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var historyKey: String { shop.memory.store.map(String.init) ?? "all" }
    private var history: [String] { shop.memory.searchHistory?[historyKey] ?? [] }

    private func saveHistory(_ terms: [String]) {
        var byStore = shop.memory.searchHistory ?? [:]
        byStore[historyKey] = terms
        shop.memory.searchHistory = byStore
    }

    private func submitSearch(_ value: String) {
        let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        query = value
        saveHistory(Array(([value] + history.filter { $0.caseInsensitiveCompare(value) != .orderedSame }).prefix(12)))
        category = "all"
        sub = ""
        order = "Популярные"
        kgOnly = false
        photoOnly = false
        go(.searchResults)
        filter()
    }

    var searchScreen: some View {
        VStack(alignment: .leading, spacing: 12) {
            if page == .search {
                HStack(spacing: 10) {
                    HStack(spacing: 8) {
                        Glyph("search", 19).foregroundStyle(Color.muted)
                        TextField("Найти товар", text: $query)
                            .focused($searching).submitLabel(.search).onSubmit { submitSearch(term) }
                        if !query.isEmpty {
                            Button { query = ""; searching = true } label: { Glyph("x", 14).frame(width: 32, height: 44) }
                                .accessibilityLabel("Очистить поиск")
                        }
                    }.padding(.horizontal, 12).frame(height: 46).tile()
                    Button("Отмена", action: back).foregroundStyle(Color.accentBlue)
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if term.isEmpty {
                            if !history.isEmpty { historySection }
                        } else {
                            suggestionSection
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }.scrollDismissesKeyboard(.interactively)
            } else {
                HStack {
                    backButton
                    Button(action: back) {
                        HStack { Glyph("search", 18); Text(query).lineLimit(1); Spacer() }
                            .padding(.horizontal, 12).frame(height: 46).tile()
                    }.accessibilityLabel("Изменить запрос")
                }
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) { resultsView }
                        .padding(.bottom, 100)
                }
            }
        }.padding(.horizontal, 16).padding(.top, 6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .task(id: page) { if page == .search { searching = true } }
            .task(id: SearchInput(page: page, query: query, digest: shop.digest)) {
                guard page == .search, !term.isEmpty else { return }
                try? await Task.sleep(for: .milliseconds(100))
                guard !Task.isCancelled else { return }
                suggestions = SearchSuggestions(term: term, items: shop.catalog.items, index: searchTextByID)
            }
    }

    private struct SearchInput: Equatable { let page: Page, query: String, digest: String }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("История").font(type(16, 700))
                Spacer()
                Button("Очистить") { saveHistory([]) }.foregroundStyle(Color.accentBlue)
            }
            ScrollView(.horizontal) {
                HStack {
                    ForEach(history, id: \.self) { value in
                        HStack(spacing: 0) {
                            Button(value) { submitSearch(value) }.padding(.leading, 12)
                            Button { saveHistory(history.filter { $0 != value }) } label: {
                                Glyph("x", 12).frame(width: 34, height: 40)
                            }.accessibilityLabel("Удалить запрос " + value)
                        }.tile(.surface, 20)
                    }
                }
            }.scrollIndicators(.hidden)
        }
    }

    @ViewBuilder private var suggestionSection: some View {
        if !suggestions.additions.isEmpty {
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    ForEach(suggestions.additions, id: \.self) { word in
                        Button { query = term + " " + word; searching = true } label: {
                            Text(word).font(type(14, 600)).padding(.horizontal, 14).frame(height: 38).tile(.surface, 19)
                        }.accessibilityIdentifier("append-" + word)
                    }
                }
            }.scrollIndicators(.hidden)
        }
        VStack(spacing: 0) {
            ForEach([term] + suggestions.additions.map { term + " " + $0 }, id: \.self) { phrase in
                if phrase != term { Divider().padding(.leading, 14) }
                Button { submitSearch(phrase) } label: {
                    Text(phrase).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 14)
                        .frame(minHeight: 46).contentShape(Rectangle())
                }.accessibilityIdentifier("submit-" + phrase)
            }
        }.tile()
        if !suggestions.categories.isEmpty {
            Text("Перейти в раздел").font(type(16, 700))
            ScrollView(.horizontal) {
                HStack(alignment: .top) {
                    ForEach(suggestions.categories, id: \.self) { id in
                        if let dep = shop.departments[id] {
                            Button {
                                back()
                                kgOnly = false
                                photoOnly = false
                                chooseCat(id)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    CategoryImage(icon: dep.icon).frame(width: 36, height: 36)
                                    Text(dep.name).font(type(12, 600)).lineLimit(2)
                                }.frame(width: 92, alignment: .leading).padding(10).tile()
                            }
                        }
                    }
                }
            }.scrollIndicators(.hidden)
        }
    }
}
