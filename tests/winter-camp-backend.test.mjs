import test from 'node:test';
import assert from 'node:assert/strict';
import { backend } from './winter-camp-fixture.mjs';

test('trusted weekly and care prices cover both weeks and all pickup combinations', () => {
  const { context, data } = backend();
  for (const [base, days] of [['WINTER_CHRISTMAS_2026', [21, 22, 23]], ['WINTER_BREAK_2026', [28, 29, 30]]]) {
    for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) {
      const hours = [a, b, c];
      const codes = [base, ...days.flatMap((day, index) => hours[index] ? [`${base}_CARE${day}_H${hours[index]}`] : [])];
      const quote = context.quoteCheckout_({ ...data, selectedItemCodes: codes });
      assert.equal(quote.subtotalCents, 32000 + (a + b + c) * 1000);
      assert.equal(quote.expectedAmountCents, Math.round(quote.subtotalCents * 1.13));
    }
  }
  assert.equal(context.quoteCheckout_({ ...data, selectedItemCodes: ['WINTER_CHRISTMAS_2026', 'WINTER_BREAK_2026'] }).expectedAmountCents, 72320);
});

test('rejects care alone, holiday care, wrong weeks, duplicate pickups, and invalid ages', () => {
  const { context, data } = backend();
  const base = 'WINTER_CHRISTMAS_2026';
  for (const codes of [[], [base, base], [`${base}_CARE21_H1`], [base, `${base}_CARE24_H1`], [base, `${base}_CARE28_H1`], [base, `${base}_CARE21_H4`], [base, `${base}_CARE21_H1`, `${base}_CARE21_H2`], ['WINTER_BREAK_2027']]) {
    assert.throws(() => context.quoteCheckout_({ ...data, selectedItemCodes: codes }));
  }
  for (const age of ['', 3, 13, 4.5]) assert.throws(() => context.createCheckoutSession_({ ...data, studentAge: age }));
  context.Utilities.formatDate = () => '2026-12-21';
  assert.throws(() => context.quoteCheckout_(data), /closed/);
  assert.ok(context.getAvailability_().items.every(item => item.itemCode.startsWith('WINTER_BREAK_2026')));
});

test('capacity counts each child once per week including care and unknown holds', () => {
  const { context, data, attempts } = backend();
  attempts.push({ status: 'CHECKOUT_CREATED', selectedItemCodes: 'WINTER_CHRISTMAS_2026, WINTER_CHRISTMAS_2026_CARE21_H3, WINTER_CHRISTMAS_2026_CARE22_H2' });
  assert.equal(context.countReservedForDay_('WINTER_CHRISTMAS_2026_CARE21_H1'), 1);
  assert.equal(context.quoteCheckout_(data).expectedAmountCents, 37290);
  attempts.push({ status: 'CHECKOUT_UNKNOWN', selectedItemCodes: 'WINTER_CHRISTMAS_2026' });
  assert.throws(() => context.quoteCheckout_(data), /fully booked/);
  assert.equal(context.getAvailability_().items[0].placesRemaining, 0);
  assert.equal(context.countReservedForDay_('WINTER_BREAK_2026'), 0);
  attempts[1].status = 'EXPIRED';
  assert.equal(context.getAvailability_().items[0].placesRemaining, 1);
});

test('checkout refuses changed prices and preserves child and purchased pickup details', () => {
  const { context, data, attempts, registrations, session } = backend();
  assert.equal(context.createCheckoutSession_({ ...data, displayedAmountCents: 1 }).success, false);
  assert.equal(attempts.length, 0);
  assert.equal(context.createCheckoutSession_(data).success, true);
  assert.equal(attempts[0].studentAge, 8);
  assert.equal(attempts[0].selectedItemCodes, 'WINTER_CHRISTMAS_2026, WINTER_CHRISTMAS_2026_CARE21_H1');
  session.payment_status = 'unpaid';
  assert.equal(context.verifyCheckoutSession_(session.id).success, false);
  assert.equal(registrations.length, 0);
  session.payment_status = 'paid';
  for (const [field, value] of [['amount_total', 1], ['currency', 'usd'], ['livemode', true], ['client_reference_id', 'other'], ['mode', 'subscription']]) {
    const previous = session[field]; session[field] = value;
    assert.throws(() => context.verifyCheckoutSession_(session.id)); session[field] = previous;
  }
  context.verifyCheckoutSession_(session.id); context.verifyCheckoutSession_(session.id);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].selectedItemCodes, attempts[0].selectedItemCodes);
  assert.equal(context.countReservedForDay_('WINTER_CHRISTMAS_2026'), 1);
});

test('discounts reduce taxable subtotal and survive verified registration', () => {
  const { context, data, session, registrations } = backend();
  context.discountServiceRequest_ = action => action === 'quote' ? { discountCents: 2500 } : action === 'reserve' ? { token: 'reservation1' } : { success: true };
  const discounted = { ...data, discountCode: 'TEST25', displayedAmountCents: 34465 };
  assert.equal(context.quoteCheckout_(discounted).expectedAmountCents, 34465);
  session.amount_total = 34465; session.metadata.expectedAmountCents = '34465';
  context.createCheckoutSession_(discounted); context.verifyCheckoutSession_(session.id);
  assert.equal(registrations[0].discountCents, 2500);
});

test('Stripe receives the exact trusted CAD total and purchased care metadata', () => {
  const { context, data, session, attempts } = backend();
  context.stripeRequest_ = (method, path, payload) => {
    assert.equal(method, 'post');
    assert.equal(path, '/checkout/sessions');
    assert.equal(attempts[0].status, 'CREATING_CHECKOUT', 'reserve capacity before contacting Stripe');
    assert.equal(payload['line_items[0][price_data][unit_amount]'], '37290');
    assert.equal(payload['line_items[0][price_data][currency]'], 'cad');
    assert.equal(payload['metadata[selectedItemCodes]'], 'WINTER_CHRISTMAS_2026,WINTER_CHRISTMAS_2026_CARE21_H1');
    assert.equal(payload.customer_email, 'parent@example.test');
    assert.equal(payload.success_url, data.successUrl);
    return session;
  };
  assert.equal(context.createCheckoutSession_(data).success, true);
});

test('scheduled reconciliation records unreturned payments and releases expired sessions', () => {
  const { context, data, registrations, attempts, session } = backend();
  context.createCheckoutSession_(data); context.reconcilePendingPayments(); context.reconcilePendingPayments();
  assert.equal(registrations.length, 1);
  registrations.length = 0; attempts[0].status = 'CHECKOUT_CREATED';
  session.payment_status = 'unpaid'; session.status = 'expired';
  context.reconcilePendingPayments();
  assert.equal(attempts[0].status, 'EXPIRED');
  assert.equal(context.countReservedForDay_('WINTER_CHRISTMAS_2026'), 0);
});

test('setup is repeatable, seeds closed products and requires confirmed tax', () => {
  const { context, properties } = backend();
  const rows = [['headers']];
  const sheet = { getDataRange: () => ({ getValues: () => rows }), appendRow: row => rows.push(Array.from(row)) };
  context.seedMissingProducts_(sheet); context.seedMissingProducts_(sheet);
  assert.equal(rows.length, 21);
  assert.equal(rows[1][7], 32000);
  assert.equal(rows[10][7], 3000);
  assert.ok(rows.slice(1).every(row => row[9] === false && row[10] === 0));
  properties.WINTER_CAMP_TAX_RATE_PERCENT = '';
  assert.throws(() => context.seedMissingProducts_(sheet));
});

test('live mode accepts only studio Winter Camp return URLs', () => {
  const { context, properties } = backend();
  for (const url of ['https://evil.test/camps/winter-camp/', 'https://sparkpreneurs.ca/camps/pa-day-camp/']) assert.throws(() => context.validateReturnUrl_(url, 'cancel'));
  properties.STRIPE_MODE = 'live'; properties.STRIPE_SECRET_KEY_LIVE = 'sk_live_mock';
  assert.throws(() => context.validateReturnUrl_('http://localhost:4321/camps/winter-camp/', 'cancel'));
  assert.equal(context.validateReturnUrl_('https://sparkpreneurs.ca/camps/winter-camp/', 'cancel'), 'https://sparkpreneurs.ca/camps/winter-camp/');
});

