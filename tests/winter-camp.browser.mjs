// Build first. Runs the actual backend in memory; Google, Stripe and email are substituted.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { backend } from './winter-camp-fixture.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const root = path.resolve('dist');
const endpoint = 'https://script.google.com/macros/s/WINTER_TEST/exec';
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname, ...(pathname.endsWith('/') ? ['index.html'] : []));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    const extension = path.extname(file);
    let body = await readFile(file);
    if (extension === '.html') body = body.toString().replace(/data-endpoint(?:="[^"]*")?(?=\s|>)/, `data-endpoint="${endpoint}"`).replace('data-stripe-mode="live"', 'data-stripe-mode="test"');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' };
    response.writeHead(200, { 'Content-Type': mime[extension] || 'application/octet-stream' }).end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
  for (const width of [1440, 390]) {
    const fixture = backend();
    const { context: service, session, registrations, attempts } = fixture;
    service.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: body => ({ setMimeType: () => JSON.parse(body) }) };
    service.Utilities.newBlob = value => ({ getBytes: () => Buffer.from(value) });
    service.stripeRequest_ = method => {
      if (method === 'post') {
        const attempt = attempts.at(-1);
        session.amount_total = attempt.expectedAmountCents;
        session.metadata.expectedAmountCents = String(attempt.expectedAmountCents);
        session.metadata.selectedItemCodes = attempt.selectedItemCodes.replace(/,\s*/g, ',');
        session.payment_status = 'unpaid';
      }
      return session;
    };
    service.discountServiceConfigured_ = () => true;
    service.discountServiceRequest_ = action => action === 'quote' ? { discountCents: 2500 } : action === 'reserve' ? { token: 'reservation1' } : { success: true };
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(() => sessionStorage.setItem('sparkpreneurs-featured-offers-v1', 'dismissed'));
    const page = await context.newPage();
    const errors = [], requests = [];
    let badHealth = false, availabilityFailure = false, noAvailability = false;
    let releaseAvailability;
    const initialAvailability = new Promise(resolve => { releaseAvailability = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await page.route('https://script.google.com/**', async route => {
      const data = route.request().postDataJSON(); requests.push(data);
      if (data.action === 'getAvailability') await initialAvailability;
      const result = data.action === 'ping' && badHealth ? { success: true, programCode: 'wrong', stripeMode: 'test' }
        : data.action === 'getAvailability' && availabilityFailure ? { success: false, error: 'Availability unavailable' }
        : data.action === 'getAvailability' && noAvailability ? { success: true, items: [] }
        : service.doPost({ postData: { contents: JSON.stringify(data) } });
      await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) });
    });
    await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Test Stripe checkout</h1>' }));
    const url = `http://127.0.0.1:${server.address().port}/camps/winter-camp/`;
    const checkout = page.locator('[data-winter-checkout]');
    const messageColor = selector => page.locator(selector).first().evaluate(element => getComputedStyle(element).color);
    const fill = async () => {
      await page.locator('[name="studentName"]').fill('Test Child');
      await page.locator('[name="studentAge"]').fill('8');
      await page.locator('[name="parentName"]').fill('Test Parent');
      await page.locator('[name="parentEmail"]').fill('parent@example.test');
      await page.locator('[name="phone"]').fill('4165550100');
    };
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('[data-winter-availability]').textContent === 'Checking availability…');
    assert.equal(await messageColor('[data-winter-availability]'), 'rgb(30, 64, 175)');
    assert.equal(await page.locator('[data-winter-add]').first().isDisabled(), true);
    assert.equal(await page.locator('[data-winter-retry]').count(), 0);
    releaseAvailability();
    await page.waitForFunction(() => !document.querySelector('[data-winter-add]').disabled);
    assert.equal(await page.locator('[data-winter-availability-status]').count(), 0);
    assert.equal(await messageColor('[data-winter-availability]'), 'rgb(22, 101, 52)');
    await page.locator('[name="christmas-pickup-21"][value="1"]').check();
    await page.locator('[data-winter-add]').first().click();
    await page.locator('[data-winter-next]').click();
    await fill();
    await checkout.click();
    await page.waitForFunction(() => document.querySelector('[data-winter-total]').textContent === '$372.90');
    assert.equal(attempts.length, 0, 'review never creates a Stripe checkout');
    await page.locator('[name="parentName"]').fill('Updated Parent');
    assert.match(await checkout.textContent(), /Review Total/);
    await page.locator('.winter-discount-panel summary').click();
    await page.locator('[name="discountCode"]').fill('TEST25');
    await page.locator('[data-discount-apply]').click();
    await page.waitForFunction(() => document.querySelector('[data-winter-total]').textContent === '$344.65');
    assert.equal(await page.locator('[data-winter-saving]').textContent(), '-$25.00');
    await checkout.click();
    await page.waitForURL('https://checkout.stripe.com/**');
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].parentName, 'Updated Parent');
    assert.equal(session.amount_total, 34465);
    assert.equal(attempts[0].selectedItemCodes, 'WINTER_CHRISTMAS_2026, WINTER_CHRISTMAS_2026_CARE21_H1');
    assert.equal(registrations.length, 0);
    await page.goto(url + '?payment=success&session_id=' + session.id);
    await page.waitForFunction(() => document.querySelector('[data-winter-status]').dataset.status === 'error');
    assert.ok(page.url().includes('session_id='), 'unpaid returns remain retryable');
    assert.equal(registrations.length, 0);
    session.payment_status = 'paid';
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-winter-status]').textContent.includes('Payment verified'));
    assert.equal(registrations.length, 1);
    await page.goto(url + '?payment=success&session_id=' + session.id);
    await page.waitForFunction(() => document.querySelector('[data-winter-status]').textContent.includes('Payment verified'));
    assert.equal(registrations.length, 1, 'repeat returns do not duplicate registration');
    const verifyCount = requests.filter(data => data.action === 'verifyCheckoutSession').length;
    await page.goto(url + '?payment=canceled');
    await page.waitForFunction(() => document.querySelector('[data-winter-status]').textContent.includes('canceled'));
    assert.equal(requests.filter(data => data.action === 'verifyCheckoutSession').length, verifyCount);
    // Existing paid registration plus an uncertain checkout consumes both places.
    attempts.push({ status: 'CHECKOUT_UNKNOWN', selectedItemCodes: 'WINTER_CHRISTMAS_2026' });
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('[data-winter-availability]').textContent === 'Fully booked');
    assert.equal(await messageColor('[data-winter-availability]'), 'rgb(133, 77, 14)');
    assert.equal(await page.locator('[data-winter-add]').first().isDisabled(), true);
    noAvailability = true;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-winter-availability]').dataset.status === 'unavailable');
    assert.equal(await messageColor('[data-winter-availability]'), 'rgb(133, 77, 14)');
    assert.equal(await page.locator('[data-winter-add]').nth(1).isDisabled(), true);
    noAvailability = false;
    availabilityFailure = true;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-winter-availability]').dataset.status === 'error');
    assert.match(await page.locator('[data-winter-availability]').first().textContent(), /Availability could not be checked/);
    assert.equal(await messageColor('[data-winter-availability]'), 'rgb(153, 27, 27)');
    assert.equal(await checkout.isDisabled(), true);
    availabilityFailure = false;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => !document.querySelectorAll('[data-winter-add]')[1].disabled);
    badHealth = true;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-winter-availability]').dataset.status === 'error');
    assert.equal(await page.locator('[data-winter-add]').nth(1).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Winter Camp browser/backend integration passed at ${width}px.`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
