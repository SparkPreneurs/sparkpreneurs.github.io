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
            schedules: [
                'TUESDAY_MORNING',
                'THURSDAY_MORNING',
                'MONDAY_EVENING',
                'WEDNESDAY_EVENING',
                'SATURDAY_MORNING'
            ]
        },
        ZUMBA_4: {
            code: 'ZUMBA_4',
            name: 'Zumba 4-Session Pass (Once Weekly Promo)',
            priceCents: 12000,
            schedules: [
                'TUESDAY_MORNING',
                'THURSDAY_MORNING',
                'MONDAY_EVENING',
                'WEDNESDAY_EVENING',
                'SATURDAY_MORNING'
            ]
        },
        ZUMBA_7: {
            code: 'ZUMBA_7',
            name: 'Zumba 7-Session Pass',
            priceCents: 17500,
            schedules: ['FLEXIBLE_7']
        },
        ZUMBA_8: {
            code: 'ZUMBA_8',
            name: 'Zumba 8-Session Pass (Twice Weekly Promo)',
            priceCents: 19000,
            schedules: ['TUE_THU_MORNING', 'MON_WED_EVENING']
        }
    };
    const SCHEDULES = {
        TUESDAY_MORNING: 'Tuesday, 10:30 AM-11:30 AM',
        THURSDAY_MORNING: 'Thursday, 10:30 AM-11:30 AM',
        MONDAY_EVENING: 'Monday, 5:30 PM-6:30 PM',
        WEDNESDAY_EVENING: 'Wednesday, 5:30 PM-6:30 PM',
        SATURDAY_MORNING: 'Saturday, 10:30 AM-11:30 AM',
        FLEXIBLE_7: 'Flexible 7-session pass across listed class times',
        TUE_THU_MORNING: 'Tuesday and Thursday, 10:30 AM-11:30 AM',
        MON_WED_EVENING: 'Monday and Wednesday, 5:30 PM-6:30 PM'
    };

    const optionCards = Array.from(shop.querySelectorAll('[data-zumba-option]'));
    const addButtons = Array.from(shop.querySelectorAll('[data-zumba-add]'));
    const cartList = shop.querySelector('[data-zumba-cart-list]');
    const totalsPanel = shop.querySelector('[data-zumba-cart-totals]');
    const subtotalEl = shop.querySelector('[data-zumba-subtotal]');
    const hstEl = shop.querySelector('[data-zumba-hst]');
    const totalEl = shop.querySelector('[data-zumba-total]');
    const form = shop.querySelector('[data-zumba-form]');
    const scheduleSelect = shop.querySelector('[data-zumba-schedule]');
    const checkoutButton = shop.querySelector('[data-zumba-checkout]');
    const clearButton = shop.querySelector('[data-zumba-clear]');
    const statusEl = shop.querySelector('[data-zumba-status]');
    const appsScriptUrl = shop.dataset.appsScriptUrl || '';
    const programCode = shop.dataset.programCode || 'august_september_2026_zumba';
    let selectedCode = '';
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

    function renderScheduleChoices() {
        const product = PRODUCTS[selectedCode];
        const previousValue = scheduleSelect.value;
        scheduleSelect.innerHTML = '';

        if (!product) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Add a pass first';
            scheduleSelect.appendChild(option);
            scheduleSelect.disabled = true;
            return;
        }

        const prompt = document.createElement('option');
        prompt.value = '';
        prompt.textContent = 'Choose a class schedule';
        scheduleSelect.appendChild(prompt);

        product.schedules.forEach(function(scheduleCode) {
            const option = document.createElement('option');
            option.value = scheduleCode;
            option.textContent = SCHEDULES[scheduleCode];
            scheduleSelect.appendChild(option);
        });

        scheduleSelect.disabled = false;
        scheduleSelect.value = product.schedules.includes(previousValue)
            ? previousValue
            : '';
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
            renderScheduleChoices();
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
        renderScheduleChoices();
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
            backendReady = result.programCode === programCode &&
                result.stripeMode === 'live';

            if (backendReady && !hasCheckoutReturnStatus) {
                setStatus('');
            } else {
                if (!backendReady) {
                    setStatus('Secure checkout is not ready for this Zumba session yet.', 'warning');
                }
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

        const values = new FormData(form);
        const scheduleChoice = String(values.get('scheduleChoice') || '').trim();
        const product = PRODUCTS[selectedCode];

        if (!product || !product.schedules.includes(scheduleChoice)) {
            scheduleSelect.focus();
            setStatus('Please choose the class schedule for this pass.', 'warning');
            return null;
        }

        return {
            studentName: String(values.get('studentName') || '').trim(),
            parentName: String(values.get('parentName') || '').trim(),
            parentEmail: String(values.get('parentEmail') || '').trim(),
            phone: String(values.get('phone') || '').trim(),
            scheduleChoice
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

            if (backendReady) {
                setStatus('');
            }

            render();
        });
    });

    cartList.addEventListener('click', function(event) {
        if (!event.target.closest('[data-zumba-remove]')) {
            return;
        }

        selectedCode = '';
        render();
    });

    clearButton.addEventListener('click', function() {
        selectedCode = '';
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
        setStatus('Checking your pass and secure total...', 'pending');
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
