(function() {
    'use strict';

    function init() {
        updateOrientation();
        window.addEventListener('resize', updateOrientation);
        window.addEventListener('orientationchange', updateOrientation);
    }

    function updateOrientation() {
        const overlay = document.getElementById('mobilefill-rotate-overlay');
        if (!overlay) return;

        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        overlay.style.display = isLandscape ? 'none' : 'flex';
        document.body.classList.toggle('mobilefill-portrait', !isLandscape);
    }

    window.MobileFillLandscapeGate = { init };
})();
