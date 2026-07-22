(function () {
    'use strict';
    if (window.SparkPreneursCart) return;

    const STORAGE_KEY = 'sparkpreneurs-shared-cart-v1';

    function readCart() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
            return saved && Array.isArray(saved.programs) ? saved : { programs: [] };
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

    function render() {
        const cart = readCart();
        const count = itemCount(cart);
        const badge = document.querySelector('[data-shared-cart-count]');
        const list = document.querySelector('[data-shared-cart-list]');
        const empty = document.querySelector('[data-shared-cart-empty]');
        const total = document.querySelector('[data-shared-cart-total]');

        if (!badge || !list || !empty || !total) return;
        badge.textContent = count;
        badge.hidden = count === 0;
        list.innerHTML = '';
        empty.hidden = count !== 0;
        let totalCents = 0;

        cart.programs.forEach(program => {
            const group = document.createElement('li');
            group.className = 'shared-cart-program';
            const heading = document.createElement('h3');
            heading.textContent = program.title;
            const items = document.createElement('ul');
            program.items.forEach(item => {
                totalCents += Number(item.priceCents) || 0;
                const row = document.createElement('li');
                row.className = 'shared-cart-item';
                row.innerHTML = `<span>${item.name}</span><strong>${formatMoney(Number(item.priceCents) || 0)}</strong>`;
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'shared-cart-remove';
                remove.dataset.sharedCartProgram = program.id;
                remove.dataset.sharedCartItem = item.id;
                remove.setAttribute('aria-label', `Remove ${item.name}`);
                remove.textContent = 'Remove';
                row.appendChild(remove);
                items.appendChild(row);
            });
            const complete = document.createElement('a');
            complete.className = 'shared-cart-complete';
            complete.href = program.checkoutUrl;
            complete.textContent = `Complete ${program.title} registration`;
            group.append(heading, items, complete);
            list.appendChild(group);
        });
        total.textContent = formatMoney(totalCents);
    }

    function setProgram(program) {
        const cart = readCart();
        const cleanProgram = {
            id: String(program.id), title: String(program.title), checkoutUrl: String(program.checkoutUrl),
            items: (program.items || []).map(item => ({ id: String(item.id), name: String(item.name), priceCents: Number(item.priceCents) || 0 }))
        };
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
        if (button) {
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

    function showCart() {
        document.querySelector('[data-shared-cart-drawer]').hidden = false;
        document.body.classList.add('shared-cart-open');
        render();
    }

    function hideCart() {
        document.querySelector('[data-shared-cart-drawer]').hidden = true;
        document.body.classList.remove('shared-cart-open');
    }

    window.SparkPreneursCart = { setProgram, getProgram, showCart };

    function initializeCart() {
        if (document.querySelector('[data-shared-cart-open]')) return;
        const shell = document.createElement('div');
        shell.innerHTML = `
            <button class="shared-cart-button" type="button" data-shared-cart-open aria-label="Open cart">
                <span aria-hidden="true">🛒</span><span>Cart</span><span class="shared-cart-count" data-shared-cart-count hidden>0</span>
            </button>
            <section class="shared-cart-drawer" data-shared-cart-drawer hidden aria-label="Your cart">
                <div class="shared-cart-panel">
                    <div class="shared-cart-heading"><h2>Your Cart</h2><button type="button" data-shared-cart-close aria-label="Close cart">×</button></div>
                    <p class="shared-cart-intro">Your selections are saved here while you browse. Each program has its own secure registration and payment step.</p>
                    <p data-shared-cart-empty>Your cart is empty.</p>
                    <ul class="shared-cart-list" data-shared-cart-list></ul>
                    <p class="shared-cart-total">Selected items total: <strong data-shared-cart-total>$0.00</strong></p>
                </div>
            </section>`;
        document.body.appendChild(shell);
        document.querySelector('[data-shared-cart-open]').addEventListener('click', showCart);
        document.querySelector('[data-shared-cart-close]').addEventListener('click', hideCart);
        document.querySelector('[data-shared-cart-drawer]').addEventListener('click', function (event) {
            if (event.target === this) hideCart();
            const remove = event.target.closest('[data-shared-cart-item]');
            if (remove) removeItem(remove.dataset.sharedCartProgram, remove.dataset.sharedCartItem);
        });
        window.addEventListener('sparkpreneurs-cart-updated', render);
        render();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCart);
    } else {
        initializeCart();
    }
}());
