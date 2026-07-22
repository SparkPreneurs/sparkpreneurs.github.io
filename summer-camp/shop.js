document.addEventListener('DOMContentLoaded', function() {
    const shop = document.querySelector('.summer-camp-shop[data-checkout-mode="sessions"]');

    if (!shop) {
        return;
    }

    const weeks = [
        { id: '1', date: 'July 6-10', theme: 'Young Chef Creations', sessionPriceCents: 10500, closed: true },
        { id: '2', date: 'July 13-17', theme: '3D Storybook Makers', sessionPriceCents: 10500, closed: true },
        { id: '3', date: 'July 20-24', theme: 'Around the World', sessionPriceCents: 10500, closed: true },
        { id: '4', date: 'July 27-31', theme: 'Dream House Designers', sessionPriceCents: 10500, closed: true },
        { id: '5', date: 'August 4-7', theme: 'Fashion Week', sessionPriceCents: 8400, fourDay: true },
        { id: '6', date: 'August 10-14', theme: 'Young Chef Creations 2', sessionPriceCents: 10500 },
        { id: '7', date: 'August 17-21', theme: '3D Storybook Makers', sessionPriceCents: 10500 },
        { id: '8', date: 'August 24-28', theme: 'Dream House Designers', sessionPriceCents: 10500 }
    ];
    const HST_RATE = 0.13;
    const SESSION_TIMES = {
        AM: '10 AM-12 PM',
        PM: '1-3 PM',
        FULL: '10:00 AM - 3:00 PM'
    };
    const openGrid = shop.querySelector('[data-summer-open-grid]');
    const closedGrid = shop.querySelector('[data-summer-closed-grid]');
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

    function formatWholeDollarCents(cents) {
        return `$${Math.round(cents / 100)}`;
    }

    function salePriceMarkup(newPriceCents, oldPriceCents) {
        return `
            <span class="summer-week-session-price">
                <span class="summer-week-session-price-old">${formatWholeDollarCents(oldPriceCents)}</span>
                <span class="summer-week-session-price-new">${formatWholeDollarCents(newPriceCents)}</span>
            </span>
        `;
    }

    function buildWeekCards() {
        weeks.forEach(week => {
            const card = document.createElement('article');
            card.className = `summer-week-card ${week.closed ? 'summer-week-card--closed' : 'summer-week-card--open'}`;
            card.dataset.weekId = week.id;

            if (week.closed) {
                card.classList.add('is-closed');
                card.dataset.weekClosed = 'true';
            }

            card.innerHTML = `
                <a class="summer-week-preview" href="../assets/week${week.id}.png" target="_blank" rel="noopener">
                    ${week.closed ? '<span class="summer-week-status-badge">Ended</span>' : ''}
                    <img src="../assets/week${week.id}.png" alt="SparkPreneurs Summer Camp Week ${week.id} design" class="summer-week-image">
                </a>
                <div class="summer-week-body">
                    ${week.closed
                        ? `
                            <div class="summer-week-closed-summary">
                                <div class="summer-week-headline">
                                    <div>
                                        <p class="summer-week-label">Week ${week.id}</p>
                                        <h2 class="summer-week-title">${week.theme}</h2>
                                    </div>
                                    <span class="summer-week-closed-chip">Closed</span>
                                </div>
                                <p class="summer-week-date">${week.date}</p>
                            </div>
                        `
                        : `
                            <div>
                                <div class="summer-week-headline">
                                    <div>
                                        <p class="summer-week-label">Week ${week.id}</p>
                                        <h2 class="summer-week-title">${week.theme}</h2>
                                    </div>
                                    ${week.fourDay ? '<span class="summer-week-badge">4 days</span>' : ''}
                                </div>
                                <p class="summer-week-date">${week.date}</p>
                            </div>
                        `}
                    ${week.closed
                        ? '<div class="summer-week-closed-pill">Ended</div>'
                        : `
                            <div class="summer-week-session-grid">
                                <button class="summer-week-session-button" type="button" data-session="AM">
                                    <span class="summer-week-session-top">
                                        <span class="summer-week-session-copy">
                                            <strong>Morning</strong>
                                            <small>${SESSION_TIMES.AM}</small>
                                        </span>
                                        ${salePriceMarkup(week.sessionPriceCents, 21000)}
                                    </span>
                                </button>
                                <button class="summer-week-session-button" type="button" data-session="PM">
                                    <span class="summer-week-session-top">
                                        <span class="summer-week-session-copy">
                                            <strong>Afternoon</strong>
                                            <small>${SESSION_TIMES.PM}</small>
                                        </span>
                                        ${salePriceMarkup(week.sessionPriceCents, 21000)}
                                    </span>
                                </button>
                                <button class="summer-week-session-button summer-week-session-button--full" type="button" data-session="FULL">
                                    <span class="summer-week-session-top">
                                        <span class="summer-week-session-copy">
                                            <strong>Full Day</strong>
                                            <small>${SESSION_TIMES.FULL}</small>
                                        </span>
                                        ${salePriceMarkup(week.sessionPriceCents * 2, 42000)}
                                    </span>
                                </button>
                            </div>
                        `}
                </div>
            `;

            if (week.closed) {
                closedGrid.appendChild(card);
            } else {
                openGrid.appendChild(card);
            }
        });
    }

    function getWeek(weekId) {
        return weeks.find(week => week.id === weekId);
    }

    function makeSessionItem(week, session) {
        const sessionLabel = session === 'AM'
            ? 'Morning'
            : (session === 'PM' ? 'Afternoon' : 'Full Day');
        const sessionTime = session === 'FULL'
            ? SESSION_TIMES.FULL
            : SESSION_TIMES[session];
        const selectedCodes = session === 'FULL'
            ? [`W${week.id}AM`, `W${week.id}PM`]
            : [`W${week.id}${session}`];

        return {
            code: `W${week.id}${session}`,
            weekId: week.id,
            session,
            selectedCodes,
            name: `Week ${week.id} ${sessionLabel}: ${week.theme} (${week.date}, ${sessionTime})`,
            priceCents: week.sessionPriceCents * selectedCodes.length
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

    function syncSharedCart() {
        if (!window.SparkPreneursCart) return;
        window.SparkPreneursCart.setProgram({
            id: 'summer-camp',
            title: 'Summer Camp',
            checkoutUrl: `${window.location.pathname}#summer-camp-booking`,
            items: Array.from(selectedItems.values()).map(item => ({
                id: item.code,
                name: item.name,
                priceCents: item.priceCents
            }))
        });
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
            const selectedItem = selectedItems.get(weekId);
            const hasSelection = Boolean(selectedItem);
            card.classList.toggle('is-selected', hasSelection);

            card.querySelectorAll('[data-session]').forEach(button => {
                const isSelected = selectedItem && selectedItem.session === button.dataset.session;
                const cta = button.querySelector('.summer-week-session-cta');
                button.classList.toggle('is-selected', isSelected);
                button.setAttribute('aria-pressed', String(isSelected));
                button.style.backgroundColor = isSelected ? '#061c49' : '';
                button.style.backgroundImage = isSelected ? 'none' : '';
                button.style.borderColor = isSelected ? '#061c49' : '';

                if (cta) {
                    if (button.dataset.session === 'FULL') {
                        cta.textContent = isSelected ? 'Full Day Added' : 'Add Full Day';
                    } else {
                        cta.textContent = isSelected ? 'Added' : 'Add to Cart';
                    }
                }
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
            syncSharedCart();
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
            removeButton.dataset.removeSessionItem = entry.weekId;
            removeButton.textContent = 'Remove';
            item.append(name, removeButton);
            cartList.appendChild(item);
        });

        totalsPanel.hidden = false;
        subtotalEl.textContent = formatMoneyCents(totals.subtotalCents);
        hstEl.textContent = formatMoneyCents(totals.hstCents);
        grandTotalEl.textContent = formatMoneyCents(totals.totalCents);
        purchaseButton.disabled = isSubmitting || !backendReady;
        syncSharedCart();
    }

    function updateShop() {
        if (backendReady) {
            setStatus('');
        }

        syncCards();
        renderCart();
    }

    function removeItem(weekId) {
        if (!selectedItems.has(weekId)) {
            return;
        }

        selectedItems.delete(weekId);
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

    openGrid.addEventListener('click', function(event) {
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
        const selectedItem = selectedItems.get(week.id);

        if (selectedItem && selectedItem.session === item.session) {
            removeItem(week.id);
            return;
        }

        selectedItems.set(week.id, item);
        updateShop();
    });

    cartList.addEventListener('click', function(event) {
        const removeButton = event.target.closest('[data-remove-session-item]');

        if (!removeButton) {
            return;
        }

        removeItem(removeButton.dataset.removeSessionItem);
    });

    window.addEventListener('sparkpreneurs-cart-item-removed', function(event) {
        if (event.detail.programId !== 'summer-camp') return;
        const item = Array.from(selectedItems.values()).find(entry => entry.code === event.detail.itemId);
        if (item) removeItem(item.weekId);
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
            setStatus('Please choose at least one morning, afternoon, or full-day session first.', 'warning');
            return;
        }

        const registrationData = getRegistrationData();

        if (!registrationData) {
            setStatus('Please complete the registration fields before payment.', 'warning');
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
                selectedWeeks: entries.flatMap(entry => entry.selectedCodes),
                selectedWeekDetails: entries.flatMap(entry => entry.selectedCodes.map(code => ({
                    code,
                    name: entry.name,
                    displayedPriceCents: entry.priceCents / entry.selectedCodes.length
                }))),
                displayedAmountCents: totals.totalCents,
                successUrl: `${pageUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${pageUrl}?payment=canceled#summer-camp`,
                ...registrationData
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
    const savedProgram = window.SparkPreneursCart && window.SparkPreneursCart.getProgram('summer-camp');
    if (savedProgram) {
        savedProgram.items.forEach(savedItem => {
            const weekId = String(savedItem.id).match(/^W(\d+)(AM|PM|FULL)$/);
            const week = weekId && getWeek(weekId[1]);
            if (week && !week.closed) selectedItems.set(week.id, makeSessionItem(week, weekId[2]));
        });
    }
    syncCards();
    renderCart();
    verifyReturnedPayment();
    checkBackendReady();
});
