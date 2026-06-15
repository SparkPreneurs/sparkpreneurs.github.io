document.addEventListener('DOMContentLoaded', function() {
    const shop = document.querySelector('.older-summer-shop');

    if (!shop) {
        return;
    }

    const weeks = [
        { id: '1', date: 'July 6-10', sessionPriceCents: 20000 },
        { id: '2', date: 'July 13-17', sessionPriceCents: 20000 },
        { id: '3', date: 'July 20-24', sessionPriceCents: 20000 },
        { id: '4', date: 'July 27-31', sessionPriceCents: 20000 },
        { id: '5', date: 'August 4-7', sessionPriceCents: 16000, fourDay: true },
        { id: '6', date: 'August 10-14', sessionPriceCents: 20000 },
        { id: '7', date: 'August 17-21', sessionPriceCents: 20000 },
        { id: '8', date: 'August 24-28', sessionPriceCents: 20000 }
    ];
    const HST_RATE = 0.13;
    const MEAL_PRICE_CENTS = 4500;
    const grid = shop.querySelector('[data-older-summer-grid]');
    const cartList = shop.querySelector('[data-older-summer-cart-list]');
    const totalsPanel = shop.querySelector('[data-older-summer-cart-totals]');
    const subtotalEl = shop.querySelector('[data-older-summer-subtotal]');
    const hstEl = shop.querySelector('[data-older-summer-hst]');
    const grandTotalEl = shop.querySelector('[data-older-summer-grand-total]');
    const registrationForm = shop.querySelector('[data-older-summer-registration-form]');
    const purchaseButton = shop.querySelector('[data-older-summer-purchase]');
    const clearButton = shop.querySelector('[data-older-summer-clear]');
    const statusEl = shop.querySelector('[data-older-summer-cart-status]');
    const appsScriptUrl = shop.dataset.appsScriptUrl || '';
    const programCode = shop.dataset.programCode || 'summer2026_10_14';
    const selectedItems = new Map();
    let isSubmitting = false;
    let backendReady = false;

    function formatMoneyCents(cents) {
        return (cents / 100).toLocaleString('en-CA', {
            style: 'currency',
            currency: 'CAD'
        });
    }

    function buildWeekCards() {
        weeks.forEach(week => {
            const card = document.createElement('article');
            card.className = 'older-summer-week-card';
            card.dataset.weekId = week.id;
            card.innerHTML = `
                <div class="older-summer-week-head">
                    <div>
                        <p class="summer-week-label">Summer Week ${week.id}</p>
                        <h2>Week ${week.id}</h2>
                        <p class="summer-week-date">${week.date}</p>
                    </div>
                    ${week.fourDay ? '<span class="older-summer-four-day">4 days</span>' : ''}
                </div>
                <div class="older-summer-session-grid">
                    <button class="older-session-button" type="button" data-session="AM">
                        <span>Morning</span>
                        <small>10 AM-12 PM</small>
                        <strong>${formatMoneyCents(week.sessionPriceCents)}</strong>
                    </button>
                    <button class="older-session-button" type="button" data-session="PM">
                        <span>Afternoon</span>
                        <small>1-3 PM</small>
                        <strong>${formatMoneyCents(week.sessionPriceCents)}</strong>
                    </button>
                </div>
                <label class="older-summer-meal">
                    <input type="checkbox" data-meal>
                    <span>Add meal for this week</span>
                    <strong>${formatMoneyCents(MEAL_PRICE_CENTS)}</strong>
                </label>
                <p class="older-summer-meal-note">Meal can be added after choosing at least one session.</p>
            `;
            grid.appendChild(card);
        });
    }

    function getWeek(weekId) {
        return weeks.find(week => week.id === weekId);
    }

    function makeSessionItem(week, session) {
        const isMorning = session === 'AM';
        return {
            code: `W${week.id}${session}`,
            weekId: week.id,
            type: 'session',
            name: `Week ${week.id} ${isMorning ? 'Morning' : 'Afternoon'} (${week.date}, ${isMorning ? '10 AM-12 PM' : '1-3 PM'})`,
            priceCents: week.sessionPriceCents
        };
    }

    function makeMealItem(week) {
        return {
            code: `W${week.id}MEAL`,
            weekId: week.id,
            type: 'meal',
            name: `Week ${week.id} Meal (${week.date})`,
            priceCents: MEAL_PRICE_CENTS
        };
    }

    function weekHasSession(weekId) {
        return selectedItems.has(`W${weekId}AM`) || selectedItems.has(`W${weekId}PM`);
    }

    function calculateTotals() {
        const subtotalCents = Array.from(selectedItems.values()).reduce((total, item) => total + item.priceCents, 0);
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

    function syncCards() {
        shop.querySelectorAll('.older-summer-week-card').forEach(card => {
            const weekId = card.dataset.weekId;
            const mealInput = card.querySelector('[data-meal]');
            const hasSession = weekHasSession(weekId);

            card.querySelectorAll('[data-session]').forEach(button => {
                button.classList.toggle('is-selected', selectedItems.has(`W${weekId}${button.dataset.session}`));
            });

            mealInput.disabled = !hasSession;
            mealInput.checked = selectedItems.has(`W${weekId}MEAL`);
            card.classList.toggle('is-selected', hasSession);
        });
    }

    function renderCart() {
        const entries = Array.from(selectedItems.values());
        const totals = calculateTotals();

        cartList.innerHTML = '';

        if (!entries.length) {
            cartList.innerHTML = '<li class="summer-cart-empty">No sessions added yet.</li>';
            totalsPanel.hidden = true;
            purchaseButton.disabled = true;
            return;
        }

        entries.forEach(entry => {
            const item = document.createElement('li');
            const name = document.createElement('span');
            const removeButton = document.createElement('button');

            item.className = 'summer-cart-item';
            name.className = 'summer-cart-item-name';
            name.textContent = `${entry.name} - ${formatMoneyCents(entry.priceCents)}`;
            removeButton.className = 'summer-cart-remove';
            removeButton.type = 'button';
            removeButton.dataset.removeOlderItem = entry.code;
            removeButton.textContent = 'Remove';
            item.append(name, removeButton);
            cartList.appendChild(item);
        });

        totalsPanel.hidden = false;
        subtotalEl.textContent = formatMoneyCents(totals.subtotalCents);
        hstEl.textContent = formatMoneyCents(totals.hstCents);
        grandTotalEl.textContent = formatMoneyCents(totals.totalCents);
        purchaseButton.disabled = isSubmitting || !backendReady;
    }

    function updateShop() {
        if (backendReady) {
            setStatus('');
        }
        syncCards();
        renderCart();
    }

    function removeItem(code) {
        const item = selectedItems.get(code);

        if (!item) {
            return;
        }

        selectedItems.delete(code);

        if (item.type === 'session' && !weekHasSession(item.weekId)) {
            selectedItems.delete(`W${item.weekId}MEAL`);
        }

        updateShop();
    }

    function getRegistrationData() {
        if (!registrationForm.reportValidity()) {
            return null;
        }

        const formData = new FormData(registrationForm);

        return {
            studentName: String(formData.get('studentName') || '').trim(),
            parentName: String(formData.get('parentName') || '').trim(),
            parentEmail: String(formData.get('parentEmail') || '').trim(),
            phone: String(formData.get('phone') || '').trim()
        };
    }

    async function collectWaiverData(registrationData) {
        if (!window.SparkPreneursWaiver) {
            throw new Error('The required waiver could not be opened. Please refresh the page and try again.');
        }

        return window.SparkPreneursWaiver.collect({
            childName: registrationData.studentName,
            parentName: registrationData.parentName,
            parentEmail: registrationData.parentEmail,
            phone: registrationData.phone
        });
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
        let data;

        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error('The registration service did not return a readable response.');
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.error || 'The registration service could not process this request.');
        }

        return data;
    }

    async function verifyReturnedPayment() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const paymentStatus = params.get('payment');

        if (paymentStatus === 'canceled') {
            setStatus('Payment was canceled. Please choose your sessions again when you are ready.', 'warning');
            shop.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState({}, document.title, `${window.location.pathname}#summer-camp`);
            return;
        }

        if (paymentStatus !== 'success' || !sessionId || !appsScriptUrl) {
            return;
        }

        setStatus('Checking payment status...', 'pending');
        shop.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            const result = await postToAppsScript({
                action: 'verifyCheckoutSession',
                stripeSessionId: sessionId
            });

            if (result.paymentStatus !== 'paid') {
                throw new Error('Payment could not be verified yet. Please contact SparkPreneurs.');
            }

            setStatus(result.message || 'Payment verified. Your registration has been received.', 'success');
        } catch (error) {
            setStatus(error.message || 'Payment could not be verified yet. Please contact SparkPreneurs.', 'error');
        } finally {
            window.history.replaceState({}, document.title, `${window.location.pathname}#summer-camp`);
        }
    }

    async function checkBackendReady() {
        if (!appsScriptUrl) {
            setStatus('Secure checkout is not connected yet. Please contact SparkPreneurs to register.', 'warning');
            renderCart();
            return;
        }

        try {
            const result = await postToAppsScript({ action: 'ping' });
            backendReady = Array.isArray(result.programs) && result.programs.includes(programCode);

            if (backendReady) {
                setStatus('');
            } else {
                setStatus('Session selection is ready. Secure checkout will be available after the payment update is deployed.', 'warning');
            }
        } catch (error) {
            setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs to register.', 'warning');
        }

        renderCart();
    }

    grid.addEventListener('click', function(event) {
        const button = event.target.closest('[data-session]');

        if (!button) {
            return;
        }

        const card = button.closest('.older-summer-week-card');
        const week = getWeek(card.dataset.weekId);
        const item = makeSessionItem(week, button.dataset.session);

        if (selectedItems.has(item.code)) {
            removeItem(item.code);
            return;
        }

        selectedItems.set(item.code, item);
        updateShop();
    });

    grid.addEventListener('change', function(event) {
        const mealInput = event.target.closest('[data-meal]');

        if (!mealInput) {
            return;
        }

        const card = mealInput.closest('.older-summer-week-card');
        const week = getWeek(card.dataset.weekId);
        const meal = makeMealItem(week);

        if (mealInput.checked && weekHasSession(week.id)) {
            selectedItems.set(meal.code, meal);
        } else {
            selectedItems.delete(meal.code);
        }

        updateShop();
    });

    cartList.addEventListener('click', function(event) {
        const removeButton = event.target.closest('[data-remove-older-item]');

        if (removeButton) {
            removeItem(removeButton.dataset.removeOlderItem);
        }
    });

    clearButton.addEventListener('click', function() {
        selectedItems.clear();
        updateShop();
    });

    purchaseButton.addEventListener('click', async function() {
        const entries = Array.from(selectedItems.values());

        if (!backendReady) {
            setStatus('Secure checkout will be available after the payment update is deployed.', 'warning');
            return;
        }

        if (!entries.some(entry => entry.type === 'session')) {
            setStatus('Please choose at least one morning or afternoon session first.', 'warning');
            return;
        }

        const registrationData = getRegistrationData();

        if (!registrationData) {
            setStatus('Please complete the registration fields before payment.', 'warning');
            return;
        }

        let waiverData;

        try {
            waiverData = await collectWaiverData(registrationData);
        } catch (error) {
            setStatus(error.message, 'error');
            return;
        }

        if (!waiverData) {
            setStatus('Please complete and sign the required waiver before payment.', 'warning');
            return;
        }

        const totals = calculateTotals();
        const pageUrl = `${window.location.origin}${window.location.pathname}`;

        isSubmitting = true;
        purchaseButton.disabled = true;
        clearButton.disabled = true;
        purchaseButton.textContent = 'Opening Secure Payment...';
        setStatus('Checking the registration total...', 'pending');

        try {
            const result = await postToAppsScript({
                action: 'createCheckoutSession',
                programCode,
                selectedWeeks: entries.map(entry => entry.code),
                selectedWeekDetails: entries.map(entry => ({
                    code: entry.code,
                    name: entry.name,
                    displayedPriceCents: entry.priceCents
                })),
                displayedAmountCents: totals.totalCents,
                successUrl: `${pageUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${pageUrl}?payment=canceled#summer-camp`,
                ...registrationData,
                ...waiverData
            });

            if (!result.checkoutUrl) {
                throw new Error('Stripe Checkout did not return a payment link.');
            }

            window.location.href = result.checkoutUrl;
        } catch (error) {
            isSubmitting = false;
            purchaseButton.disabled = false;
            clearButton.disabled = false;
            purchaseButton.textContent = 'Continue to Secure Payment';
            setStatus(error.message || 'Payment could not be started. Please try again.', 'error');
        }
    });

    buildWeekCards();
    syncCards();
    renderCart();
    verifyReturnedPayment();
    checkBackendReady();
});
