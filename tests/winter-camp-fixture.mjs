import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../apps-script/WINTER_CAMP.gs', import.meta.url), 'utf8');
export function backend() {
  /** @type {Record<string, string>} */
  const properties = { WINTER_CAMP_SPREADSHEET_ID: 'test-sheet', STRIPE_MODE: 'test', STRIPE_SECRET_KEY_TEST: 'sk_test_mock', STRIPE_SECRET_KEY_LIVE: '', WINTER_CAMP_TAX_RATE_PERCENT: '13' };
  const context = vm.createContext({ console, PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
    Utilities: { formatDate: () => '2026-11-10', getUuid: () => 'order1' } });
  vm.runInContext(source, context);
  const headers = name => Array.from(vm.runInContext(name, context));
  const productHeaders = headers('PRODUCT_HEADERS');
  const seeded = [];
  context.seedMissingProducts_({ getDataRange: () => ({ getValues: () => [productHeaders] }), appendRow: row => seeded.push(Array.from(row)) });
  const products = [productHeaders, ...seeded.map(row => { row[9] = true; row[10] = 2; return row; })];
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
  const data = { programCode: 'winter_2026_camp', selectedItemCodes: ['WINTER_CHRISTMAS_2026', 'WINTER_CHRISTMAS_2026_CARE21_H1'], studentName: 'Test Child', studentAge: '8', school: 'Test School', parentName: 'Test Parent', parentEmail: 'parent@example.test', phone: '4165550100', displayedAmountCents: 37290,
    successUrl: 'http://localhost:4321/camps/winter-camp/?payment=success&session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'http://localhost:4321/camps/winter-camp/?payment=canceled' };
  const session = { id: 'cs_test_abc', url: 'https://checkout.stripe.com/c/pay/mock', mode: 'payment', livemode: false, payment_status: 'paid', amount_total: 37290, currency: 'cad', client_reference_id: 'order1', metadata: { programCode: 'winter_2026_camp', orderId: 'order1', expectedAmountCents: '37290', selectedItemCodes: 'WINTER_CHRISTMAS_2026,WINTER_CHRISTMAS_2026_CARE21_H1' } };
  context.stripeRequest_ = (method) => { if (method === 'post') assert.equal(locked, true); return session; };
  return { context, properties, products, attempts, registrations, data, session, sheets };
}

