const camp = document.querySelector('[data-pa-camp]');

if (camp) {
  const find = selector => camp.querySelector(selector);
  const tabs = [...camp.querySelectorAll('[data-pa-tab]')];
  const panels = [...camp.querySelectorAll('[data-pa-panel]')];
  const form = find('[data-pa-form]');
  const days = [...camp.querySelectorAll('[data-pa-day]')];
  const money = cents => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  const selected = () => days.filter(day => day.querySelector('[data-pa-select]').checked);
  const optionFor = day => day.querySelector('select').selectedOptions[0];
  const subtotal = () => selected().reduce((sum, day) => sum + Number(optionFor(day).dataset.price), 0);
  const status = find('[data-pa-status]');
  let ready = false;
  let discountsSupported = false;
  let submitting = false;
  let quote = null;
  let availabilityLoaded = false;
  let availabilityFailed = false;
  let availability = new Map();
  let availabilityRequest = null;
  const itemCode = (day, option) => `PA_${day.dataset.date.replaceAll('-', '')}_${option.toUpperCase()}`;
  const hasPlace = (day, option) => availabilityLoaded && (availability.get(itemCode(day, option)) ?? 0) > 0;
  const codes = () => selected().map(day => `PA_${day.dataset.date.replaceAll('-', '')}_${optionFor(day).value.toUpperCase()}`);
  const snapshot = () => JSON.stringify([codes(), Object.fromEntries(new FormData(form))]);
  function showDiscountStatus(message = '', type = '') {
    const messageNode = find('[data-pa-discount-status]');
    messageNode.textContent = message;
    messageNode.dataset.status = type;
    const input = form.querySelector('[name="discountCode"]');
    if (type === 'error') input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function resetQuote() {
    quote = null;
    find('[data-pa-quote]').hidden = true;
    find('[data-pa-submit]').textContent = 'Review Total';
    showDiscountStatus();
  }
  async function post(payload) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(camp.dataset.endpoint || '')) {
      throw new Error('Online payment is not available yet. Please contact the studio to register.');
    }
    const response = await fetch(camp.dataset.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000),
    });
    let result;
    try { result = JSON.parse(await response.text()); }
    catch { throw new Error('The registration service returned an unreadable response. Please try again.'); }
    if (!response.ok || result?.success !== true) throw new Error(result?.error || 'Registration could not be processed.');
    return result;
  }
  const timePickers = days.map(day => ({
    day, select: day.querySelector('select'), trigger: day.querySelector('[data-pa-time-trigger]'),
    menu: day.querySelector('[data-pa-time-menu]'), options: [...day.querySelectorAll('[data-pa-time-option]')],
  }));
  function closeTimeMenus() {
    timePickers.forEach(picker => {
      picker.menu.hidden = true;
      picker.trigger.setAttribute('aria-expanded', 'false');
    });
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  function showPanel(id, focus = false) {
    closeTimeMenus();
    tabs.forEach(tab => {
      const active = tab.dataset.paTab === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    panels.forEach(panel => { panel.hidden = panel.id !== id; });
  }

  function navigate(id) {
    showPanel(id, true);
    history.replaceState({}, '', `#${id}`);
    find('#pa-booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    days.forEach(day => {
      const select = day.querySelector('select');
      const options = [...select.options];
      const available = options.filter(option => hasPlace(day, option.value));
      if (availabilityLoaded) {
        if (!available.length) day.querySelector('[data-pa-select]').checked = false;
        else if (!hasPlace(day, select.value)) select.value = available[0].value;
      }
      options.forEach(option => { option.disabled = !hasPlace(day, option.value); });
      day.classList.toggle('is-unavailable', availabilityLoaded && !available.length);
      const remaining = options.map(option => availability.get(itemCode(day, option.value))).filter(value => value !== undefined);
      day.querySelector('[data-pa-day-availability]').textContent = !availabilityLoaded ? availabilityFailed ? 'Availability unavailable' : 'Checking availability…'
        : available.length ? `${Math.max(...remaining)} ${Math.max(...remaining) === 1 ? 'place' : 'places'} remaining`
        : remaining.length ? 'Fully booked' : 'Not available';
    });
    if (quote && quote.key !== snapshot()) resetQuote();
    const selection = selected();
    days.forEach(day => {
      const checked = day.querySelector('[data-pa-select]').checked;
      day.classList.toggle('is-selected', checked);
      const available = [...day.querySelector('select').options].some(option => hasPlace(day, option.value));
      day.querySelector('[data-pa-select]').disabled = submitting || day.hidden || !available;
      day.querySelector('select').disabled = submitting || !checked || day.hidden || !available;
    });
    timePickers.forEach(picker => {
      const option = picker.select.selectedOptions[0];
      picker.trigger.disabled = picker.select.disabled;
      picker.trigger.querySelector('[data-pa-time-text]').textContent = option.value === 'extended' ? '8:00 AM - 5:00 PM' : '8:00 AM - 3:00 PM';
      picker.trigger.querySelector('[data-pa-time-price]').textContent = money(Number(option.dataset.price));
      picker.options.forEach(button => {
        button.setAttribute('aria-selected', String(button.dataset.paTimeOption === option.value));
        button.disabled = submitting || !hasPlace(picker.day, button.dataset.paTimeOption);
      });
      if (picker.trigger.disabled) {
        picker.menu.hidden = true;
        picker.trigger.setAttribute('aria-expanded', 'false');
      }
    });
    find('[data-pa-count]').textContent = `${selection.length} ${selection.length === 1 ? 'day' : 'days'} selected`;
    find('[data-pa-selection-total]').textContent = money(subtotal());
    find('[data-pa-subtotal]').textContent = money(subtotal());
    find('[data-pa-summary]').hidden = !selection.length;
    find('[data-pa-submit]').disabled = submitting || !!availabilityRequest || !ready || !availabilityLoaded || !selection.length;
    find('[data-pa-next]').disabled = submitting || !availabilityLoaded || !selection.length;
    find('[data-pa-clear]').disabled = submitting;
    form.querySelectorAll('input').forEach(input => { input.disabled = submitting; });
    form.querySelector('[name="discountCode"]').disabled = submitting || !discountsSupported;
    find('[data-pa-apply-discount]').disabled = submitting || !!availabilityRequest || !ready || !availabilityLoaded || !selection.length || !discountsSupported;
    find('[data-pa-remove-discount]').disabled = submitting || !discountsSupported || !form.querySelector('[name="discountCode"]').value;
    find('[data-pa-clear]').hidden = !selection.length;
    const list = find('[data-pa-items]');
    list.replaceChildren();
    if (!selection.length) {
      const empty = document.createElement('li');
      empty.className = 'pa-cart-empty';
      empty.textContent = 'Choose your PA days to start your booking.';
      list.append(empty);
    }
    selection.forEach(day => {
      const option = optionFor(day);
      const item = document.createElement('li');
      item.className = 'pa-cart-item';
      const title = document.createElement('strong');
      title.textContent = day.dataset.label;
      const price = document.createElement('b');
      price.textContent = money(Number(option.dataset.price));
      const detail = document.createElement('span');
      detail.textContent = option.dataset.label;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.disabled = submitting;
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${day.dataset.label}`);
      remove.addEventListener('click', () => {
        day.querySelector('[data-pa-select]').checked = false;
        status.textContent = '';
        render();
      });
      item.append(title, price, detail, remove);
      list.append(item);
    });
  }

  timePickers.forEach(picker => {
    const open = (last = false) => {
      if (picker.trigger.disabled) return;
      closeTimeMenus();
      picker.menu.hidden = false;
      picker.trigger.setAttribute('aria-expanded', 'true');
      const available = picker.options.filter(button => !button.disabled);
      const selectedOption = available.find(button => button.dataset.paTimeOption === picker.select.value);
      (last ? available.at(-1) : selectedOption || available[0])?.focus();
    };
    picker.trigger.addEventListener('click', () => {
      if (picker.menu.hidden) open();
      else closeTimeMenus();
    });
    picker.trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open(event.key === 'ArrowUp');
      }
    });
    picker.options.forEach(button => {
      button.addEventListener('click', () => {
        if (button.disabled || submitting) return;
        picker.select.value = button.dataset.paTimeOption;
        closeTimeMenus();
        status.textContent = '';
        render();
        picker.trigger.focus();
      });
      button.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault(); closeTimeMenus(); picker.trigger.focus(); return;
        }
        const available = picker.options.filter(option => !option.disabled);
        const current = available.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1
          : event.key === 'ArrowDown' ? (current + 1) % available.length
          : event.key === 'ArrowUp' ? (current + available.length - 1) % available.length : null;
        if (next === null) return;
        event.preventDefault(); available[next]?.focus();
      });
    });
    picker.day.addEventListener('focusout', event => {
      if (!picker.day.contains(event.relatedTarget)) {
        picker.menu.hidden = true;
        picker.trigger.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-pa-time-picker]')) closeTimeMenus();
  });
  days.forEach(day => {
    if (day.dataset.date <= today) {
      day.hidden = true;
      day.querySelector('[data-pa-select]').checked = false;
      day.querySelector('[data-pa-select]').disabled = true;
    }
    day.addEventListener('change', () => { status.textContent = ''; render(); });
  });
  find('[data-pa-no-dates]').hidden = days.some(day => !day.hidden);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => navigate(tab.dataset.paTab));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
      if (next === null) return;
      event.preventDefault();
      navigate(tabs[next].dataset.paTab);
    });
  });
  document.querySelectorAll('a[href="#pa-dates"], a[href="#pa-enrollment"]').forEach(link => {
    link.addEventListener('click', event => { event.preventDefault(); navigate(link.hash.slice(1)); });
  });
  find('[data-pa-next]').addEventListener('click', () => { if (selected().length) navigate('pa-enrollment'); });
  find('[data-pa-clear]').addEventListener('click', () => {
    days.forEach(day => { day.querySelector('[data-pa-select]').checked = false; });
    status.textContent = '';
    render();
  });
  window.addEventListener('hashchange', () => {
    if (['#pa-dates', '#pa-enrollment'].includes(location.hash)) showPanel(location.hash.slice(1));
  });
  form.addEventListener('input', () => { resetQuote(); status.textContent = ''; render(); });
  find('[data-pa-apply-discount]').addEventListener('click', () => {
    const input = form.querySelector('[name="discountCode"]');
    if (!input.value.trim()) {
      showDiscountStatus('Enter a discount code first.', 'error');
      input.focus();
      return;
    }
    resetQuote();
    form.requestSubmit();
  });
  find('[data-pa-remove-discount]').addEventListener('click', () => {
    form.querySelector('[name="discountCode"]').value = '';
    resetQuote(); render();
    status.textContent = 'Discount code removed. Review your total before payment.';
    form.querySelector('[name="discountCode"]').focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || availabilityRequest || !ready || !availabilityLoaded || !selected().length || !form.reportValidity()) return;
    const discountInput = form.querySelector('[name="discountCode"]');
    discountInput.value = discountsSupported ? discountInput.value.trim().toUpperCase() : '';
    const fields = Object.fromEntries(new FormData(form));
    const key = snapshot();
    const selectedItemCodes = codes();
    submitting = true;
    status.textContent = quote ? 'Opening secure payment…' : 'Checking availability and your total…';
    render();
    try {
      const payload = { ...fields, programCode: camp.dataset.programCode, selectedItemCodes };
      if (!quote || quote.key !== key) {
        const result = await post({ ...payload, action: 'quoteCheckout' });
        for (const field of ['subtotalCents', 'discountCents', 'taxCents', 'expectedAmountCents']) {
          if (!Number.isSafeInteger(result[field]) || result[field] < 0) throw new Error('The service returned an invalid total.');
        }
        if (result.expectedAmountCents <= 0 || result.subtotalCents - result.discountCents + result.taxCents !== result.expectedAmountCents) throw new Error('The service returned an invalid total.');
        quote = { ...result, key };
        find('[data-pa-subtotal]').textContent = money(result.subtotalCents);
        find('[data-pa-discount-total]').textContent = money(-result.discountCents);
        find('[data-pa-tax]').textContent = money(result.taxCents);
        find('[data-pa-total]').textContent = money(result.expectedAmountCents);
        status.textContent = 'Review your total, then continue to secure payment. Availability is checked again before checkout.';
        showDiscountStatus(result.discountCents > 0
          ? `Code ${fields.discountCode} applied. You save ${money(result.discountCents)} before tax.` : '', 'success');
      } else {
        const result = await post({ ...payload, action: 'createCheckoutSession', displayedAmountCents: quote.expectedAmountCents,
          successUrl: camp.dataset.returnUrl + '?payment=success&session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: camp.dataset.returnUrl + '?payment=canceled#pa-enrollment' });
        const url = new URL(result.checkoutUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('The payment service returned an invalid checkout link.');
        location.assign(url.href);
        return;
      }
    } catch (error) {
      resetQuote();
      status.textContent = error.name === 'TimeoutError' ? 'The service took too long to respond. Please try again or contact the studio.' : error.message || 'Payment could not be started. Please try again.';
      if (fields.discountCode) {
        find('[data-pa-discount]').open = true;
        showDiscountStatus(status.textContent, 'error');
      }
    }
    submitting = false;
    // Restore inputs before comparing the form snapshot.
    form.querySelectorAll('input').forEach(input => { input.disabled = input.name === 'discountCode' && !discountsSupported; });
    render();
    if (quote) {
      find('[data-pa-quote]').hidden = false;
      find('[data-pa-subtotal]').textContent = money(quote.subtotalCents);
      find('[data-pa-submit]').textContent = 'Continue to Secure Payment';
    }
    if (!quote) refreshAvailability();
  });
  showPanel(location.hash === '#pa-enrollment' ? 'pa-enrollment' : 'pa-dates');
  render();
  function refreshAvailability() {
    if (availabilityRequest) return availabilityRequest;
    if (submitting || !ready) return Promise.resolve();
    availabilityRequest = (async () => {
      try {
        const result = await post({ action: 'getAvailability', programCode: camp.dataset.programCode });
        if (!Array.isArray(result.items) || result.items.some(item => !/^PA_\d{8}_(STANDARD|EXTENDED)$/.test(item.itemCode)
          || !Number.isSafeInteger(item.placesRemaining) || item.placesRemaining < 0)) throw new Error('Invalid availability response.');
        availability = new Map(result.items.map(item => [item.itemCode, item.placesRemaining]));
        availabilityLoaded = true;
        availabilityFailed = false;
        find('[data-pa-availability-status]').textContent = 'Availability checked. Places are confirmed after payment.';
        find('[data-pa-availability-retry]').hidden = true;
      } catch {
        availabilityLoaded = false;
        availabilityFailed = true;
        resetQuote();
        find('[data-pa-availability-status]').textContent = 'We could not check available places. Please try again or contact the studio.';
        find('[data-pa-availability-retry]').hidden = false;
      } finally {
        availabilityRequest = null;
        render();
        if (quote) {
          find('[data-pa-subtotal]').textContent = money(quote.subtotalCents);
          find('[data-pa-quote]').hidden = false;
        }
      }
    })();
    render();
    return availabilityRequest;
  }
  find('[data-pa-availability-retry]').addEventListener('click', refreshAvailability);
  window.addEventListener('focus', () => { if (!document.hidden) refreshAvailability(); });
  setInterval(() => { if (!document.hidden) refreshAvailability(); }, 60000);
  async function initialize() {
    try {
      const health = await post({ action: 'ping' });
      ready = health.programCode === camp.dataset.programCode && health.bookingVersion === 1 && health.stripeMode === camp.dataset.stripeMode;
      if (!ready) throw new Error('Online payment is being set up. Please contact the studio to register.');
      discountsSupported = health.discountsSupported === true;
      find('[data-pa-discount]').hidden = !discountsSupported;
      status.textContent = health.stripeMode === 'test' ? 'Test mode: use a Stripe test card. No real payment will be taken.' : '';
      await refreshAvailability();
    } catch (error) {
      ready = false;
      status.textContent = error.message || 'Online payment is temporarily unavailable.';
      find('[data-pa-availability-status]').textContent = status.textContent;
    }
    render();
    const params = new URLSearchParams(location.search);
    if (!params.has('payment')) return;
    showPanel('pa-enrollment');
    find('#pa-booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (params.get('payment') === 'canceled') {
      status.textContent = 'Payment was canceled. Choose your dates to try again.';
      history.replaceState({}, '', location.pathname + '#pa-enrollment');
    } else if (params.get('payment') === 'success' && params.get('session_id')) {
      status.textContent = 'Verifying your payment…';
      try {
        const result = await post({ action: 'verifyCheckoutSession', stripeSessionId: params.get('session_id') });
        if (result.paymentStatus !== 'paid') throw new Error('Payment has not been confirmed. Refresh to check again or contact the studio.');
        days.forEach(day => { day.querySelector('[data-pa-select]').checked = false; });
        resetQuote(); render();
        status.textContent = result.message || 'Payment verified. Your PA Day Camp registration is confirmed.';
        history.replaceState({}, '', location.pathname + '#pa-enrollment');
      } catch (error) { status.textContent = error.message || 'Payment could not be verified. Refresh to retry or contact the studio.'; }
    }
  }
  initialize();
}
