# Winter Camp registration and payments

The local backend and website integration are ready. The deployed test web app
is connected in the local `.env`. The unit and browser regression tests use
in-memory substitutes. The hosted check below used the actual Google web app
and Stripe sandbox; no real money was charged.

## Test deployment check — November 11, 2026

The provided [test deployment](https://script.google.com/macros/s/AKfycbzmC8ZmPCiccJO72brfRywPnZJi2IqqUUXCbHy1YDqceaa8Pbmezdm4zziGdXlhFw4/exec)
reports `winter_2026_camp`, `bookingVersion: 1`, version
`2026-11-11-winter-1` and Stripe `test` mode. Hosted end-to-end checks passed:

- Health and availability returned the correct program and ten places per week
  before checkout. Active care options share their base week's capacity.
- The local website reviewed Christmas Camp plus December 21 pickup at 4 PM:
  $330 subtotal, $42.90 configured tax, $372.90 CAD total.
- Stripe sandbox checkout showed the matching camp, pickup and CAD total.
  A payment with Stripe's test card succeeded and returned to the local page,
  which confirmed the paid registration through the hosted backend.
- Two repeat verification requests recognized the existing paid registration.
  Christmas Camp and its care options retained nine places; Winter Break
  retained ten. Care did not consume a second place.
- A tampered one-cent checkout total was rejected with the trusted $372.90
  total, before creating another payable session. Care without its camp week
  and holiday care were also rejected.

The test booking uses child name **Backend Test Child** and parent email
`winter-camp-backend-test@example.com`. It remains in the test workbook and
consumes one Christmas Camp place. The paid-verification response confirms the
backend recorded it; direct workbook inspection, notification delivery and the
scheduled reconciliation trigger were not independently checked. Production
still requires a separate live deployment and live workbook.

## Diagnose product configuration

Do not run `doPost` with the editor's Run button: Google supplies its request
argument only for an actual web request, so a manual run reports "Missing
request data." To diagnose directly in the editor, add this helper at the end
of `Code.gs`, save, select `testWinterCampAvailability`, and click Run:

```javascript
function testWinterCampAvailability() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Products");
  sheet.getDataRange().getValues().slice(1).forEach(function(row, index) {
    console.log(JSON.stringify({ row: index + 2, code: row[1], active: row[9], capacity: row[10] }));
  });
  console.log(JSON.stringify(getAvailability_()));
}
```

This logs only product row numbers, codes, active flags and capacities, then
reads availability and reservation counts without creating a checkout. An
invalid configuration produces the specific error and line number. No web-app
redeployment is needed to run an editor helper.

Activate only intended Products rows and configure the total capacity. The base
week and every active care option must use the same capacity. Confirm product
tax rates as well. An active care option with zero capacity while its base week
has ten is a configuration error; deactivate unavailable care options instead.

## Create the test service

1. Create a dedicated Google spreadsheet and open Extensions → Apps Script.
   Paste [WINTER_CAMP.gs](WINTER_CAMP.gs) into `Code.gs`. Keep this separate from
   PA Day Camp and other programs.
2. Add Script Properties:

   | Property | Value |
   | --- | --- |
   | `WINTER_CAMP_SPREADSHEET_ID` | Your new spreadsheet ID |
   | `STRIPE_MODE` | `test` |
   | `STRIPE_SECRET_KEY_TEST` | Your private `sk_test_…` key |
   | `WINTER_CAMP_TAX_RATE_PERCENT` | Confirmed applicable tax percentage; explicit `0` is allowed |
   | `ENROLLMENT_NOTIFICATION_EMAILS` | Studio notification address |

   Keep Stripe and discount service keys in Script Properties, outside the
   website, Git and chat. The tax setting seeds products; later changes belong
   in the Products rows too. The website reviews the backend's actual tax and
   total instead of assuming a rate.
3. Run `setupPeriodWorkbook`. It preserves existing rows and creates Products,
   Checkout Attempts and Registrations. Twenty product rows cover two $320
   four-day weeks and $10/$20/$30 pickup options on the three eligible days.
   December 24 and 31 have no extended care.
4. Set `active=TRUE` and a confirmed total `capacity` on offered products.
   Every active care option must have its base week active and the same capacity
   as that week. A capacity of zero blocks checkout. Seeded products are inactive
   with zero capacity. Review prices, dates and tax before activating.
5. Run `authorizeRequiredServices`. Deploy as a Web app, executing as the owner,
   accessible to Anyone. Open the `/exec` URL in a private window and check
   `programCode: "winter_2026_camp"`, `bookingVersion: 1`,
   `version: "2026-11-11-winter-1"` and `stripeMode: "test"`.
6. Add a time-driven trigger for `reconcilePendingPayments`, every five minutes.
   It records paid bookings even when customers do not return to the website.
7. Set local `.env`:

   ```dotenv
   PUBLIC_WINTER_CAMP_ENDPOINT=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   PUBLIC_WINTER_CAMP_STRIPE_MODE=test
   ```

   Restart `npm.cmd run dev`; use `http://localhost:4321/camps/winter-camp/`.

## Test hosted registration

- Select either or both weeks, change each eligible day's pickup, and enter child
  and parent details. Click Review Total, check the CAD price and configured tax,
  then Continue to Secure Payment. With a test-mode backend use Stripe's test
  card `4242 4242 4242 4242`, future expiry and any three-digit CVC.
- Confirm Stripe shows the reviewed amount, then check exactly one paid
  Registrations row with child name/age, parent contacts, purchased week and
  each care day's pickup time. Reloading a success URL must not duplicate it.
- Test cancellation, unpaid returns, a fully booked week and unavailable care.
  A return URL alone must never create a paid registration.
- Complete another test payment without returning to the website. Confirm the
  five-minute reconciliation records it. Let an unpaid checkout expire and
  confirm its reserved place returns after reconciliation.
- If using discounts, configure `DISCOUNT_SERVICE_URL` and `DISCOUNT_SERVICE_KEY`
  as in [DISCOUNTS_SETUP.md](DISCOUNTS_SETUP.md), using a test service with the
  same Stripe account/mode. Test savings, tax and once-per-email enforcement.

Each checkout reserves one place per week, regardless of the number of care
options. Canceling does not immediately release the hold: unpaid sessions expire
after 30 minutes and reconciliation releases them after checking Stripe.
Unknown network outcomes retain capacity. Investigate unresolved order IDs in
Stripe before manually releasing them. Paid cancellations/refunds do not
automatically restore capacity. Spreadsheet Places remaining is a display;
backend checkout reads trusted capacities and reservations under a lock.

## Connect production

The supplied live endpoint is configured in `.github/workflows/deploy.yml`:
`https://script.google.com/macros/s/AKfycbyWEnGAaZHFOAnxH0n4BLQpJ9gaZD2HpnG1Khk4p3Joao4uTJu1I4uN0fyXcc2vcMwc/exec`.
Final read-only checks on November 12, 2026 confirmed live Stripe mode, discount
support, and ten available places on both base weeks and all care options.
Christmas Camp plus one hour of December 21 care quotes $330 subtotal,
$42.90 tax and $372.90 CAD total. `KUMON25` quotes $25 savings, $39.65 tax and
$344.65 CAD total. The code was not redeemed. The production build contains this
live endpoint and the correct published return URL. No live checkout or charge
was created. Live Stripe-key authorization, the reconciliation trigger and
notification delivery still require owner-side confirmation. Frontend changes
remain local until pushed and deployed through GitHub Pages.

After sandbox validation, create a separate live workbook and Apps Script
project. Use `STRIPE_MODE=live`, `STRIPE_SECRET_KEY_LIVE=sk_live_…`, the confirmed
tax and real capacities. Repeat setup, authorization, deployment and trigger
creation. Production builds only accept live backends; production payment
returns use `https://sparkpreneurs.ca/camps/winter-camp/`.

GitHub Pages is the production host. The deploy workflow passes
`PUBLIC_WINTER_CAMP_ENDPOINT` directly to Astro. If the endpoint changes, update
the workflow value. Push the release to `main` to trigger the build and
deployment; pushing only `dev` does not publish the site. Local `.env` files do
not configure hosted builds.
For local development connected to a live backend, explicitly set
`PUBLIC_WINTER_CAMP_STRIPE_MODE=live`; returns go to the published page.

After changing Apps Script source, update the existing deployment to a new
version while retaining its `/exec` URL. A local source edit does not update
Google's hosted service.

## Local verification

```powershell
node --test tests/winter-camp.test.mjs tests/winter-camp-backend.test.mjs
npm.cmd run check
npm.cmd run build
node tests/winter-camp.browser.mjs
```

The browser test accepts `PLAYWRIGHT_MODULE_PATH` pointing to an installed
Playwright entry module. Hosted Stripe authorization, spreadsheet writes,
trigger execution and notification delivery still require the test-service
checks above.
