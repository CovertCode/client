import https from 'node:https';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { TLS_CONFIG, ALLOWED_SERVICES, MASTER_PUBLIC_KEY, CLIENT_ID } from './config.js';
import { getServicesStatus, runCommand } from './services/pm2_control.js';

const app = express();
app.use(helmet());
app.use(express.json());

// Middleware: Verify mTLS & JWT
const requireAuth = (req, res, next) => {
    // 1. mTLS Check (Transport Layer)
    const cert = req.socket.getPeerCertificate();
    if (!cert || !cert.subject) {
        return res.status(401).json({ error: 'Client certificate required' });
    }
    // In production, verify cert.fingerprint against a known registry if needed
    // or rely on 'rejectUnauthorized: true' + CA trust.

    // 2. JWT Check (Application Layer)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing JWT' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, MASTER_PUBLIC_KEY, { 
            audience: CLIENT_ID,
            algorithms: ['RS256'] // Ensure strong algo
        });
        
        // Replay attack protection (simple cache implementation omitted for brevity)
        req.user = decoded;
        next();
    } catch (err) {
        console.error('JWT Fail:', err.message);
        return res.status(403).json({ error: 'Invalid Token' });
    }
};

// Routes
app.get('/health', requireAuth, async (req, res) => {
    try {
        const services = await getServicesStatus(ALLOWED_SERVICES);
        res.json({ status: 'ok', server_name: 'web-1', services });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/v1/commands', requireAuth, async (req, res) => {
    const { action, service, jti } = req.body;
    
    console.log(`[Audit] Action: ${action} on ${service} by ${req.user.sub} (JTI: ${jti})`);

    try {
        await runCommand(action, service, ALLOWED_SERVICES);
        res.json({ status: 'success', service, action });
    } catch (e) {
        res.status(500).json({ status: 'failed', message: e.message });
    }
});

// Start Server
const server = https.createServer(TLS_CONFIG, app);
server.listen(8443, () => {
    console.log('Client Service listening on port 8443 (mTLS enabled)');
});