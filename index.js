import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import pm2 from 'pm2';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(helmet());
app.use(express.json());

// --- 1. KEY GENERATION SYSTEM ---
const KEY_FILE = path.join(__dirname, 'key.json');
let API_KEY;

if (fs.existsSync(KEY_FILE)) {
    const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf-8'));
    API_KEY = data.key;
    console.log('\n==================================================');
    console.log(' EXISTING KEY LOADED');
    console.log(` Key: ${API_KEY}`);
    console.log('==================================================\n');
} else {
    // Generate a secure random key
    API_KEY = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(KEY_FILE, JSON.stringify({ key: API_KEY }));
    console.log('\n==================================================');
    console.log(' NEW SECURITY KEY GENERATED');
    console.log(' Copy this key to your Master Manager:');
    console.log(` Key: ${API_KEY}`);
    console.log('==================================================\n');
}

// --- 2. AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
        console.warn(`[Auth Failed] IP: ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
};

// --- 3. PM2 WRAPPERS (No filtering) ---
const pm2Call = (method, ...args) => new Promise((resolve, reject) => {
    pm2.connect((err) => {
        if (err) return reject(err);
        pm2[method](...args, (err, data) => {
            if (err) return reject(err);
            resolve(data);
        });
    });
});

// --- 4. ROUTES ---

// GET /health - Returns ALL services
app.get('/health', requireAuth, async (req, res) => {
    try {
        const list = await pm2Call('list');

        // Map simplified data for UI
        const services = list.map(proc => ({
            name: proc.name,
            status: proc.pm2_env.status,
            uptime: Date.now() - proc.pm2_env.pm_uptime,
            memory: proc.monit ? proc.monit.memory : 0,
            cpu: proc.monit ? proc.monit.cpu : 0
        }));

        res.json({ status: 'ok', services });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /commands - Execute action on ANY service
app.post('/api/v1/commands', requireAuth, async (req, res) => {
    const { action, service } = req.body;
    console.log(`[Command] ${action} -> ${service}`);

    try {
        if (!['start', 'stop', 'restart'].includes(action)) throw new Error('Invalid action');

        await pm2Call(action, service);
        res.json({ status: 'success', service, action });
    } catch (e) {
        res.status(500).json({ status: 'failed', message: e.message });
    }
});

// --- 5. START SERVER (Self-Signed HTTPS) ---
// We generate a temporary cert in memory or require a basic one. 
// For simplicity, let's assume you still have the basic 'target-node.key/crt' 
// OR generate them once. Using HTTP is unsafe for API Keys.
const TLS_OPTS = {
    key: fs.readFileSync('../certs/target-node.key'), // Keep the basic SSL certs
    cert: fs.readFileSync('../certs/target-node.crt'),
    // REMOVED: requestCert, rejectUnauthorized, ca (No mTLS)
};

https.createServer(TLS_OPTS, app).listen(8443, () => {
    console.log('Client listening on port 8443 (HTTPS enabled, API Key protection active)');
});