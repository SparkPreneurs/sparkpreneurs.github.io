// Build first. All Google and Stripe requests are mocked; no bookings or charges.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = path.resolve('dist');
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => sessionStorage.setItem('sparkpreneurs-featured-offers-v1', 'dismissed'));
    const page = await context.newPage();
    await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
    const errors = [], requests = [];
    let legacyBackend = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
    await page.route('https://script.google.com/**', route => {
      const data = route.request().postDataJSON(); requests.push(data);
      const result = data.action === 'ping'
        ? { success: true, programCode: 'after_school_program', stripeMode: 'live', ...(legacyBackend ? {} : { bookingVersion: 1, checkoutVersion: 1, discountsSupported: true }) }
        : data.action === 'getBookingCalendar' ? { success: true, firstWeek: '2026-11-16', lastWeek: '2027-12-27', closedWeeks: ['2026-12-21'], minimumWeeks: 4, maximumWeeks: 12, weeklyCapacity: 30, unavailableWeeks: [], products: [{ itemCode: 'AFTER3', weeklyPriceCents: 8400, taxRatePercent: 13 }, { itemCode: 'AFTER4', weeklyPriceCents: 10400, taxRatePercent: 13 }, { itemCode: 'AFTER5', weeklyPriceCents: 12000, taxRatePercent: 13 }] }
        : data.action === 'verifyCheckoutSession' ? { success: true, paid: true, paymentStatus: 'paid' }
        : data.action === 'quoteCheckout' ? { success: true, subtotalCents: 41600, discountCents: data.discountCode ? 1000 : 0, taxCents: data.discountCode ? 5278 : 5408, expectedAmountCents: data.discountCode ? 45878 : 47008 }
        : { success: true, checkoutUrl: 'https://checkout.stripe.com/c/pay/after-school-mock' };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    });
    await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock Stripe checkout</h1>' }));
    const url = `http://127.0.0.1:${server.address().port}/after-school/`;
    const planTab = page.getByRole('tab', { name: '1. Plan & dates' });
    const paymentTab = page.getByRole('tab', { name: '2. Details & payment' });
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('[data-start-date]').max === '2027-12-27');
    assert.equal(await planTab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#after-school-plan').isVisible(), true);
    assert.equal(await page.locator('#after-school-payment').isHidden(), true);
    assert.equal(await page.locator('[data-plan]').count(), 3);
    assert.equal(await page.locator('[data-next]').isDisabled(), true);
    await paymentTab.click();
    assert.equal(await page.locator('[name="studentName"]').isVisible(), true);
    assert.equal(await page.locator('[data-checkout]').isDisabled(), true);
    await page.locator('[data-back]').click();
    await page.locator('[data-plan][data-code="AFTER4"] [data-select-plan]').click();
    if (width > 760) await page.locator('[data-week-date="2026-11-16"]').click();
    else await page.locator('[data-start-date]').fill('2026-11-16');
    assert.match(await page.locator('[data-selection-preview]').textContent(), /\$416\.00/);
    await page.locator('[data-after-school-booking]').screenshot({ path: `.tools/after-school-plan-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'plan tab has no horizontal overflow');
    await planTab.focus();
    await planTab.press('ArrowRight');
    assert.equal(await paymentTab.getAttribute('aria-selected'), 'true');
    assert.equal(await paymentTab.evaluate(element => document.activeElement === element), true);
    assert.equal(await page.locator('#after-school-plan').isHidden(), true);
    assert.equal(await page.locator('[data-total]').textContent(), '$470.08');
    assert.match(await page.locator('[data-selected-plan]').textContent(), /4 days\/week.*4 weeks/);
    for (const [name, value] of Object.entries({ studentName: 'Test Child', parentName: 'Test Parent', parentEmail: 'parent@example.test', phone: '4165550100' })) {
      await page.locator(`[name="${name}"]`).fill(value);
    }
    await page.locator('[data-after-school-booking]').screenshot({ path: `.tools/after-school-payment-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'payment tab has no horizontal overflow');
    await paymentTab.focus();
    await paymentTab.press('Home');
    assert.equal(await planTab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-start-date]').inputValue(), '2026-11-16');
    await page.locator('[data-week-preset="8"]').click();
    assert.equal(await page.locator('[data-next]').isDisabled(), true, 'a block containing a closed week cannot continue');
    await page.locator('[data-week-preset="4"]').click();
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('[name="studentName"]').inputValue(), 'Test Child', 'family details survive editing the plan');
    await page.locator('[data-checkout]').click();
    await page.getByRole('button', { name: 'Continue to secure payment' }).waitFor();
    assert.equal(requests.some(data => data.action === 'createCheckoutSession'), false, 'reviewing does not create a checkout');
    await page.locator('[name="phone"]').fill('4165550101');
    assert.equal(await page.locator('[data-checkout]').textContent(), 'Review total', 'editing invalidates the quote');
    await page.locator('.after-school-discount-panel > summary').click();
    await page.locator('[name="discountCode"]').fill('SAVE10');
    await page.locator('[data-discount-apply]').click();
    await page.getByRole('button', { name: 'Continue to secure payment' }).waitFor();
    assert.equal(await page.locator('[data-total]').textContent(), '$458.78');
    assert.equal(await page.locator('[data-saving-row]').isVisible(), true);
    assert.equal(await page.locator('[data-discount-summary]').isHidden(), true, 'discount totals appear only in Your booking');
    assert.equal(await page.locator('#after-school-registration-status').textContent(), '', 'quote review adds no message to the payment panel');
    await page.locator('[data-checkout]').click();
    await page.waitForURL('https://checkout.stripe.com/**');
    const checkout = requests.find(data => data.action === 'createCheckoutSession');
    assert.equal(checkout.startDate, '2026-11-16', 'hidden first-tab controls remain in the submitted form');
    assert.equal(checkout.weekCount, 4);
    assert.deepEqual(checkout.selectedItemCodes, ['AFTER4']);
    assert.equal(checkout.displayedAmountCents, 45878);
    assert.equal(checkout.discountCode, 'SAVE10');
    assert.match(checkout.successUrl, /session_id=\{CHECKOUT_SESSION_ID\}/);
    assert.equal(checkout.parentEmail, 'parent@example.test');
    await page.goto(url + '?payment=success&session_id=cs_live_mock');
    await page.waitForFunction(() => document.querySelector('#after-school-registration-status').dataset.type === 'success');
    assert.equal(await paymentTab.getAttribute('aria-selected'), 'true', 'payment returns open the second tab');
    await page.goto(url + '?payment=canceled');
    await page.waitForFunction(() => document.querySelector('#after-school-registration-status').textContent.includes('canceled'));
    assert.equal(await page.locator('#after-school-payment').isVisible(), true);
    legacyBackend = true;
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#after-school-registration-status').textContent.includes('being updated'));
    await page.locator('[data-plan][data-code="AFTER3"] [data-select-plan]').click();
    await page.locator('[data-start-date]').fill('2026-11-16');
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('[data-checkout]').isDisabled(), true, 'legacy backend still blocks payment');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`After School tabs, retained details, checkout payload and layout passed at ${width}px.`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
