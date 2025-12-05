import fs from 'node:fs';
import path from 'node:path';

// Load Certs
const BASE_CERT_PATH = './certs'; // Adjust for production deployment
export const TLS_CONFIG = {
    key: fs.readFileSync(path.join(BASE_CERT_PATH, 'target-node.key')),
    cert: fs.readFileSync(path.join(BASE_CERT_PATH, 'target-node.crt')),
    ca: fs.readFileSync(path.join(BASE_CERT_PATH, 'ca.crt')), // Trust the CA
    requestCert: true, 
    rejectUnauthorized: true // FORCE mTLS
};

// Security Config
export const ALLOWED_SERVICES = ['api-server', 'background-worker']; // EXACT NAMES
export const MASTER_PUBLIC_KEY = fs.readFileSync(path.join(BASE_CERT_PATH, 'master.crt')); // Using cert as public key source for JWT
export const CLIENT_ID = 'uuid-client-001'; // Defined during setup