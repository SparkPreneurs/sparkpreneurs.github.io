# Stripe Apps Script Registration Skill

## Purpose
Use this skill when adding or updating a registration/payment flow for SparkPreneurs where the site is static, Google Sheets stores registration/pricing data, Google Apps Script is the only server-like component, and Stripe Checkout is used for payment.

The intended flow is:
1. Static frontend collects parent/student fields and selected weeks/products.
2. Frontend displays an estimated total only.
3. Frontend sends selected product codes and displayed amount to Apps Script.
4. Apps Script recalculates the trusted amount from Google Sheets pricing data.
5. Apps Script rejects invalid products or amount mismatches.
6. Apps Script creates a Stripe Checkout Session with the verified amount.
7. Apps Script appends final registration rows only after Stripe reports the Checkout Session as paid.

Do not put Stripe secret keys in frontend files. Do not put live or test secret keys in the repo. Store the Stripe secret key only in Apps Script Script Properties.

## Required Repo Files
- `index.html`: registration UI and `data-apps-script-url`.
- `script.js`: cart/form logic, Apps Script POST, and post-payment verification.
- `Code.gs`: exact code the user copies into Google Apps Script.
- `apps-script.gs`: repo copy of the same Apps Script code. Keep this identical to `Code.gs`.

After editing Apps Script logic, always copy/update both `Code.gs` and `apps-script.gs`, then verify they match.

## Google Sheet Schema
Use one spreadsheet with:
- `Sheet1`: verified paid registrations.
- `Sheet2`: trusted pricing/products/discount rules.

`Sheet2` columns:
```text
programCode | weekCode | weekName | priceCents | active | minWeeks | discountPercent | bundlePriceCents | taxRatePercent
```

Summer 2026 example:
```text
programCode | weekCode | weekName | priceCents | active | minWeeks | discountPercent | bundlePriceCents | taxRatePercent
summer2026 | W1 | Week 1 (July 6-10) | 42000 | TRUE | | | | 13
summer2026 | W2 | Week 2 (July 13-17) | 42000 | TRUE | | | |
summer2026 | W3 | Week 3 (July 20-24) | 42000 | TRUE | | | |
summer2026 | W4 | Week 4 (July 27-31) | 42000 | TRUE | | | |
summer2026 | W5 | Week 5 (August 4-7) | 39000 | TRUE | | | |
summer2026 | W6 | Week 6 (August 10-14) | 42000 | TRUE | | | |
summer2026 | W7 | Week 7 (August 17-21) | 42000 | TRUE | | | |
summer2026 | W8 | Week 8 (August 24-28) | 42000 | TRUE | | | |
 | | Bundle: any 4 weeks | | | 4 | | 120000 |
 | | Bundle: all 8 weeks | | | 8 | | 240000 |
```

`Sheet1` columns are created/extended by the Apps Script:
```text
createdAt | paidAt | programCode | studentName | parentName | parentEmail | phone | selectedWeeks | selectedWeekNames | regularSubtotalCents | discountCents | taxCents | expectedAmountCents | stripeSessionId | stripePaymentIntentId | stripePaymentStatus | registrationStatus | orderId
```

If `Sheet2` is empty, add or preserve a setup helper named `setupSheet2Summer2026()` in `Code.gs`, tell the user to run it once in Apps Script, and pause until they confirm it populated `Sheet2`.

## Apps Script Requirements
`Code.gs` must include:
- `doGet()` returning JSON with `success`, `message`, and `version`.
- `doPost()` actions:
  - `ping`: returns `{ success: true, version }`.
  - `createCheckoutSession`: validates registration fields, selected weeks, and displayed amount against `Sheet2`, then creates Stripe Checkout Session.
  - `verifyCheckoutSession`: retrieves Stripe Checkout Session and only finalizes registration if `payment_status === "paid"`.
- `setupSheet2Summer2026()`: optional manual Sheet2 setup helper.
- `authorizeRequiredServices()`: manual helper the user can run once to authorize spreadsheet and external Stripe API access.
- Strict selected-week validation and duplicate rejection.
- Amount mismatch response that includes `expectedAmountCents`.
- `STRIPE_SECRET_KEY` read from Apps Script Script Properties.
- Optional webhook handler protected by `STRIPE_WEBHOOK_TOKEN`.

Important Apps Script/Stripe details:
- Send Stripe integer fields such as `unit_amount` and `quantity` as strings from Apps Script, for example:
```js
"line_items[0][price_data][unit_amount]": String(pricing.totalCents),
"line_items[0][quantity]": "1",
```
- If Stripe returns `Invalid integer: 1.0`, this integer serialization issue has regressed.
- If Apps Script returns a `UrlFetchApp.fetch` permission error, tell the user to run `authorizeRequiredServices()` from Apps Script, approve permissions, deploy a new Web App version, and send the new `/exec` link.
- True Stripe webhook signature verification is not safely available in Apps Script Web Apps because the needed `Stripe-Signature` header is not exposed in normal `doPost(e)` event data. Use a private `webhookToken` query parameter plus Stripe session retrieval if webhooks are configured.

## User Deployment Loop
When Apps Script changes are needed:
1. Update `Code.gs` in the repo with exactly what the user should paste.
2. Keep `apps-script.gs` identical.
3. Run local syntax checks.
4. Tell the user to paste `Code.gs` into Apps Script.
5. If applicable, tell the user to run `setupSheet2Summer2026()` once.
6. If applicable, tell the user to run `authorizeRequiredServices()` once and approve permissions.
7. Tell the user to deploy a new Web App version.
8. Pause. Do not continue live tests until the user sends the new `/exec` link.

Use clear non-developer language for the user. Example:
```text
Please replace Code.gs, save, deploy a new Web App version, and send me the new /exec link.
```

## Frontend Requirements
The frontend should:
- Keep the week-selection UI.
- Add/keep registration fields:
  - `studentName`
  - `parentName`
  - `parentEmail`
  - `phone`
- Use product/week codes, for example `W1`, `W2`.
- Send:
  - `action: "createCheckoutSession"`
  - `programCode`
  - `selectedWeeks`
  - `selectedWeekDetails`
  - `displayedAmountCents`
  - registration fields
  - `successUrl`
  - `cancelUrl`
- Never expose Stripe secret keys or use pasted `sk_*` keys in frontend files.
- Redirect only to the `checkoutUrl` returned by Apps Script.
- On return from Stripe, call `verifyCheckoutSession`.
- Show success only if the response includes `paymentStatus: "paid"`.

When the user provides a new Apps Script `/exec` link, update `index.html`:
```html
data-apps-script-url="https://script.google.com/macros/s/.../exec"
```

## Live Test Sequence
Use safe tests before creating a real Checkout Session.

Set:
```js
const endpoint = "PASTE_EXEC_URL_HERE";
```

Version/ping:
```powershell
@'
const endpoint = "PASTE_EXEC_URL_HERE";
async function request(label, method, payload) {
  const options = method === "POST"
    ? { method, headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }
    : { method };
  const response = await fetch(endpoint, options);
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  console.log(JSON.stringify({ label, status: response.status, ok: response.ok, contentType: response.headers.get("content-type"), json, textStart: text.slice(0, 300) }));
}
(async () => {
  await request("get", "GET");
  await request("ping", "POST", { action: "ping" });
})();
'@ | node -
```

Validation tests:
```powershell
@'
const endpoint = "PASTE_EXEC_URL_HERE";
async function post(label, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  console.log(JSON.stringify({ label, status: response.status, ok: response.ok, json, textStart: text.slice(0, 300) }));
}
(async () => {
  await post("invalid action", { action: "notARealAction" });
  await post("invalid session id", { action: "verifyCheckoutSession", stripeSessionId: "bad" });
  await post("invalid week", {
    action: "createCheckoutSession",
    programCode: "summer2026",
    selectedWeeks: ["W9"],
    displayedAmountCents: 100,
    studentName: "Test Student",
    parentName: "Test Parent",
    parentEmail: "parent@example.com",
    phone: "4165551212",
    successUrl: "https://sparkpreneurs.ca/?payment=success&session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://sparkpreneurs.ca/?payment=canceled#summer-camp"
  });
  await post("amount mismatch W1", {
    action: "createCheckoutSession",
    programCode: "summer2026",
    selectedWeeks: ["W1"],
    displayedAmountCents: 1,
    studentName: "Test Student",
    parentName: "Test Parent",
    parentEmail: "parent@example.com",
    phone: "4165551212",
    successUrl: "https://sparkpreneurs.ca/?payment=success&session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://sparkpreneurs.ca/?payment=canceled#summer-camp"
  });
})();
'@ | node -
```

Expected validation evidence:
- `ping` returns the expected `SCRIPT_VERSION`.
- Invalid action returns `success:false`.
- Invalid session ID returns `Invalid Stripe session ID.`
- Invalid week returns `Invalid or inactive week`.
- Wrong amount returns `Amount mismatch` and the trusted `expectedAmountCents`.

Checkout Session creation test, without paying:
```powershell
@'
const endpoint = "PASTE_EXEC_URL_HERE";
async function post(payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, ok: response.ok, json, text };
}
(async () => {
  const create = await post({
    action: "createCheckoutSession",
    programCode: "summer2026",
    selectedWeeks: ["W1"],
    displayedAmountCents: 47460,
    studentName: "Verification Student",
    parentName: "Verification Parent",
    parentEmail: "verification.parent@example.com",
    phone: "4165551212",
    successUrl: "https://sparkpreneurs.ca/?payment=success&session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://sparkpreneurs.ca/?payment=canceled#summer-camp"
  });
  const sessionId = create.json && create.json.stripeSessionId;
  let verify = null;
  if (sessionId) {
    verify = await post({ action: "verifyCheckoutSession", stripeSessionId: sessionId });
  }
  console.log(JSON.stringify({
    createStatus: create.status,
    createSuccess: create.json && create.json.success,
    expectedAmountCents: create.json && create.json.expectedAmountCents,
    stripeSessionIdPrefix: sessionId ? sessionId.slice(0, 8) : null,
    checkoutHost: create.json && create.json.checkoutUrl ? new URL(create.json.checkoutUrl).host : null,
    verifySuccess: verify && verify.json && verify.json.success,
    verifyError: verify && verify.json && verify.json.error,
    verifyPaymentStatus: verify && verify.json && verify.json.paymentStatus,
    createError: create.json && create.json.error,
    rawCreateStart: create.text.slice(0, 300)
  }));
})();
'@ | node -
```

Expected checkout evidence:
- `createSuccess:true`.
- `expectedAmountCents` matches `Sheet2` trusted total.
- `checkoutHost:"checkout.stripe.com"`.
- `stripeSessionIdPrefix` starts with `cs_live_` or `cs_test_`.
- Immediate verification returns `success:false`, `paymentStatus:"unpaid"`.

Browser redirect test:
```powershell
$tmp = Join-Path $env:TEMP 'sparkpreneurs-pw-check'
$env:NODE_PATH = Join-Path $tmp 'node_modules'
@'
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let requestPayload = null;
  page.on("request", request => {
    if (request.url().includes("script.google.com/macros/s/") && request.method() === "POST") {
      try { requestPayload = JSON.parse(request.postData() || "{}"); } catch {}
    }
  });
  await page.goto("file:///C:/Users/roxan/sparkpreneurs.github.io/index.html");
  await page.click('[data-add-week="1"]');
  await page.fill('[name="studentName"]', "Browser Test Student");
  await page.fill('[name="parentName"]', "Browser Test Parent");
  await page.fill('[name="parentEmail"]', "browser.test.parent@example.com");
  await page.fill('[name="phone"]', "4165553434");
  const total = await page.textContent("[data-summer-grand-total]");
  await page.click("[data-summer-cart-purchase]");
  await page.waitForURL(url => String(url).startsWith("https://checkout.stripe.com/"), { timeout: 45000 });
  console.log(JSON.stringify({
    total,
    checkoutHost: new URL(page.url()).host,
    selectedWeeks: requestPayload && requestPayload.selectedWeeks,
    displayedAmountCents: requestPayload && requestPayload.displayedAmountCents,
    studentName: requestPayload && requestPayload.studentName,
    parentEmail: requestPayload && requestPayload.parentEmail
  }));
  await browser.close();
})();
'@ | node -
```

## Google Sheet Access
If the user gives a shared Google Sheet URL:
- If it is public/viewable, inspect `Sheet2` via CSV export:
```powershell
curl.exe -L -s "https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/gviz/tq?tqx=out:csv&sheet=Sheet2"
```
- If it requires login, ask the user to set “Anyone with link can view” or paste the rows.
- Do not rely on visual scraping unless CSV export is unavailable.

## Stripe Docs
For new Stripe work, check current official Stripe docs first. Start from:
```text
https://docs.stripe.com/llms.txt
```

Relevant topics:
- Checkout Sessions create API.
- Redirect success/cancel URLs.
- Checkout Session retrieve and `payment_status`.
- API key safety.
- Webhooks and signature verification limitations.

Restrict Stripe research to official Stripe docs unless the user explicitly asks otherwise.

## Final Verification Checklist
Before marking done:
- `git status --short --branch` is clean or only expected changes remain.
- `node --check script.js` passes.
- `Get-Content Code.gs | node --check --input-type=commonjs -` passes.
- `Code.gs` and `apps-script.gs` are identical.
- `rg` finds no Stripe secret keys:
```powershell
rg -n 's[k]_(live|test)|r[k]_(live|test)|STRIPE_SECRET_KEY\s*=\s*["'']s[k]_' -S .
```
- Deployed Apps Script returns the expected `SCRIPT_VERSION`.
- `Sheet2` has trusted pricing rows.
- Invalid week and amount mismatch are rejected.
- Valid request creates Stripe Checkout Session without making payment.
- Frontend redirects to `checkout.stripe.com`.
- Immediate unpaid verification does not append/confirm as paid.
- Final frontend endpoint in `index.html` uses the latest `/exec` URL.
- Commit and push when the flow is verified.

If GitHub raw content has the final code but `sparkpreneurs.ca` still shows an older page, explain this as a publishing/cache issue and compare raw GitHub vs live domain before claiming the live site is updated.
