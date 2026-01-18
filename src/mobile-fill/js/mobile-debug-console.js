(function() {
    'use strict';

    const MAX_LINES = 50;
    const logs = [];

    let panel = null;
    let content = null;
    let toggleBtn = null;

    function init() {
        if (panel) return;

        panel = document.createElement('div');
        panel.id = 'mobile-debug-console';
        panel.innerHTML = `
            <div class="mobile-debug-header">
                <span>Debug Console</span>
                <button type="button" class="mobile-debug-toggle">×</button>
            </div>
            <div class="mobile-debug-content"></div>
        `;

        document.body.appendChild(panel);

        content = panel.querySelector('.mobile-debug-content');
        toggleBtn = panel.querySelector('.mobile-debug-toggle');

        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.textContent = panel.classList.contains('collapsed') ? '◂' : '×';
        });

        wrapConsole('log');
        wrapConsole('warn');
        wrapConsole('error');
    }

    function wrapConsole(level) {
        const original = console[level];

        console[level] = function(...args) {
            try {
                appendLine(level, args);
            } catch (err) {
                original.call(console, 'Mobile debug console error', err);
            }

            original.apply(console, args);
        };
    }

    function appendLine(level, args) {
        if (!content) return;

        const message = args.map(formatArg).join(' ');
        const line = document.createElement('div');
        line.className = `mobile-debug-line ${level}`;
        line.textContent = message;

        logs.push(line);
        content.appendChild(line);

        while (logs.length > MAX_LINES) {
            const removed = logs.shift();
            removed.remove();
        }

        content.scrollTop = content.scrollHeight;
    }

    function formatArg(arg) {
        if (typeof arg === 'string') return arg;
        try {
            return JSON.stringify(arg);
        } catch (err) {
            return String(arg);
        }
    }

    window.MobileFillDebugConsole = { init };
})();
