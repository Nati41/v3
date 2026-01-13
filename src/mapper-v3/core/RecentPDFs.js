/**
 * RecentPDFs.js
 * V3.9: IndexedDB manager for recent PDF files
 *
 * Stores ACTUAL PDF files (not just metadata) so they can be reloaded.
 * Uses IndexedDB for binary storage (localStorage can't store files).
 */

const RecentPDFs = (function() {
    'use strict';

    const DB_NAME = 'MapperV3_RecentPDFs';
    const DB_VERSION = 1;
    const STORE_NAME = 'pdfs';
    const MAX_RECENT = 5; // Keep last 5 PDFs (they're large!)

    let db = null;

    /**
     * Initialize IndexedDB
     */
    async function init() {
        if (db) return db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('[RecentPDFs] IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                console.log('[RecentPDFs] IndexedDB ready');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Create object store with name as key
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: 'name' });
                    store.createIndex('lastOpened', 'lastOpened', { unique: false });
                    console.log('[RecentPDFs] Created object store');
                }
            };
        });
    }

    /**
     * Get all recent PDFs (metadata only, sorted by lastOpened)
     * @returns {Promise<Array>}
     */
    async function getAll() {
        try {
            await init();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.getAll();

                request.onsuccess = () => {
                    // Sort by lastOpened (most recent first) and strip binary data
                    const results = request.result
                        .sort((a, b) => b.lastOpened - a.lastOpened)
                        .map(item => ({
                            name: item.name,
                            lastOpened: item.lastOpened,
                            pageCount: item.pageCount,
                            thumbnail: item.thumbnail,
                            hasData: !!item.data // Indicate if we have the actual PDF
                        }));
                    resolve(results);
                };

                request.onerror = () => {
                    console.error('[RecentPDFs] getAll error:', request.error);
                    resolve([]);
                };
            });
        } catch (e) {
            console.warn('[RecentPDFs] getAll failed:', e);
            return [];
        }
    }

    /**
     * Add or update a PDF in storage
     * @param {string} name - PDF filename
     * @param {ArrayBuffer} data - PDF binary data
     * @param {number} pageCount - Number of pages
     * @param {string} [thumbnail] - Optional base64 thumbnail
     */
    async function add(name, data, pageCount, thumbnail) {
        if (!name || !data) return;

        try {
            await init();

            // First, check how many we have and remove old ones if needed
            const all = await getAll();
            if (all.length >= MAX_RECENT) {
                // Remove oldest entries
                const toRemove = all.slice(MAX_RECENT - 1);
                for (const item of toRemove) {
                    await remove(item.name);
                }
            }

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);

                const entry = {
                    name: name,
                    data: data, // The actual PDF ArrayBuffer!
                    lastOpened: Date.now(),
                    pageCount: pageCount || 1,
                    thumbnail: thumbnail || null
                };

                const request = store.put(entry);

                request.onsuccess = () => {
                    console.log(`[RecentPDFs] Saved: ${name} (${(data.byteLength / 1024 / 1024).toFixed(2)} MB)`);
                    resolve();
                };

                request.onerror = () => {
                    console.error('[RecentPDFs] add error:', request.error);
                    reject(request.error);
                };
            });
        } catch (e) {
            console.warn('[RecentPDFs] add failed:', e);
        }
    }

    /**
     * Get a PDF's data by name
     * @param {string} name - PDF filename
     * @returns {Promise<{name, data, pageCount, thumbnail}|null>}
     */
    async function get(name) {
        if (!name) return null;

        try {
            await init();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(name);

                request.onsuccess = () => {
                    if (request.result) {
                        // Update lastOpened timestamp
                        updateLastOpened(name);
                        resolve(request.result);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = () => {
                    console.error('[RecentPDFs] get error:', request.error);
                    resolve(null);
                };
            });
        } catch (e) {
            console.warn('[RecentPDFs] get failed:', e);
            return null;
        }
    }

    /**
     * Update lastOpened timestamp for a PDF
     */
    async function updateLastOpened(name) {
        try {
            await init();

            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const getRequest = store.get(name);

            getRequest.onsuccess = () => {
                if (getRequest.result) {
                    const entry = getRequest.result;
                    entry.lastOpened = Date.now();
                    store.put(entry);
                }
            };
        } catch (e) {
            // Silently fail - not critical
        }
    }

    /**
     * Remove a PDF from storage
     * @param {string} name - PDF filename to remove
     */
    async function remove(name) {
        if (!name) return;

        try {
            await init();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(name);

                request.onsuccess = () => {
                    console.log(`[RecentPDFs] Removed: ${name}`);
                    resolve();
                };

                request.onerror = () => {
                    console.error('[RecentPDFs] remove error:', request.error);
                    reject(request.error);
                };
            });
        } catch (e) {
            console.warn('[RecentPDFs] remove failed:', e);
        }
    }

    /**
     * Clear all recent PDFs
     */
    async function clear() {
        try {
            await init();

            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.clear();

                request.onsuccess = () => {
                    console.log('[RecentPDFs] Cleared all');
                    resolve();
                };

                request.onerror = () => {
                    console.error('[RecentPDFs] clear error:', request.error);
                    reject(request.error);
                };
            });
        } catch (e) {
            console.warn('[RecentPDFs] clear failed:', e);
        }
    }

    /**
     * Check if there are any recent PDFs
     * @returns {Promise<boolean>}
     */
    async function hasRecent() {
        const all = await getAll();
        return all.length > 0;
    }

    /**
     * Format lastOpened timestamp for display
     * @param {number} timestamp
     * @returns {string} - Human readable date string in Hebrew
     */
    function formatDate(timestamp) {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'היום';
        } else if (diffDays === 1) {
            return 'אתמול';
        } else if (diffDays < 7) {
            return `לפני ${diffDays} ימים`;
        } else {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    }

    /**
     * Generate a thumbnail from PDF first page
     * @param {PDFDocumentProxy} pdfDoc - PDF.js document
     * @returns {Promise<string|null>} - Base64 thumbnail or null
     */
    async function generateThumbnail(pdfDoc) {
        try {
            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 0.2 });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const ctx = canvas.getContext('2d');
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            return canvas.toDataURL('image/jpeg', 0.5);
        } catch (e) {
            console.warn('[RecentPDFs] Failed to generate thumbnail:', e);
            return null;
        }
    }

    // Public API
    return {
        init,
        getAll,
        add,
        get,
        remove,
        clear,
        hasRecent,
        formatDate,
        generateThumbnail
    };

})();

// Export for module systems if available
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RecentPDFs;
}
