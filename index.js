import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express'; // Pure Express
import helmet from 'helmet';
import pm2 from 'pm2';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Security Middleware
app.use(helmet());
app.use(express.json());

// --- 1. KEY GENERATION (Shared Secret) ---
const KEY_FILE = path.join(__dirname, 'key.json');
let API_KEY;

if (fs.existsSync(KEY_FILE)) {
    const data = JSON.parse(fs.readFileSync(KEY_FILE, 'utf-8'));
    API_KEY = data.key;
    console.log('\n=== EXISTING KEY LOADED ===');
    console.log(`Key: ${API_KEY}`);
    console.log('===========================\n');
} else {
    API_KEY = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(KEY_FILE, JSON.stringify({ key: API_KEY }));
    console.log('\n=== NEW KEY GENERATED ===');
    console.log('Copy this to Master:');
    console.log(`Key: ${API_KEY}`);
    console.log('=========================\n');
}

// --- 2. AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// --- 3. PM2 WRAPPERS ---
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
app.get('/health', requireAuth, async (req, res) => {
    try {
        const list = await pm2Call('list');
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

app.post('/api/v1/commands', requireAuth, async (req, res) => {
    const { action, service } = req.body;
    try {
        await pm2Call(action, service);
        res.json({ status: 'success', service, action });
    } catch (e) {
        res.status(500).json({ status: 'failed', message: e.message });
    }
});

// --- 5. START SERVER ---
const PORT = 8443;

// CURRENT: HTTP Mode
app.listen(PORT, () => {
    console.log(`Client Node running on http://localhost:${PORT}`);
});

/* 
   FUTURE HTTPS SETUP:
   1. import https from 'node:https';
   2. const opts = { key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') };
   3. https.createServer(opts, app).listen(PORT, ...);
*/