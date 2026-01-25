/**
 * field-navigator.js
 * Provides Previous/Next navigation between fields.
 * Shows current field counter (e.g., "3 / 12").
 */
(function() {
    'use strict';

    let navBarEl = null;
    let prevBtn = null;
    let nextBtn = null;
    let counterEl = null;

    let fields = [];
    let currentIndex = -1;

    function init() {
        if (!window.MobileFillEventBus) {
            console.warn('[MobileFill] EventBus missing; field navigator disabled');
            return;
        }

        navBarEl = document.getElementById('mobilefill-nav-bar');
        prevBtn = document.getElementById('mobilefill-prev-field');
        nextBtn = document.getElementById('mobilefill-next-field');
        counterEl = document.getElementById('mobilefill-field-counter');

        if (!navBarEl) {
            console.warn('[MobileFill] Nav bar elements not found');
            return;
        }

        // Button listeners
        if (prevBtn) {
            prevBtn.addEventListener('click', goToPrevious);
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', goToNext);
        }

        // Listen for mapping ready to get fields
        window.MobileFillEventBus.on('MAPPING_READY', handleMappingReady);

        // Listen for hotspot clicks to update current index
        window.MobileFillEventBus.on('FIELD_FOCUSED', handleFieldFocused);

        // Listen for field updates
        window.MobileFillEventBus.on('FIELD_UPDATED', handleFieldUpdated);

        // Hide nav bar initially
        hideNavBar();

        console.log('[MobileFill] Field navigator initialized');
    }

    function handleMappingReady(payload) {
        const mapping = payload?.fieldsMapping;
        if (!mapping || !Array.isArray(mapping.fields)) {
            fields = [];
            hideNavBar();
            return;
        }

        // Filter to text fields only (skip checkboxes for navigation)
        fields = mapping.fields.filter(f => {
            const type = (f.type || 'text').toLowerCase();
            return type === 'text' || type === 'number' || type === 'date';
        });

        if (fields.length > 0) {
            currentIndex = 0;
            showNavBar();
            updateCounter();
        } else {
            hideNavBar();
        }
    }

    function handleFieldFocused(payload) {
        const fieldId = payload?.fieldId;
        if (!fieldId) return;

        const index = fields.findIndex(f => (f.id || f.fieldId) === fieldId);
        if (index !== -1) {
            currentIndex = index;
            updateCounter();
        }
    }

    function handleFieldUpdated(payload) {
        // After field update, we might want to auto-advance
        // For now, just update the counter
        updateCounter();
    }

    function goToPrevious() {
        if (fields.length === 0) return;

        currentIndex--;
        if (currentIndex < 0) {
            currentIndex = fields.length - 1; // Wrap around
        }

        focusField(currentIndex);
    }

    function goToNext() {
        if (fields.length === 0) return;

        currentIndex++;
        if (currentIndex >= fields.length) {
            currentIndex = 0; // Wrap around
        }

        focusField(currentIndex);
    }

    function focusField(index) {
        if (index < 0 || index >= fields.length) return;

        const field = fields[index];
        const fieldId = field.id || field.fieldId;

        updateCounter();

        // Find and click the hotspot
        const hotspot = document.querySelector(`.mobilefill-hotspot[data-field-id="${fieldId}"]`);
        if (hotspot) {
            // Scroll into view
            hotspot.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Trigger click after scroll
            setTimeout(() => {
                hotspot.click();
            }, 300);
        }

        // Emit event
        window.MobileFillEventBus.emit('FIELD_FOCUSED', { fieldId, index });
    }

    function updateCounter() {
        if (!counterEl) return;

        if (fields.length === 0) {
            counterEl.textContent = '0 / 0';
        } else {
            counterEl.textContent = `${currentIndex + 1} / ${fields.length}`;
        }

        // Update button states
        if (prevBtn) {
            prevBtn.disabled = fields.length <= 1;
        }
        if (nextBtn) {
            nextBtn.disabled = fields.length <= 1;
        }
    }

    function showNavBar() {
        if (navBarEl) {
            navBarEl.classList.remove('is-hidden');
        }
    }

    function hideNavBar() {
        if (navBarEl) {
            navBarEl.classList.add('is-hidden');
        }
    }

    function getCurrentField() {
        if (currentIndex >= 0 && currentIndex < fields.length) {
            return fields[currentIndex];
        }
        return null;
    }

    window.MobileFillFieldNavigator = {
        init,
        goToPrevious,
        goToNext,
        getCurrentField,
        showNavBar,
        hideNavBar
    };
})();
