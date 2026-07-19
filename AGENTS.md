# SparkPreneurs Agent Instructions

## Repository

- GitHub: https://github.com/SparkPreneurs/sparkpreneurs.github.io
- Live site: https://sparkpreneurs.ca/
- This is a static site with no build system. Open a page's `index.html` directly or use a simple static server.
- GitHub Pages publishes committed and pushed website files.

## Required Workflow

- Read this file before working in the repository.
- Run `git status --short --branch` before editing so existing user changes are visible.
- Run `git pull --ff-only` before starting a new commit.
- Preserve unrelated user changes. Never reset, discard, or overwrite them.
- Use `rg` and `rg --files` for repository searches when available.
- Use `apply_patch` for manual file edits.
- Before committing, run the checks appropriate to the change and inspect `git status` so every intended file, including new assets, is included.
- For straightforward content or layout requests, implement, verify, and commit without asking for confirmation unless there is meaningful ambiguity or risk.
- Do not push unless the user asks to publish/upload, or the requested task clearly includes publishing.

## Project Layout

- `index.html`: landing page markup and overall site structure.
- `styles.css`: global styling, gradients, typography, and responsive rules.
- `script.js`: shared navigation and page interactions.
- `<route>/index.html`: standalone page for a route such as `/gallery` or `/summer-camp`.
- `<route>/shop.js`: page-specific cart, registration, or checkout behavior where present.
- `waiver.js`: shared waiver behavior where present.
- `assets/`: images and other site assets.
- `Code.gs`: legacy shared Google Apps Script backend. Treat it as a read-only example by default.
- `apps-script/<PERIOD_MAIN_ACTIVITY_NAME>.gs`: canonical backend source for each new registration period.
- [Stripe Apps Script Registration skill](.agents/stripe-apps-script-registration/SKILL.md): required workflow for Google Sheets, Apps Script, registration, waiver, and Stripe Checkout work.

## Registration And Payment Skill

Use the [Stripe Apps Script Registration skill](.agents/stripe-apps-script-registration/SKILL.md) whenever a request involves any of the following:

- Starting a new workshop, camp, class, or registration period that needs its own spreadsheet.
- Creating a Google Spreadsheet or standalone Google Apps Script project for registration.
- Creating a period backend named `apps-script/<PERIOD_MAIN_ACTIVITY_NAME>.gs`.
- Adding or changing a cart, registration form, waiver, medical form, availability, product code, price, tax, or discount used during checkout.
- Connecting a page to an Apps Script `/exec` URL.
- Creating, retrieving, or verifying a Stripe Checkout Session.
- Diagnosing a payment button such as `Continue to Secure Payment`.
- Diagnosing why Stripe did not open or why a Google Sheets row was not written.
- Testing Apps Script deployment versions, trusted totals, paid registration writes, or test/live Stripe mode.

When this skill applies:

1. Read its entire `SKILL.md` before acting.
2. Read every reference it marks as required, especially `references/backend-contract.md`.
3. Follow its milestones in order.
4. Give a non-technical user only the current Google or Stripe account step, then wait for the requested ID, confirmation, or `/exec` URL.
5. Do all repository inspection, code generation, endpoint requests, and browser checks yourself.

Do not use the registration skill for ordinary text, image, hero, navigation, gallery, or layout changes that do not affect a form, cart, payment, waiver, or registration backend.

If the user asks only to inspect, map, explain, or diagnose a flow, use the skill's repair workflow but do not edit code, spreadsheets, Apps Script projects, Stripe settings, or deployments.

## Registration Architecture

- Use one private Google Spreadsheet per time period containing one or a few related workshops.
- Use one standalone Google Apps Script project per period spreadsheet.
- Create one complete source file named with uppercase snake case and the period first, for example `apps-script/FALL_2026_HAND_BUILDING_POTTERY.gs`.
- Use matching human-readable names for the spreadsheet and Apps Script project, for example `Fall 2026 - Hand-Building Pottery`.
- Each period spreadsheet owns its `Products`, `Checkout Attempts`, and `Registrations` tabs.
- Keep waiver and medical details in that period's spreadsheet. Do not add new periods to a central registration or waiver spreadsheet.
- Do not add new programs, prices, spreadsheet IDs, or routing branches to root `Code.gs`.
- Read root `Code.gs` only to learn from its checkout creation, Stripe verification, waiver normalization, and row-write patterns.
- Modify root `Code.gs` only when the user explicitly requests a change to a still-active legacy flow and the impact has been inspected first.
- Never assume repository Apps Script code is deployed. Compare the local `SCRIPT_VERSION` and program code with GET/`ping` output from the live `/exec` URL.

## Payment Security Boundaries

- Google Apps Script is the backend. The frontend is never a trusted source of prices, totals, product names, availability, payment status, or registration status.
- Recalculate checkout totals from active product rows in the period spreadsheet.
- Reject unknown products, duplicate products, wrong program codes, malformed fields, and displayed amount mismatches.
- Create Stripe Checkout only after server-side validation.
- Retrieve the Checkout Session directly from Stripe before recording a paid registration.
- Require paid status, expected amount, expected currency, matching program/order metadata, and an existing checkout attempt.
- Make paid writes locked and idempotent by Stripe session ID.
- Neutralize spreadsheet formulas in user-provided values before writing them.
- Keep medical information, waiver text, dates of birth, signatures, and other sensitive details out of Stripe metadata.
- Allow only approved SparkPreneurs HTTPS return URLs.
- Keep `STRIPE_SECRET_KEY_TEST` and `STRIPE_SECRET_KEY_LIVE` only in Apps Script Script Properties, selected by `STRIPE_MODE`.
- Never put Stripe secret keys in frontend files, `.gs` files, spreadsheets, logs, chat, commits, or screenshots.
- Never ask the user to send a secret key. Tell them exactly where to paste it privately.

## New Pages And Assets

- Build a requested new path as a standalone page, for example `/gallery` as `gallery/index.html`.
- Keep shared navigation, footer, fonts, and visual language consistent unless the user requests a redesign.
- Use relative paths that work on GitHub Pages and the custom domain.
- Rename new assets before linking them so filenames contain no spaces and are URL-friendly, for example `spring-flyer.png`.
- Fonts currently load from Google Fonts and need network access during an accurate preview.

## Communication

- Assume the user is not a developer.
- Use plain, outcome-focused language and give visual, step-by-step directions for account actions.
- Name the page, button, and location the user should see.
- State exactly what they should copy and what they should send back.
- Avoid jargon when a plain-language explanation is available.
- When publishing, explain what changed on the live website and mention technical details only when they affect the outcome.

## Browser Checks

Run browser checks after changing layouts, responsive behavior, forms, buttons, carts, payment flows, images, or navigation. Do not ask the user to install or run testing tools.

If Playwright is not ready, install Chromium:

```powershell
npx playwright install chromium
```

If an inline script cannot find Playwright, install it in a temporary folder outside the repository:

```powershell
$tmp = Join-Path $env:TEMP 'sparkpreneurs-pw-check'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
npm install --prefix $tmp --no-save playwright
$env:NODE_PATH = Join-Path $tmp 'node_modules'
```

Use a local file URL for quick static checks:

```text
file:///C:/Users/roxan/sparkpreneurs.github.io/index.html
```

Minimum UI verification:

- Check desktop and phone-size layouts.
- Detect horizontal overflow and clipped controls.
- Exercise the changed interaction and verify its visible result.
- Check menu open/close and destination when navigation changes.
- Mock third-party calls before testing registration or payment behavior.

For registration and payment changes, follow the skill's complete test order. Do not test a deployed endpoint until the user has copied the period-specific `.gs` file, run the required setup and authorization functions, deployed a new Web App version, and sent the `/exec` URL.

Summarize checks in plain language, for example: `I checked the phone-size layout and the registration button stays visible.`

## Code Checks

Use checks appropriate to the files changed:

```powershell
node --check script.js
Get-Content 'path/to/shop.js' | node --check --input-type=commonjs -
Get-Content 'apps-script/PERIOD_MAIN_ACTIVITY_NAME.gs' | node --check --input-type=commonjs -
git diff --check
```

Scan for accidentally committed Stripe keys after registration or payment work:

```powershell
rg -n 's[k]_(live|test)|r[k]_(live|test)|STRIPE_SECRET_KEY[^\n]*=[^\n]*s[k]_' -S .
```

## Live Site Debugging

If the user says the website differs from their computer, do not guess:

1. Fetch the relevant live page from `https://sparkpreneurs.ca/`.
2. Compare its HTML, CSS, JavaScript, and directly relevant assets with local files.
3. Check whether local commits were pushed and whether the branch is ahead, behind, or synchronized.
4. Check for an old deployment, cache, incorrect path, filename mismatch, or missing asset.
5. If caching is likely, explain it plainly and suggest a hard refresh or private window.
6. If publishing is incomplete, fix the source issue, verify it, commit it, and push when publishing is in scope.

Explain the difference as `live website` versus `local copy`; use Git terminology only when it helps the user act.
