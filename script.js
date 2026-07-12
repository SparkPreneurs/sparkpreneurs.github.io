// Mobile Navigation Toggle
document.addEventListener('DOMContentLoaded', function() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
        
        // Close menu when clicking on a nav link
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
            });
        });
    }
});

function scrollToSection(target) {
    const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 18;
    window.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
    });
}

// Smooth Scrolling for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const selector = this.getAttribute('href');
        if (!selector || selector === '#') {
            return;
        }

        const target = document.querySelector(selector);
        if (target) {
            e.preventDefault();
            scrollToSection(target);
        }
    });
});

window.addEventListener('load', function() {
    if (!window.location.hash) {
        return;
    }

    const target = document.querySelector(window.location.hash);
    if (target) {
        setTimeout(() => scrollToSection(target), 50);
    }
});

// Header Background on Scroll
window.addEventListener('scroll', function() {
    const header = document.querySelector('.header');
    if (window.scrollY > 100) {
        header.style.background = 'rgba(234, 219, 200, 0.98)';
        header.style.boxShadow = '0 8px 28px rgba(41, 35, 31, 0.08)';
    } else {
        header.style.background = 'rgba(234, 219, 200, 0.94)';
        header.style.boxShadow = 'none';
    }
});

// Button Click Animations with Sparkle Effect
document.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', function(e) {
        // Create sparkle effect for fun buttons
        const sparkle = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        sparkle.style.width = sparkle.style.height = size + 'px';
        sparkle.style.left = x + 'px';
        sparkle.style.top = y + 'px';
        sparkle.classList.add('sparkle');
        
        this.appendChild(sparkle);
        
        setTimeout(() => {
            sparkle.remove();
        }, 600);
    });
});

// Intersection Observer for Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe elements for animation
document.addEventListener('DOMContentLoaded', function() {
    const animatedElements = document.querySelectorAll('.about-card, .program-card, .party-feature, .benefit');
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
});

function setupClickableProgramCards(scope, options = {}) {
    const cards = scope.querySelectorAll('[data-card-link]');
    const programSelect = options.programSelect || null;

    cards.forEach((card) => {
        const navigate = () => {
            const href = card.dataset.cardLink;
            if (!href) {
                return;
            }

            if (card.dataset.interestProgram && programSelect) {
                programSelect.value = card.dataset.interestProgram;
            }

            window.location.href = href;
        };

        card.addEventListener('click', (event) => {
            if (event.target.closest('a, button, input, select, textarea, label')) {
                return;
            }
            navigate();
        });

        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate();
            }
        });
    });
}

function setupInterestForm(scope) {
    const interestForm = scope.querySelector('[data-interest-form]');
    const successMessage = scope.querySelector('[data-interest-form-success]');
    const programSelect = scope.querySelector('[data-interest-program-select]');
    const interestLinks = scope.querySelectorAll('[data-interest-program]');

    if (!interestForm || !successMessage || !programSelect) {
        return { programSelect: null };
    }

    interestLinks.forEach((link) => {
        link.addEventListener('click', () => {
            programSelect.value = link.dataset.interestProgram || '';
        });
    });

    interestForm.addEventListener('submit', (event) => {
        event.preventDefault();

        if (!interestForm.reportValidity()) {
            return;
        }

        interestForm.reset();
        successMessage.hidden = false;
    });

    return { programSelect };
}

document.addEventListener('DOMContentLoaded', function() {
    const page = document.body?.dataset.page;

    if (page !== 'adult-art-studio') {
        return;
    }

    const formSetup = setupInterestForm(document);
    setupClickableProgramCards(document, { programSelect: formSetup.programSelect });
});

// Fun Emoji Reactions on Hover
document.addEventListener('DOMContentLoaded', function() {
    const programCards = document.querySelectorAll('.program-card');
    
    programCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            const icon = this.querySelector('.program-icon');
            icon.style.transform = 'scale(1.2) rotate(10deg)';
            icon.style.transition = 'transform 0.3s ease';
        });
        
        card.addEventListener('mouseleave', function() {
            const icon = this.querySelector('.program-icon');
            icon.style.transform = 'scale(1) rotate(0deg)';
        });
    });
});

// Handle CTA Button Clicks with Fun Messages
document.querySelectorAll('.btn-primary, .cta-button').forEach(button => {
    button.addEventListener('click', function() {
        const messages = [
            "Awesome! Let's get this creative adventure started!",
            "So exciting! We can't wait to meet another creative guest!",
            "Amazing choice! Your creativity journey begins here!",
            "Fantastic! Time to spark some serious creativity!"
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        
        // Create a fun popup or alert
        const popup = document.createElement('div');
        popup.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #8B5CF6, #F97316);
                color: white;
                padding: 24px 32px;
                border-radius: 20px;
                font-family: 'Lora', Georgia, serif;
                font-size: 18px;
                font-weight: 600;
                z-index: 10000;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                text-align: center;
                max-width: 400px;
            ">
                ${randomMessage}<br><br>
                <div style="font-size: 14px; opacity: 0.9;">
                    Contact us at info@sparkpreneurs.ca or (416)884-1393 to get started!
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: white;
                    color: #8B5CF6;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 15px;
                    margin-top: 16px;
                    cursor: pointer;
                    font-family: 'Lora', Georgia, serif;
                    font-weight: 600;
                ">Got it!</button>
            </div>
        `;
        
        document.body.appendChild(popup);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (popup.parentElement) {
                popup.remove();
            }
        }, 5000);
    });
});

// Handle secondary buttons
document.querySelectorAll('.btn-secondary, .btn-outline').forEach(button => {
    if (button.textContent.includes('Explore') || button.textContent.includes('Visit')) {
        button.addEventListener('click', function() {
            const target = button.textContent.includes('Visit')
                ? document.getElementById('contact')
                : document.getElementById('explore-sparkpreneurs');
            if (target) {
                scrollToSection(target);
            }
        });
    }
});

// Add CSS for sparkle effect and mobile menu
const style = document.createElement('style');
style.textContent = `
    button {
        position: relative;
        overflow: hidden;
    }
    
    .sparkle {
        position: absolute;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 50%, transparent 70%);
        transform: scale(0);
        animation: sparkle-animation 0.6s linear;
        pointer-events: none;
    }
    
    @keyframes sparkle-animation {
        to {
            transform: scale(4);
            opacity: 0;
        }
    }
    
    @media (max-width: 768px) {
        .nav-menu {
            position: absolute;
            top: calc(100% + 8px);
            left: 16px;
            right: 16px;
            background: #f5eadc;
            flex-direction: column;
            padding: 18px;
            box-shadow: 0 20px 55px rgba(70, 55, 40, 0.12);
            transform: translateY(-100%);
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            border: 1px solid rgba(41, 35, 31, 0.14);
            border-radius: 8px;
        }
        
        .nav-menu.active {
            transform: translateY(0);
            opacity: 1;
            visibility: visible;
        }
        
        .hamburger.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }
        
        .hamburger.active span:nth-child(2) {
            opacity: 0;
        }
        
        .hamburger.active span:nth-child(3) {
            transform: rotate(-45deg) translate(7px, -6px);
        }
    }
`;

document.head.appendChild(style);

// Performance optimization: Lazy load images
document.addEventListener('DOMContentLoaded', function() {
    const images = document.querySelectorAll('img[src]');
    
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.classList.add('loaded');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => {
        imageObserver.observe(img);
    });
});

// Add fun hover effects to floating elements
document.addEventListener('DOMContentLoaded', function() {
    const floatingElements = document.querySelectorAll('.float-element');
    
    floatingElements.forEach(element => {
        element.addEventListener('mouseenter', function() {
            this.style.animationPlayState = 'paused';
            this.style.transform = 'scale(1.2) rotate(45deg)';
        });
        
        element.addEventListener('mouseleave', function() {
            this.style.animationPlayState = 'running';
            this.style.transform = '';
        });
    });
});

// Add section reveal animation on scroll
window.addEventListener('scroll', function() {
    const sections = document.querySelectorAll('section');
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        const windowHeight = window.innerHeight;
        const scrollY = window.scrollY;
        
        if (scrollY > (sectionTop - windowHeight + 100)) {
            section.classList.add('section-visible');
        }
    });
});

// Fun party button interaction
document.querySelector('.party-cta')?.addEventListener('click', function() {
    // Create confetti effect
    const colors = ['#8B5CF6', '#F97316', '#FDE047', '#14B8A6'];
    
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.style.cssText = `
                position: fixed;
                width: 10px;
                height: 10px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                top: 50%;
                left: 50%;
                border-radius: 50%;
                pointer-events: none;
                z-index: 10000;
                animation: confetti-fall 2s ease-out forwards;
            `;
            
            document.body.appendChild(confetti);
            
            setTimeout(() => confetti.remove(), 2000);
        }, i * 50);
    }
    
    // Add confetti animation
    if (!document.querySelector('#confetti-style')) {
        const confettiStyle = document.createElement('style');
        confettiStyle.id = 'confetti-style';
        confettiStyle.textContent = `
            @keyframes confetti-fall {
                0% {
                    transform: translate(-50%, -50%) rotate(0deg);
                    opacity: 1;
                }
                100% {
                    transform: translate(${Math.random() * 400 - 200}px, 400px) rotate(720deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(confettiStyle);
    }
    
    // Show party booking message
    alert('Let\'s plan an amazing party! Contact us at info@sparkpreneurs.ca or (416)884-1393 to book your celebration!');
});

document.addEventListener('DOMContentLoaded', function() {
    const summerShop = document.querySelector('.summer-camp-shop');

    if (!summerShop || summerShop.dataset.checkoutMode === 'sessions') {
        return;
    }

    const addButtons = summerShop.querySelectorAll('[data-add-week]');
    const cards = summerShop.querySelectorAll('.summer-week-card');
    const cartList = summerShop.querySelector('[data-summer-cart-list]');
    const registrationForm = summerShop.querySelector('[data-summer-registration-form]');
    const purchaseButton = summerShop.querySelector('[data-summer-cart-purchase]');
    const clearButton = summerShop.querySelector('[data-summer-cart-clear]');
    const statusEl = summerShop.querySelector('[data-summer-cart-status]');
    const totalsPanel = summerShop.querySelector('[data-summer-cart-totals]');
    const regularTotalEl = summerShop.querySelector('[data-summer-regular-total]');
    const discountRow = summerShop.querySelector('[data-summer-discount-row]');
    const discountTotalEl = summerShop.querySelector('[data-summer-discount-total]');
    const subtotalEl = summerShop.querySelector('[data-summer-subtotal]');
    const hstEl = summerShop.querySelector('[data-summer-hst]');
    const grandTotalEl = summerShop.querySelector('[data-summer-grand-total]');
    const appsScriptUrl = summerShop.dataset.appsScriptUrl || '';
    const programCode = summerShop.dataset.programCode || 'summer2026';
    const selectedWeeks = new Map();
    const HST_RATE = 0.13;
    const FOUR_WEEK_BUNDLE_CENTS = 120000;
    const EIGHT_WEEK_BUNDLE_CENTS = 240000;
    let isSubmitting = false;

    function formatMoneyCents(cents) {
        return (cents / 100).toLocaleString('en-CA', {
            style: 'currency',
            currency: 'CAD'
        });
    }

    function calculateTotals(entries) {
        const sortedEntries = [...entries].sort((a, b) => b.priceCents - a.priceCents);
        const regularTotalCents = sortedEntries.reduce((total, entry) => total + entry.priceCents, 0);
        let subtotalCents = regularTotalCents;

        if (sortedEntries.length === 8) {
            subtotalCents = EIGHT_WEEK_BUNDLE_CENTS;
        } else if (sortedEntries.length >= 4) {
            const extraWeeks = sortedEntries.slice(4);
            subtotalCents = FOUR_WEEK_BUNDLE_CENTS + extraWeeks.reduce((total, entry) => total + entry.priceCents, 0);
        }

        const discountCents = regularTotalCents - subtotalCents;
        const hstCents = Math.round(subtotalCents * HST_RATE);
        const totalCents = subtotalCents + hstCents;

        return {
            regularTotalCents,
            discountCents,
            subtotalCents,
            hstCents,
            totalCents
        };
    }

    function setStatus(message, type = '') {
        if (!statusEl) {
            return;
        }

        statusEl.textContent = message;
        statusEl.dataset.status = type;
    }

    function setSubmitting(isLoading) {
        isSubmitting = isLoading;
        purchaseButton.disabled = isLoading || selectedWeeks.size === 0;
        clearButton.disabled = isLoading;
        purchaseButton.textContent = isLoading ? 'Opening Secure Payment...' : 'Continue to Secure Payment';
    }

    function syncButtons() {
        cards.forEach(card => {
            const weekId = card.dataset.weekId;
            const button = card.querySelector('[data-add-week]');
            const isSelected = selectedWeeks.has(weekId);

            card.classList.toggle('is-selected', isSelected);
            button.classList.toggle('is-added', isSelected);
            button.textContent = isSelected ? 'Added' : 'Add to Cart';
        });
    }

    function renderCart() {
        const entries = Array.from(selectedWeeks.values());
        const totals = calculateTotals(entries);

        cartList.innerHTML = '';

        if (!entries.length) {
            cartList.innerHTML = '<li class="summer-cart-empty">No weeks added yet.</li>';
            purchaseButton.disabled = true;
            totalsPanel.hidden = true;
            return;
        }

        entries.forEach(entry => {
            const item = document.createElement('li');
            item.className = 'summer-cart-item';
            const name = document.createElement('span');
            const removeButton = document.createElement('button');

            name.className = 'summer-cart-item-name';
            name.textContent = `${entry.name} - ${formatMoneyCents(entry.priceCents)}`;
            removeButton.className = 'summer-cart-remove';
            removeButton.type = 'button';
            removeButton.dataset.removeWeek = entry.id;
            removeButton.textContent = 'Remove';
            item.append(name, removeButton);
            cartList.appendChild(item);
        });

        totalsPanel.hidden = false;
        regularTotalEl.textContent = formatMoneyCents(totals.regularTotalCents);
        discountRow.hidden = totals.discountCents <= 0;
        discountTotalEl.textContent = `-${formatMoneyCents(totals.discountCents)}`;
        subtotalEl.textContent = formatMoneyCents(totals.subtotalCents);
        hstEl.textContent = formatMoneyCents(totals.hstCents);
        grandTotalEl.textContent = formatMoneyCents(totals.totalCents);
        purchaseButton.disabled = isSubmitting;
    }

    function addWeek(weekId) {
        const card = summerShop.querySelector(`.summer-week-card[data-week-id="${weekId}"]`);

        if (!card || selectedWeeks.has(weekId)) {
            return;
        }

        selectedWeeks.set(weekId, {
            id: weekId,
            code: card.dataset.weekCode || `W${weekId}`,
            name: card.dataset.weekName || `Week ${weekId}`,
            priceCents: Number(card.dataset.weekPriceCents || 0)
        });

        setStatus('');
        syncButtons();
        renderCart();
    }

    function removeWeek(weekId) {
        selectedWeeks.delete(weekId);
        setStatus('');
        syncButtons();
        renderCart();
    }

    function getRegistrationData() {
        if (!registrationForm?.reportValidity()) {
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
            setStatus('Payment was canceled. Please choose your weeks again when you are ready.', 'warning');
            summerShop.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState({}, document.title, `${window.location.pathname}#summer-camp`);
            return;
        }

        if (paymentStatus !== 'success' || !sessionId || !appsScriptUrl) {
            return;
        }

        setStatus('Checking payment status...', 'pending');
        summerShop.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

    addButtons.forEach(button => {
        button.addEventListener('click', function() {
            addWeek(this.dataset.addWeek);
        });
    });

    cartList.addEventListener('click', function(event) {
        const removeButton = event.target.closest('[data-remove-week]');

        if (!removeButton) {
            return;
        }

        removeWeek(removeButton.dataset.removeWeek);
    });

    clearButton?.addEventListener('click', function() {
        selectedWeeks.clear();
        setStatus('');
        syncButtons();
        renderCart();
    });

    purchaseButton?.addEventListener('click', async function() {
        if (!selectedWeeks.size) {
            setStatus('Please choose at least one week first.', 'warning');
            return;
        }

        if (!appsScriptUrl) {
            setStatus('Secure payment is not connected yet. Please contact SparkPreneurs.', 'error');
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

        const entries = Array.from(selectedWeeks.values());
        const totals = calculateTotals(entries);
        const pageUrl = `${window.location.origin}${window.location.pathname}`;

        setSubmitting(true);
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

            setStatus('Opening Stripe Checkout...', 'pending');
            window.location.href = result.checkoutUrl;
        } catch (error) {
            setSubmitting(false);
            setStatus(error.message || 'Payment could not be started. Please try again.', 'error');
        }
    });

    syncButtons();
    renderCart();
    verifyReturnedPayment();
});

