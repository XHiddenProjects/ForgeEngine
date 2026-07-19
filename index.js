const fs = require('fs');
const path = require('path');

/**
 * ForgeEngine main entry point.
 *
 * Scans every immediate subdirectory of this file for an `index.js`
 */

const modules = {};

const rootDir = __dirname;

const entries = fs.readdirSync(rootDir, { withFileTypes: true });

for (const entry of entries) {
    // Only look at directories, skip files, node_modules, and hidden folders (.git, etc)
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules') continue;
    if (entry.name.startsWith('.')) continue;

    const modulePath = path.join(rootDir, entry.name, 'index.js');

    if (fs.existsSync(modulePath)) {
        try {
            modules[entry.name] = require(modulePath);
        } catch (err) {
            console.error(`ForgeEngine: failed to load module "${entry.name}" from ${modulePath}:`, err);
        }
    }
}

module.exports = modules;

// If index.js is run directly (e.g. `node index.js` / `npm start`),
// report which modules were discovered and loaded.
if (require.main === module) {
    const loaded = Object.keys(modules);
    if (loaded.length === 0) console.log('ForgeEngine: no sub-modules found (looked for */index.js).');
    else console.log(`ForgeEngine: loaded ${loaded.length} module(s): ${loaded.join(', ')}`);
}