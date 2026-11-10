# PA Day Camp: first-time payment setup

The website and backend source are prepared locally. Nothing has been deployed
to Google or Stripe. The page keeps checkout disabled until its endpoint is set
and the backend reports the correct program and payment mode.

## Upgrade an existing workbook: Places remaining

The latest backend version is `2026-11-10-pa-day-4`. It also provides
`getAvailability` for the website. After replacing `Code.gs`, update the existing
web-app deployment to a new version while keeping its URL. The frontend now
requires this API before enabling date selection. A backend with only the older
checkout API leaves date selection disabled until it is updated.

The page shows remaining places, disables fully booked or inactive dates and
unavailable pickup options, and refreshes availability every minute while visible
and when the browser window regains focus. A date that fills up is removed from
the selection and its reviewed total is invalidated. If availability cannot be
loaded, selection and checkout are disabled and a retry button appears. The API
calculates remaining places directly from trusted capacity and checkout records;
the spreadsheet's display formulas are not used to authorize bookings. Checkout
still checks capacity again under the existing booking lock.

If you already deployed the first version and made test registrations:

1. Replace `Code.gs` in the existing Apps Script project with the updated
   [PA_DAY_CAMP.gs](PA_DAY_CAMP.gs) and save.
2. Update the existing web-app deployment: **Deploy → Manage deployments → Edit →
   New version → Deploy**. Keep the same `/exec` URL. Do this before adding the
   column, because the first backend version rejects extra Products columns.
3. Select **addPlacesRemainingColumn → Run** in the Apps Script editor.
4. Open Products. Column L is now **Places remaining**. Existing products,
   prices, capacities and registrations are preserved. Running the upgrade again
   repairs the formulas without adding another column.

This calculated column updates automatically when checkout records or capacity
change. Both pickup options show the same remaining places when their total
capacities match. Paid bookings and pending/uncertain checkout holds use one
place per date; failed or Stripe-confirmed expired checkouts release it. A hold
becoming paid does not subtract another place. Leave `capacity` as the total
number of children the date can accept, and do not edit the calculated column.
The displayed value is never below zero. Inactive dates can still show remaining
physical places, but cannot be purchased.

New workbooks get the column automatically from `setupPeriodWorkbook`. If you
manually add product rows later, run `addPlacesRemainingColumn` again to fill
their formulas. The display reads the same Checkout Attempts records as the
backend's availability check. Refunds and cancellations of paid registrations
are not currently synchronized automatically from Stripe.

## 1. Create a test workbook and script

1. In Google Sheets, create a blank spreadsheet named **SparkPreneurs PA Day Camp — TEST**.
2. Copy its spreadsheet ID: the text between `/d/` and `/edit` in the address.
3. Open **Extensions → Apps Script**. Name the project **PA Day Camp — TEST**.
4. Replace the contents of `Code.gs` with the entire contents of
   [PA_DAY_CAMP.gs](PA_DAY_CAMP.gs), then save. This is a standalone backend;
   do not paste it into one of the other programs' Apps Script projects.

## 2. Add private settings

In Apps Script, open **Project Settings → Script properties → Add script property**.
Add these properties and save:

| Property | Value |
| --- | --- |
| `PA_DAY_SPREADSHEET_ID` | The new test spreadsheet ID |
| `STRIPE_MODE` | `test` |
| `STRIPE_SECRET_KEY_TEST` | Your Stripe sandbox secret key, beginning `sk_test_` |
| `PA_DAY_TAX_RATE_PERCENT` | The tax percentage you have confirmed for this camp; use `0` only if confirmed appropriate |
| `ENROLLMENT_NOTIFICATION_EMAILS` | `sparkpreneurs.ca@gmail.com`, or your preferred notification address |

Get the test key from your Stripe account's sandbox API keys page. Keep secret
keys in Script Properties. Do not paste them into chat, the website, or Git.
The tax property seeds new Products rows; later tax changes must be made in the
Products sheet too. No tax rate has been assumed for this new camp.

Google documents manual property management in its
[Properties Service guide](https://developers.google.com/apps-script/guides/properties).

## 3. Create and configure the spreadsheet tabs

1. In the Apps Script function selector, choose **setupPeriodWorkbook**, then
   click **Run**. Complete Google's authorization prompts using the project owner's account.
2. Return to the spreadsheet. It now has **Products**, **Checkout Attempts**, and
   **Registrations** tabs. Leave their column names and order unchanged.
3. Products contains two options for each date already displayed on the website:
   standard care, $85 (8500 cents), and extended care, $105 (10500 cents).
4. Verify the studio will offer each date, the pickup times, and the prices.
   For each date you will offer, set **active** to `TRUE` and **capacity** to the
   total number of children the camp can accept. Put the **same capacity on both
   pickup options**: they share one pool of places. A capacity of zero blocks sales.
   Seeded rows are inactive with zero capacity until you configure them.
5. Confirm **taxRatePercent** on all enabled rows. The backend requires the same
   rate for the purchased options. Keep prices in whole cents.
6. Run **authorizeRequiredServices** to check spreadsheet access and your test
   Stripe key. Missing or invalid configuration causes an error in the execution log.

Only future dates can be purchased, using Toronto's date. Closed products are
rejected by the backend even if the website still shows that date. Dates and
base prices on the website live in `src/data/pa-day-camp.ts`; update that file
too when the schedule or advertised prices change.

## 4. Deploy the test backend

1. Choose **Deploy → New deployment**.
2. Select deployment type **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone** so parents can register
   without a Google account. If your organization disallows that setting, this
   hosting approach requires an administrator change or a different backend host.
4. Click **Deploy**, authorize if prompted, and copy the URL ending in `/exec`.
5. Open that URL in a private browser window. It should return JSON containing
   `"programCode":"pa_day_camp"`, `"bookingVersion":1`, and `"stripeMode":"test"`.

See Google's [web app deployment guide](https://developers.google.com/apps-script/guides/web).

## 5. Add the payment reconciliation trigger

In Apps Script, open **Triggers → Add Trigger**:

- Function: **reconcilePendingPayments**
- Deployment: **Head**
- Event source: **Time-driven**
- Type: **Minutes timer**
- Interval: **Every 5 minutes**

This records paid registrations even if the customer never returns from Stripe.
It releases a pending seat only after Stripe confirms the session is expired.
Check Apps Script's execution/failure notifications regularly.

## 6. Connect and test the website locally

1. In the website project folder, create `.env` using `.env.example` as a template:

   ```dotenv
   PUBLIC_PA_DAY_CAMP_ENDPOINT=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   ```

2. Start or restart `npm.cmd run dev` and visit
   `http://localhost:4321/camps/pa-day-camp/` (use port 4321).
   Development mode expects Stripe test mode by default. Production builds expect live mode.
   To connect local development to a live backend, set its live `/exec` URL and
   `PUBLIC_PA_DAY_CAMP_STRIPE_MODE=live` in `.env`, then restart the dev server.
   Local live checkout uses real payments and returns to the published production
   page; localhost returns are permitted only for test mode. To return to testing,
   restore the test endpoint and set `PUBLIC_PA_DAY_CAMP_STRIPE_MODE=test`.
3. Select dates, choose pickup times, and fill in the child and parent details.
4. Click **Review Total**, verify the tax and total, then click **Continue to Secure Payment**.
5. On Stripe's test checkout, use card **4242 4242 4242 4242**, a future expiry,
   and any three-digit CVC. These are
   [Stripe's documented test values](https://docs.stripe.com/testing).
6. After returning, check the confirmation message, one paid row in
   **Registrations**, the child's age/school and purchased dates/hours, and the
   studio notification email. Reload the return URL: it must not add a second row.
7. Also check canceled checkout, disabled dates, full dates, and invalid selections.
   Complete another test payment and close Stripe's tab before returning; the
   reconciliation trigger should still record it within about five minutes.

Pending checkout sessions reserve one place per purchased date across both
pickup options. Sessions expire after 30 minutes, then the next reconciliation
releases their holds. Canceling checkout does not immediately release a hold.
An ambiguous creation/network failure conservatively retains its hold. An owner
must inspect the logged order in Stripe, restore a matching session ID in the
attempt and reconcile it, or mark the attempt `CHECKOUT_FAILED` only after
confirming no payable or paid session exists. Do not clear unknown holds blindly.

## 7. Enable real payments

1. After test validation, create a **separate live spreadsheet and Apps Script
   project**, repeating steps 1–5 with the same backend source. Do not mix test
   registrations with live capacity counts.
2. Set `STRIPE_MODE=live` and `STRIPE_SECRET_KEY_LIVE` to the live secret key
   beginning `sk_live_`. Use the live spreadsheet ID and confirmed tax setting.
3. Run setup, verify and activate the intended dates with real capacities, run
   authorization, deploy the live web app, and install its five-minute trigger.
4. Verify the live `/exec` health response reports `pa_day_camp`, `bookingVersion: 1`,
   and `stripeMode: "live"`.
5. In the website hosting provider's build environment settings, set
   **PUBLIC_PA_DAY_CAMP_ENDPOINT** to the **live** `/exec` URL.
   For GitHub Pages, this variable is supplied to the Astro build step in
   `.github/workflows/deploy.yml`. GitHub Actions does not read `netlify.toml`,
   and local `.env` / `.env.production` files are intentionally not committed.
   If the backend deployment URL changes, update the workflow too before merging
   to `main`. A successful build alone does not prove the backend URL was embedded.
6. Rebuild and publish the website. This is a static site, so changing the
   environment variable requires a new build. Production returns use
   `https://sparkpreneurs.ca/camps/pa-day-camp/`.
7. Check the published page's connection and total review. Monitor the first
   real customer payment in Stripe and the live Registrations sheet.

Updating Apps Script source later requires **Deploy → Manage deployments → Edit →
New version → Deploy** to update the web app. Keep the existing deployment URL.

## Optional discounts

Reuse the existing **test discount service** when you already have one:

1. Deploy that discount script as a web app if it is not deployed already. Copy
   its `/exec` URL. It must support the `quote`, `reserve`, `attach`, and `confirm`
   actions in [DISCOUNT_SERVICE.gs](DISCOUNT_SERVICE.gs).
2. In the **PA Day Camp test** Apps Script project's Script Properties, add
   `DISCOUNT_SERVICE_URL` with that URL and `DISCOUNT_SERVICE_KEY` with the same
   private key stored in the discount service. Keep the key out of the website
   and chat. Keep `STRIPE_MODE=test`; both services must use the same Stripe
   account's test key.
3. Replace the PA Day backend source with the latest `PA_DAY_CAMP.gs`, save,
   then update the existing web-app deployment to a **New version**. Health
   should report version `2026-11-10-pa-day-4` and `discountsSupported: true`.
   Existing PA Day workbook columns already include discount fields; no schema
   migration is needed for discounts.
4. In the discount workbook's **Discounts** tab, confirm the intended code is
   active. `KUMON25` is seeded as `2500` cents ($25), once per email across
   programs. The shared service accepts `pa_day_camp` without a program list change.
5. Refresh the website. Under **Have a discount code?**, enter the code and click
   **Apply code** after completing the registration fields. Check savings, tax
   and total, then continue to Stripe. **Remove code** invalidates the discounted
   total and lets the parent review the regular price again.
6. For a single $85 standard day at 13% configured tax, `KUMON25` should show
   $25 savings, $7.80 tax, and $67.80 total. If your confirmed tax rate differs,
   the total differs. Complete a Stripe test payment and check the discount
   fields in Registrations and the shared Discount Usage record. Try reusing the
   code with the same email; it must be rejected. Use a fresh test email when
   testing a code already redeemed on another program.

Checkout works without discounts; the code field stays hidden until the backend
has both service properties configured. Invalid or previously used codes show an
error and cannot start checkout. Changes to email, code, or dates require a new
total review. A discount applies once to the whole booking subtotal before tax,
not separately to every date. For a new discount service or live rollout, follow
[DISCOUNTS_SETUP.md](DISCOUNTS_SETUP.md).

## Local verification

```powershell
node --test tests/pa-day-camp.test.mjs
npm.cmd run check
npm.cmd run build
node tests/pa-day-camp.browser.mjs
```

The browser test accepts `PLAYWRIGHT_MODULE_PATH` for an existing Playwright
installation. Automated tests mock Google and Stripe and do not prove account-side
authorization, delivery of email, a hosted spreadsheet write, or a live charge.
