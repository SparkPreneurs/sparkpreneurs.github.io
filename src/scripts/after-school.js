import { bookingWeeks, nextMonday, dateLabel } from './booking-weeks.js';
import { createBookingCalendar } from './booking-calendar.js';

const shop = document.querySelector('[data-after-school-shop]');
if (shop) {
  const find = selector => shop.querySelector(selector);
  const form = find('[data-registration-form]');
  const start = find('[data-start-date]');
  const count = find('[data-week-count]');
  const checkout = find('[data-checkout]');
  const clear = find('[data-clear]');
  let selected = null;
  let calendar = null;
  let ready = false;
  let submitting = false;
  let step = 1;
  let reviewedQuote = null;
  let products = null;
  let discountsSupported = false;
  let backendHealthy = false;
  let loadingCalendar = false;
  const discountPanel = find('.after-school-discount-panel');
  const discountInput = form.querySelector('[name="discountCode"]');
  const discountSummary = form.querySelector('[data-discount-summary]');
  const discountStatus = form.querySelector('[data-discount-status]');
  const snapshot = () => JSON.stringify([selected?.code, ...[...form.querySelectorAll('input')].map(input => [input.name, input.value])]);
  const tabs = [...shop.querySelectorAll('[data-after-school-tab]')];
  const panels = [...shop.querySelectorAll('[data-step-panel]')];
  const panelId = value => value === 1 ? 'after-school-plan' : 'after-school-payment';
  function showStep(value, { moveFocus = false, scroll = false, updateHistory = false } = {}) {
    if (submitting) return;
    step = value;
    find('[data-after-school-tabs]').hidden = false;
    panels.forEach(panel => { panel.hidden = Number(panel.dataset.stepPanel) !== step; });
    tabs.forEach(tab => {
      const active = Number(tab.dataset.afterSchoolTab) === step;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && moveFocus) tab.focus({ preventScroll: true });
    });
    find('.registration-family').disabled = step !== 2;
    render();
    if (updateHistory) history.replaceState({}, '', `#${panelId(step)}`);
    if (scroll) find('[data-after-school-booking]').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showStep(Number(tab.dataset.afterSchoolTab), { updateHistory: true }));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
      if (next === null) return;
      event.preventDefault();
      showStep(Number(tabs[next].dataset.afterSchoolTab), { moveFocus: true, updateHistory: true });
    });
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#after-school-plan') showStep(1);
    if (location.hash === '#after-school-payment') showStep(2);
  });
  start.min = nextMonday();
  const calendarDisclosure = find('[data-calendar-disclosure]');
  const compactCalendar = window.matchMedia('(max-width: 760px)');
  const updateCalendarDisclosure = () => { calendarDisclosure.open = !compactCalendar.matches; };
  compactCalendar.addEventListener('change', updateCalendarDisclosure);
  updateCalendarDisclosure();
  const renderCalendar = createBookingCalendar(find('[data-booking-calendar]'), value => { start.value = value; invalidateQuote(); });
  const money = cents => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  const status = (message, type = '') => { find('#after-school-registration-status').textContent = message; find('#after-school-registration-status').dataset.type = type; };
  const post = async payload => {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(shop.dataset.endpoint || '')) throw new Error('Online registration is not connected yet. Please contact SparkPreneurs.');
    const response = await fetch(shop.dataset.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload),
      ...(['ping', 'getBookingCalendar', 'quoteCheckout'].includes(payload.action) ? { signal: AbortSignal.timeout(30000) } : {}),
    });
    let data;
    try { data = JSON.parse(await response.text()); }
    catch { throw new Error('The registration service returned an unreadable response. Please try again.'); }
    if (!response.ok || !data || data.success !== true) throw new Error(data?.error || 'Registration could not be processed.');
    return data;
  };
  function invalidateQuote() {
    if (reviewedQuote) status('Your registration changed. Review the total again before payment.', 'warning');
    reviewedQuote = null;
    discountSummary.hidden = true;
    discountStatus.textContent = '';
    discountStatus.dataset.status = '';
    render();
  }

  function selection() {
    return bookingWeeks(start.value, Number(count.value), calendar || { firstWeek: start.min });
  }
  function render() {
    start.setCustomValidity('');
    count.setCustomValidity('');
    let weeks = [];
    try { weeks = selection(); }
    catch (error) {
      if (start.value) start.setCustomValidity(error.message);
      find('[data-week-summary]').textContent = start.value ? error.message : 'Select a starting week to see your dates.';
    }
    if (weeks.length) {
      const range = document.createElement('p');
      range.className = 'booking-date-range';
      const end = new Date(weeks.at(-1) + 'T12:00:00Z');
      end.setUTCDate(end.getUTCDate() + 4);
      range.textContent = `${dateLabel(weeks[0])} – ${dateLabel(end.toISOString().slice(0, 10))}`;
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'See every included week';
      const list = document.createElement('ul');
      weeks.forEach(week => { const item = document.createElement('li'); item.textContent = `Week of ${dateLabel(week)}`; list.append(item); });
      details.append(summary, list);
      find('[data-week-summary]').replaceChildren(range, details);
    }
    shop.querySelectorAll('[data-plan]').forEach(card => {
      const active = selected?.code === card.dataset.code;
      card.classList.toggle('is-selected', active);
      const button = card.querySelector('[data-select-plan]');
      button.disabled = submitting || Boolean(products && !products.has(card.dataset.code));
      button.setAttribute('aria-pressed', String(active));
    });
    const validCount = Number.isInteger(Number(count.value)) && Number(count.value) >= 4 && Number(count.value) <= 12;
    const subtotal = selected && validCount ? selected.price * Number(count.value) : 0;
    const taxRate = selected && products?.get(selected.code)?.taxRatePercent;
    const estimatedTax = Number.isFinite(taxRate) ? Math.round(subtotal * taxRate / 100) : null;
    if (reviewedQuote && reviewedQuote.key !== snapshot()) reviewedQuote = null;
    const amount = reviewedQuote || { subtotalCents: subtotal, discountCents: 0, taxCents: estimatedTax,
      expectedAmountCents: estimatedTax === null ? null : subtotal + estimatedTax };
    find('[data-selection-preview]').textContent = selected && weeks.length
      ? `${selected.name} / ${weeks.length} weeks / ${money(subtotal)} before tax`
      : 'Choose a plan and starting week to continue.';
    find('[data-selected-plan]').textContent = selected ? `${selected.name} / ${validCount ? count.value : 'Choose your'} weeks` : 'No weekly plan selected yet.';
    find('[data-totals]').hidden = !selected || !validCount;
    find('[data-subtotal-label]').textContent = `Subtotal (${count.value} weeks)`;
    find('[data-subtotal]').textContent = money(amount.subtotalCents);
    find('[data-tax]').textContent = amount.taxCents === null ? 'Review total to calculate' : money(amount.taxCents);
    find('[data-total]').textContent = amount.expectedAmountCents === null ? 'Review total to calculate' : money(amount.expectedAmountCents);
    find('[data-saving-row]').hidden = !amount.discountCents;
    find('[data-saving]').textContent = money(-amount.discountCents);
    checkout.textContent = submitting ? 'Please wait...' : reviewedQuote ? 'Continue to secure payment' : 'Review total';
    discountPanel.hidden = !discountsSupported;
    form.querySelector('[data-discount-apply]').disabled = submitting || !discountsSupported;
    checkout.disabled = submitting || !ready || !selected || !weeks.length;
    find('[data-next]').disabled = submitting || !selected || !weeks.length;
    find('[data-back]').disabled = submitting;
    tabs.forEach(tab => { tab.disabled = submitting; });
    if (step === 2 && weeks.length) {
      const finalDay = new Date(weeks.at(-1) + 'T12:00:00Z');
      finalDay.setUTCDate(finalDay.getUTCDate() + 4);
      find('[data-selected-plan]').textContent += ` · ${dateLabel(weeks[0])} – ${dateLabel(finalDay.toISOString().slice(0, 10))}`;
    }
    clear.disabled = submitting || !selected;
    form.querySelectorAll('input').forEach(input => { input.disabled = submitting; });
    shop.querySelectorAll('[data-week-preset]').forEach(button => { button.disabled = submitting; button.setAttribute('aria-pressed', String(Number(button.dataset.weekPreset) === Number(count.value))); });
    shop.querySelectorAll('[data-week-adjust]').forEach(button => { button.disabled = submitting || (Number(button.dataset.weekAdjust) < 0 ? Number(count.value) <= 4 : Number(count.value) >= 12); });
    renderCalendar({ start: start.value, count: Number(count.value), minimum: start.min, calendar, submitting });
  }
  shop.addEventListener('click', event => {
    const button = event.target.closest('[data-select-plan]');
    if (!button || submitting) return;
    const card = button.closest('[data-plan]');
    selected = selected?.code === card.dataset.code ? null : { code: card.dataset.code, name: card.dataset.name, price: Number(card.dataset.price) };
    invalidateQuote();
  });
  form.addEventListener('input', invalidateQuote);
  form.addEventListener('change', invalidateQuote);
  form.querySelector('[data-discount-apply]').addEventListener('click', () => {
    if (submitting || !discountsSupported) return;
    invalidateQuote();
    form.requestSubmit();
  });
  shop.addEventListener('click', event => {
    const preset = event.target.closest('[data-week-preset]');
    const adjust = event.target.closest('[data-week-adjust]');
    if (submitting || (!preset && !adjust)) return;
    count.value = String(preset ? Number(preset.dataset.weekPreset) : Math.max(4, Math.min(12, (Number(count.value) || 4) + Number(adjust.dataset.weekAdjust))));
    invalidateQuote();
  });
  find('[data-next]').addEventListener('click', () => {
    render();
    if (!selected || !start.reportValidity() || !count.reportValidity()) return;
    showStep(2, { moveFocus: true, scroll: true, updateHistory: true });
  });
  find('[data-back]').addEventListener('click', () => showStep(1, { moveFocus: true, scroll: true, updateHistory: true }));
  clear.addEventListener('click', () => { selected = null; start.value = ''; count.value = '4'; invalidateQuote(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (step === 1) { find('[data-next]').click(); return; }
    if (submitting || !ready || !selected) return;
    render();
    if (!start.checkValidity() || !count.checkValidity()) { showStep(1); start.reportValidity(); return; }
    if (!form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    const key = snapshot();
    const previousQuote = reviewedQuote;
    const payload = { ...fields, weekCount: Number(fields.weekCount), programCode: shop.dataset.programCode,
      selectedItemCodes: [selected.code], discountCode: discountsSupported ? discountInput.value.trim().toUpperCase() : '' };
    submitting = true;
    render();
    status('Checking your registration dates and total...', 'pending');
    try {
      if (!previousQuote) {
        const result = await post({ ...payload, action: 'quoteCheckout' });
        if (key !== snapshot()) throw new Error('Your registration changed. Review the total again.');
        for (const field of ['subtotalCents', 'discountCents', 'taxCents', 'expectedAmountCents']) {
          if (!Number.isSafeInteger(result[field]) || result[field] < 0) throw new Error('The service returned an invalid total.');
        }
        if (result.subtotalCents - result.discountCents + result.taxCents !== result.expectedAmountCents || result.expectedAmountCents <= 0) throw new Error('The service returned an invalid total.');
        reviewedQuote = { ...result, key };
        discountSummary.hidden = true;
        discountStatus.textContent = '';
        discountStatus.dataset.status = '';
        status('');
        submitting = false; render();
        return;
      }
      const pageUrl = shop.dataset.returnUrl;
      const data = await post({ ...payload, action: 'createCheckoutSession', displayedAmountCents: previousQuote.expectedAmountCents,
        successUrl: pageUrl + '?payment=success&session_id={CHECKOUT_SESSION_ID}', cancelUrl: pageUrl + '?payment=canceled#after-school-payment' });
      const url = new URL(data.checkoutUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Secure payment did not return a valid link.');
      location.assign(url.href);
    } catch (error) {
      submitting = false; reviewedQuote = null; discountSummary.hidden = true;
      status(error.message || 'Payment could not be started. Please try again.', 'error');
      if (payload.discountCode) { discountStatus.textContent = error.message; discountStatus.dataset.status = 'error'; }
      render();
    }
  });

  async function loadCalendar() {
    if (loadingCalendar || submitting) return;
    loadingCalendar = true;
    try {
      const result = await post({ action: 'getBookingCalendar', programCode: shop.dataset.programCode });
      if (result.minimumWeeks !== 4 || result.maximumWeeks !== 12 || !Array.isArray(result.products) || !Array.isArray(result.unavailableWeeks) || !Number.isInteger(result.weeklyCapacity) || result.weeklyCapacity < 0 || result.weeklyCapacity > 30) throw new Error('The booking calendar needs updating. Please contact SparkPreneurs.');
      const previousProducts = JSON.stringify([...products?.values() || []]);
      products = new Map();
      result.products.forEach(product => {
        if (!['AFTER3', 'AFTER4', 'AFTER5'].includes(product.itemCode) || !Number.isSafeInteger(product.weeklyPriceCents) || product.weeklyPriceCents <= 0 || !Number.isFinite(product.taxRatePercent) || product.taxRatePercent < 0 || product.taxRatePercent > 100) throw new Error('The service returned an invalid plan.');
        products.set(product.itemCode, product);
      });
      calendar = result;
      start.min = result.firstWeek > nextMonday() ? result.firstWeek : nextMonday();
      start.max = result.lastWeek || '';
      shop.querySelectorAll('[data-plan]').forEach(card => {
        const product = products.get(card.dataset.code);
        if (!product) return;
        card.dataset.price = String(product.weeklyPriceCents);
        card.querySelector('[data-plan-price-amount]').textContent = money(product.weeklyPriceCents);
        card.querySelector('[data-select-plan]').setAttribute('aria-label', `${card.dataset.name}, ${money(product.weeklyPriceCents)} per week`);
      });
      if (selected) {
        const product = products.get(selected.code);
        if (!product) selected = null;
        else selected.price = product.weeklyPriceCents;
      }
      if (previousProducts !== JSON.stringify([...products.values()])) { reviewedQuote = null; discountSummary.hidden = true; }
      ready = true;
      const closures = calendar.closedWeeks || [];
      find('#week-help').textContent = closures.length ? `Closed weeks: ${closures.map(dateLabel).join(', ')}. Choose a consecutive block without closures.` : 'Choose a Monday strictly after today. Your weeks run consecutively.';
      if (start.value) {
        try { selection(); }
        catch (error) { reviewedQuote = null; discountSummary.hidden = true; status(error.message, 'warning'); }
      }
    } catch (error) {
      ready = false; reviewedQuote = null; discountSummary.hidden = true;
      status(error.message || 'Availability could not be loaded. Please contact SparkPreneurs.', 'warning');
    } finally { loadingCalendar = false; render(); }
  }
  async function initialize() {
    try {
      const health = await post({ action: 'ping', programCode: shop.dataset.programCode });
      if (health.programCode !== shop.dataset.programCode || health.bookingVersion !== 1 || health.checkoutVersion !== 1 || health.stripeMode !== shop.dataset.stripeMode) throw new Error('Weekly checkout is being updated. Please contact SparkPreneurs to register.');
      backendHealthy = true;
      discountsSupported = health.discountsSupported === true;
      await loadCalendar();
    } catch (error) { backendHealthy = false; ready = false; status(error.message || 'Secure checkout is temporarily unavailable.', 'warning'); }
    render();
    const params = new URLSearchParams(location.search);
    const cleanReturn = () => history.replaceState({}, document.title, location.pathname + '#after-school-payment');
    if (params.get('payment') === 'canceled') { status('Payment was canceled. You can choose your weeks again.', 'warning'); cleanReturn(); }
    if (backendHealthy && params.get('payment') === 'success' && params.get('session_id')) {
      try {
        const data = await post({ action: 'verifyCheckoutSession', programCode: shop.dataset.programCode, sessionId: params.get('session_id') });
        if (!data.paid || data.paymentStatus !== 'paid') throw new Error('Payment is still processing. Refresh to check again, or contact us with your receipt.');
        status(data.message || 'Payment received. Your selected weeks have been recorded.', 'success'); cleanReturn();
      } catch (error) { status(error.message || 'We could not confirm your payment. Please contact us with your receipt.', 'warning'); }
    }
  }
  window.addEventListener('focus', () => { if (backendHealthy) loadCalendar(); });
  setInterval(() => { if (backendHealthy && !document.hidden) loadCalendar(); }, 60000);
  showStep(location.hash === '#after-school-payment' || new URLSearchParams(location.search).has('payment') ? 2 : 1);
  initialize();
}
