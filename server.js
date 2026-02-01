/**
 * tofesPDF Local Development Server
 *
 * Smart server that automatically finds a free port.
 * No external dependencies - uses Node.js built-in modules only.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Configuration
const PREFERRED_PORT = 3000;
const MAX_PORT = 3100;
const ROOT_DIR = __dirname;

// MIME types
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
};

// Check if port is available
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

// Find first available port
async function findAvailablePort(startPort, maxPort) {
    for (let port = startPort; port <= maxPort; port++) {
        if (await isPortAvailable(port)) {
            return port;
        }
        console.log(`Port ${port} is busy, trying next...`);
    }
    throw new Error(`No available port found between ${startPort} and ${maxPort}`);
}

// Serve static files
function serveFile(req, res) {
    let filePath = req.url.split('?')[0]; // Remove query string

    // Decode URL-encoded characters (Hebrew, spaces, etc.)
    try {
        filePath = decodeURIComponent(filePath);
    } catch (e) {
        // Invalid encoding, use as-is
    }

    // Default to index.html for root
    if (filePath === '/' || filePath === '/fill') {
        filePath = '/src/mapper-v3/mapper-v3.html';
    }

    // Security: prevent directory traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(ROOT_DIR, safePath);

    // Check if file exists
    fs.stat(fullPath, (err, stats) => {
        if (err || !stats.isFile()) {
            // Try adding .html extension
            const htmlPath = fullPath + '.html';
            fs.stat(htmlPath, (err2, stats2) => {
                if (!err2 && stats2.isFile()) {
                    sendFile(htmlPath, res);
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<h1>404 - File Not Found</h1><p>${safePath}</p><p><a href="/dev.html">Back to Dev Portal</a></p>`);
                }
            });
            return;
        }

        sendFile(fullPath, res);
    });
}

// Send file with proper headers
function sendFile(filePath, res) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Server Error');
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
}

// Open browser (cross-platform)
function openBrowser(url) {
    const platform = process.platform;
    let command;

    if (platform === 'darwin') {
        command = `open "${url}"`;
    } else if (platform === 'win32') {
        command = `start "${url}"`;
    } else {
        command = `xdg-open "${url}"`;
    }

    exec(command, (err) => {
        if (err) {
            console.log(`Could not open browser automatically. Please open: ${url}`);
        }
    });
}

// Start server
async function startServer() {
    console.log('\n========================================');
    console.log('   tofesPDF Development Server v3.13');
    console.log('========================================\n');

    try {
        const port = await findAvailablePort(PREFERRED_PORT, MAX_PORT);

        const server = http.createServer((req, res) => {
            console.log(`${new Date().toLocaleTimeString('he-IL')} - ${req.method} ${req.url}`);
            serveFile(req, res);
        });

        server.listen(port, () => {
            const devUrl = `http://localhost:${port}/dev.html`;
            const mainUrl = `http://localhost:${port}`;

            console.log(`Server running on port ${port}\n`);
            console.log('URLs:');
            console.log(`  Main Tool:    ${mainUrl}`);
            console.log(`  Dev Portal:   ${devUrl}`);
            console.log(`  QuickFill:    ${mainUrl}/src/mapper-v3/mapper-v3.html`);
            console.log(`  Advanced:     ${mainUrl}/src/mapper-v3/mapper-v3.html?mode=advanced`);
            console.log('\nPress Ctrl+C to stop\n');
            console.log('----------------------------------------\n');

            // Open dev portal in browser
            setTimeout(() => openBrowser(devUrl), 500);
        });

        server.on('error', (err) => {
            console.error('Server error:', err.message);
        });

    } catch (err) {
        console.error('Failed to start server:', err.message);
        process.exit(1);
    }
}

// Run
startServer();
