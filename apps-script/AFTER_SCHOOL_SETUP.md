# After School backend setup

The local source is `AFTER_SCHOOL_PROGRAM.gs`, version `2026-11-16-after-school-4`. Copying or editing this file locally does not update Google Apps Script.

## Booking rules

- Starts are Mondays strictly after today, using America/Toronto time. On Monday, the earliest start is the following Monday.
- Each registration covers one child and 4 to 12 consecutive weeks.
- All three plans share a maximum of 30 children per purchased week. Pending checkouts hold a place until Stripe confirms expiration; paid registrations keep their places.
- Attendance weekdays are arranged with the studio outside the website.
- New workbooks seed AFTER3 at $84, AFTER4 at $104, and AFTER5 at $120 per week. Existing workbook prices are preserved. The frontend loads the current prices and tax from Products.
- A block crossing a closed or full week is rejected. Weeks are not silently skipped or added.

## Test setup

1. Create a separate test spreadsheet and Apps Script project. Paste the complete `AFTER_SCHOOL_PROGRAM.gs` source into Code.gs. Do not combine it with another program's backend.
2. Under Project Settings > Script Properties, add:

   | Property | Value |
   | --- | --- |
   | `AFTER_SCHOOL_SPREADSHEET_ID` | Spreadsheet ID from the test workbook URL |
   | `STRIPE_MODE` | `test` |
   | `STRIPE_SECRET_KEY_TEST` | Your Stripe test secret key |
   | `AFTER_SCHOOL_WEEKLY_CAPACITY` | `30` (optional; default 30, allowed 0 to 30) |
   | `BOOKING_CLOSED_WEEKS` | `[]`, or a JSON array of closed Mondays such as `["2026-12-21"]` |
   | `BOOKING_LAST_WEEK` | Optional final purchasable Monday, `YYYY-MM-DD`; omit for no season limit |

   `BOOKING_FIRST_WEEK` is no longer used. The earliest Monday moves automatically. Product capacity columns are retained for compatibility; the shared limit comes from `AFTER_SCHOOL_WEEKLY_CAPACITY`.
3. Run `setupPeriodWorkbook`. Check the three Products rows, their active values, prices in cents, and `taxRatePercent`. New rows retain the existing 13% tax default; confirm the rate before accepting payment. Setup preserves existing rows and prices and appends supported columns without moving legacy payment fields. Unexpected headers cause an error.
4. Run `testAfterSchoolConfiguration`, then `authorizeRequiredServices`. Grant spreadsheet, external request and mail permissions. Authorization checks Stripe access without creating a charge or sending an email.
5. Deploy > New deployment > Web app. Execute as yourself; access: Anyone. Copy the `/exec` URL.
6. Put `PUBLIC_AFTER_SCHOOL_ENDPOINT=<test /exec URL>` and `PUBLIC_AFTER_SCHOOL_STRIPE_MODE=test` in local `.env`. Restart `npm run dev` at `http://localhost:4321`. Local development defaults to test mode. Production builds require live mode.
7. Add an Apps Script time-driven trigger for `reconcilePendingPayments` every five minutes. This records verified payments even if the parent does not return and releases holds only after Stripe confirms expiration.
8. Test dates, 4/12-week boundaries, all prices, a full week, an invalid discount, a successful Stripe test payment, canceled payment, and repeat verification. Confirm one paid Registrations row with all purchased Mondays. Test cards belong only in Stripe test checkout.

## Discounts

Use the same shared discount service as Winter Camp: set `DISCOUNT_SERVICE_URL` and `DISCOUNT_SERVICE_KEY` in Script Properties. Configure eligible codes for `after_school_program` in that service. See [DISCOUNTS_SETUP.md](DISCOUNTS_SETUP.md). Without both properties, the page hides the code section. The server applies discounts before tax and persists the code and savings with the booking. Neither the shared key nor Stripe secret belongs in `.env` or frontend code.

## Existing workbook migration

Back up the workbook and script before replacing a deployed source. Run setup to append the booking and discount columns. Old attempts without `paidWeekStarts` cannot safely determine weekly occupancy and block new bookings until reviewed. Recover their actual dates and reconcile their Stripe status; do not delete paid records or mark uncertain payments failed simply to clear capacity. Use separate workbooks for test and live mode.

Checkout sessions expire after 30 minutes. Failed discount reservations before Stripe release their holds. Network failures with an uncertain Stripe outcome retain their holds and are logged for owner review. Orders without a saved session ID require checking Stripe before releasing capacity. Refunds, cancellations after payment, and manual bookings require owner updates to occupancy records; they are not automatically synchronized.

## Live deployment

1. After testing, install the source in the live project and set the live spreadsheet ID, `STRIPE_MODE=live`, and `STRIPE_SECRET_KEY_LIVE`. Confirm live Products prices, tax, closures, capacity, and any discount service settings. Run setup, configuration checks, and authorization in that project.
2. Deploy the new source version. To keep the current endpoint, use Deploy > Manage deployments > Edit > New version > Deploy. Changing Script Properties alone does not require a new source deployment.
3. Confirm health reports `programCode: "after_school_program"`, `version: "2026-11-16-after-school-4"`, `bookingVersion: 1`, `checkoutVersion: 1`, and `stripeMode: "live"`. Confirm `getBookingCalendar` returns the expected prices and availability.
4. The GitHub Pages workflow and `src/pages/after-school.astro` fallback now point to the verified live endpoint. If creating a new deployment URL later, update `PUBLIC_AFTER_SCHOOL_ENDPOINT` in `.github/workflows/deploy.yml` and the page fallback before pushing. Local `.env` settings are separate from GitHub Pages.
5. Confirm the reconciliation trigger exists in the live project. Review the deployed frontend and complete an agreed live payment check before opening registration publicly.

The frontend blocks incompatible or wrong-mode backends. It reviews a server quote first, then creates Stripe checkout only if the amount still matches. Registration is saved only after Stripe confirms the correct paid CAD session, program, order, plan and dates. Studio email notification is best effort and sent on the first successful registration write.

## Local checks

`node --test tests/after-school.test.mjs`

`npm run build`

`node tests/after-school.browser.mjs` (requires Playwright; optional `PLAYWRIGHT_MODULE_PATH` and `BROWSER_CHANNEL`). Browser tests mock Google and Stripe and create no charges.

## Recovering a paid checkout rejected by the old date comparison

Version `2026-11-16-after-school-4` preserves the ISO day for booking Date cells stored at midnight UTC; other Date cells use the workbook timezone. This handles ISO dates parsed at UTC midnight even when the workbook timezone is America/Los_Angeles. Real mismatches still fail and now name the affected fields. No sheet edits or new payment are needed for a date-type mismatch.

Replace the After School script source, save it, and run `reconcilePendingPayments` in the editor. Confirm the existing order becomes PAID, its registration is written once, and its discount usage becomes PAID. Publish the source as a new version of the existing web-app deployment so website returns also use the fix. If reconciliation still reports a mismatch, compare the named fields with the existing Stripe session and investigate before editing any payment record.
