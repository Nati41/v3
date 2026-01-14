/**
 * Name Debug Overlay - Visual debugging for name selection
 *
 * This module provides visual feedback showing what name was selected
 * and why, without modifying any existing scoring/fusion logic.
 *
 * SAFE: This module is purely visual and does not affect any logic.
 */

export class NameDebugOverlay {

    // ============ CONFIGURATION ============
    static DEBUG_MODE = false;  // Set to true to keep overlays visible
    static AUTO_HIDE_DELAY = 1500;  // ms before auto-hiding boxes
    static PANEL_COLLAPSED = true;  // Start collapsed

    // ============ COLOR SCHEME ============
    static COLORS = {
        pdf: '#2196F3',           // Blue for PDF text
        pdf_in_field: '#1976D2',  // Darker blue for PDF in field
        ocr: '#FF9800',           // Orange for OCR
        smart: '#9C27B0',         // Purple for smart scoring
        user: '#4CAF50',          // Green for user capture
        auto: '#607D8B',          // Gray for auto/legacy
        winner: '#00E676',        // Bright green for winner
        fusion: '#00E676'         // Bright green for fusion result
    };

    // ============ STATE ============
    static _candidateBoxes = [];
    static _winnerBox = null;
    static _debugPanel = null;
    static _autoHideTimers = [];

    /**
     * Show a candidate box overlay at the given position
     * @param {Object} canvasBBox - { x, y, width, height } in canvas coordinates
     * @param {string} source - Source type for color selection
     * @param {string} text - Text to display
     * @param {number} score - Optional score to display
     */
    static showCandidateBox(canvasBBox, source, text, score = null) {
        if (!canvasBBox) return;

        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const color = this.COLORS[source] || this.COLORS.auto;

        const box = document.createElement('div');
        box.className = 'name-debug-candidate-box';
        box.style.cssText = `
            position: absolute;
            left: ${canvasBBox.x}px;
            top: ${canvasBBox.y}px;
            width: ${Math.max(canvasBBox.width || 100, 50)}px;
            height: ${Math.max(canvasBBox.height || 20, 16)}px;
            border: 2px dashed ${color};
            background: ${color}20;
            pointer-events: none;
            z-index: 900;
            box-sizing: border-box;
            transition: opacity 0.3s ease;
        `;

        // Label with source and text
        const label = document.createElement('div');
        label.className = 'name-debug-candidate-label';
        label.style.cssText = `
            position: absolute;
            top: -20px;
            left: 0;
            background: ${color};
            color: white;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            white-space: nowrap;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            font-family: Arial, sans-serif;
            direction: rtl;
        `;
        const scoreText = score !== null ? ` (${Math.round(score)})` : '';
        label.textContent = `${source}: ${text}${scoreText}`;

        box.appendChild(label);
        layer.appendChild(box);
        this._candidateBoxes.push(box);

        // Auto-hide unless debug mode is on
        if (!this.DEBUG_MODE) {
            const timer = setTimeout(() => {
                box.style.opacity = '0';
                setTimeout(() => box.remove(), 300);
                const idx = this._candidateBoxes.indexOf(box);
                if (idx > -1) this._candidateBoxes.splice(idx, 1);
            }, this.AUTO_HIDE_DELAY);
            this._autoHideTimers.push(timer);
        }

        return box;
    }

    /**
     * Hide all candidate boxes
     */
    static hideCandidateBox() {
        // Clear all auto-hide timers
        this._autoHideTimers.forEach(timer => clearTimeout(timer));
        this._autoHideTimers = [];

        // Remove all candidate boxes
        this._candidateBoxes.forEach(box => {
            if (box && box.parentNode) {
                box.remove();
            }
        });
        this._candidateBoxes = [];
    }

    /**
     * Show the fusion winner box (highlighted)
     * @param {Object} canvasBBox - { x, y, width, height } in canvas coordinates
     * @param {string} text - The winning text
     */
    static showFusionWinner(canvasBBox, text) {
        if (!canvasBBox || !text) return;

        // Remove existing winner box
        if (this._winnerBox && this._winnerBox.parentNode) {
            this._winnerBox.remove();
        }

        const layer = document.getElementById('mapping-layer');
        if (!layer) return;

        const color = this.COLORS.winner;

        const box = document.createElement('div');
        box.className = 'name-debug-winner-box';
        box.style.cssText = `
            position: absolute;
            left: ${canvasBBox.x - 3}px;
            top: ${canvasBBox.y - 3}px;
            width: ${Math.max(canvasBBox.width || 100, 50) + 6}px;
            height: ${Math.max(canvasBBox.height || 20, 16) + 6}px;
            border: 3px solid ${color};
            background: ${color}30;
            pointer-events: none;
            z-index: 901;
            box-sizing: border-box;
            border-radius: 4px;
            animation: winner-pulse 0.5s ease-out;
            transition: opacity 0.3s ease;
        `;

        // Winner label
        const label = document.createElement('div');
        label.className = 'name-debug-winner-label';
        label.style.cssText = `
            position: absolute;
            bottom: -24px;
            left: 50%;
            transform: translateX(-50%);
            background: ${color};
            color: #000;
            font-size: 11px;
            font-weight: bold;
            padding: 3px 10px;
            border-radius: 10px;
            white-space: nowrap;
            font-family: Arial, sans-serif;
            direction: rtl;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        label.textContent = `✓ ${text}`;

        box.appendChild(label);
        layer.appendChild(box);
        this._winnerBox = box;

        // Auto-hide unless debug mode is on
        if (!this.DEBUG_MODE) {
            setTimeout(() => {
                if (this._winnerBox) {
                    this._winnerBox.style.opacity = '0';
                    setTimeout(() => {
                        if (this._winnerBox && this._winnerBox.parentNode) {
                            this._winnerBox.remove();
                            this._winnerBox = null;
                        }
                    }, 300);
                }
            }, this.AUTO_HIDE_DELAY + 500);  // Winner stays a bit longer
        }

        return box;
    }

    /**
     * Show debug panel with all candidates and fusion result
     * @param {Object[]} candidates - Array of candidate objects
     * @param {Object} fused - The fusion result
     */
    static showDebugPanel(candidates, fused) {
        // Create or update panel
        if (!this._debugPanel) {
            this._createDebugPanel();
        }

        const content = this._debugPanel.querySelector('.name-debug-content');
        if (!content) return;

        // Clear existing content
        content.innerHTML = '';

        // Add header
        const header = document.createElement('div');
        header.style.cssText = `
            font-weight: bold;
            margin-bottom: 8px;
            padding-bottom: 5px;
            border-bottom: 1px solid #444;
            color: #fff;
        `;
        header.textContent = `🔀 Fusion Debug (${candidates?.length || 0} candidates)`;
        content.appendChild(header);

        // Add candidates list
        if (candidates && candidates.length > 0) {
            const list = document.createElement('div');
            list.style.cssText = `max-height: 150px; overflow-y: auto;`;

            // Sort by score (if available)
            const sorted = [...candidates].sort((a, b) =>
                (b.finalScore || b.score || 0) - (a.finalScore || a.score || 0)
            );

            sorted.slice(0, 10).forEach((c, i) => {
                const item = document.createElement('div');
                const color = this.COLORS[c.source] || this.COLORS.auto;
                const isWinner = fused && c.text === fused.text;
                const score = c.finalScore || c.score || 0;
                const isFiltered = c.isValid === false || c.finalScore === 'FILTERED';

                item.style.cssText = `
                    padding: 3px 5px;
                    margin: 2px 0;
                    border-radius: 3px;
                    font-size: 10px;
                    background: ${isWinner ? color + '40' : '#333'};
                    border-left: 3px solid ${color};
                    opacity: ${isFiltered ? '0.5' : '1'};
                    ${isFiltered ? 'text-decoration: line-through;' : ''}
                `;

                const sourceLabel = document.createElement('span');
                sourceLabel.style.cssText = `color: ${color}; font-weight: bold;`;
                sourceLabel.textContent = c.source?.toUpperCase() || 'N/A';

                const textLabel = document.createElement('span');
                textLabel.style.cssText = `color: #ddd; margin: 0 5px; direction: rtl;`;
                textLabel.textContent = c.text?.substring(0, 20) || '';
                if (c.text?.length > 20) textLabel.textContent += '...';

                const scoreLabel = document.createElement('span');
                scoreLabel.style.cssText = `color: #888; float: left;`;
                scoreLabel.textContent = isFiltered ? 'FILTERED' : Math.round(score);

                item.appendChild(sourceLabel);
                item.appendChild(textLabel);
                item.appendChild(scoreLabel);

                if (isWinner) {
                    const winnerBadge = document.createElement('span');
                    winnerBadge.style.cssText = `color: ${this.COLORS.winner}; margin-left: 5px;`;
                    winnerBadge.textContent = ' ✓';
                    item.appendChild(winnerBadge);
                }

                list.appendChild(item);
            });

            content.appendChild(list);
        } else {
            const noData = document.createElement('div');
            noData.style.cssText = `color: #888; font-style: italic;`;
            noData.textContent = 'No candidates';
            content.appendChild(noData);
        }

        // Add fusion result
        if (fused && fused.text) {
            const result = document.createElement('div');
            result.style.cssText = `
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid #444;
            `;

            const resultHeader = document.createElement('div');
            resultHeader.style.cssText = `color: ${this.COLORS.winner}; font-weight: bold;`;
            resultHeader.textContent = '🏆 Winner:';

            const resultText = document.createElement('div');
            resultText.style.cssText = `
                background: ${this.COLORS.winner}30;
                padding: 5px;
                border-radius: 3px;
                margin-top: 3px;
                direction: rtl;
            `;
            resultText.innerHTML = `
                <strong>${fused.text}</strong><br>
                <small style="color:#888">Key: ${fused.key} | Source: ${fused.source} | Score: ${fused.score}</small>
            `;

            result.appendChild(resultHeader);
            result.appendChild(resultText);
            content.appendChild(result);
        }

        // Show panel
        this._debugPanel.style.display = 'block';

        // Auto-hide unless debug mode is on
        if (!this.DEBUG_MODE && !this.PANEL_COLLAPSED) {
            setTimeout(() => this.clearDebugPanel(), this.AUTO_HIDE_DELAY + 2000);
        }
    }

    /**
     * Clear/hide the debug panel
     */
    static clearDebugPanel() {
        if (this._debugPanel) {
            this._debugPanel.style.display = 'none';
            const content = this._debugPanel.querySelector('.name-debug-content');
            if (content) content.innerHTML = '';
        }
    }

    /**
     * Create the debug panel element
     * @private
     */
    static _createDebugPanel() {
        // Remove existing panel
        const existing = document.getElementById('name-debug-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'name-debug-panel';
        panel.className = 'name-debug-panel';
        panel.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 280px;
            max-height: 350px;
            background: rgba(30, 30, 30, 0.95);
            border: 1px solid #444;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 11px;
            color: #ddd;
            display: none;
            overflow: hidden;
        `;

        // Header with collapse toggle
        const panelHeader = document.createElement('div');
        panelHeader.style.cssText = `
            background: #333;
            padding: 8px 10px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
        `;
        panelHeader.innerHTML = `
            <span>🔍 Name Debug</span>
            <span class="collapse-icon">${this.PANEL_COLLAPSED ? '▶' : '▼'}</span>
        `;
        panelHeader.onclick = () => this._togglePanelCollapse();

        // Content area
        const content = document.createElement('div');
        content.className = 'name-debug-content';
        content.style.cssText = `
            padding: 10px;
            max-height: 300px;
            overflow-y: auto;
            display: ${this.PANEL_COLLAPSED ? 'none' : 'block'};
        `;

        panel.appendChild(panelHeader);
        panel.appendChild(content);

        document.body.appendChild(panel);
        this._debugPanel = panel;

        // Add CSS for animations
        this._injectStyles();

        return panel;
    }

    /**
     * Toggle panel collapse state
     * @private
     */
    static _togglePanelCollapse() {
        this.PANEL_COLLAPSED = !this.PANEL_COLLAPSED;

        if (this._debugPanel) {
            const content = this._debugPanel.querySelector('.name-debug-content');
            const icon = this._debugPanel.querySelector('.collapse-icon');

            if (content) {
                content.style.display = this.PANEL_COLLAPSED ? 'none' : 'block';
            }
            if (icon) {
                icon.textContent = this.PANEL_COLLAPSED ? '▶' : '▼';
            }
        }
    }

    /**
     * Inject CSS styles for debug overlay
     * @private
     */
    static _injectStyles() {
        if (document.getElementById('name-debug-styles')) return;

        const style = document.createElement('style');
        style.id = 'name-debug-styles';
        style.textContent = `
            @keyframes winner-pulse {
                0% {
                    transform: scale(1);
                    box-shadow: 0 0 0 0 rgba(0, 230, 118, 0.7);
                }
                50% {
                    transform: scale(1.02);
                    box-shadow: 0 0 15px 5px rgba(0, 230, 118, 0.3);
                }
                100% {
                    transform: scale(1);
                    box-shadow: 0 0 0 0 rgba(0, 230, 118, 0);
                }
            }

            .name-debug-candidate-box {
                animation: candidate-fade-in 0.2s ease-out;
            }

            @keyframes candidate-fade-in {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }

            .name-debug-panel::-webkit-scrollbar {
                width: 6px;
            }

            .name-debug-panel::-webkit-scrollbar-track {
                background: #222;
            }

            .name-debug-panel::-webkit-scrollbar-thumb {
                background: #555;
                border-radius: 3px;
            }

            .name-debug-content::-webkit-scrollbar {
                width: 5px;
            }

            .name-debug-content::-webkit-scrollbar-thumb {
                background: #444;
                border-radius: 2px;
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Set debug mode (keeps overlays visible)
     * @param {boolean} enabled
     */
    static setDebugMode(enabled) {
        this.DEBUG_MODE = enabled;
        console.log(`🔍 Name Debug Mode: ${enabled ? 'ON' : 'OFF'}`);
    }

    /**
     * Clean up all debug overlays
     */
    static cleanup() {
        this.hideCandidateBox();
        if (this._winnerBox && this._winnerBox.parentNode) {
            this._winnerBox.remove();
            this._winnerBox = null;
        }
        this.clearDebugPanel();
    }
}

// Expose to window for global access
if (typeof window !== 'undefined') {
    window.NameDebugOverlay = NameDebugOverlay;
    console.log('🔍 NameDebugOverlay loaded and exposed to window');
}
