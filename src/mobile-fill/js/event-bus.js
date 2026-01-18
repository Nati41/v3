(function() {
    'use strict';

    const listeners = new Map();

    function on(eventName, handler) {
        if (!listeners.has(eventName)) {
            listeners.set(eventName, new Set());
        }

        const handlers = listeners.get(eventName);
        handlers.add(handler);

        return function unsubscribe() {
            handlers.delete(handler);
            if (handlers.size === 0) {
                listeners.delete(eventName);
            }
        };
    }

    function emit(eventName, payload) {
        const handlers = listeners.get(eventName);
        if (!handlers || handlers.size === 0) return;

        handlers.forEach((handler) => {
            handler(payload);
        });
    }

    window.MobileFillEventBus = {
        emit,
        on
    };
})();
