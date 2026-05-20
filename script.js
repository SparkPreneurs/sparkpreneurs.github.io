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

// Smooth Scrolling for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Header Background on Scroll
window.addEventListener('scroll', function() {
    const header = document.querySelector('.header');
    if (window.scrollY > 100) {
        header.style.background = 'rgba(255, 255, 255, 0.98)';
        header.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.1)';
    } else {
        header.style.background = 'rgba(255, 255, 255, 0.95)';
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
            "So exciting! We can't wait to meet your little creator!",
            "Amazing choice! Your child's creativity journey begins here!",
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
                font-family: 'Fredoka', cursive;
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
                    font-family: 'Fredoka', cursive;
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
            // Scroll to programs or contact section
            const programsSection = document.getElementById('programs');
            if (programsSection) {
                programsSection.scrollIntoView({ behavior: 'smooth' });
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
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            flex-direction: column;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            transform: translateY(-100%);
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
            border-radius: 0 0 20px 20px;
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

    if (!summerShop) {
        return;
    }

    const addButtons = summerShop.querySelectorAll('[data-add-week]');
    const cards = summerShop.querySelectorAll('.summer-week-card');
    const cartList = summerShop.querySelector('[data-summer-cart-list]');
    const purchaseButton = summerShop.querySelector('[data-summer-cart-purchase]');
    const clearButton = summerShop.querySelector('[data-summer-cart-clear]');
    const totalsPanel = summerShop.querySelector('[data-summer-cart-totals]');
    const regularTotalEl = summerShop.querySelector('[data-summer-regular-total]');
    const discountRow = summerShop.querySelector('[data-summer-discount-row]');
    const discountTotalEl = summerShop.querySelector('[data-summer-discount-total]');
    const subtotalEl = summerShop.querySelector('[data-summer-subtotal]');
    const hstEl = summerShop.querySelector('[data-summer-hst]');
    const grandTotalEl = summerShop.querySelector('[data-summer-grand-total]');
    const purchaseEmail = summerShop.dataset.purchaseEmail || 'info@sparkpreneurs.ca';
    const selectedWeeks = new Map();
    const HST_RATE = 0.13;
    const FOUR_WEEK_BUNDLE = 1200;
    const EIGHT_WEEK_BUNDLE = 2400;

    function formatMoney(amount) {
        return amount.toLocaleString('en-CA', {
            style: 'currency',
            currency: 'CAD'
        });
    }

    function calculateTotals(entries) {
        const sortedEntries = [...entries].sort((a, b) => b.price - a.price);
        const regularTotal = sortedEntries.reduce((total, entry) => total + entry.price, 0);
        let subtotal = regularTotal;

        if (sortedEntries.length === 8) {
            subtotal = EIGHT_WEEK_BUNDLE;
        } else if (sortedEntries.length >= 4) {
            const extraWeeks = sortedEntries.slice(4);
            subtotal = FOUR_WEEK_BUNDLE + extraWeeks.reduce((total, entry) => total + entry.price, 0);
        }

        const discount = regularTotal - subtotal;
        const hst = subtotal * HST_RATE;
        const total = subtotal + hst;

        return {
            regularTotal,
            discount,
            subtotal,
            hst,
            total
        };
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
            item.innerHTML = `
                <span class="summer-cart-item-name">${entry.name} - ${formatMoney(entry.price)}</span>
                <button class="summer-cart-remove" type="button" data-remove-week="${entry.id}">Remove</button>
            `;
            cartList.appendChild(item);
        });

        totalsPanel.hidden = false;
        regularTotalEl.textContent = formatMoney(totals.regularTotal);
        discountRow.hidden = totals.discount <= 0;
        discountTotalEl.textContent = `-${formatMoney(totals.discount)}`;
        subtotalEl.textContent = formatMoney(totals.subtotal);
        hstEl.textContent = formatMoney(totals.hst);
        grandTotalEl.textContent = formatMoney(totals.total);
        purchaseButton.disabled = false;
    }

    function addWeek(weekId) {
        const card = summerShop.querySelector(`.summer-week-card[data-week-id="${weekId}"]`);

        if (!card || selectedWeeks.has(weekId)) {
            return;
        }

        selectedWeeks.set(weekId, {
            id: weekId,
            name: card.dataset.weekName || `Week ${weekId}`,
            price: Number(card.dataset.weekPrice || 0)
        });

        syncButtons();
        renderCart();
    }

    function removeWeek(weekId) {
        selectedWeeks.delete(weekId);
        syncButtons();
        renderCart();
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
        syncButtons();
        renderCart();
    });

    purchaseButton?.addEventListener('click', function() {
        if (!selectedWeeks.size) {
            return;
        }

        const weekList = Array.from(selectedWeeks.values()).map(entry => entry.name).join(', ');
        const totals = calculateTotals(Array.from(selectedWeeks.values()));
        const subject = 'Summer Camp Purchase Request';
        const body = encodeURIComponent(
            `Hello SparkPreneurs,\n\nI would like to purchase the following summer camp weeks:\n${weekList}\n\nSubtotal: ${formatMoney(totals.subtotal)}\nHST 13%: ${formatMoney(totals.hst)}\nTotal: ${formatMoney(totals.total)}\n\nPlease contact me with the next payment step.\n\nThank you.`
        );

        window.location.href = `mailto:${purchaseEmail}?subject=${encodeURIComponent(subject)}&body=${body}`;
    });

    syncButtons();
    renderCart();
});

