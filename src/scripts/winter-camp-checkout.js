import { winterCampSelection } from './winter-camp-selection.js';

const shop = document.querySelector('[data-winter-shop]');

if (shop) {
  const find = selector => shop.querySelector(selector);
  const booking = find('[data-winter-booking]');
  const tabList = find('[data-winter-tabs]');
  const tabs = [...shop.querySelectorAll('[data-winter-tab]')];
  let activePanel = location.hash === '#winter-registration' || new URLSearchParams(location.search).has('payment')
    ? 'winter-registration' : 'winter-dates';

  function showBookingPanel(panelId, moveFocus = false) {
    activePanel = panelId;
    tabList.hidden = false;
    tabs.forEach(tab => {
      const active = tab.dataset.winterTab === panelId;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = find(`#${tab.dataset.winterTab}`);
      panel.hidden = !active;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
      if (active && moveFocus) tab.focus();
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      showBookingPanel(tab.dataset.winterTab);
      history.replaceState({}, '', `#${activePanel}`);
    });
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
      if (next === null) return;
      event.preventDefault();
      showBookingPanel(tabs[next].dataset.winterTab, true);
      history.replaceState({}, '', `#${activePanel}`);
    });
  });
  document.querySelectorAll('a[href="#winter-dates"], a[href="#winter-registration"]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      showBookingPanel(link.hash.slice(1), true);
      history.replaceState({}, '', link.hash);
      booking.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  window.addEventListener('hashchange', () => {
    if (['#winter-dates', '#winter-registration'].includes(location.hash)) showBookingPanel(location.hash.slice(1));
  });
  showBookingPanel(activePanel);

  const cards = [...shop.querySelectorAll('[data-winter-item]')];
  const selected = new Map();
  const form = find('[data-winter-form]');
  const checkout = find('[data-winter-checkout]');
  const clear = find('[data-winter-clear]');
  const programCode = shop.dataset.programCode;
  const endpoint = shop.dataset.endpoint;
  const money = cents => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  let ready = false;
  let submitting = false;
  let quote = null;
  let places = new Map();
  let discountsSupported = false;
  let availabilityState = 'loading';
  let backendHealthy = false;
  let initializing = false;
  const discountPanel = form.querySelector('[data-registration-discount]');
  const discountInput = form.querySelector('[name="discountCode"]');
  const snapshot = () => JSON.stringify([selectedItemCodes(), ...[...form.querySelectorAll('input')].map(input => [input.name, input.value])]);

  function status(message, type = '') {
    find('[data-winter-status]').textContent = message;
    find('[data-winter-status]').dataset.status = type;
  }

  function selectionFor(card) {
    const selection = winterCampSelection({
      code: card.dataset.code,
      basePrice: card.dataset.price === '' ? null : Number(card.dataset.price),
      hourlyPrice: Number(card.dataset.careHourlyPrice),
      availableDays: (card.dataset.careDays || '').split(',').filter(Boolean),
      pickups: [...card.querySelectorAll('[data-winter-pickup]:checked')].map(input => ({ day: input.dataset.day, hours: Number(input.value) })),
    });
    return { ...selection, dates: card.dataset.dates, label: 'Four-day camp · 8 AM–3 PM' };
  }

  const selectedItemCodes = () => [...selected.values()].flatMap(card => selectionFor(card).codes);

  function amounts() {
    const prices = [...selected.values()].map(card => selectionFor(card).price);
    if (!prices.length || prices.some(price => !Number.isSafeInteger(price) || price <= 0)) return null;
    const sum = prices.reduce((total, price) => total + price, 0);
    return quote ? { subtotal: quote.subtotalCents, tax: quote.taxCents, total: quote.expectedAmountCents }
      : { subtotal: sum, tax: null, total: null };
  }

  async function post(payload) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint || '')) {
      throw new Error('Online payment is not available yet. Please email SparkPreneurs to register.');
    }
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload),
      ...(['ping', 'getAvailability'].includes(payload.action) ? { signal: AbortSignal.timeout(20000) } : {}),
    });
    let result;
    try { result = JSON.parse(await response.text()); }
    catch { throw new Error('The registration service returned an unreadable response. Please try again.'); }
    if (!response.ok || !result || result.success === false) throw new Error(result?.error || 'Registration could not be processed.');
    return result;
  }

  function render() {
    cards.forEach(card => {
      const selection = selectionFor(card);
      card.querySelectorAll('[data-winter-pickup]').forEach(input => {
        input.disabled = submitting || (ready && Number(input.value) > 0 && !(places.get(`${card.dataset.code}_CARE${input.dataset.day}_H${input.value}`) > 0));
      });
      card.querySelector('[data-winter-care-hours]').textContent = `(${selection.careHours} ${selection.careHours === 1 ? 'hour' : 'hours'})`;
      card.querySelector('[data-winter-care-total]').textContent = money(selection.carePrice);
      if (!selection.valid) selected.delete(card.dataset.code);
      const active = selected.has(card.dataset.code);
      card.classList.toggle('is-selected', active);
      const button = card.querySelector('[data-winter-add]');
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `${active ? 'Remove' : 'Add'} ${card.dataset.name}, ${card.dataset.dates}, ${active ? 'from' : 'to'} cart`);
      button.textContent = active ? 'Added ✓' : 'Add camp +';
      button.disabled = submitting || !ready || !(places.get(card.dataset.code) > 0) || !selection.valid;
      const cardAvailability = card.querySelector('[data-winter-availability]');
      cardAvailability.dataset.status = availabilityState === 'loading' ? 'loading' : !ready ? 'error'
        : !places.has(card.dataset.code) ? 'unavailable' : places.get(card.dataset.code) > 0 ? 'available' : 'full';
      cardAvailability.textContent = availabilityState === 'loading' ? 'Checking availability…'
        : !ready ? 'Availability could not be checked. Please email us for help.'
        : !places.has(card.dataset.code) ? 'Registration is not available for this camp.'
        : places.get(card.dataset.code) > 0 ? `${places.get(card.dataset.code)} ${places.get(card.dataset.code) === 1 ? 'place' : 'places'} remaining` : 'Fully booked';
      card.querySelector('[data-winter-card-price]').textContent = !selection.valid ? 'Check pickup times' : selection.price === null ? 'Price to be confirmed' : money(selection.price);
      card.querySelector('[data-winter-card-price-note]').textContent = selection.price === null ? 'Contact us for this camp’s pricing' : 'Per week · per child · before tax';
    });
    find('[data-winter-count]').textContent = `${selected.size} ${selected.size === 1 ? 'camp' : 'camps'}`;
    find('[data-winter-next]').disabled = submitting || !selected.size;
    const list = find('[data-winter-cart]');
    list.replaceChildren();
    if (!selected.size) {
      const empty = document.createElement('li');
      empty.className = 'winter-cart-empty';
      empty.textContent = 'Your camps will appear here. Choose a camp to start your booking.';
      list.append(empty);
    }
    selected.forEach((card, code) => {
      const selection = selectionFor(card);
      const item = document.createElement('li');
      item.className = 'winter-cart-item';
      const name = document.createElement('strong');
      name.className = 'winter-cart-item-name';
      name.textContent = card.dataset.name;
      const dates = document.createElement('small');
      dates.className = 'winter-cart-item-dates';
      dates.textContent = selection.dates;
      const details = document.createElement('small');
      details.className = 'winter-cart-item-details';
      details.textContent = selection.label + (selection.care.length
        ? ` · Extended care: ${selection.care.map(({ day, hours }) => `Dec ${day} until ${3 + hours} PM`).join('; ')} · ${money(selection.carePrice)} extra`
        : ' · No extended care') + ` · ${card.dataset.pickupNote}`;
      const price = document.createElement('span');
      price.className = 'winter-cart-item-price';
      price.textContent = selection.price === null ? 'Price to be confirmed' : money(selection.price);
      const remove = document.createElement('button');
      remove.className = 'winter-cart-item-remove';
      remove.type = 'button'; remove.textContent = 'Remove'; remove.disabled = submitting;
      remove.setAttribute('aria-label', `Remove ${card.dataset.name} from cart`);
      remove.addEventListener('click', () => {
        if (submitting) return;
        selected.delete(code); selectionChanged();
      });
      item.append(name, price, dates, details, remove);
      list.append(item);
    });
    const total = amounts();
    find('[data-winter-selection-total]').textContent = !selected.size ? 'No camps selected' : total ? `${money(total.subtotal)} before tax` : 'Price to be confirmed';
    find('[data-winter-totals]').hidden = !total;
    if (total) {
      find('[data-winter-subtotal]').textContent = money(total.subtotal);
      find('[data-winter-tax]').textContent = total.tax === null ? 'Review total to calculate' : money(total.tax);
      find('[data-winter-total]').textContent = total.total === null ? 'Review total to calculate' : money(total.total);
      find('[data-winter-saving-row]').hidden = !quote?.discountCents;
      find('[data-winter-saving]').textContent = money(-(quote?.discountCents || 0));
    }
    checkout.disabled = submitting || !ready || !total;
    checkout.textContent = submitting ? 'Please wait…' : quote ? 'Continue to Secure Payment →' : 'Review Total →';
    clear.disabled = submitting || !selected.size;
    clear.hidden = !selected.size;
    form.querySelectorAll('input, [data-discount-apply]').forEach(input => { input.disabled = submitting || (input === discountInput && !discountsSupported); });
    discountPanel.hidden = !discountsSupported;
  }

  function selectionChanged() {
    quote = null;
    form.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  }

  form.addEventListener('input', () => { quote = null; render(); });
  form.addEventListener('change', () => { quote = null; render(); });
  form.querySelector('[data-discount-apply]').addEventListener('click', () => { quote = null; form.requestSubmit(); });

  cards.forEach(card => card.querySelector('[data-winter-add]').addEventListener('click', () => {
    if (submitting) return;
    const code = card.dataset.code;
    if (selected.has(code)) selected.delete(code);
    else selected.set(code, card);
    selectionChanged();
  }));
  cards.forEach(card => card.addEventListener('change', () => {
    if (submitting) return;
    selectionChanged();
  }));
  find('[data-winter-next]').addEventListener('click', () => {
    if (submitting || !selected.size) return;
    showBookingPanel('winter-registration', true);
    history.replaceState({}, '', '#winter-registration');
    booking.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  clear.addEventListener('click', () => {
    if (submitting) return;
    selected.clear(); selectionChanged();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !ready || !amounts() || !form.reportValidity()) return;
    const requestKey = snapshot();
    const fields = Object.fromEntries(new FormData(form));
    const pageUrl = shop.dataset.returnUrl;
    const codes = selectedItemCodes();
    const reviewedQuote = quote;
    submitting = true; render();
    status('Checking your camps and total…', 'pending');
    try {
      if (!reviewedQuote) {
        const result = await post({ ...fields, action: 'quoteCheckout', programCode, selectedItemCodes: codes });
        if (requestKey !== snapshot()) throw new Error('Your registration changed. Review the total again.');
        for (const key of ['subtotalCents', 'discountCents', 'taxCents', 'expectedAmountCents']) {
          if (!Number.isSafeInteger(result[key]) || result[key] < 0) throw new Error('The service returned an invalid total.');
        }
        if (result.subtotalCents - result.discountCents + result.taxCents !== result.expectedAmountCents || result.expectedAmountCents <= 0) throw new Error('The service returned an invalid total.');
        quote = result;
        status('Review your total, then continue to secure payment.', 'success');
        submitting = false; render();
        return;
      }
      const result = await post({ ...fields, studentAge: Number(fields.studentAge), action: 'createCheckoutSession',
        programCode, selectedItemCodes: codes, displayedAmountCents: reviewedQuote.expectedAmountCents,
        successUrl: pageUrl + '?payment=success&session_id={CHECKOUT_SESSION_ID}',
        cancelUrl: pageUrl + '?payment=canceled#winter-registration' });
      const url = new URL(result.checkoutUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('The payment service returned an invalid checkout link.');
      location.assign(url.href);
    } catch (error) {
      quote = null;
      submitting = false; checkout.textContent = 'Continue to Secure Payment →';
      status(error.message || 'Payment could not be started. Please try again.', 'error'); render();
    }
  });

  let refreshing = false;
  async function refreshAvailability() {
    if (refreshing || submitting) return;
    refreshing = true;
    const wasUnavailable = !ready;
    availabilityState = 'loading'; render();
    try {
      const result = await post({ action: 'getAvailability', programCode });
      if (!Array.isArray(result.items) || result.items.some(item => typeof item.itemCode !== 'string' || !Number.isSafeInteger(item.placesRemaining) || item.placesRemaining < 0)) throw new Error('Availability could not be loaded.');
      places = new Map(result.items.map(item => [item.itemCode, item.placesRemaining]));
      let changed = false;
      selected.forEach((card, code) => {
        if (selectionFor(card).codes.some(item => !(places.get(item) > 0))) { selected.delete(code); changed = true; }
      });
      if (changed) { quote = null; status('Availability changed. Please check your camps and pickup times, then review the total again.', 'warning'); }
      ready = true;
      availabilityState = 'ready';
      if (wasUnavailable && !changed) status('');
    } catch (error) {
      ready = false; quote = null;
      availabilityState = 'error';
      status('We couldn’t check availability. Please email SparkPreneurs for help. We’ll check again automatically.', 'error');
    } finally { refreshing = false; render(); }
  }

  async function initialize() {
    if (initializing || submitting) return;
    if (!endpoint) {
      availabilityState = 'error'; render();
      status('Online payment is not available yet. Email us to register.');
      return;
    }
    initializing = true;
    availabilityState = 'loading'; render();
    try {
      const health = await post({ action: 'ping', programCode });
      const healthy = health.success === true && health.programCode === programCode && health.bookingVersion === 1 && health.stripeMode === shop.dataset.stripeMode;
      discountsSupported = healthy && health.discountsSupported === true;
      if (!healthy) throw new Error('Online payment is temporarily unavailable. Please email SparkPreneurs.');
      backendHealthy = true;
      status('');
      await refreshAvailability();
    } catch (error) { ready = false; backendHealthy = false; availabilityState = 'error'; status('We couldn’t check availability. Please email SparkPreneurs for help. We’ll check again automatically.', 'error'); }
    initializing = false;
    render();
    const params = new URLSearchParams(location.search);
    const cleanReturn = () => history.replaceState({}, document.title, location.pathname + '#winter-registration');
    if (params.get('payment') === 'canceled' || params.get('payment') === 'cancelled') {
      status('Payment was canceled. You can select your camps again when you are ready.'); cleanReturn();
    }
    if (ready && params.get('payment') === 'success' && params.get('session_id')) {
      status('Verifying payment…', 'pending');
      try {
        const result = await post({ action: 'verifyCheckoutSession', programCode, stripeSessionId: params.get('session_id') });
        if (result.success !== true || result.paymentStatus !== 'paid') throw new Error('Payment is not confirmed yet. Refresh to check again, or contact SparkPreneurs with your receipt.');
        selected.clear(); render();
        status('Payment verified. Your Winter Camp registration has been received.', 'success'); cleanReturn();
      } catch (error) { status(error.message || 'Payment could not be verified. Please contact SparkPreneurs.', 'error'); }
      find('#winter-registration').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const checkAvailability = () => { if (!initializing) backendHealthy ? refreshAvailability() : initialize(); };
  window.addEventListener('focus', checkAvailability);
  setInterval(() => { if (!document.hidden) checkAvailability(); }, 60000);

  render();
  initialize();
}
