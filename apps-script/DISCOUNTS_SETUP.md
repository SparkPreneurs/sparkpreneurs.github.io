# KUMON25: $25 off, once per email across registrations

All active checkout forms support this discount: Pottery Wheel, Hand-Building
Pottery, 3D Printing, Zumba, After School, and PA Day Camp. Summer Camp uses its original
shared checkout service, whose deployed API does not advertise discount support;
its checkout does not offer this discount.

Pottery Wheel's base price is $250. KUMON25 reduces it to $225 before any
applicable tax. The other programs retain their trusted Products-tab prices.
The $25 discount applies once to the registration subtotal, before tax, rather
than once per week/session/date. Each email may redeem KUMON25 once across all six
programs. Matching ignores letter case and surrounding whitespace. This does
not verify email ownership or identify people using different addresses.

## Architecture

`DISCOUNT_SERVICE.gs` is a separate standalone Apps Script service with a small
shared workbook containing `Discounts` and `Discount Usage`. Registration and
medical data remain in their existing program workbooks. The shared workbook
stores only the discount email, program/order/session identifiers, expected
total, and reservation/payment status.

Each standalone program backend embeds the same server-only client from
`shared/discount-client.js`. After editing that reference client, regenerate the
embedded copies before deployment; tests check they remain identical. Do not
paste the reference client as an additional editor file alongside a complete
backend, because it is already embedded.

The browser only calls its program backend. The private discount service key
is never sent to the browser. All programs must use the same Stripe account
as the discount service so it can retrieve/expire their checkout sessions.

## First account step: create the discount workbook

Create a private Google Sheet named **SparkPreneurs Discounts**. Its ID is the
part of its URL between `/d/` and `/edit`. Do not make it public.

The following steps are deployment instructions, not actions performed by
editing this repository. Complete test mode in isolated test workbooks and
projects before changing any live registration deployment.

## Deploy the shared service

1. Create a standalone Apps Script project named **SparkPreneurs Discounts**.
   Paste the complete `DISCOUNT_SERVICE.gs` source into its editor.
2. Add these private Script Properties:

   | Property | Value |
   | --- | --- |
   | `DISCOUNT_SPREADSHEET_ID` | The new workbook ID |
   | `DISCOUNT_SERVICE_KEY` | A private random value of at least 32 characters; use the same value in each program project |
   | `STRIPE_SECRET_KEY_TEST` | The same Stripe account's test secret key |
   | `STRIPE_SECRET_KEY_LIVE` | Add the same account's live key only when preparing live launch |

   Enter keys directly in Apps Script. Never send them in chat or commit them.
3. Run `setupDiscountWorkbook()` and authorize Google access. It creates the two
   tabs and adds `KUMON25`, amount `2500` cents, active `TRUE`, with no expiry.
   Rerunning setup preserves usage and existing code settings.
4. Deploy a Web App, executing as the owner, accessible to Anyone. Server-to-
   server operations require the private service key; public requests cannot
   read the discount ledger. Copy the `/exec` deployment URL.

`Discounts` has columns `code`, `amountCents`, `active`, `expiresAt`. Codes are
case-insensitive. Amounts are positive integer Canadian cents. An optional
expiry must be a timestamp with timezone. Duplicate, expired, inactive, invalid,
or full-price-covering discounts are rejected.

## Update each registration backend

For each participating program backend in this directory (including `PA_DAY_CAMP.gs`):

1. Paste its complete updated source into its existing program Apps Script
   project (or an isolated copy during testing).
2. Add `DISCOUNT_SERVICE_URL` with the shared service's `/exec` URL, and
   `DISCOUNT_SERVICE_KEY` with the same private key. Retain that program's own
   spreadsheet ID and Stripe properties. Each program's `STRIPE_MODE` selects
   test or live; test redemptions never consume live eligibility.
3. For Pottery Wheel, run `setupPeriodWorkbook()` to add its new discount
   columns. Existing products and paid-registration values are preserved. The
   migration stops if the existing column order differs unexpectedly.
4. Deploy a new Web App version. Merely saving source does not update the live
   deployment. Keep existing deployment URLs where possible. If a URL changes,
   update the corresponding page's endpoint. The new standalone 3D Printing
   backend can replace the older shared deployment; the frontend accepts both
   health-response formats during rollout.
5. Confirm ping reports the new discount version and `discountsSupported: true`.
   The discount input stays hidden until its program backend reports support.

The frontend files also need publishing through the usual website deployment.
No Apps Script deployments, spreadsheet edits, or website publishing are
performed automatically by this change.

PA Day Camp uses **Apply code** to request its total review and **Remove code**
to return to a regular-price review. Its workbook already contains `discountCode`
and `discountCents`, so no discount column migration is needed. See
[PA_DAY_CAMP_SETUP.md](PA_DAY_CAMP_SETUP.md#optional-discounts) for the test-service
connection steps. The shared discount service already accepts `pa_day_camp`.

## Verification and concurrency

- Applying a code requests a quote from the program backend. Pricing and tax
  come from Products. Browser-supplied savings/totals are not trusted.
- Changing email, code, schedule, or booking weeks invalidates the quote.
  A new total must be reviewed before checkout.
- Before creating a discounted Stripe session, the program backend obtains a
  shared reservation. The shared service holds one lock across all programs
  while checking existing usage and invalidating old unpaid payment links.
- The program creates Stripe checkout and attaches its session to that
  reservation before returning the payment URL. The shared service verifies
  its order metadata, program, mode, currency and expected amount directly
  with Stripe.
- Payment verification records usage as paid. Future discount requests also
  retrieve Stripe sessions: a paid session blocks reuse even if its customer
  never returns to the website.
- Old open sessions are expired before a replacement reservation is issued.
  If payment wins that race, no replacement discount is issued. Expired unpaid
  sessions do not consume a code; payments still processing block reuse.
- Uncertain session creation/attachment leaves a reservation blocked for
  review. Do not delete it or mark it expired merely to retry. Locate the Stripe
  session using its order metadata, confirm its status, then reconcile the
  ledger. A paid or still-payable session must never be released for reuse.
- Paid registration verification remains idempotent in each program backend.

## Checks

```powershell
node --test tests/after-school.test.mjs tests/3d-printing.test.mjs tests/pottery-wheel.test.mjs tests/pottery-discounts.test.mjs
npm.cmd run build
node tests/pottery-discounts.browser.mjs
```

The browser script uses Playwright and the built site, intercepts all Google
and Stripe requests, and checks desktop/mobile layouts. It also accepts
`PLAYWRIGHT_MODULE_PATH` pointing to a temporary Playwright installation.
No live payment is created by these tests. A full test-mode deployment/payment
check and intentional live rollout remain required account steps.
