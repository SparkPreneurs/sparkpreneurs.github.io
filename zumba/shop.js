document.addEventListener('DOMContentLoaded', function() {
    const shop = document.querySelector('[data-zumba-shop]');

    if (!shop) {
        return;
    }

    const HST_RATE = 0.13;
    const RETURN_PAGE_URL = 'https://sparkpreneurs.ca/zumba/';
    const PRODUCTS = {
        ZUMBA_SINGLE: {
            code: 'ZUMBA_SINGLE',
            name: 'Zumba Single Session',
            priceCents: 3500,
            sessionCount: 1
        },
        ZUMBA_4: {
            code: 'ZUMBA_4',
            name: 'Zumba Summer Promotion - 4 Sessions',
            priceCents: 12000,
            sessionCount: 4
        },
        ZUMBA_8: {
            code: 'ZUMBA_8',
            name: 'Zumba Summer Promotion - 8 Sessions',
            priceCents: 19000,
            sessionCount: 8
        }
    };
    const CLASS_TIMES = [
        ['AUG01_SAT_1030', 'Saturday, August 1', '10:30 AM-11:30 AM'],
        ['AUG03_MON_1730', 'Monday, August 3', '5:30 PM-6:30 PM'],
        ['AUG04_TUE_1030', 'Tuesday, August 4', '10:30 AM-11:30 AM'],
        ['AUG05_WED_1730', 'Wednesday, August 5', '5:30 PM-6:30 PM'],
        ['AUG06_THU_1030', 'Thursday, August 6', '10:30 AM-11:30 AM'],
        ['AUG08_SAT_1030', 'Saturday, August 8', '10:30 AM-11:30 AM'],
        ['AUG10_MON_1730', 'Monday, August 10', '5:30 PM-6:30 PM'],
        ['AUG11_TUE_1030', 'Tuesday, August 11', '10:30 AM-11:30 AM'],
        ['AUG12_WED_1730', 'Wednesday, August 12', '5:30 PM-6:30 PM'],
        ['AUG13_THU_1030', 'Thursday, August 13', '10:30 AM-11:30 AM'],
        ['AUG15_SAT_1030', 'Saturday, August 15', '10:30 AM-11:30 AM'],
        ['AUG17_MON_1730', 'Monday, August 17', '5:30 PM-6:30 PM'],
        ['AUG18_TUE_1030', 'Tuesday, August 18', '10:30 AM-11:30 AM'],
        ['AUG19_WED_1730', 'Wednesday, August 19', '5:30 PM-6:30 PM'],
        ['AUG20_THU_1030', 'Thursday, August 20', '10:30 AM-11:30 AM'],
        ['AUG22_SAT_1030', 'Saturday, August 22', '10:30 AM-11:30 AM'],
        ['AUG24_MON_1730', 'Monday, August 24', '5:30 PM-6:30 PM'],
        ['AUG25_TUE_1030', 'Tuesday, August 25', '10:30 AM-11:30 AM'],
        ['AUG26_WED_1730', 'Wednesday, August 26', '5:30 PM-6:30 PM'],
        ['AUG27_THU_1030', 'Thursday, August 27', '10:30 AM-11:30 AM'],
        ['AUG29_SAT_1030', 'Saturday, August 29', '10:30 AM-11:30 AM'],
        ['AUG31_MON_1730', 'Monday, August 31', '5:30 PM-6:30 PM'],
        ['SEP01_TUE_1030', 'Tuesday, September 1', '10:30 AM-11:30 AM'],
        ['SEP02_WED_1730', 'Wednesday, September 2', '5:30 PM-6:30 PM'],
        ['SEP03_THU_1030', 'Thursday, September 3', '10:30 AM-11:30 AM']
    ];
    const isAvailableClassTime = code => /^AUG(0[1-9]|1[0-9]|2[0-8])_/.test(code);

    const optionCards = Array.from(shop.querySelectorAll('[data-zumba-option]'));
    const addButtons = Array.from(shop.querySelectorAll('[data-zumba-add]'));
    const cartList = shop.querySelector('[data-zumba-cart-list]');
    const totalsPanel = shop.querySelector('[data-zumba-cart-totals]');
    const subtotalEl = shop.querySelector('[data-zumba-subtotal]');
    const hstEl = shop.querySelector('[data-zumba-hst]');
    const totalEl = shop.querySelector('[data-zumba-total]');
    const form = shop.querySelector('[data-zumba-form]');
    const timePicker = shop.querySelector('[data-zumba-time-picker]');
    const timeHelp = shop.querySelector('[data-zumba-time-help]');
    const timeOptions = shop.querySelector('[data-zumba-time-options]');
    const checkoutButton = shop.querySelector('[data-zumba-checkout]');
    const clearButton = shop.querySelector('[data-zumba-clear]');
    const statusEl = shop.querySelector('[data-zumba-status]');
    const appsScriptUrl = shop.dataset.appsScriptUrl || '';
    const programCode = shop.dataset.programCode || 'august_september_2026_zumba';
    let selectedCode = '';
    let selectedClassTimes = new Set();
    let backendReady = false;
    let isSubmitting = false;
    let hasCheckoutReturnStatus = false;

    function formatMoney(cents) {
        return (cents / 100).toLocaleString('en-CA', {
            style: 'currency',
            currency: 'CAD'
        });
    }

    function calculateTotals() {
        const product = PRODUCTS[selectedCode];
        const subtotalCents = product ? product.priceCents : 0;
        const hstCents = Math.round(subtotalCents * HST_RATE);

        return {
            subtotalCents,
            hstCents,
            totalCents: subtotalCents + hstCents
        };
    }

    function setStatus(message, type = '') {
        statusEl.textContent = message;
        statusEl.dataset.status = type;
    }

    function updateTimeHelp() {
        const product = PRODUCTS[selectedCode];

        if (!product) {
            timeHelp.textContent = 'Add a pass first.';
            return;
        }

        const remaining = product.sessionCount - selectedClassTimes.size;

        if (remaining === 0) {
            timeHelp.textContent = `${product.sessionCount} of ${product.sessionCount} class times selected.`;
            return;
        }

        timeHelp.textContent = `August 1-28 is the available four-week window. Choose ${remaining} more class time${remaining === 1 ? '' : 's'} (${selectedClassTimes.size} of ${product.sessionCount} selected).`;
    }

    function renderTimeChoices() {
        const product = PRODUCTS[selectedCode];
        timeOptions.innerHTML = '';
        timePicker.disabled = !product;

        if (!product) {
            updateTimeHelp();
            return;
        }

        CLASS_TIMES.forEach(function(classTime) {
            const [code, date, time] = classTime;
            const available = isAvailableClassTime(code);
            const label = document.createElement('label');
            const input = document.createElement('input');
            const copy = document.createElement('span');
            const dateEl = document.createElement('strong');
            const timeEl = document.createElement('small');

            label.className = 'zumba-time-option';
            input.type = 'checkbox';
            input.value = code;
            input.checked = selectedClassTimes.has(code);
            input.disabled = !available;
            input.dataset.zumbaTime = code;
            if (!available) {
                label.classList.add('is-disabled');
                input.setAttribute('aria-label', `${date}, ${time} (September registration not open)`);
            }
            dateEl.textContent = date;
            timeEl.textContent = time;
            copy.append(dateEl, timeEl);
            label.append(input, copy);
            timeOptions.appendChild(label);
        });

        updateTimeHelp();
    }

    function render() {
        const product = PRODUCTS[selectedCode];
        const totals = calculateTotals();

        optionCards.forEach(function(card) {
            card.classList.toggle(
                'is-selected',
                card.dataset.zumbaOption === selectedCode
            );
        });
        addButtons.forEach(function(button) {
            const isSelected = button.dataset.zumbaAdd === selectedCode;
            button.classList.toggle('is-added', isSelected);
            button.setAttribute('aria-pressed', String(isSelected));
            button.textContent = isSelected ? 'Added' : 'Add to Cart';
        });

        cartList.innerHTML = '';

        if (!product) {
            cartList.innerHTML = '<li class="zumba-cart-empty">No pass added yet.</li>';
            totalsPanel.hidden = true;
            checkoutButton.disabled = true;
            clearButton.disabled = true;
            renderTimeChoices();
            return;
        }

        const item = document.createElement('li');
        const name = document.createElement('span');
        const removeButton = document.createElement('button');
        item.className = 'zumba-cart-item';
        name.textContent = product.name + ' - ' + formatMoney(product.priceCents);
        removeButton.className = 'zumba-remove';
        removeButton.type = 'button';
        removeButton.textContent = 'Remove';
        removeButton.dataset.zumbaRemove = 'true';
        item.append(name, removeButton);
        cartList.appendChild(item);

        totalsPanel.hidden = false;
        subtotalEl.textContent = formatMoney(totals.subtotalCents);
        hstEl.textContent = formatMoney(totals.hstCents);
        totalEl.textContent = formatMoney(totals.totalCents);
        clearButton.disabled = isSubmitting;
        checkoutButton.disabled = isSubmitting || !backendReady;
        renderTimeChoices();
    }

    async function postToAppsScript(payload) {
        const response = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        let result;

        try {
            result = JSON.parse(text);
        } catch (error) {
            throw new Error('The registration service did not return a readable response.');
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.error || 'The registration service could not process this request.');
        }

        return result;
    }

    async function checkBackendReady() {
        if (!appsScriptUrl) {
            setStatus('Secure checkout is not connected yet. Please contact SparkPreneurs to register.', 'warning');
            render();
            return;
        }

        try {
            const result = await postToAppsScript({
                action: 'ping',
                programCode
            });
            backendReady = result.version === '2026-07-23-4' &&
                result.programCode === programCode &&
                result.stripeMode === 'live';

            if (backendReady && !hasCheckoutReturnStatus) {
                setStatus('');
            } else if (!backendReady) {
                setStatus('Secure checkout is being updated for the Summer Zumba promotion.', 'warning');
            }
        } catch (error) {
            setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs to register.', 'warning');
        }

        render();
    }

    function getRegistration() {
        if (!form.reportValidity()) {
            return null;
        }

        const product = PRODUCTS[selectedCode];

        if (!product || selectedClassTimes.size !== product.sessionCount) {
            timePicker.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setStatus(
                `Please choose exactly ${product ? product.sessionCount : 0} class time${product && product.sessionCount === 1 ? '' : 's'}.`,
                'warning'
            );
            return null;
        }

        const values = new FormData(form);

        return {
            studentName: String(values.get('studentName') || '').trim(),
            parentName: String(values.get('parentName') || '').trim(),
            parentEmail: String(values.get('parentEmail') || '').trim(),
            phone: String(values.get('phone') || '').trim(),
            selectedClassTimes: Array.from(selectedClassTimes)
        };
    }

    async function verifyReturnedPayment() {
        const params = new URLSearchParams(window.location.search);
        const payment = params.get('payment');

        if (payment === 'canceled') {
            hasCheckoutReturnStatus = true;
            setStatus('Payment was canceled. Your selected pass has not been charged.', 'warning');
            shop.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState({}, document.title, window.location.pathname + '#zumba-registration');
            return;
        }

        const sessionId = params.get('session_id');

        if (payment !== 'success' || !sessionId || !appsScriptUrl) {
            return;
        }

        hasCheckoutReturnStatus = true;
        setStatus('Checking payment status with Stripe...', 'pending');
        shop.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            const result = await postToAppsScript({
                action: 'verifyCheckoutSession',
                programCode,
                stripeSessionId: sessionId
            });

            if (!result.paid || result.paymentStatus !== 'paid') {
                throw new Error('Stripe has not confirmed this payment yet.');
            }

            selectedCode = '';
            selectedClassTimes.clear();
            render();
            setStatus('Payment verified. Your Summer Zumba registration has been received.', 'success');
        } catch (error) {
            setStatus(error.message || 'Payment could not be verified. Please contact SparkPreneurs.', 'error');
        } finally {
            window.history.replaceState({}, document.title, window.location.pathname + '#zumba-registration');
        }
    }

    addButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            const code = button.dataset.zumbaAdd;
            selectedCode = selectedCode === code ? '' : code;
            selectedClassTimes.clear();

            if (backendReady) {
                setStatus('');
            }

            render();
        });
    });

    timeOptions.addEventListener('change', function(event) {
        const checkbox = event.target.closest('[data-zumba-time]');
        const product = PRODUCTS[selectedCode];

        if (!checkbox || !product) {
            return;
        }

        if (checkbox.checked && selectedClassTimes.size >= product.sessionCount) {
            checkbox.checked = false;
            setStatus(
                `This pass includes ${product.sessionCount} class time${product.sessionCount === 1 ? '' : 's'}. Remove one before choosing another.`,
                'warning'
            );
            return;
        }

        if (checkbox.checked) {
            selectedClassTimes.add(checkbox.value);
        } else {
            selectedClassTimes.delete(checkbox.value);
        }

        if (selectedClassTimes.size === product.sessionCount) {
            setStatus('');
        }
        updateTimeHelp();
    });

    cartList.addEventListener('click', function(event) {
        if (!event.target.closest('[data-zumba-remove]')) {
            return;
        }

        selectedCode = '';
        selectedClassTimes.clear();
        render();
    });

    clearButton.addEventListener('click', function() {
        selectedCode = '';
        selectedClassTimes.clear();
        setStatus('');
        render();
    });

    checkoutButton.addEventListener('click', async function() {
        const product = PRODUCTS[selectedCode];

        if (!backendReady) {
            setStatus('Secure checkout is not ready yet. Please try again shortly.', 'warning');
            return;
        }
        if (!product) {
            setStatus('Please add one Zumba pass first.', 'warning');
            return;
        }

        const registration = getRegistration();

        if (!registration) {
            return;
        }

        const totals = calculateTotals();
        isSubmitting = true;
        checkoutButton.textContent = 'Opening Secure Payment...';
        setStatus('Checking your pass, class times, and secure total...', 'pending');
        render();

        try {
            const result = await postToAppsScript({
                action: 'createCheckoutSession',
                programCode,
                selectedItemCodes: [product.code],
                displayedAmountCents: totals.totalCents,
                successUrl: RETURN_PAGE_URL + '?payment=success&session_id={CHECKOUT_SESSION_ID}',
                cancelUrl: RETURN_PAGE_URL + '?payment=canceled#zumba-registration',
                ...registration
            });
            const checkoutUrl = new URL(result.checkoutUrl);

            if (checkoutUrl.protocol !== 'https:' ||
                checkoutUrl.hostname !== 'checkout.stripe.com') {
                throw new Error('Stripe returned an invalid payment link.');
            }

            window.location.href = checkoutUrl.href;
        } catch (error) {
            isSubmitting = false;
            checkoutButton.textContent = 'Continue to Secure Payment';
            setStatus(error.message || 'Payment could not be started. Please try again.', 'error');
            render();
        }
    });

    render();
    verifyReturnedPayment();
    checkBackendReady();
});
