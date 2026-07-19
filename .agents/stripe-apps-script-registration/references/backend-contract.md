# Period Backend Contract

Read this reference whenever generating or reviewing a period-specific `.gs` backend.

## Legacy reference

The repository root `Code.gs` is the legacy multi-program backend. Treat it as read-only example material. Learn from its request routing, trusted pricing, dynamic Stripe Checkout creation, payment retrieval, waiver normalization, and idempotent registration upsert. Do not copy its shared spreadsheet IDs, program lists, conditional pricing-sheet routing, old prices, or separate waiver spreadsheet into a new period backend.

The period-specific `.gs` file is the source copied into that period's standalone Apps Script project. It must be complete; it must not import or depend on root `Code.gs`.

## Workbook schema

Use one private Google Spreadsheet with exactly these operational tabs.

### Products

```text
programCode | itemCode | itemName | startDate | endDate | startTime | endTime | priceCents | taxRatePercent | active | capacity
```

Rules:

- Store money as integer cents.
- Use stable uppercase item codes containing only `A-Z`, `0-9`, `_`, and `-`.
- Keep `programCode` fixed to the backend's `PROGRAM_CODE`.
- Read only rows with the matching program code and a truthy `active` value.
- Treat blank capacity as unlimited. If capacity is used, validate it as a non-negative integer.
- Do not accept product name, price, tax, date, or availability from the frontend as trusted data.

### Checkout Attempts

Create headers in code. Store one row per server-created order/session, including:

```text
createdAt | updatedAt | programCode | orderId | stripeSessionId | stripeMode | status | selectedItemCodes | selectedItemNames | subtotalCents | taxCents | expectedAmountCents | studentName | parentName | parentEmail | phone | waiver fields | medical fields | lastError
```

Use this tab for submitted registration, waiver, and medical details before payment. Update by `stripeSessionId` or `orderId`; do not append a second attempt row during verification.

### Registrations

Create headers in code. Include the checkout fields plus:

```text
paidAt | stripePaymentIntentId | stripePaymentStatus | registrationStatus
```

Write only after retrieving the Checkout Session directly from Stripe and verifying payment. Upsert by `stripeSessionId` so browser retries and webhook retries cannot create duplicates.

## Script properties

Read secrets only with `PropertiesService.getScriptProperties()`.

```text
STRIPE_MODE=test|live
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_SECRET_KEY_LIVE=sk_live_...
STRIPE_WEBHOOK_TOKEN_TEST=<optional random token>
STRIPE_WEBHOOK_TOKEN_LIVE=<optional random token>
```

Select the key server-side from `STRIPE_MODE`. Validate that test mode uses an `sk_test_` key and live mode uses an `sk_live_` key before making a Stripe request. Never return, log, or place these values in sheet cells.

## Request boundary

`doGet()` must return only a health object such as:

```json
{"success":true,"version":"2026-07-19-1","programCode":"fall_2026_hand_building_pottery","stripeMode":"test"}
```

Do not return products, registrations, personal information, properties, or errors with stack traces from GET.

`doPost(e)` must:

1. Require a request body and enforce a conservative maximum byte length.
2. Parse JSON in a try/catch.
3. Accept only explicit actions such as `ping`, `createCheckoutSession`, and `verifyCheckoutSession`.
4. Reject a request program code that does not exactly match `PROGRAM_CODE`.
5. Return JSON with a generic failure message; log enough non-secret context for diagnosis.

Do not trust request method semantics as authentication. The endpoint is public because the static website must call it.

## Input safety

- Require all mandatory registration and waiver fields server-side.
- Trim strings, enforce field-specific maximum lengths, validate dates and email shape, and reject invalid enumerated values.
- Reject empty selections, excessive selection counts, malformed item codes, and duplicate item codes.
- Normalize item codes before lookup.
- Neutralize spreadsheet formulas in every user-controlled string before writing. Prefix values beginning with `=`, `+`, `-`, or `@` with an apostrophe.
- Do not accept a Stripe session URL or payment status from the frontend.
- Allow only exact SparkPreneurs HTTPS origins for success and cancel URLs. Validate with URL parsing and hostname equality, not loose substring matching.
- Do not put medical details, waiver text, dates of birth, phone numbers, or signatures in Stripe metadata.

## Trusted pricing and Checkout

The frontend may send `displayedAmountCents` only as a consistency check. The backend must:

1. Load selected item codes from `Products`.
2. Reject unknown, inactive, wrong-program, or unavailable items.
3. Calculate subtotal, discount if explicitly supported, tax, and total using sheet values.
4. Return `Amount mismatch` with the trusted expected amount if the display differs.
5. Create Stripe Checkout with dynamic `price_data` from the trusted total.
6. Serialize Stripe integer fields as strings for Apps Script form encoding.
7. Generate `orderId` server-side.
8. Put only compact non-sensitive identifiers and verified totals in Stripe metadata.
9. Save the `Checkout Attempts` row only with server-generated Stripe/session/order values.

The current architecture intentionally uses dynamic `price_data`; fixed Stripe Price IDs are not required for small, period-specific workshop catalogs.

## Payment verification and writes

Never mark a registration paid because the browser returned to a success URL.

For `verifyCheckoutSession` and any webhook path:

1. Validate the session ID shape.
2. Retrieve the Checkout Session from Stripe using the active mode's secret key.
3. Require `payment_status === "paid"`.
4. Require the expected currency.
5. Require `amount_total` to equal the trusted attempt total.
6. Require metadata program code and order ID to match the stored attempt.
7. Acquire `LockService.getScriptLock()` before changing sheets.
8. Recheck for an existing registration by Stripe session ID while holding the lock.
9. Upsert exactly one paid registration and mark the attempt paid.
10. Release the lock in `finally`.

If the session is unpaid, return an unpaid response and leave `Registrations` unchanged.

Apps Script Web Apps do not reliably expose the raw Stripe signature header needed for normal webhook signature verification. If a webhook is used, protect its URL with a long environment-specific token and still retrieve the session from Stripe before writing. Do not treat the webhook body itself as proof of payment.

## Consistency and operations

- Make `setupPeriodWorkbook()` additive and safe to re-run.
- Create missing tabs and headers without clearing registrations or attempts.
- Refuse to overwrite non-empty product data silently.
- Freeze header rows and use clear column names.
- Use batch `setValues()` where practical.
- Use one unique `SCRIPT_VERSION` change for every deployed code revision.
- Keep test and live keys separate even though one `STRIPE_MODE` selects the active environment.
- Disable the frontend submit button while a request is pending, but do not rely on that for backend idempotency.
- Expect public endpoints to receive malformed and automated requests; fail closed without exposing personal data or secrets.

## Required checks

Run local syntax and secret scans before handoff:

```powershell
Get-Content 'apps-script/PERIOD_MAIN_ACTIVITY_NAME.gs' | node --check --input-type=commonjs -
rg -n 's[k]_(live|test)|r[k]_(live|test)|STRIPE_SECRET_KEY[^\n]*=[^\n]*s[k]_' -S .
```

After deployment, verify health/version, wrong program, invalid item, duplicate item, amount mismatch, valid unpaid Checkout creation, unpaid verification, one paid test registration, and repeated verification without duplication.

