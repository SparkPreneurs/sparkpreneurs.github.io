---
name: stripe-apps-script-registration
description: Create or repair a SparkPreneurs registration and Stripe Checkout flow backed by a period-specific Google Spreadsheet and a standalone Google Apps Script project. Use when starting a new workshop period, creating its spreadsheet and named .gs backend, connecting a static registration page to Stripe, deploying Apps Script, or diagnosing checkout and Google Sheet writes. Guide non-technical users through one small screen-level step at a time.
---

# Stripe Apps Script Registration

Build one isolated backend for each registration period. Keep the conversation simple enough for a non-technical user to follow without guessing.

## Non-negotiable architecture

- Use one Google Spreadsheet for one time period containing one or a few related workshops.
- Use one standalone Google Apps Script project for that spreadsheet.
- Create one complete backend source file at `apps-script/<PERIOD_MAIN_ACTIVITY_NAME>.gs`.
- Format the filename as uppercase snake case, period first, for example `FALL_2026_HAND_BUILDING_POTTERY.gs`.
- Give the spreadsheet and Apps Script project the matching human-readable name, for example `Fall 2026 - Hand-Building Pottery`.
- Keep all period data in that period's spreadsheet. Never add a new period to the legacy shared spreadsheet.
- Keep the root `Code.gs` unchanged when initiating a new period. Read it as a legacy implementation example for checkout, payment verification, waiver handling, and row writes.
- Read [backend-contract.md](references/backend-contract.md) before generating or reviewing a backend.
- Never place a Stripe secret key in the repository, spreadsheet, frontend, chat, or Apps Script source.

The period spreadsheet must contain these tabs:

- `Products`: trusted product codes, names, dates, times, prices, tax, and availability.
- `Checkout Attempts`: server-created checkout records and submitted registration/waiver details before payment.
- `Registrations`: paid and Stripe-verified registrations only.

Do not use a separate central waiver spreadsheet. Store waiver and medical data in the period's `Checkout Attempts` record, then copy the verified record to `Registrations` after payment.

## Conversation rule

Give the user only the current milestone. Stop and wait after asking them to return an ID, confirmation, or URL. Do not dump all setup instructions into one message.

Use plain visual directions:

- Name the page they should be on.
- Name the button and where it appears.
- State exactly what to copy.
- Show a short example.
- State exactly what they should send back.
- Never ask the user to send a Stripe secret key.

Do repository inspection, code generation, checks, endpoint tests, and browser tests yourself. Ask the user only to perform actions that require their signed-in Google or Stripe account.

## Milestone 0: Inspect and name

Before asking the user to do anything:

1. Read the target page HTML and its dedicated JavaScript.
2. Trace its current Apps Script URL, `programCode`, product codes, displayed prices, waiver fields, success URL, and cancel URL.
3. Read the root `Code.gs` as a legacy example. Do not assume its deployed version matches the repository.
4. Check for existing period-specific files under `apps-script/`.
5. Derive a human title, a fixed program code, and the filename.
6. If the period or main activity cannot be inferred, ask one short naming question before continuing.

Use these formats:

```text
Spreadsheet/project: Fall 2026 - Hand-Building Pottery
Program code: fall_2026_hand_building_pottery
Repository file: apps-script/FALL_2026_HAND_BUILDING_POTTERY.gs
```

## Milestone 1: Create the spreadsheet

This must be the first account action requested from the user.

Send one instruction like this, adapted to the period:

```text
Step 1: Create the spreadsheet

1. Open https://sheets.new while signed into the Google account that should own registrations.
2. At the top-left, click "Untitled spreadsheet" and rename it to "Fall 2026 - Hand-Building Pottery".
3. Look at the address bar. It will look like:
   https://docs.google.com/spreadsheets/d/1AbC...XYZ/edit#gid=0
4. Copy only the long part between `/d/` and `/edit`.

Send me only that spreadsheet ID. Do not make the sheet public.
```

Stop. Do not create the backend until the user returns the spreadsheet ID.

Validate that the ID contains only letters, numbers, `_`, and `-`, and is a plausible Google file ID. Explain again visually if the user sends the full URL; extract the ID yourself rather than making them repeat the step.

## Milestone 2: Generate the period backend

After receiving the spreadsheet ID:

1. Gather missing workshop details from repository content first.
2. Ask one concise question only if dates, products, prices, tax, or availability remain genuinely unclear.
3. Create `apps-script/` if needed.
4. Create `apps-script/<PERIOD_MAIN_ACTIVITY_NAME>.gs` as a complete standalone Apps Script backend.
5. Put only this period's spreadsheet ID, fixed program code, products, and setup data in that file.
6. Never edit root `Code.gs` as part of new-period setup.
7. Run a local Apps Script-compatible syntax check.
8. Scan the repository for accidentally pasted Stripe keys.
9. Report the filename and product rows in plain language.

The generated file must include at least:

- `doGet()` for a minimal health response only.
- `doPost(e)` with an explicit action allowlist.
- `setupPeriodWorkbook()` to create or validate all three tabs and seed `Products`.
- `authorizeRequiredServices()` to verify spreadsheet and Stripe access.
- `createCheckoutSession_(data)`.
- `verifyCheckoutSession_(stripeSessionId)`.
- `sendEnrollmentNotification_()` or an equivalent helper that emails SparkPreneurs only after the first paid registration write.
- Stripe retrieval before any paid registration write.
- Input normalization, strict limits, formula-injection protection, trusted pricing, safe return URLs, locks, and idempotent writes.
- Dynamic Stripe `price_data` calculated from the trusted `Products` tab.
- A unique `SCRIPT_VERSION` and the one fixed `PROGRAM_CODE` in `ping`/health output.

Do not connect the frontend yet.

## Milestone 3: Create the Apps Script project

After the `.gs` file exists, guide the user through only this milestone:

```text
Step 2: Create the Apps Script project

1. Open https://script.google.com/u/1/home in the same Google account.
2. Click "New project" near the top-left.
3. Click "Untitled project" at the top and rename it to "Fall 2026 - Hand-Building Pottery".
4. In the left file list, open `Code.gs`.
5. Select all of the sample code and delete it.
6. Open the file I created in the website folder: `apps-script/FALL_2026_HAND_BUILDING_POTTERY.gs`.
7. Copy all of that file into the Apps Script editor.
8. Click the Save icon near the top.

Tell me when the project is created and the code is pasted. Do not deploy yet.
```

Apps Script may display the editor file as `Code.gs`; that is acceptable. The canonical named source remains in the repository. If the interface offers Rename, the user may rename it to the filename base without `.gs`, but do not block progress on this cosmetic step.

Stop and wait for confirmation.

## Milestone 4: Add the test Stripe key

Use separate test and live Script Properties:

```text
STRIPE_MODE=test
STRIPE_SECRET_KEY_TEST=<test secret key>
STRIPE_SECRET_KEY_LIVE=<live secret key, added only at live launch>
STRIPE_WEBHOOK_TOKEN_TEST=<optional random test token>
STRIPE_WEBHOOK_TOKEN_LIVE=<optional random live token>
ENROLLMENT_NOTIFICATION_EMAILS=sparkpreneurs.ca@gmail.com
```

Guide the user through test properties only:

```text
Step 3: Add the Stripe test key privately

1. In Apps Script, click the gear icon on the left for "Project Settings".
2. Scroll to "Script Properties" and click "Add script property".
3. Add `STRIPE_MODE` with the value `test`.
4. Add another property named `STRIPE_SECRET_KEY_TEST`.
5. In Stripe, make sure test mode is on, open the API keys page, reveal the test secret key, and paste it directly into the property value.
6. Click "Save script properties".

Do not send the key to me. Tell me only when both properties are saved.
```

Stop and wait. Never echo, log, inspect, or request the key.

## Milestone 5: Set up and authorize

Guide one function at a time.

First ask the user to run `setupPeriodWorkbook()` from the function dropdown near the top of the Apps Script editor. Explain that Google may ask them to review permissions, choose their account, open the advanced option if shown, and allow the project they just created.

Stop until they confirm the spreadsheet now shows `Products`, `Checkout Attempts`, and `Registrations` tabs. Ask them to compare the visible `Products` rows with the agreed dates and prices.

Then ask them to run `authorizeRequiredServices()`. Stop until they report its success message or paste the exact error text.

Never run a setup helper that clears a non-empty tab without first checking for existing data and obtaining explicit confirmation. Generated setup helpers must be safe to re-run: preserve existing registrations and refuse destructive product replacement unless an explicit force flag is coded and intentionally used.

## Milestone 6: Deploy test mode

After setup and authorization succeed, give these directions:

```text
Step 4: Make the test backend available to the registration page

1. In Apps Script, click "Deploy" at the top-right, then "New deployment".
2. Beside "Select type", click the gear and choose "Web app".
3. Add a description such as "Test checkout - version 1".
4. Set "Execute as" to "Me".
5. Set "Who has access" to "Anyone".
6. Click "Deploy" and approve access if Google asks.
7. Copy the Web app URL ending in `/exec`.

Send me that `/exec` URL. It is safe to share; do not send any Stripe key.
```

Stop and wait for the URL.

## Milestone 7: Verify before connecting

Test the deployed endpoint yourself in this order:

1. GET health and POST `ping`; confirm the expected version and fixed program code.
2. Send malformed JSON, unknown action, oversized input, invalid product, duplicate product, wrong program code, and amount mismatch tests.
3. Confirm each request fails without writing a paid registration.
4. Create one valid test Checkout Session without paying.
5. Confirm the URL host is `checkout.stripe.com`, session prefix is `cs_test_`, and amount matches trusted spreadsheet pricing.
6. Verify the unpaid session and confirm it does not create a `Registrations` row.
7. Inspect `Checkout Attempts` for one consistent pending record.

Never use live money during this milestone.

If tests fail, diagnose repository code, deployed version, Script Properties, spreadsheet ID, tab contents, and permissions. Change only the period `.gs` file. Ask the user to paste the revised file and deploy a new version, then retest.

## Milestone 8: Connect and browser-test the frontend

Only after backend validation passes:

1. Update the target page's `data-apps-script-url` to the new test `/exec` URL.
2. Keep product codes synchronized with `Products`.
3. Treat frontend names, prices, totals, availability, and query parameters as display-only input.
4. POST selection codes and registration/waiver fields to Apps Script.
5. Redirect only to the returned Stripe Checkout URL.
6. On return, call `verifyCheckoutSession` and show success only for `paymentStatus: "paid"`.
7. Mock third-party calls for browser interaction checks first.
8. Check desktop and phone-size form, cart, error, redirect, cancel, and return states.

Have the user complete one Stripe test payment only after the mocked and unpaid tests pass. Verify exactly one paid row appears in `Registrations`, the matching attempt is marked paid, and repeating verification does not duplicate the registration.

## Milestone 9: Switch to live deliberately

Do not combine this with test setup.

1. Ask the user to add `STRIPE_SECRET_KEY_LIVE` in Apps Script Script Properties directly. Never ask them to send it.
2. Ask them to change `STRIPE_MODE` from `test` to `live`.
3. Ask them to save and deploy a new Web App version with a clear live description.
4. Retest health, invalid requests, and one valid unpaid session.
5. Confirm the session prefix is `cs_live_`; do not complete a charge.
6. Confirm the frontend points to the intended live `/exec` URL.
7. Run final browser checks, syntax checks, secret scans, and repository status checks.
8. Commit and push only the intended website and period-backend files when requested or when repository instructions require publishing.

## GitHub Pages deployment recovery

After publishing a registration-page change, check the GitHub Pages workflow before treating the live site as updated:

```powershell
gh run list --repo SparkPreneurs/sparkpreneurs.github.io --limit 5
gh run view <run-id> --repo SparkPreneurs/sparkpreneurs.github.io --log-failed
```

If `gh` is not recognized, give the user only this recovery step:

```text
1. Install GitHub CLI from https://cli.github.com/.
2. Open a new terminal and run `gh auth login`, then complete the sign-in prompts for GitHub.com.
3. Restart the terminal or Codex session so `gh` is available.

Tell me when that is complete. Do not send any GitHub token or password.
```

After the user confirms, run `gh --version` and `gh auth status` yourself before returning to the failed deployment. Do not guess from a stale custom-domain page or repeatedly ask the user to reinstall the CLI.

If the failed log shows a GitHub API `5xx` error while GitHub Pages or Jekyll calls the repository Pages API, the source build did not prove a code error. Rerun only the failed jobs, then watch the rerun:

```powershell
gh run rerun <run-id> --repo SparkPreneurs/sparkpreneurs.github.io --failed
gh run watch <run-id> --repo SparkPreneurs/sparkpreneurs.github.io --exit-status
```

If a rerun fails with the same repository-file error, inspect and fix that file. If it fails again with a GitHub API `5xx`, report the external outage evidence and wait before trying another rerun.

## Repair workflow

For an existing broken flow, inspect before changing anything:

1. Compare the frontend program/product codes with the local period `.gs` file.
2. GET and ping the deployed `/exec` URL; compare its version and program code.
3. Manually send an invalid-product and amount-mismatch request.
4. Confirm which spreadsheet ID and tabs the local `.gs` file uses.
5. Determine whether failure occurs before Stripe, during Stripe creation, after return, or during the paid row write.
6. Report the evidence and proposed fix before implementing if the user asked only to diagnose.

A live endpoint that reports an older version or rejects a locally defined product is a deployment mismatch, not proof that Stripe is disconnected.

## Completion evidence

Do not call the flow complete until all applicable checks pass:

- The period has its own private spreadsheet and named `.gs` source file.
- The spreadsheet contains only that period's products and registrations.
- Test and live Stripe keys are separate Script Properties.
- No secret keys exist in repository files.
- Backend pricing ignores frontend prices and rejects amount manipulation.
- Only active known products are accepted.
- Unpaid sessions never create paid registrations.
- Paid registration writes are locked and idempotent by Stripe session ID.
- Enrollment notification emails are sent only after the first paid registration write.
- Waiver and medical details remain in the period spreadsheet and are not sent to Stripe metadata.
- The deployed version matches the repository version.
- The frontend endpoint and product codes match the period backend.
- Desktop and phone-size checkout flows were checked.
