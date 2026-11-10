// Run after npm run build. No requests reach Google or Stripe.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = path.resolve('dist');
const endpoint = 'https://script.google.com/macros/s/PA_DAY_TEST/exec';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const extension = path.extname(file);
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp' };
    let body = await readFile(file);
    // Inject a mock deployment only into this in-memory test response.
    if (extension === '.html') body = body.toString().replace(/data-endpoint(?:="[^"]*")?(?=\s|>)/, `data-endpoint="${endpoint}"`);
    response.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream' }).end(body);
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
    await page.clock.install({ time: new Date('2026-11-10T12:00:00Z') });
    const requests = [], errors = [];
    let unavailable = false;
    let availabilityFailure = false;
    let soldOutFirst = false;
    let invalidCode = false;
    let discountsSupported = true;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.route('https://script.google.com/**', async route => {
      const data = route.request().postDataJSON(); requests.push(data);
      const body = data.action === 'getAvailability' ? availabilityFailure ? { success: false, error: 'Unavailable' }
        : { success: true, items: [...['20261120', '20270115', '20270212'].flatMap(date => ['STANDARD', 'EXTENDED'].map(option => ({ itemCode: `PA_${date}_${option}`, placesRemaining: date === '20270212' || (soldOutFirst && date === '20261120') ? 0 : 2 }))), { itemCode: 'PA_20270630_EXTENDED', placesRemaining: 1 }] }
        : unavailable ? { success: false, error: 'This PA day is fully booked.' }
        : data.action === 'ping' ? { success: true, programCode: 'pa_day_camp', bookingVersion: 1, stripeMode: 'live', discountsSupported }
        : data.action === 'quoteCheckout' ? invalidCode ? { success: false, error: 'This discount code has already been used with this email.' }
          : data.discountCode ? { success: true, discountCode: 'TEST25', subtotalCents: 19000, discountCents: 2500, taxCents: 2145, expectedAmountCents: 18645 }
          : { success: true, discountCode: '', subtotalCents: 19000, discountCents: 0, taxCents: 2470, expectedAmountCents: 21470 }
        : data.action === 'verifyCheckoutSession' ? { success: true, paymentStatus: 'paid', message: 'Payment verified. Registration confirmed.' }
        : { success: true, checkoutUrl: 'https://checkout.stripe.com/c/pay/mock' };
      await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    });
    await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock Stripe checkout</h1>' }));
    const url = `http://127.0.0.1:${server.address().port}/camps/pa-day-camp/`;
    await page.goto(url);
    await page.waitForFunction(() => !document.querySelector('[data-pa-select]').disabled);
    assert.equal(await page.locator('[data-pa-day]').nth(2).locator('[data-pa-select]').isDisabled(), true);
    assert.equal(await page.locator('[data-pa-day]').nth(2).locator('[data-pa-day-availability]').textContent(), 'Fully booked');
    assert.equal(await page.locator('[data-pa-day]').nth(3).locator('[data-pa-select]').isDisabled(), true, 'missing/inactive dates cannot be selected');
    const extendedOnly = page.locator('[data-pa-day]').nth(4);
    await extendedOnly.locator('[data-pa-select]').check();
    assert.equal(await extendedOnly.locator('select').inputValue(), 'extended', 'an unavailable pickup option cannot be selected');
    await extendedOnly.locator('[data-pa-time-trigger]').click();
    assert.equal(await extendedOnly.locator('[data-pa-time-option="standard"]').isDisabled(), true);
    await page.keyboard.press('Escape');
    await extendedOnly.locator('[data-pa-select]').uncheck();
    availabilityFailure = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.locator('[data-pa-availability-retry]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-pa-day]').nth(0).locator('[data-pa-select]').isDisabled(), true, 'failed availability disables selection');
    availabilityFailure = false;
    await page.locator('[data-pa-availability-retry]').click();
    await page.waitForFunction(() => !document.querySelector('[data-pa-select]').disabled);
    await page.locator('[data-pa-day]').nth(0).locator('[data-pa-select]').check();
    await page.locator('[data-pa-day]').nth(1).locator('[data-pa-select]').check();
    await page.locator('[data-pa-day]').nth(1).locator('[data-pa-time-trigger]').click();
    await page.locator('[data-pa-day]').nth(1).locator('[data-pa-time-option="extended"]').click();
    await page.locator('[data-pa-next]').click();
    for (const [name, value] of Object.entries({ studentName: 'Test Child', studentAge: '8', school: 'Test School', parentName: 'Test Parent', parentEmail: 'parent@example.test', phone: '4165550100' })) await page.locator(`[name="${name}"]`).fill(value);
    await page.locator('[data-pa-discount]').waitFor({ state: 'visible' });
    await page.locator('[data-pa-discount] summary').click();
    await page.locator('[name="discountCode"]').fill(' test25 ');
    invalidCode = true;
    await page.locator('[data-pa-apply-discount]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-discount-status]').textContent.includes('already been used'));
    assert.equal(await page.locator('[data-pa-quote]').isVisible(), false);
    invalidCode = false;
    await page.locator('[data-pa-apply-discount]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-submit]').textContent === 'Continue to Secure Payment');
    assert.equal(await page.locator('[data-pa-total]').textContent(), '$186.45');
    assert.equal(await page.locator('[name="discountCode"]').inputValue(), 'TEST25');
    assert.ok((await page.locator('[data-pa-discount-status]').textContent()).includes('$25.00'));
    await page.locator('[data-pa-remove-discount]').click();
    assert.equal(await page.locator('[data-pa-quote]').isVisible(), false);
    await page.locator('[data-pa-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-total]').textContent === '$214.70');
    await page.locator('[name="discountCode"]').fill('TEST25');
    await page.locator('[data-pa-apply-discount]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-total]').textContent === '$186.45');
    assert.equal(requests.filter(data => data.action === 'createCheckoutSession').length, 0, 'review must not create a payable session');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    soldOutFirst = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('[data-pa-select]').disabled);
    assert.equal(await page.locator('[data-pa-select]').first().isChecked(), false, 'newly sold-out dates are removed from cart');
    assert.equal(await page.locator('[data-pa-quote]').isVisible(), false, 'availability changes invalidate the reviewed total');
    soldOutFirst = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => !document.querySelector('[data-pa-select]').disabled);
    await page.locator('[data-pa-tab="pa-dates"]').click();
    await page.locator('[data-pa-select]').first().check();
    await page.locator('[data-pa-next]').click();
    await page.locator('[data-pa-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-submit]').textContent === 'Continue to Secure Payment');
    // Editing details invalidates the total and requires another review.
    await page.locator('[name="studentAge"]').fill('9');
    assert.equal(await page.locator('[data-pa-quote]').isVisible(), false);
    unavailable = true;
    await page.locator('[data-pa-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-status]').textContent.includes('fully booked'));
    unavailable = false;
    await page.locator('[data-pa-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-submit]').textContent === 'Continue to Secure Payment');
    await page.locator('[data-pa-submit]').click();
    await page.waitForURL('https://checkout.stripe.com/**');
    const checkout = requests.find(data => data.action === 'createCheckoutSession');
    assert.deepEqual(checkout.selectedItemCodes, ['PA_20261120_STANDARD', 'PA_20270115_EXTENDED']);
    assert.equal(checkout.studentAge, '9');
    assert.equal(checkout.discountCode, 'TEST25');
    assert.equal(checkout.displayedAmountCents, 18645);
    await page.goto(url + '?payment=success&session_id=cs_live_mock');
    await page.waitForFunction(() => document.querySelector('[data-pa-status]').textContent.includes('Registration confirmed'));
    assert.equal(await page.locator('#pa-enrollment').isVisible(), true);
    assert.equal(new URL(page.url()).search, '');
    await page.goto(url + '?payment=canceled');
    await page.waitForFunction(() => document.querySelector('[data-pa-status]').textContent.includes('Payment was canceled'));
    discountsSupported = false;
    await page.goto(url);
    await page.waitForFunction(() => !document.querySelector('[data-pa-select]').disabled);
    assert.equal(await page.locator('[data-pa-discount]').isVisible(), false, 'unconfigured discount service does not offer unusable codes');
    await page.locator('[data-pa-select]').first().check();
    await page.locator('[data-pa-next]').click();
    for (const [name, value] of Object.entries({ studentName: 'Test Child', studentAge: '8', school: 'Test School', parentName: 'Test Parent', parentEmail: 'parent@example.test', phone: '4165550100' })) await page.locator(`[name="${name}"]`).fill(value);
    await page.locator('[data-pa-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-pa-submit]').textContent === 'Continue to Secure Payment');
    assert.equal(await page.locator('[data-pa-total]').textContent(), '$214.70', 'ordinary checkout works without discount configuration');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PA Day checkout, errors, verification and cancellation passed at ${width}px`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
