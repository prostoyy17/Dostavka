import XCTest

final class Walkthrough: XCTestCase {
    func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
    }

    func testShopping() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let shops = app.buttons["stores"]
        XCTAssertTrue(shops.waitForExistence(timeout: 15))
        sleep(6)
        capture("01-catalog")
        shops.tap()
        sleep(2)
        app.buttons["Вкусдом"].firstMatch.tap()
        let item = app.buttons["product-1933184393"]
        XCTAssertTrue(item.waitForExistence(timeout: 5))
        sleep(2)
        item.tap()
        let add = app.buttons["add"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        sleep(2)
        capture("02-product")
        add.tap()
        sleep(2)
        app.tabBars.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Корзина")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["1 шт"].waitForExistence(timeout: 8))
        sleep(2)
        capture("03-cart")
        sleep(2)
    }
}
