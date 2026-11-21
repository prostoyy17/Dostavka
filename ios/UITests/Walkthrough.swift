import XCTest

final class Walkthrough: XCTestCase {
    func testStorefrontOpens() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.webViews.buttons.containing(NSPredicate(format: "label CONTAINS %@", "Все магазины")).firstMatch.waitForExistence(timeout: 90))
    }
}
