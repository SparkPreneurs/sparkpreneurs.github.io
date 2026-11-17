import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../apps-script/AFTER_SCHOOL_PROGRAM.gs', import.meta.url), 'utf8');
class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.columns = 26; }
  getMaxColumns() { return this.columns; }
  insertColumnsAfter(after, count) { assert.equal(after, this.columns); this.columns += count; }
  getName() { return this.name; }
  getParent() { return { getSpreadsheetTimeZone: () => this.timeZone || 'UTC' }; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return Math.max(0, ...this.rows.map(row => row.length)); }
  setFrozenRows() {}
  appendRow(row) { this.rows.push([...row]); }
  getRange(row, column, height = 1, width = 1) {
    assert.ok(column + width - 1 <= this.columns, 'range must fit the sheet grid');
    const setValues = values => values.forEach((cells, r) => cells.forEach((value, c) => {
      this.rows[row - 1 + r] ||= [];
      this.rows[row - 1 + r][column - 1 + c] = value;
    }));
    return {
      getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => this.rows[row - 1 + r]?.[column - 1 + c] ?? '')),
      setValues, setValue: value => setValues([[value]]),
    };
  }
}
export function backend() {
  const properties = { AFTER_SCHOOL_SPREADSHEET_ID: 'test-workbook', STRIPE_MODE: 'test', STRIPE_SECRET_KEY_TEST: 'sk_test_mock', BOOKING_CLOSED_WEEKS: '[]' };
  const sheets = new Map(), sessions = new Map(), calls = [];
  let today = '2098-01-01', locked = false, sequence = 0;
  const workbook = { getSheetByName: name => sheets.get(name), insertSheet: name => { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet; } };
  const context = vm.createContext({
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] ?? null }) },
    SpreadsheetApp: { openById: id => { assert.equal(id, 'test-workbook'); return workbook; } },
    Utilities: { formatDate: () => today, getUuid: () => 'order' + (++sequence), newBlob: value => ({ getBytes: () => Buffer.from(value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { assert.equal(locked, false); locked = true; }, releaseLock: () => { locked = false; } }) },
  });
  vm.runInContext(source, context);
  context.setupPeriodWorkbook();
  context.stripePost_ = (path, params, key) => {
    assert.ok(locked, 'capacity check and session creation must hold the same lock');
    calls.push({ path, params, key });
    const id = 'cs_test_session' + calls.length;
    const session = { id, object: 'checkout.session', mode: 'payment', livemode: false, payment_status: 'unpaid', status: 'open',
      amount_total: Number(params['line_items[0][price_data][unit_amount]']), currency: 'cad', client_reference_id: params.client_reference_id,
      url: 'https://checkout.stripe.com/c/pay/' + id, metadata: {} };
    for (const [name, value] of Object.entries(params)) {
      const match = /^metadata\[(.+)\]$/.exec(name);
      if (match) session.metadata[match[1]] = value;
    }
    sessions.set(id, session);
    return session;
  };
  context.stripeGet_ = path => sessions.get(path.split('/').at(-1));
  let notifications = 0;
  context.sendEnrollmentNotificationSafely_ = () => { notifications++; };
  const rows = name => context.readRows_(sheets.get(name), vm.runInContext(name === 'Registrations' ? 'REGISTRATION_HEADERS' : name === 'Products' ? 'PRODUCT_HEADERS' : 'ATTEMPT_HEADERS', context));
  const request = changes => ({ programCode: 'after_school_program', selectedItemCodes: ['AFTER3'], startDate: '2098-01-20', weekCount: 4,
    studentName: 'Test Child', parentName: 'Test Parent', parentEmail: 'parent@example.test', phone: '4165550100', displayedAmountCents: 37968,
    successUrl: 'http://localhost:4321/after-school/?payment=success&session_id={CHECKOUT_SESSION_ID}', cancelUrl: 'http://localhost:4321/after-school/?payment=canceled', ...changes });
  return { context, properties, sheets, sessions, calls, rows, request, setToday: value => { today = value; },
    get locked() { return locked; }, get notifications() { return notifications; } };
}

