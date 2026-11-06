// Loaded synchronously by RegistrationDiscount before each registration script.
globalThis.createRegistrationDiscount = (form, options) => {
  const panel = form.querySelector('[data-registration-discount]');
  const input = panel.querySelector('[name="discountCode"]');
  const button = panel.querySelector('[data-discount-apply]');
  const status = panel.querySelector('[data-discount-status]');
  const summary = panel.querySelector('[data-discount-summary]');
  let supported = false;
  let quote = null;
  let busy = false;
  const unavailableMessage = 'Discount codes are temporarily unavailable. Remove the code to continue without a discount, or contact SparkPreneurs.';
  const snapshot = payload => ({ ...payload, programCode: options.programCode,
    email: String(payload.email || payload.parentEmail || '').trim().toLowerCase(),
    discountCode: input.value.trim().toUpperCase() });
  const key = data => JSON.stringify([data.programCode, data.selectedItemCodes, data.email, data.discountCode, data.startDate, data.weekCount]);
  const reset = () => { quote = null; summary.hidden = true; status.textContent = ''; };
  const setStatus = (message, type) => { status.textContent = message; status.dataset.status = type; };
  const fetchQuote = async payload => {
    if (!supported) throw new Error(unavailableMessage);
    if (busy) throw new Error('Please wait while your discount is checked.');
    const data = snapshot(payload);
    if (!data.selectedItemCodes?.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Choose a registration option and enter your email before applying a code.');
    const requestKey = key(data);
    busy = true; button.disabled = true; reset(); setStatus('Checking your discount…', 'pending');
    try {
      const result = await options.post({ ...data, action: 'quoteCheckout' });
      if (requestKey !== key(snapshot(options.selection()))) throw new Error('Your registration changed. Apply the code again.');
      for (const field of ['subtotalCents', 'discountCents', 'taxCents', 'expectedAmountCents']) {
        if (!Number.isSafeInteger(result[field]) || result[field] < 0) throw new Error('The service returned an invalid discount total.');
      }
      if (result.subtotalCents - result.discountCents + result.taxCents !== result.expectedAmountCents || result.expectedAmountCents <= 0) throw new Error('The service returned an invalid discount total.');
      const money = amount => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount / 100);
      for (const [name, amount] of [['subtotal', result.subtotalCents], ['saving', -result.discountCents], ['tax', result.taxCents], ['total', result.expectedAmountCents]]) {
        panel.querySelector('[data-discount-' + name + ']').textContent = money(amount);
      }
      quote = { ...result, key: requestKey }; summary.hidden = false;
      setStatus('Discount applied. Review your total before payment.', 'success');
    } catch (error) { reset(); setStatus(error.message || 'The discount could not be checked.', 'error'); throw error; }
    finally { busy = false; button.disabled = false; }
  };
  button.addEventListener('click', () => {
    if (!supported) { setStatus(unavailableMessage, 'error'); return; }
    fetchQuote(options.selection()).catch(error => setStatus(error.message || 'The discount could not be checked.', 'error'));
  });
  form.addEventListener('input', reset);
  form.addEventListener('change', reset);
  // Schedule/cart controls can live outside the contact form.
  document.addEventListener('change', () => { if (quote && quote.key !== key(snapshot(options.selection()))) reset(); });
  return {
    setSupported(value) { supported = value === true; if (!supported) reset(); },
    async checkoutPayload(payload) {
      const data = snapshot(payload);
      if (!data.discountCode) return { ...payload, discountCode: '' };
      if (!supported) throw new Error(unavailableMessage);
      if (!quote || quote.key !== key(data)) {
        await fetchQuote(payload);
        throw new Error('Review your discounted total, then continue to secure payment again.');
      }
      return { ...payload, discountCode: quote.discountCode, displayedAmountCents: quote.expectedAmountCents };
    },
  };
};
