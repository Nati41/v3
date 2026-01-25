(function() {
    'use strict';

    function init() {
        // Disabled - app works in both portrait and landscape
        const overlay = document.getElementById('mobilefill-rotate-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    window.MobileFillLandscapeGate = { init };
})();
