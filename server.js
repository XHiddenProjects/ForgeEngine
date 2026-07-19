const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve public/index.html, etc. at the site root.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html','htm']
}));

// Serve the engine source files (Transform.js, canvas.js, shapes.js) at
// /engine/* so index.html can pull them in with plain <script> tags -
// this replaces what page.addScriptTag used to do from the Node side.
app.use('/utils', express.static(path.join(__dirname, 'utils', 'src')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));



app.listen(PORT, async () => {
    const url = `http://localhost:${PORT}`;
    console.log(`ForgeEngine is running at ${url}`);

    // Best-effort auto-open in the default browser, same spirit as the old
    // headless:false Puppeteer window - if it fails (e.g. no GUI available,
    // or the "open" package isn't installed), just fall back to printing
    // the URL above instead of crashing the server.
    try {
        const open = (await import('open')).default;
        await open(url);
    } catch (err) {
        console.log('Could not auto-open a browser window - open the URL above manually.');
    }
});
