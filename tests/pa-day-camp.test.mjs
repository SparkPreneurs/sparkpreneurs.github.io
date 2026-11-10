import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../apps-script/PA_DAY_CAMP.gs', import.meta.url), 'utf8');
function backend() {
  /** @type {Record<string, string>} */
  const properties = { PA_DAY_SPREADSHEET_ID: 'test-sheet', STRIPE_MODE: 'test', STRIPE_SECRET_KEY_TEST: 'sk_test_mock', STRIPE_SECRET_KEY_LIVE: '', PA_DAY_TAX_RATE_PERCENT: '13' };
  const context = vm.createContext({ console, PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
    Utilities: { formatDate: () => '2026-11-10', getUuid: () => 'order1' } });
  vm.runInContext(source, context);
  const headers = name => Array.from(vm.runInContext(name, context));
  const productHeaders = headers('PRODUCT_HEADERS');
  const products = [productHeaders, ...['STANDARD', 'EXTENDED'].map((option, i) => ['pa_day_camp', `PA_20261120_${option}`, `Nov 20 ${option}`, '2026-11-20', '2026-11-20', '08:00', i ? '17:00' : '15:00', i ? 10500 : 8500, 13, true, 2])];
  const attempts = [], registrations = [];
  const tables = { Products: products, 'Checkout Attempts': [headers('ATTEMPT_HEADERS')], Registrations: [headers('REGISTRATION_HEADERS')] };
  const sheets = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    getDataRange: () => ({ getValues: () => name === 'Products' ? rows : [rows[0], ...(name === 'Registrations' ? registrations : attempts).map(record => rows[0].map(key => record[key] ?? ''))] }),
  }]));
  context.SpreadsheetApp = { openById: () => ({ getSheetByName: name => sheets[name] }) };
  context.assertRequiredHeaders_ = () => {};
  context.requireSheet_ = (_ss, name) => sheets[name];
  context.readRecordByColumn_ = (sheet, _headers, key, value) => (sheet === sheets.Registrations ? registrations : attempts).find(row => row[key] === value);
  context.upsertByColumn_ = (sheet, _headers, key, value, record) => {
    const rows = sheet === sheets.Registrations ? registrations : attempts;
    const index = rows.findIndex(row => row[key] === value);
    if (index < 0) rows.push({ ...record }); else rows[index] = { ...record };
  };
  let locked = false;
  context.LockService = { getScriptLock: () => ({ waitLock: () => { assert.equal(locked, false); locked = true; }, releaseLock: () => { locked = false; } }) };
  context.sendEnrollmentNotificationSafely_ = () => {};
  const data = { programCode: 'pa_day_camp', selectedItemCodes: ['PA_20261120_STANDARD'], studentName: 'Test Child', studentAge: '8', school: 'Test School', parentName: 'Test Parent', parentEmail: 'parent@example.test', phone: '4165550100', displayedAmountCents: 9605,
    successUrl: 'http://localhost:4321/camps/pa-day-camp/?payment=success&session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'http://localhost:4321/camps/pa-day-camp/?payment=canceled' };
  const session = { id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/mock', mode: 'payment', livemode: false, payment_status: 'paid', amount_total: 9605, currency: 'cad', client_reference_id: 'order1', metadata: { programCode: 'pa_day_camp', orderId: 'order1', expectedAmountCents: '9605', selectedItemCodes: 'PA_20261120_STANDARD' } };
  context.stripeRequest_ = (method) => { if (method === 'post') assert.equal(locked, true); return session; };
  return { context, properties, products, attempts, registrations, data, session, sheets };
}

test('quotes trusted CAD prices and tax, rejecting closed or unavailable dates', () => {
  const { context, products, data } = backend();
  assert.equal(context.quoteCheckout_(data).expectedAmountCents, 9605);
  assert.equal(context.quoteCheckout_({ ...data, selectedItemCodes: ['PA_20261120_EXTENDED'] }).expectedAmountCents, 11865);
  for (const codes of [[], ['PA_20261120_STANDARD', 'PA_20261120_EXTENDED'], ['PA_20261120_STANDARD', 'PA_20261120_STANDARD'], ['PA_20261110_STANDARD'], ['PA_20270101_STANDARD'], ['bad']]) {
    assert.throws(() => context.quoteCheckout_({ ...data, selectedItemCodes: codes }));
  }
  products[1][9] = false;
  assert.throws(() => context.quoteCheckout_(data));
});

test('capacity is shared across pickup times and includes pending reservations', () => {
  const { context, data, attempts } = backend();
  attempts.push({ status: 'CHECKOUT_CREATED', selectedItemCodes: 'PA_20261120_EXTENDED' }, { status: 'PAID_VERIFIED', selectedItemCodes: 'PA_20261120_STANDARD' });
  assert.throws(() => context.quoteCheckout_(data), /fully booked/);
  attempts[0].status = 'EXPIRED';
  assert.equal(context.quoteCheckout_(data).success, true);
  attempts[0].status = 'CHECKOUT_UNKNOWN';
  assert.throws(() => context.quoteCheckout_(data), /fully booked/);
});

test('public availability returns remaining places without exposing registrations', () => {
  const { context, products, attempts } = backend();
  attempts.push({ status: 'PAID_VERIFIED', selectedItemCodes: 'PA_20261120_STANDARD', parentEmail: 'private@example.test' });
  let result = context.getAvailability_();
  assert.equal(result.items.length, 2);
  assert.ok(result.items.every(item => item.placesRemaining === 1));
  assert.equal(JSON.stringify(result).includes('private@example.test'), false);
  attempts.push({ status: 'CHECKOUT_CREATED', selectedItemCodes: 'PA_20261120_EXTENDED' });
  assert.ok(context.getAvailability_().items.every(item => item.placesRemaining === 0));
  attempts[1].status = 'EXPIRED';
  assert.ok(context.getAvailability_().items.every(item => item.placesRemaining === 1));
  products[1][9] = false;
  result = context.getAvailability_();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].itemCode, 'PA_20261120_EXTENDED');
  products[2][1] = 'PA_20261110_EXTENDED';
  assert.equal(context.getAvailability_().items.length, 0, 'past and same-day dates are not offered');
});

test('checkout rejects price tampering, preserves child details, and reserves before Stripe', () => {
  const { context, data, attempts } = backend();
  assert.equal(context.createCheckoutSession_({ ...data, displayedAmountCents: 1 }).success, false);
  assert.equal(attempts.length, 0);
  assert.equal(context.createCheckoutSession_(data).success, true);
  assert.equal(attempts[0].studentAge, 8);
  assert.equal(attempts[0].school, 'Test School');
  assert.equal(attempts[0].selectedItemCodes, 'PA_20261120_STANDARD');
  assert.equal(attempts[0].status, 'CHECKOUT_CREATED');
  assert.throws(() => context.createCheckoutSession_({ ...data, studentAge: '' }));
});

test('discounts use trusted savings and tax and are saved with the verified registration', () => {
  const { context, data, attempts, registrations, session, properties } = backend();
  assert.equal(context.discountServiceConfigured_(), false);
  properties.DISCOUNT_SERVICE_URL = 'https://script.google.com/macros/s/DISCOUNT_TEST/exec';
  properties.DISCOUNT_SERVICE_KEY = 'private-test-service-key-not-for-browser';
  assert.equal(context.discountServiceConfigured_(), true);
  const calls = [];
  context.discountServiceRequest_ = (action, payload) => {
    calls.push({ action, payload });
    if (action === 'quote') return { discountCents: 2500 };
    if (action === 'reserve') return { token: 'reservation1' };
    return { success: true };
  };
  const discounted = { ...data, discountCode: ' kumon25 ', displayedAmountCents: 6780 };
  const quote = context.quoteCheckout_(discounted);
  assert.equal(quote.discountCode, 'KUMON25');
  assert.equal(quote.subtotalCents, 8500);
  assert.equal(quote.discountCents, 2500);
  assert.equal(quote.taxCents, 780);
  assert.equal(quote.expectedAmountCents, 6780);
  assert.equal(context.createCheckoutSession_({ ...discounted, displayedAmountCents: 1 }).success, false);
  assert.equal(attempts.length, 0);
  session.amount_total = 6780;
  session.metadata.expectedAmountCents = '6780';
  context.createCheckoutSession_(discounted);
  assert.equal(attempts[0].discountCode, 'KUMON25');
  assert.equal(attempts[0].discountCents, 2500);
  assert.equal(calls.find(call => call.action === 'reserve').payload.expectedAmountCents, 6780);
  assert.equal(calls.find(call => call.action === 'attach').payload.stripeSessionId, 'cs_test_abc');
  context.verifyCheckoutSession_(session.id);
  context.verifyCheckoutSession_(session.id);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].discountCents, 2500);
  assert.ok(calls.some(call => call.action === 'confirm'));
  assert.equal(context.countReservedForDay_('PA_20261120_EXTENDED'), 1);
});

test('invalid or used discount codes are rejected and failed reservations release camp capacity', () => {
  const { context, data, attempts } = backend();
  context.discountServiceRequest_ = () => { throw context.clientError_('This discount code has already been used with this email.'); };
  assert.throws(() => context.quoteCheckout_({ ...data, discountCode: 'USED25' }), /already been used/);
  assert.throws(() => context.quoteCheckout_({ ...data, discountCode: 'INVALID CODE!' }), /valid discount code/);
  assert.equal(attempts.length, 0);
  context.discountServiceRequest_ = action => {
    if (action === 'quote') return { discountCents: 2500 };
    throw context.clientError_('This discount code has already been used with this email.');
  };
  context.stripeRequest_ = () => assert.fail('Stripe must not be called after discount reservation failure');
  assert.throws(() => context.createCheckoutSession_({ ...data, discountCode: 'USED25', displayedAmountCents: 6780 }), /already been used/);
  assert.equal(attempts[0].status, 'CHECKOUT_FAILED');
  assert.equal(context.countReservedForDay_('PA_20261120_STANDARD'), 0);
});

test('paid verification checks amount, currency, mode and order and records only once', () => {
  const { context, data, session, registrations } = backend();
  context.createCheckoutSession_(data);
  session.payment_status = 'unpaid';
  assert.equal(context.verifyCheckoutSession_(session.id).success, false);
  session.payment_status = 'paid';
  for (const [field, wrong] of [['amount_total', 1], ['currency', 'usd'], ['livemode', true], ['client_reference_id', 'other'], ['mode', 'subscription']]) {
    const previous = session[field]; session[field] = wrong;
    assert.throws(() => context.verifyCheckoutSession_(session.id));
    session[field] = previous;
  }
  assert.equal(registrations.length, 0);
  context.verifyCheckoutSession_(session.id);
  context.verifyCheckoutSession_(session.id);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].school, 'Test School');
});

test('scheduled reconciliation records payments without customer returning and releases expired holds', () => {
  const { context, data, session, registrations, attempts } = backend();
  context.createCheckoutSession_(data);
  context.reconcilePendingPayments();
  assert.equal(registrations.length, 1);
  context.reconcilePendingPayments();
  assert.equal(registrations.length, 1);
  registrations.length = 0; attempts[0].status = 'CHECKOUT_CREATED';
  session.payment_status = 'unpaid'; session.status = 'expired';
  context.reconcilePendingPayments();
  assert.equal(attempts[0].status, 'EXPIRED');
  assert.equal(registrations.length, 0);
});

test('untrusted redirects and local redirects in live mode are rejected', () => {
  const { context, properties } = backend();
  for (const url of ['https://evil.test/camps/pa-day-camp/', 'https://sparkpreneurs.ca.evil.test/camps/pa-day-camp/', 'https://sparkpreneurs.ca/other/']) assert.throws(() => context.validateReturnUrl_(url, 'cancel'));
  assert.throws(() => context.validateReturnUrl_('https://sparkpreneurs.ca/camps/pa-day-camp/', 'success'));
  properties.STRIPE_MODE = 'live'; properties.STRIPE_SECRET_KEY_LIVE = 'sk_live_mock';
  assert.throws(() => context.validateReturnUrl_('http://localhost:4321/camps/pa-day-camp/', 'cancel'));
  assert.equal(context.validateReturnUrl_('https://sparkpreneurs.ca/camps/pa-day-camp/', 'cancel'), 'https://sparkpreneurs.ca/camps/pa-day-camp/');
});

test('setup seeds inactive $85/$105 options without overwriting existing workbook products', () => {
  const { context, properties } = backend();
  const rows = [['headers'], ['pa_day_camp', 'PA_20261120_STANDARD', 'existing']];
  const products = { getDataRange: () => ({ getValues: () => rows }), appendRow: row => rows.push(Array.from(row)) };
  context.seedMissingProducts_(products);
  assert.equal(rows.length, 11);
  assert.equal(rows[1][2], 'existing');
  assert.equal(rows[2][7], 10500);
  assert.equal(rows[2][9], false);
  assert.equal(rows[2][10], 0);
  context.seedMissingProducts_(products);
  assert.equal(rows.length, 11);
  properties.PA_DAY_TAX_RATE_PERCENT = '';
  assert.throws(() => context.seedMissingProducts_(products));
});

test('remaining-places upgrade preserves existing data and is safe to run again', () => {
  const { context } = backend();
  const productHeaders = Array.from(vm.runInContext('PRODUCT_HEADERS', context));
  const rows = [productHeaders.slice(), ['pa_day_camp', 'PA_20261120_STANDARD', 'Original camp', '', '', '', '', 8500, 13, true, 20],
    ['pa_day_camp', 'PA_20261120_EXTENDED', 'Original extended care', '', '', '', '', 10500, 13, true, 20]];
  const original = rows.map(row => row.slice());
  const sheet = {
    getName: () => 'Products', getLastColumn: () => rows[0].length, getLastRow: () => rows.length,
    autoResizeColumn: column => assert.equal(column, 12),
    getRange: (row, column, height = 1, width = 1) => {
      const range = {
        getValues: () => Array.from({ length: height }, (_, offset) => Array.from({ length: width }, (_, cell) => rows[row - 1 + offset]?.[column - 1 + cell] ?? '')),
        setValue: value => { rows[row - 1][column - 1] = value; return range; },
        setNote: () => range, setNumberFormat: () => range,
        setFormulas: formulas => { formulas.forEach(([formula], offset) => { rows[row - 1 + offset][column - 1] = formula; }); return range; },
      };
      return range;
    },
  };
  // Exercise the real schema validation, rather than the checkout fixture's stub.
  vm.runInContext(source.slice(source.indexOf('function assertRequiredHeaders_'), source.indexOf('\nfunction headerIndexes_')), context);
  context.updatePlacesRemainingColumn_(sheet);
  assert.equal(rows[0][11], 'Places remaining');
  assert.deepEqual(rows.map(row => row.slice(0, 11)), original);
  assert.equal(rows[1][11], '=IF($A2<>"pa_day_camp","",IF($K2="","",MAX(0,$K2-COUNTIFS(\'Checkout Attempts\'!$H$2:$H,"*"&LEFT($B2,12)&"*",\'Checkout Attempts\'!$G$2:$G,"<>EXPIRED",\'Checkout Attempts\'!$G$2:$G,"<>CHECKOUT_FAILED"))))');
  const upgraded = rows.map(row => row.slice());
  context.updatePlacesRemainingColumn_(sheet);
  assert.deepEqual(rows, upgraded);
  // Adding the display column must not prevent backend price/availability reads.
  context.productSheet = sheet;
  vm.runInContext('assertRequiredHeaders_(productSheet, PRODUCT_HEADERS)', context);
  rows[0][11] = 'Unrecognized column';
  assert.throws(() => context.updatePlacesRemainingColumn_(sheet), /unexpected columns/);
  rows[0][11] = 'Places remaining'; rows[0][1] = 'Wrong item header';
  assert.throws(() => context.updatePlacesRemainingColumn_(sheet), /unexpected columns/);
});
