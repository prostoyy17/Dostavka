import XCTest

final class Walkthrough:XCTestCase {
    func testNativeShopping() {
        continueAfterFailure=false
        let app=XCUIApplication()
        app.launchArguments += ["-AppleLanguages","(ru)","-AppleLocale","ru_RU"]
        app.launch()
        func tap(_ label:String) {
            let button=app.buttons[label].firstMatch
            XCTAssertTrue(button.waitForExistence(timeout:15),label)
            button.tap()
            Thread.sleep(forTimeInterval:1)
        }
        func capture(_ name:String) {
            let a=XCTAttachment(screenshot:XCUIScreen.main.screenshot());a.name=name;a.lifetime = .keepAlways;add(a)
        }
        XCTAssertTrue(app.buttons["stores"].waitForExistence(timeout:35))
        XCTAssertEqual(app.webViews.count,0)
        Thread.sleep(forTimeInterval:2); capture("01-home")
        tap("stores");capture("02-stores");tap("store-0");tap("Готово")
        tap("open-2");capture("03-item");tap("Сохранить товар");tap("add-2");tap("Закрыть")
        tap("tab-favorites");capture("04-favorites");tap("tab-account");capture("05-account")
        tap("tab-cart");capture("06-cart");tap("checkout");capture("07-checkout")
        app.swipeUp();Thread.sleep(forTimeInterval:1);capture("08-time")
        app.swipeUp();Thread.sleep(forTimeInterval:1);capture("09-summary")
    }
}
