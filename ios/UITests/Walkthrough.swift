import XCTest

final class Walkthrough: XCTestCase {
    func testNativeShopping() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-RecordShopping", "-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        func tap(_ label: String) {
            let button = app.buttons[label].firstMatch
            XCTAssertTrue(button.waitForExistence(timeout: 15), label)
            button.tap()
            Thread.sleep(forTimeInterval: 1)
        }
        func capture(_ name: String) {
            let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
            a.name = name
            a.lifetime = .keepAlways
            add(a)
        }
        XCTAssertTrue(app.buttons["stores"].waitForExistence(timeout: 35))
        XCTAssertEqual(app.webViews.count, 0)
        Thread.sleep(forTimeInterval: 2)
        capture("01-home")
        tap("stores")
        capture("02-stores")
        tap("store-1")
        tap("open-search")
        let searchField = app.textFields["Найти товар"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Популярные"].exists)
        searchField.tap()
        searchField.typeText("2")
        let chip = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "append-")).firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 10))
        capture("14-suggestions")
        chip.tap()
        let refined = searchField.value as? String ?? ""
        XCTAssertTrue(refined.hasPrefix("2 "))
        tap("submit-" + refined)
        XCTAssertTrue(app.buttons["Изменить запрос"].exists)
        tap("Изменить запрос")
        tap("Очистить поиск")
        searchField.typeText("2")
        tap("submit-2")
        tap("Популярные")
        tap("Сначала дешевле")
        capture("12-search")
        tap("Назад")
        tap("Очистить поиск")
        XCTAssertTrue(app.staticTexts["История"].exists)
        tap("Очистить")
        XCTAssertFalse(app.staticTexts["История"].exists)
        searchField.tap()
        searchField.typeText("zzzzzz")
        tap("submit-zzzzzz")
        XCTAssertTrue(app.staticTexts["Ничего не найдено"].waitForExistence(timeout: 8))
        tap("Назад")
        tap("Отмена")
        tap("stores")
        tap("store-0")
        tap("cat-veg")
        tap("Фильтры")
        tap("Весовые товары")
        tap("Закрыть")
        tap("Популярные")
        tap("Популярные")
        tap("open-2")
        capture("03-item")
        tap("Сохранить товар")
        tap("add-2")
        tap("Меньше")
        tap("add-2")
        tap("Закрыть")
        tap("tab-favorites")
        capture("04-favorites")
        tap("tab-account")
        capture("05-account")
        tap("Войти или зарегистрироваться")
        tap("Зарегистрироваться")
        tap("Назад")
        tap("account-address")
        capture("10-address")
        tap("Назад")
        tap("account-settings")
        capture("13-settings")
        tap("Назад")
        tap("account-about")
        tap("Назад")
        tap("tab-cart")
        capture("06-cart")
        tap("checkout")
        capture("07-checkout")
        app.swipeUp()
        tap("choose-time")
        capture("08-time")
        if app.buttons["asap"].exists {
            tap("asap")
        }
        app.swipeUp()
        Thread.sleep(forTimeInterval: 1)
        capture("09-summary")
        let send = app.buttons["send-order"]
        for _ in 0 ..< 6 where !send.isHittable {
            app.swipeUp()
        }
        tap("send-order")
        tap("Продолжить")
        capture("11-orders")
    }
}
