import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { bookingWeeks, nextMonday } from '../src/scripts/booking-weeks.js';
import { backend } from './after-school-fixture.mjs';

test('all plans use workbook prices for 4 to 12 weeks and agree with browser dates', () => {
  const { context, request } = backend();
  for (const [code, price] of [['AFTER3', 8400], ['AFTER4', 10400], ['AFTER5', 12000]]) {
    for (const weekCount of [4, 8, 12]) {
      const booking = context.normalizeBooking_(request({ weekCount }));
      assert.deepEqual(booking.paidWeekStarts.split(', '), bookingWeeks('2098-01-20', weekCount));
      assert.equal(context.quoteCheckout_(request({ weekCount, selectedItemCodes: [code] })).expectedAmountCents, Math.round(price * weekCount * 1.13));
    }
  }
});
test('first Monday is strictly upcoming, including when today is Monday', () => {
  const { context, setToday, request } = backend();
  for (const [today, expected] of [['2026-11-15', '2026-11-16'], ['2026-11-16', '2026-11-23'], ['2026-11-17', '2026-11-23']]) {
    setToday(today);
    assert.equal(context.getBookingCalendar_().firstWeek, expected);
    assert.equal(context.normalizeBooking_(request({ startDate: expected })).startDate, expected);
  }
  setToday('2026-11-16');
  assert.throws(() => context.normalizeBooking_(request({ startDate: '2026-11-16' })));
  const RealDate = globalThis.Date;
  try {
    globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-11-16T17:00:00Z'])); } };
    assert.equal(nextMonday(), '2026-11-23');
  } finally { globalThis.Date = RealDate; }
});
test('invalid dates, counts, closures and season boundaries are rejected', () => {
  const { context, properties, request } = backend();
  for (const startDate of ['2098-02-30', '2098-01-21', '', '2020-01-06']) assert.throws(() => context.normalizeBooking_(request({ startDate })));
  for (const weekCount of [0, 3, 13, 4.5, NaN, '4']) assert.throws(() => context.normalizeBooking_(request({ weekCount })));
  properties.BOOKING_CLOSED_WEEKS = '["2098-02-03"]';
  assert.throws(() => context.quoteCheckout_(request()));
  assert.throws(() => bookingWeeks('2098-01-20', 4, { closedWeeks: ['2098-02-03'] }));
  properties.BOOKING_CLOSED_WEEKS = '[]'; properties.BOOKING_LAST_WEEK = '2098-02-03';
  assert.throws(() => context.quoteCheckout_(request()));
});
test('30 children share capacity across plans; expired holds release their weeks', () => {
  const fixture = backend(); const { context, request, sessions, rows } = fixture;
  for (let i = 0; i < 30; i++) {
    const data = request({ selectedItemCodes: [i % 2 ? 'AFTER4' : 'AFTER3'] });
    data.displayedAmountCents = context.quoteCheckout_(data).expectedAmountCents;
    context.createCheckoutSession_(data);
  }
  assert.equal(rows('Checkout Attempts').length, 30);
  assert.throws(() => context.createCheckoutSession_(request()), /fully booked/);
  const calendar = context.getPublicBookingCalendar_();
  assert.equal(calendar.unavailableWeeks.length, 4);
  assert.throws(() => bookingWeeks('2098-01-20', 4, calendar), /fully booked/);
  const session = [...sessions.values()][0]; session.status = 'expired';
  context.verifyCheckoutSession_({ sessionId: session.id });
  assert.equal(context.getPublicBookingCalendar_().unavailableWeeks.length, 0);
  context.createCheckoutSession_(request());
  assert.equal(fixture.locked, false);
});
test('paid verification rejects tampering and records registration and notification once', () => {
  const fixture = backend(); const { context, request, sessions, rows } = fixture;
  const created = context.createCheckoutSession_(request()); const session = sessions.get(created.stripeSessionId);
  assert.equal(context.verifyCheckoutSession_({ sessionId: session.id }).paid, false);
  assert.equal(rows('Registrations').length, 0); session.payment_status = 'paid';
  for (const [object, key, value] of [[session, 'amount_total', 1], [session, 'currency', 'usd'], [session, 'livemode', true], [session, 'client_reference_id', 'wrong'], [session.metadata, 'startDate', '2098-01-27'], [session.metadata, 'programCode', 'wrong']]) {
    const original = object[key]; object[key] = value;
    assert.throws(() => context.verifyCheckoutSession_({ sessionId: session.id })); object[key] = original;
  }
  context.verifyCheckoutSession_({ sessionId: session.id });
  assert.equal(context.verifyCheckoutSession_({ sessionId: session.id }).alreadyRecorded, true);
  assert.equal(rows('Registrations').length, 1); assert.equal(rows('Checkout Attempts')[0].status, 'PAID');
  assert.equal(rows('Registrations')[0].paidWeekStarts, '2098-01-20, 2098-01-27, 2098-02-03, 2098-02-10');
  assert.equal(fixture.notifications, 1); assert.equal(fixture.locked, false);
});
test('discount is calculated before tax, persisted, reserved and confirmed', () => {
  const { context, properties, request, sessions, rows } = backend();
  properties.DISCOUNT_SERVICE_URL = 'configured'; properties.DISCOUNT_SERVICE_KEY = 'secret';
  const calls = [];
  context.discountServiceRequest_ = action => { calls.push(action); return action === 'quote' ? { discountCents: 1000 } : { token: 'reservation' }; };
  const data = request({ discountCode: 'SAVE10' }); const quote = context.quoteCheckout_(data);
  assert.equal(quote.expectedAmountCents, 36838);
  const created = context.createCheckoutSession_({ ...data, displayedAmountCents: quote.expectedAmountCents });
  const session = sessions.get(created.stripeSessionId); session.payment_status = 'paid';
  context.verifyCheckoutSession_({ sessionId: session.id });
  assert.equal(rows('Registrations')[0].discountCents, 1000); assert.equal(rows('Registrations')[0].discountCode, 'SAVE10');
  assert.deepEqual(calls, ['quote', 'quote', 'reserve', 'attach', 'confirm']);
});

test('paid verification preserves ISO UTC dates and native workbook date cells', () => {
  for (const [timeZone, midnight] of [['UTC', '2098-01-20T00:00:00Z'], ['America/Los_Angeles', '2098-01-20T00:00:00Z'], ['America/Los_Angeles', '2098-01-20T08:00:00Z'], ['America/Toronto', '2098-01-20T05:00:00Z'], ['Asia/Tokyo', '2098-01-19T15:00:00Z']]) {
    const { context, request, sessions, sheets, rows } = backend();
    const created = context.createCheckoutSession_(request());
    const session = sessions.get(created.stripeSessionId); session.payment_status = 'paid';
    const attempts = sheets.get('Checkout Attempts'); attempts.timeZone = timeZone;
    attempts.rows[1][attempts.rows[0].indexOf('startDate')] = new Date(midnight);
    attempts.rows[1][attempts.rows[0].indexOf('endDate')] = new Date(new Date(midnight).getTime() + 25 * 86400000);
    context.Utilities.formatDate = (date, zone) => {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
      const part = type => parts.find(value => value.type === type).value;
      return `${part('year')}-${part('month')}-${part('day')}`;
    };
    assert.equal(context.verifyCheckoutSession_({ sessionId: session.id }).paid, true);
    assert.equal(rows('Registrations')[0].startDate, '2098-01-20');
    assert.equal(rows('Registrations')[0].endDate, '2098-02-14');
    session.metadata.startDate = '2098-01-27';
    assert.throws(() => context.verifyCheckoutSession_({ sessionId: session.id }), /startDate/);
  }
});
test('tampered totals, return URLs and wrong modes never create checkout', () => {
  const fixture = backend(); const { context, request, rows, properties } = fixture;
  for (const change of [{ displayedAmountCents: 1 }, { selectedItemCodes: ['AFTER3', 'AFTER4'] }, { successUrl: 'https://example.com/?session_id={CHECKOUT_SESSION_ID}' }, { successUrl: 'http://localhost:4321/after-school/' }]) assert.throws(() => context.createCheckoutSession_(request(change)));
  assert.equal(rows('Checkout Attempts').length, 0);
  assert.throws(() => context.verifyCheckoutSession_({ sessionId: 'cs_live_wrong' }));
  properties.STRIPE_MODE = 'live'; assert.throws(() => context.createCheckoutSession_(request()), /return URL/);
  assert.equal(fixture.locked, false);
});
test('uncertain Stripe outcomes retain capacity; pre-Stripe discount failures release it', () => {
  const { context, request, properties, rows } = backend(); properties.AFTER_SCHOOL_WEEKLY_CAPACITY = '1';
  context.stripePost_ = () => { throw new Error('Network failure'); };
  assert.throws(() => context.createCheckoutSession_(request()));
  assert.equal(rows('Checkout Attempts')[0].status, 'CHECKOUT_UNKNOWN');
  assert.throws(() => context.quoteCheckout_(request()), /fully booked/);
  context.updateAttemptByOrderId_(rows('Checkout Attempts')[0].orderId, { status: 'CHECKOUT_FAILED' });
  context.discountReservePricing_ = () => { throw new Error('Discount unavailable'); };
  assert.throws(() => context.createCheckoutSession_(request()));
  assert.equal(rows('Checkout Attempts')[1].status, 'CHECKOUT_FAILED');
  assert.equal(context.getPublicBookingCalendar_().unavailableWeeks.length, 0);
});
test('reconciliation records payments without browser return and expires abandoned sessions', () => {
  const { context, request, sessions, rows } = backend();
  context.createCheckoutSession_(request()); context.createCheckoutSession_(request());
  const values = [...sessions.values()]; values[0].payment_status = 'paid'; values[1].status = 'expired';
  context.reconcilePendingPayments(); context.reconcilePendingPayments();
  assert.equal(rows('Registrations').length, 1);
  assert.deepEqual(Array.from(rows('Checkout Attempts'), row => row.status), ['PAID', 'EXPIRED']);
});
test('setup preserves payment positions, existing data and workbook prices', () => {
  const { context, sheets, rows } = backend(); const registrations = sheets.get('Registrations');
  registrations.rows = [Array.from(vm.runInContext('LEGACY_ATTEMPT_HEADERS.concat(["paidAt", "stripePaymentIntentId", "stripePaymentStatus", "registrationStatus"])', context)), Array(21).fill('existing')];
  sheets.get('Products').rows[1][7] = 9000; context.setupPeriodWorkbook(); context.setupPeriodWorkbook();
  assert.equal(registrations.rows[0][17], 'paidAt'); assert.equal(registrations.rows[0][21], 'startDate');
  assert.equal(registrations.rows[1][17], 'existing'); assert.equal(rows('Products').length, 3); assert.equal(rows('Products')[0].priceCents, 9000);
  assert.equal(context.safeCell_('=1+1'), "'=1+1");
  sheets.get('Checkout Attempts').rows[0][0] = 'unexpected'; assert.throws(() => context.getPublicBookingCalendar_(), /columns/);
});
test('capacity is bounded and public availability excludes personal data', () => {
  const { context, properties, request } = backend(); context.createCheckoutSession_(request());
  assert.doesNotMatch(JSON.stringify(context.getPublicBookingCalendar_()), /Test Child|parent@example/);
  properties.AFTER_SCHOOL_WEEKLY_CAPACITY = '31'; assert.throws(() => context.getPublicBookingCalendar_());
  properties.AFTER_SCHOOL_WEEKLY_CAPACITY = '0'; assert.throws(() => context.quoteCheckout_(request()), /fully booked/);
  assert.throws(() => bookingWeeks('2098-01-20', 4, context.getPublicBookingCalendar_()), /fully booked/);
});

test('date diagnosis reports the exact mismatch without changing payment or discount records', () => {
  const { context, request, sessions, sheets } = backend();
  const created = context.createCheckoutSession_(request());
  const session = sessions.get(created.stripeSessionId);
  session.metadata.startDate = '2098-01-27';
  const before = JSON.stringify([...sheets.values()].map(sheet => sheet.rows));
  context.console = { log: () => {} };
  context.discountServiceRequest_ = () => { throw new Error('Diagnosis must not call the discount service'); };
  const report = context.diagnoseAfterSchoolPaymentDates()[0];
  assert.equal(report.normalizedStartDate, '2098-01-20');
  assert.equal(report.firstPurchasedWeek, '2098-01-20');
  assert.equal(report.stripeStartDate, '2098-01-27');
  assert.equal(report.dateMatches, false);
  assert.doesNotMatch(JSON.stringify(report), /parent@example|Test Child|Test Parent|416555/);
  assert.equal(JSON.stringify([...sheets.values()].map(sheet => sheet.rows)), before);
});
