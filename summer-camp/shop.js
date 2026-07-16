document.addEventListener('DOMContentLoaded', function() {
    const shop = document.querySelector('.summer-camp-shop[data-checkout-mode="sessions"]');

    if (!shop) {
        return;
    }

    const weeks = [
        { id: '1', date: 'July 6-10', theme: 'Creative Explorers', sessionPriceCents: 21000, closed: true },
        { id: '2', date: 'July 13-17', theme: 'Invent & Imagine', sessionPriceCents: 21000, closed: true },
        { id: '3', date: 'July 20-24', theme: 'Mini Makers Lab', sessionPriceCents: 21000, closed: true },
        { id: '4', date: 'July 27-31', theme: 'Color Splash Studio', sessionPriceCents: 21000, closed: true },
        { id: '5', date: 'August 4-7', theme: 'Kitchen Creations', sessionPriceCents: 19500, fourDay: true },
        { id: '6', date: 'August 10-14', theme: 'Movement & Mindfulness', sessionPriceCents: 21000 },
        { id: '7', date: 'August 17-21', theme: '3D Storybook Makers', sessionPriceCents: 21000 },
        { id: '8', date: 'August 24-28', theme: 'Dream House Designers', sessionPriceCents: 21000 }
    ];
    const HST_RATE = 0.13;
    const SESSION_TIMES = {
        AM: '10 AM-12 PM',
        PM: '1-3 PM'
    };
    const grid = shop.querySelector('[data-summer-week-grid]');
    const cartList = shop.querySelector('[data-summer-cart-list]');
    const totalsPanel = shop.querySelector('[data-summer-cart-totals]');
    const subtotalEl = shop.querySelector('[data-summer-subtotal]');
    const hstEl = shop.querySelector('[data-summer-hst]');
    const grandTotalEl = shop.querySelector('[data-summer-grand-total]');
    const registrationForm = shop.querySelector('[data-summer-registration-form]');
    const purchaseButton = shop.querySelector('[data-summer-cart-purchase]');
    const clearButton = shop.querySelector('[data-summer-cart-clear]');
    const statusEl = shop.querySelector('[data-summer-cart-status]');
    const appsScriptUrl = shop.dataset.appsScriptUrl || '';
    const programCode = shop.dataset.programCode || 'summer2026_4_10_sessions';
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
            card.className = 'summer-week-card';
            card.dataset.weekId = week.id;

            if (week.closed) {
                card.classList.add('is-closed');
                card.dataset.weekClosed = 'true';
            }

            card.innerHTML = `
                <a class="summer-week-preview" href="../assets/week${week.id}.png" target="_blank" rel="noopener">
                    <img src="../assets/week${week.id}.png" alt="SparkPreneurs Summer Camp Week ${week.id} design" class="summer-week-image">
                </a>
                <div class="summer-week-body">
                    <div>
                        <div class="summer-week-headline">
                            <div>
                                <p class="summer-week-label">Summer Week ${week.id}</p>
                                <h2 class="summer-week-title">Week ${week.id}</h2>
                            </div>
                            ${week.fourDay ? '<span class="summer-week-badge">4 days</span>' : ''}
                        </div>
                        <p class="summer-week-theme">${week.theme}</p>
                        <p class="summer-week-date">${week.date}</p>
                        ${week.closed
                            ? '<p class="summer-week-session-note">This week has ended and is now closed.</p>'
                            : `<p class="summer-week-session-note">Choose morning, afternoon, or both. No lunch included.</p>`}
                    </div>
                    ${week.closed
                        ? '<div class="summer-week-closed-pill">Closed</div>'
                        : `
                            <div class="summer-week-session-grid">
                                <button class="summer-week-session-button" type="button" data-session="AM">
                                    <span>Morning</span>
                                    <small>${SESSION_TIMES.AM}</small>
                                    <strong>${formatMoneyCents(week.sessionPriceCents)}</strong>
                                </button>
                                <button class="summer-week-session-button" type="button" data-session="PM">
                                    <span>Afternoon</span>
                                    <small>${SESSION_TIMES.PM}</small>
                                    <strong>${formatMoneyCents(week.sessionPriceCents)}</strong>
                                </button>
                            </div>
                        `}
                </div>
            `;

            grid.appendChild(card);
        });
    }

    function getWeek(weekId) {
        return weeks.find(week => week.id === weekId);
    }

    function makeSessionItem(week, session) {
        const sessionLabel = session === 'AM' ? 'Morning' : 'Afternoon';

        return {
            code: `W${week.id}${session}`,
            weekId: week.id,
            name: `Week ${week.id} ${sessionLabel}: ${week.theme} (${week.date}, ${SESSION_TIMES[session]})`,
            priceCents: week.sessionPriceCents
        };
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
        if (!statusEl) {
            return;
        }

        statusEl.textContent = message;
        statusEl.dataset.status = type;
    }

    function syncCards() {
        shop.querySelectorAll('.summer-week-card').forEach(card => {
            if (card.dataset.weekClosed === 'true') {
                return;
            }

            const weekId = card.dataset.weekId;
            const hasSelection = selectedItems.has(`W${weekId}AM`) || selectedItems.has(`W${weekId}PM`);
            card.classList.toggle('is-selected', hasSelection);

            card.querySelectorAll('[data-session]').forEach(button => {
                button.classList.toggle('is-selected', selectedItems.has(`W${weekId}${button.dataset.session}`));
            });
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
            removeButton.dataset.removeSessionItem = entry.code;
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
        if (!selectedItems.has(code)) {
            return;
        }

        selectedItems.delete(code);
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
                setStatus('Session registration is ready. Secure checkout will be available after the payment update is published.', 'warning');
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

        const card = button.closest('.summer-week-card');
        const week = getWeek(card.dataset.weekId);

        if (!week || week.closed) {
            return;
        }

        const item = makeSessionItem(week, button.dataset.session);

        if (selectedItems.has(item.code)) {
            removeItem(item.code);
            return;
        }

        selectedItems.set(item.code, item);
        updateShop();
    });

    cartList.addEventListener('click', function(event) {
        const removeButton = event.target.closest('[data-remove-session-item]');

        if (!removeButton) {
            return;
        }

        removeItem(removeButton.dataset.removeSessionItem);
    });

    clearButton.addEventListener('click', function() {
        selectedItems.clear();
        updateShop();
    });

    purchaseButton.addEventListener('click', async function() {
        const entries = Array.from(selectedItems.values());

        if (!backendReady) {
            setStatus('Secure checkout will be available after the payment update is published.', 'warning');
            return;
        }

        if (!entries.length) {
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
