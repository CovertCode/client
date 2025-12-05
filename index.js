import path from 'node:path';
import fs from 'node:fs';
import express from 'express'; // Pure Express
import session from 'cookie-session';
import { fileURLToPath } from 'url';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import db from './db.js';
import * as remote from './services/remote_client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Config
app.use(session({
    name: 'session',
    keys: ['your-secret-key'],
    maxAge: 60 * 60 * 1000,
    secure: false, // Set to TRUE when you switch to HTTPS
    httpOnly: true,
    sameSite: 'lax'
}));

// Middleware
const requireLogin = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/login');
    next();
};

// --- ROUTES ---

// Login Routes
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
        if (user && await argon2.verify(user.password_hash, password)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            return res.redirect('/dashboard');
        }
        res.render('login', { error: 'Invalid credentials' });
    } catch (e) {
        res.render('login', { error: 'Server error' });
    }
});

app.get('/logout', (req, res) => {
    req.session = null;
    res.redirect('/login');
});

// Dashboard
app.get('/dashboard', requireLogin, async (req, res) => {
    const clients = db.prepare('SELECT * FROM clients').all();
    const clientsWithStatus = await Promise.all(clients.map(async (c) => {
        const health = await remote.checkHealth(c);
        return { ...c, health };
    }));
    res.render('dashboard', { clients: clientsWithStatus });
});

// Add Client
app.get('/clients/add', requireLogin, (req, res) => res.render('add_client'));

app.post('/clients/add', requireLogin, (req, res) => {
    const { server_name, host, port, api_key } = req.body;
    
    // NOTE: When you switch to HTTPS, change this string to 'https://'
    const apiUrl = `http://${host}:${port || 8443}`;
    
    try {
        db.prepare('INSERT INTO clients (id, server_name, host, port, api_url, api_key) VALUES (?, ?, ?, ?, ?, ?)')
          .run(uuidv4(), server_name, host, port || 8443, apiUrl, api_key);
        res.redirect('/dashboard');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

// Remote Action
app.post('/api/clients/:id/service/:service/:action', requireLogin, async (req, res) => {
    const { id, service, action } = req.params;
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
    if (!client) return res.status(404).json({ error: 'Not found' });

    const result = await remote.sendCommand(client, action, service);
    res.json(result);
});

// --- START SERVER ---
const PORT = 3000;

// CURRENT: HTTP Mode
app.listen(PORT, () => {
    console.log(`Master Manager running on http://localhost:${PORT}`);
});

/* 
   FUTURE HTTPS SETUP:
   1. import https from 'node:https';
   2. const opts = { key: ..., cert: ... };
   3. https.createServer(opts, app).listen(443, ...);
*/