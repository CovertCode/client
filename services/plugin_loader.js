import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, '../plugins');

// In-memory registry
const registry = new Map();

export async function loadPlugins() {
    if (!fs.existsSync(PLUGINS_DIR)) {
        fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    }

    const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
    registry.clear();

    console.log('\n--- Loading Plugins ---');
    for (const file of files) {
        try {
            // Dynamic import (ESM)
            const pluginPath = `file://${path.join(PLUGINS_DIR, file)}`;
            const module = await import(pluginPath);
            
            // Validation
            if (!module.meta || !module.execute) {
                console.warn(`[Plugins] Skipped ${file}: Missing export const meta = { name, code } or execute()`);
                continue;
            }

            registry.set(module.meta.code, module);
            console.log(`[+] Loaded: ${module.meta.name} (${module.meta.code})`);
        } catch (e) {
            console.error(`[!] Failed to load ${file}:`, e.message);
        }
    }
    console.log('-----------------------\n');
}

export function getPluginList() {
    return Array.from(registry.values()).map(p => p.meta);
}

export async function executePlugin(code, args = {}) {
    const plugin = registry.get(code);
    if (!plugin) throw new Error(`Plugin '${code}' not found`);
    
    // Execute the plugin function
    return await plugin.execute(args);
}