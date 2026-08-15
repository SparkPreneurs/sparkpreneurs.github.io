(function () {
    'use strict';
    if (window.SparkPreneursCart) return;

    const STORAGE_KEY = 'sparkpreneurs-shared-cart-v1';
    const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxo9bBZQjKLQL8XpzDQResSAWkmGIQVYbmFb0Djoj_y-LfdhDoDIhqpkZLO40kdTzMH/exec';
    const CHECKOUT_PROGRAM_CODE = 'summer_2026_unified_cart_checkout';
    const PROGRAM_CONFIG = {
        'summer-camp': { programCode: 'summer2026_4_10_sessions', title: 'Summer Camp' },
        'hand-building-pottery': { programCode: 'adult_hand_building_pottery', title: 'Hand-Building Pottery' }
    };
    const REQUIRED_PROGRAM_CODES = Object.values(PROGRAM_CONFIG).map(program => program.programCode);
    const registrationDrafts = {};
    let backendReady = false;
    let backendMode = '';
    let backendCheckPromise = null;
    let isSubmitting = false;
    let currentStatus = { message: '', type: '' };

    function readCart() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
            const cart = saved && Array.isArray(saved.programs) ? saved : { programs: [] };
            const programs = cart.programs.filter(program => PROGRAM_CONFIG[program.id]);
            if (programs.length !== cart.programs.length) {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ programs }));
            }
            return { programs };
        } catch (error) {
            return { programs: [] };
        }
    }

    function writeCart(cart) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
        window.dispatchEvent(new CustomEvent('sparkpreneurs-cart-updated', { detail: cart }));
    }

    function formatMoney(cents) {
        return (cents / 100).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
    }

    function itemCount(cart) {
        return cart.programs.reduce((count, program) => count + program.items.length, 0);
    }

    function calculateTotals(cart) {
        const subtotalCents = cart.programs.reduce((programTotal, program) => programTotal + program.items.reduce((itemTotal, item) => itemTotal + (Number(item.priceCents) || 0), 0), 0);
        const taxCents = Math.round(subtotalCents * 0.13);
        return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
    }

    function captureRegistrationDrafts() {
        document.querySelectorAll('[data-shared-cart-registration]').forEach(form => {
            const values = new FormData(form);
            registrationDrafts[form.dataset.programId] = {
                studentName: String(values.get('studentName') || ''),
                parentName: String(values.get('parentName') || ''),
                parentEmail: String(values.get('parentEmail') || ''),
                phone: String(values.get('phone') || '')
            };
        });
    }

    function makeField(form, programId, name, label, type, autocomplete) {
        const wrapper = document.createElement('label');
        const labelText = document.createElement('span');
        const input = document.createElement('input');
        labelText.textContent = label;
        input.type = type;
        input.name = name;
        input.id = `shared-cart-${programId}-${name}`;
        input.autocomplete = autocomplete;
        input.required = true;
        input.value = registrationDrafts[programId] ? registrationDrafts[programId][name] || '' : '';
        wrapper.htmlFor = input.id;
        wrapper.append(labelText, input);
        form.appendChild(wrapper);
    }

    function makeProgramGroup(program) {
        const group = document.createElement('li');
        const heading = document.createElement('h3');
        const items = document.createElement('ul');
        const form = document.createElement('form');
        group.className = 'shared-cart-program';
        heading.textContent = program.title;

        program.items.forEach(item => {
            const row = document.createElement('li');
            const name = document.createElement('span');
            const price = document.createElement('strong');
            const remove = document.createElement('button');
            row.className = 'shared-cart-item';
            name.textContent = item.name;
            price.textContent = formatMoney(Number(item.priceCents) || 0);
            remove.type = 'button';
            remove.className = 'shared-cart-remove';
            remove.dataset.sharedCartProgram = program.id;
            remove.dataset.sharedCartItem = item.id;
            remove.setAttribute('aria-label', `Remove ${item.name}`);
            remove.textContent = 'Remove';
            row.append(name, price, remove);
            items.appendChild(row);
        });

        form.className = 'shared-cart-registration';
        form.dataset.sharedCartRegistration = 'true';
        form.dataset.programId = program.id;
        form.noValidate = false;
        const formHeading = document.createElement('h4');
        formHeading.textContent = `Registration information for ${program.title}`;
        form.appendChild(formHeading);
        makeField(form, program.id, 'studentName', program.id === 'hand-building-pottery' ? 'Participant name' : 'Student name', 'text', 'name');
        makeField(form, program.id, 'parentName', 'Parent or contact name', 'text', 'name');
        makeField(form, program.id, 'parentEmail', 'Email', 'email', 'email');
        makeField(form, program.id, 'phone', 'Phone', 'tel', 'tel');
        group.append(heading, items, form);
        return group;
    }

    function render() {
        captureRegistrationDrafts();
        const cart = readCart();
        const count = itemCount(cart);
        const totals = calculateTotals(cart);
        const badge = document.querySelector('[data-shared-cart-count]');
        const list = document.querySelector('[data-shared-cart-list]');
        const empty = document.querySelector('[data-shared-cart-empty]');
        const totalsPanel = document.querySelector('[data-shared-cart-totals]');
        const checkout = document.querySelector('[data-shared-cart-checkout]');
        if (!badge || !list || !empty || !totalsPanel || !checkout) return;

        badge.textContent = count;
        badge.hidden = count === 0;
        list.innerHTML = '';
        empty.hidden = count !== 0;
        cart.programs.forEach(program => list.appendChild(makeProgramGroup(program)));
        totalsPanel.hidden = count === 0;
        document.querySelector('[data-shared-cart-subtotal]').textContent = formatMoney(totals.subtotalCents);
        document.querySelector('[data-shared-cart-tax]').textContent = formatMoney(totals.taxCents);
        document.querySelector('[data-shared-cart-total]').textContent = formatMoney(totals.totalCents);
        checkout.hidden = count === 0;
        checkout.disabled = count === 0 || isSubmitting || !backendReady;
        checkout.textContent = isSubmitting ? 'Opening Secure Payment…' : 'Continue to Secure Payment';
        setStatus(currentStatus.message, currentStatus.type, false);
    }

    function setStatus(message, type, remember = true) {
        if (remember) currentStatus = { message: message || '', type: type || '' };
        const status = document.querySelector('[data-shared-cart-status]');
        if (!status) return;
        status.textContent = message || '';
        status.dataset.status = type || '';
    }

    function setProgram(program) {
        const cart = readCart();
        const cleanProgram = {
            id: String(program.id),
            title: String(program.title),
            checkoutUrl: String(program.checkoutUrl || ''),
            items: (program.items || []).map(item => ({ id: String(item.id), name: String(item.name), priceCents: Number(item.priceCents) || 0 }))
        };
        if (!PROGRAM_CONFIG[cleanProgram.id]) return;
        const previous = cart.programs.find(entry => entry.id === cleanProgram.id);
        cart.programs = cart.programs.filter(entry => entry.id !== cleanProgram.id);
        if (cleanProgram.items.length) cart.programs.push(cleanProgram);
        if (JSON.stringify(previous || null) === JSON.stringify(cleanProgram.items.length ? cleanProgram : null)) {
            render();
            return;
        }
        writeCart(cart);
        render();
        const button = document.querySelector('[data-shared-cart-open]');
        if (button && cleanProgram.items.length) {
            button.classList.remove('is-bumping');
            void button.offsetWidth;
            button.classList.add('is-bumping');
        }
    }

    function getProgram(id) {
        return readCart().programs.find(program => program.id === id) || null;
    }

    function removeItem(programId, itemId) {
        const cart = readCart();
        cart.programs = cart.programs.map(program => program.id === programId
            ? { ...program, items: program.items.filter(item => item.id !== itemId) }
            : program).filter(program => program.items.length);
        writeCart(cart);
        window.dispatchEvent(new CustomEvent('sparkpreneurs-cart-item-removed', { detail: { programId, itemId } }));
        render();
    }

    async function postToBackend(payload) {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || result.success === false) throw new Error(result.error || 'The checkout service could not complete this request.');
        return result;
    }

    async function checkBackendReady() {
        if (backendCheckPromise) return backendCheckPromise;
        backendCheckPromise = (async function () {
            try {
                const response = await fetch(BACKEND_URL);
                const result = await response.json();
                backendReady = Boolean(result.success && result.programCode === CHECKOUT_PROGRAM_CODE && REQUIRED_PROGRAM_CODES.every(code => result.programs.includes(code)));
                backendMode = result.stripeMode || '';
                if (!backendReady) setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', 'error');
            } catch (error) {
                backendReady = false;
                setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', 'error');
            }
            render();
            return backendReady;
        }());
        return backendCheckPromise;
    }

    function collectRegistrations(cart) {
        const registrations = {};
        for (const program of cart.programs) {
            const form = document.querySelector(`[data-shared-cart-registration][data-program-id="${program.id}"]`);
            if (!form || !form.reportValidity()) return null;
            const values = new FormData(form);
            registrations[PROGRAM_CONFIG[program.id].programCode] = {
                studentName: String(values.get('studentName') || '').trim(),
                parentName: String(values.get('parentName') || '').trim(),
                parentEmail: String(values.get('parentEmail') || '').trim(),
                phone: String(values.get('phone') || '').trim()
            };
        }
        return registrations;
    }

    async function beginCheckout() {
        const cart = readCart();
        if (!itemCount(cart)) return;
        if (!await checkBackendReady()) return;
        const registrations = collectRegistrations(cart);
        if (!registrations) {
            setStatus('Please complete the registration information for every selected program.', 'error');
            return;
        }

        const totals = calculateTotals(cart);
        const items = cart.programs.flatMap(program => program.items.map(item => ({
            programCode: PROGRAM_CONFIG[program.id].programCode,
            itemCode: item.id
        })));
        isSubmitting = true;
        setStatus('Checking availability and the secure total…', 'pending');
        render();

        try {
            const returnUrl = 'https://sparkpreneurs.ca/';
            const result = await postToBackend({
                action: 'createCheckoutSession',
                programCode: CHECKOUT_PROGRAM_CODE,
                items,
                registrations,
                displayedAmountCents: totals.totalCents,
                successUrl: `${returnUrl}?cart_payment=success`,
                cancelUrl: `${returnUrl}?cart_payment=canceled`
            });
            const checkoutUrl = new URL(result.checkoutUrl);
            if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') throw new Error('Stripe returned an invalid payment link.');
            window.location.href = result.checkoutUrl;
        } catch (error) {
            isSubmitting = false;
            setStatus(error.message || 'Secure payment could not be opened. Please try again.', 'error');
            render();
        }
    }

    function showCart() {
        const drawer = document.querySelector('[data-shared-cart-drawer]');
        if (!drawer) return;
        drawer.hidden = false;
        document.body.classList.add('shared-cart-open');
        document.getElementById('nav-menu')?.classList.remove('active');
        document.getElementById('hamburger')?.classList.remove('active');
        render();
        checkBackendReady();
        document.querySelector('[data-shared-cart-close]')?.focus();
    }

    function hideCart() {
        document.querySelector('[data-shared-cart-drawer]').hidden = true;
        document.body.classList.remove('shared-cart-open');
        document.querySelector('[data-shared-cart-open]')?.focus();
    }

    async function handleCheckoutReturn() {
        const params = new URLSearchParams(window.location.search);
        const payment = params.get('cart_payment');
        if (!payment) return;
        showCart();

        if (payment === 'canceled') {
            setStatus('Payment was canceled. Your selections are still in the cart.', 'warning');
            cleanCheckoutQuery();
            return;
        }

        const sessionId = params.get('session_id');
        if (payment !== 'success' || !sessionId) {
            setStatus('The payment return information is incomplete. Please contact SparkPreneurs.', 'error');
            return;
        }

        setStatus('Verifying the payment with Stripe…', 'pending');
        try {
            const result = await postToBackend({ action: 'verifyCheckoutSession', stripeSessionId: sessionId });
            if (!result.paid || result.paymentStatus !== 'paid') throw new Error('Stripe has not confirmed this payment yet.');
            writeCart({ programs: [] });
            Object.keys(registrationDrafts).forEach(key => delete registrationDrafts[key]);
            render();
            setStatus('Payment confirmed. Each registration was sent to its matching program spreadsheet.', 'success');
        } catch (error) {
            setStatus(error.message || 'Payment could not be verified automatically. Please contact SparkPreneurs.', 'error');
        }
        cleanCheckoutQuery();
    }

    function cleanCheckoutQuery() {
        const url = new URL(window.location.href);
        url.searchParams.delete('cart_payment');
        url.searchParams.delete('session_id');
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }

    window.SparkPreneursCart = { setProgram, getProgram, showCart };

    function initializeCart() {
        if (document.querySelector('[data-shared-cart-open]')) return;
        const navItem = document.createElement('button');
        navItem.type = 'button';
        navItem.dataset.sharedCartOpen = '';
        navItem.className = 'shared-cart-button';
        navItem.setAttribute('aria-label', 'Open cart');
        navItem.innerHTML = `
            <span>
                <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H7M10 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm9 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>
                <span>Cart</span><span class="shared-cart-count" data-shared-cart-count hidden>0</span>
            </span>`;
        const nav = document.querySelector('.nav');
        const hamburger = document.getElementById('hamburger');
        if (nav && hamburger) nav.insertBefore(navItem, hamburger);
        else if (nav) nav.appendChild(navItem);
        else document.body.appendChild(navItem);

        const shell = document.createElement('div');
        shell.innerHTML = `
            <section class="shared-cart-drawer" data-shared-cart-drawer hidden aria-label="Your cart" role="dialog" aria-modal="true">
                <div class="shared-cart-panel">
                    <div class="shared-cart-heading"><h2>Your Cart</h2><button type="button" data-shared-cart-close aria-label="Close cart">×</button></div>
                    <p class="shared-cart-intro">Add programs while you browse, then register and pay for everything together here.</p>
                    <p data-shared-cart-empty>Your cart is empty.</p>
                    <ul class="shared-cart-list" data-shared-cart-list></ul>
                    <div class="shared-cart-totals" data-shared-cart-totals hidden>
                        <p><span>Subtotal</span><strong data-shared-cart-subtotal>$0.00</strong></p>
                        <p><span>HST 13%</span><strong data-shared-cart-tax>$0.00</strong></p>
                        <p class="shared-cart-grand-total"><span>Total</span><strong data-shared-cart-total>$0.00</strong></p>
                    </div>
                    <p class="shared-cart-status" data-shared-cart-status role="status" aria-live="polite"></p>
                    <button class="shared-cart-checkout" type="button" data-shared-cart-checkout hidden disabled>Continue to Secure Payment</button>
                    <p class="shared-cart-security-note">Prices and availability are checked securely before Stripe opens. Registration is confirmed only after Stripe verifies payment.</p>
                </div>
            </section>`;
        document.body.appendChild(shell);
        document.querySelector('[data-shared-cart-open]').addEventListener('click', showCart);
        document.querySelector('[data-shared-cart-close]').addEventListener('click', hideCart);
        document.querySelector('[data-shared-cart-checkout]').addEventListener('click', beginCheckout);
        document.querySelector('[data-shared-cart-drawer]').addEventListener('click', function (event) {
            if (event.target === this) hideCart();
            const remove = event.target.closest('[data-shared-cart-item]');
            if (remove) removeItem(remove.dataset.sharedCartProgram, remove.dataset.sharedCartItem);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !document.querySelector('[data-shared-cart-drawer]').hidden) hideCart();
        });
        window.addEventListener('sparkpreneurs-cart-updated', render);
        render();
        checkBackendReady();
        handleCheckoutReturn();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeCart);
    else initializeCart();
}());
