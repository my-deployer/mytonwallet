import Foundation
import Testing
@testable import UIComponents

@Suite("Activity Date Formatting")
struct ActivityDateFormattingTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private let locale = Locale(identifier: "en_US_POSIX")

    @Test
    func `today always uses time even after twelve hours`() {
        let now = date(2026, 8, 30, 23)
        let activityDate = date(2026, 8, 30, 1)

        #expect(!ActivityDateFormatting.shouldShowDate(
            for: activityDate,
            relativeTo: now,
            calendar: calendar
        ))
    }

    @Test
    func `previous day keeps time through twelve hour boundary`() {
        let now = date(2026, 8, 30, 10)

        #expect(!ActivityDateFormatting.shouldShowDate(
            for: date(2026, 8, 29, 22),
            relativeTo: now,
            calendar: calendar
        ))
        #expect(ActivityDateFormatting.shouldShowDate(
            for: date(2026, 8, 29, 21, 59),
            relativeTo: now,
            calendar: calendar
        ))
    }

    @Test
    func `date omits current year and includes a different year`() {
        let now = date(2026, 8, 30, 10)

        #expect(ActivityDateFormatting.dateText(
            for: date(2026, 8, 29),
            relativeTo: now,
            calendar: calendar,
            locale: locale
        ) == "August 29")
        #expect(ActivityDateFormatting.dateText(
            for: date(2025, 12, 31),
            relativeTo: now,
            calendar: calendar,
            locale: locale
        ) == "December 31, 2025")
    }

    @Test
    func `activity timestamp uses abbreviated system date`() {
        let now = date(2026, 8, 30, 10)

        #expect(ActivityDateFormatting.timestampText(
            for: date(2026, 8, 29),
            mode: .dateWhenOlderThanTwelveHours,
            relativeTo: now,
            calendar: calendar,
            locale: locale
        ) == "Aug 29")
        #expect(ActivityDateFormatting.timestampText(
            for: date(2025, 12, 31),
            mode: .dateWhenOlderThanTwelveHours,
            relativeTo: now,
            calendar: calendar,
            locale: locale
        ) == "Dec 31, 2025")
    }

    private func date(
        _ year: Int,
        _ month: Int,
        _ day: Int,
        _ hour: Int = 0,
        _ minute: Int = 0
    ) -> Date {
        calendar.date(from: DateComponents(
            year: year,
            month: month,
            day: day,
            hour: hour,
            minute: minute
        ))!
    }
}
