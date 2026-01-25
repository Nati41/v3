(function() {
    'use strict';

    function init() {
        const overlay = document.getElementById('mobilefill-rotate-overlay');
        if (!overlay) return;

        function checkOrientation() {
            const isLandscape = window.innerWidth > window.innerHeight;
            overlay.style.display = isLandscape ? 'flex' : 'none';
        }

        // Check on load
        checkOrientation();

        // Check on resize/orientation change
        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);
    }

    window.MobileFillLandscapeGate = { init };
})();
