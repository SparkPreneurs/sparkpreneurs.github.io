# Website payment connections

## Winter Camp setup

Winter Camp now has a standalone backend and a server-calculated total review.
Follow [WINTER_CAMP_SETUP.md](WINTER_CAMP_SETUP.md) to deploy a separate test
service, validate payment and registration, then connect the live service with
`PUBLIC_WINTER_CAMP_ENDPOINT`. The supplied test deployment is configured locally
and passed hosted availability, price review, Stripe sandbox payment, paid
registration verification, duplicate verification and shared-capacity checks.
One sample Christmas Camp booking remains in the test workbook (nine places
remaining). See the setup guide for the tested amount and remaining checks.
Production still requires a separate verified live endpoint.

## New PA Day Camp setup

PA Day Camp now has a standalone backend source and a two-step total review and
Stripe checkout flow. It has **not been deployed**. Follow
[PA_DAY_CAMP_SETUP.md](PA_DAY_CAMP_SETUP.md) to create its workbook and Apps Script
project, configure tax and shared date capacity, test payments, and set
`PUBLIC_PA_DAY_CAMP_ENDPOINT` for the website build. No endpoint or tax rate is
assumed. Production checkout requires the live `pa_day_camp` backend with
`bookingVersion: 1`; development uses Stripe test mode.

Each registration page sends JSON to its existing Google Apps Script `/exec`
endpoint using `Content-Type: text/plain;charset=utf-8`, then redirects to a
validated HTTPS Stripe Checkout URL. The backend calculates trusted prices and
verifies payment with Stripe. A successful return URL alone is not proof of payment.

## Connection audit (October 26, 2026)

Read-only GET health requests succeeded for all six deployed services. No live
checkout sessions or charges were created during this audit.

| Website page | Program code | Deployed health result |
| --- | --- | --- |
| `/programs/pottery-wheel/` | `august_september_2026_pottery_wheel` | Correct program, live mode |
| `/programs/hand-building-pottery/` | `adult_hand_building_pottery` | Correct program, live mode |
| `/programs/3d-printing/` | `august_2026_3d_printing` | Correct program, live mode |
| `/programs/zumba/` | `august_september_2026_zumba` | Correct program, live mode |
| `/after-school/` | `after_school_program` | Correct program, live mode, **missing `bookingVersion: 1`** |
| `/camps/summer-camp/` | `summer2026_4_10_sessions` | Shared service lists the camp program; legacy health response has no Stripe mode |

The first five retain their existing endpoint URLs. Summer Camp now uses the
endpoint and request contract from the original public camp registration page.
Session selection replaces another selection for the same week. A full day
expands into the original `W7AM`/`W7PM` style product codes, with 13% HST on the
subtotal. Closed weeks have no purchase controls. The page retains the existing
schedule's explicit open/closed flags; backend Products remain authoritative for
price and availability. Verify those historical 2026 products before accepting
new registrations.

Camp payment returns use `https://sparkpreneurs.ca/summer-camp/`, preserving
compatibility with the original service. The Netlify redirect maps that path to
`/camps/summer-camp/` while forwarding Stripe's payment/session query parameters.
Keep this redirect when publishing. Other hosts must provide the equivalent
redirect before checkout is enabled there.

## After School live backend (verified November 17, 2026)

The new live deployment is version `2026-11-16-after-school-4`, with
`bookingVersion: 1`, `checkoutVersion: 1`, and `stripeMode: "live"`.

- Endpoint: `https://script.google.com/macros/s/AKfycbxlv4NzTR4JeO9LgZbKAnorFN7E5JTC5t-bnb3aQ3zlOCKP7kUeYCmm7Wz8llam-8Y/exec`
- Live workbook: https://docs.google.com/spreadsheets/d/1FsxpTEq0x5kPl0miRwYC6QdeETs8WnElh6Xwn8LY2ec/edit
- Script project: https://script.google.com/home/projects/1qChbQuEoIgYS7wGYRyBI6XQINzZShPqELyGQhwJ0j_F5DY7wvZGwJyJL/edit

Verified public health, calendar, all three regular-price quotes, and KUMON25
through the shared live discount service. Four weeks cost $379.68 / $470.08 /
$542.40 including the configured 13% tax. KUMON25 reduces AFTER3's four-week
total to $351.43. No live checkout sessions, registrations, or charges were
created by these checks. A real live payment and final registration write still
require a customer-approved end-to-end check.

The owner reports running `configureLiveAfterSchool`, which initializes the
workbook and installs reconciliation every five minutes after authorizing Stripe,
spreadsheet and mail access. Public calendar access was confirmed afterwards.

The frontend fallback and GitHub Pages workflow point to this live endpoint.
The local `.env` retains the separate test endpoint. Push the frontend changes
to the website's `main` branch to publish them; local source edits do not publish
the website or update Apps Script deployments. See [AFTER_SCHOOL_SETUP.md](AFTER_SCHOOL_SETUP.md).

## Discounts and other booking pages

The five standalone source backends support the shared discount service. The
currently deployed health responses do not advertise that feature. Follow
[DISCOUNTS_SETUP.md](DISCOUNTS_SETUP.md) to roll out discounts; the UI only shows
discount fields after the deployed service advertises support. The original
Summer Camp service has no advertised discount API.

Events, studio rental, and future workshops currently request custom quotes or
expressions of interest. They have no defined payable products or payment
forms, so their inquiry links remain email links.

## Local verification

```powershell
node --test tests/after-school.test.mjs tests/3d-printing.test.mjs tests/pottery-wheel.test.mjs tests/pottery-discounts.test.mjs tests/summer-camp.test.mjs
npm.cmd run check
npm.cmd run build
node tests/pottery-discounts.browser.mjs
```

The browser test accepts `PLAYWRIGHT_MODULE_PATH` for an existing Playwright
installation. Its Google and Stripe requests are mocked. It covers desktop and
mobile registration, discounts, camp full-day product codes, payment verification,
and horizontal overflow. These checks do not prove a live card transaction or
spreadsheet write. Publish the website changes and validate the account-side
configuration separately.
