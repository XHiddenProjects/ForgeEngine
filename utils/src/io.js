'use strict';

// Wrapped in an IIFE - see the comment at the top of Transform.js for why:
// this file may be loaded as a sibling <script> tag alongside the other
// engine files, all sharing ONE global scope. IO has no dependency on any
// of them (it doesn't touch a canvas at all), so - like Transform.js - it
// only ever leaks its name via an explicit `root.IO` assignment, never a
// top-level `const`/`class` declaration.
(function (root, factory) {
    const IO = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = IO;
        module.exports.IO = IO;
    } else if (root) {
        root.IO = IO;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

/**
 * Resolves to `fetch` in a browser, or Node's global `fetch` (Node 18+) when
 * running under `require()`. Centralized here so every loader/http method
 * below fails with the same clear error instead of a bare
 * "fetch is not defined".
 *
 * @private
 * @returns {typeof fetch} The available `fetch` implementation.
 * @throws {Error} If no `fetch` implementation is available.
 */
function getFetch() {
    if (typeof fetch === 'function') return fetch;
    throw new Error('IO requires a `fetch` implementation (a browser, or Node 18+).');
}

/**
 * Triggers a client-side download of a `Blob` under the given filename.
 * Used internally by {@link IO.save}/{@link IO.saveJSON}/{@link
 * IO.saveStrings}/{@link IO.saveTable}; no-ops (and returns `false`) outside
 * a browser (e.g. under Node), since there's no user to download a file to.
 *
 * @private
 * @param {Blob} blob - Data to save.
 * @param {string} filename - Filename (including extension) to save as.
 * @returns {boolean} `true` if a download was triggered, `false` otherwise.
 */
function downloadBlob(blob, filename) {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return false;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
}

/**
 * Splits a filename into `{ name, extension }`, e.g. `'data.json'` ->
 * `{ name: 'data', extension: 'json' }`. A filename with no `.` falls back
 * to `defaultExtension` for the extension half.
 *
 * @private
 * @param {string} filename - Filename to split.
 * @param {string} defaultExtension - Extension to use if `filename` has none.
 * @returns {{name: string, extension: string}}
 */
function splitExtension(filename, defaultExtension) {
    const match = /^(.*)\.([^./\\]+)$/.exec(filename);
    return match ? { name: match[1], extension: match[2] } : { name: filename, extension: defaultExtension };
}

/**
 * Naive CSV/TSV line splitter/joiner supporting double-quoted fields (with
 * `""` as an escaped quote) - enough for {@link IO.loadTable}/{@link
 * IO.saveTable} without pulling in a full CSV parsing dependency.
 *
 * @private
 */
const Delimited = {
    /**
     * @param {string} text - Raw file contents.
     * @param {string} separator - Field separator (`','` for CSV, `'\t'` for TSV).
     * @returns {string[][]} Rows of string cells.
     */
    parse(text, separator) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        const lines = text.replace(/\r\n/g, '\n').split('\n');
        for (const line of lines) {
            if (line === '' && !inQuotes && rows.length && row.length === 0 && field === '') continue;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (inQuotes) {
                    if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
                    else if (ch === '"') { inQuotes = false; }
                    else { field += ch; }
                } else if (ch === '"') {
                    inQuotes = true;
                } else if (ch === separator) {
                    row.push(field);
                    field = '';
                } else {
                    field += ch;
                }
            }
            if (inQuotes) {
                field += '\n';
                continue;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        }
        return rows;
    },

    /**
     * @param {string[][]} rows - Rows of string cells.
     * @param {string} separator - Field separator to join with.
     * @returns {string} Delimited text, one row per line.
     */
    stringify(rows, separator) {
        return rows.map(row => row.map(cell => {
            const value = cell === null || cell === undefined ? '' : String(cell);
            return /["\n]/.test(value) || value.includes(separator)
                ? `"${value.replace(/"/g, '""')}"`
                : value;
        }).join(separator)).join('\n');
    }
};

/**
 * A minimal p5.Table-like structure: an array of row objects plus the
 * column names, as produced by {@link IO.loadTable} and consumed by {@link
 * IO.saveTable}.
 *
 * @typedef {Object} Table
 * @property {string[]} columns - Column names, in file order.
 * @property {Object[]} rows - One plain object per data row, keyed by column name.
 */

/**
 * A minimal p5.PrintWriter-like object returned by {@link IO.createWriter}.
 * Buffers lines in memory; nothing is saved to disk until {@link
 * IO.PrintWriter#close} (or {@link IO.PrintWriter#flush} for a live-updating
 * copy without ending the stream) is called.
 *
 * @class
 */
class PrintWriter {
    #name;
    #extension;
    #lines;

    /**
     * @param {string} name - Filename (without extension) to save as.
     * @param {string} [extension='txt'] - File extension to save as.
     */
    constructor(name, extension = 'txt') {
        this.#name = name;
        this.#extension = extension;
        this.#lines = [''];
    }

    /**
     * Writes data to the print stream without adding a new line - each
     * argument is appended, space-separated, to the end of the current
     * last line.
     *
     * @param {...*} data - Values to write (stringified and space-joined).
     * @returns {PrintWriter} This instance, to allow chaining.
     */
    write(...data) {
        const text = data.map(String).join(' ');
        this.#lines[this.#lines.length - 1] += text;
        return this;
    }

    /**
     * Writes data to the print stream, each argument ending its own line
     * (i.e. like {@link PrintWriter#write} followed by a line break after
     * every argument).
     *
     * @param {...*} data - Values to print, one per line.
     * @returns {PrintWriter} This instance, to allow chaining.
     */
    print(...data) {
        for (const value of data) {
            this.#lines[this.#lines.length - 1] += String(value);
            this.#lines.push('');
        }
        return this;
    }

    /**
     * Saves the current buffered contents to a file without ending the
     * stream - `write()`/`print()` can still be called afterwards.
     *
     * @returns {boolean} `true` if a download was triggered (browser only).
     */
    flush() {
        const blob = new Blob([this.#lines.join('\n')], { type: 'text/plain' });
        return downloadBlob(blob, `${this.#name}.${this.#extension}`);
    }

    /**
     * Saves the file and closes the print stream. Further `write()`/
     * `print()` calls are ignored after this.
     *
     * @returns {boolean} `true` if a download was triggered (browser only).
     */
    close() {
        const saved = this.flush();
        this.write = () => this;
        this.print = () => this;
        return saved;
    }
}

const IO = {
    // Exposed so callers can `instanceof IO.PrintWriter` or construct one
    // directly, though createWriter() below is the normal entry point.
    PrintWriter,

    // -----------------------------------------------------------
    // Writing
    // -----------------------------------------------------------

    /**
     * Creates a new {@link PrintWriter} object for accumulating and later
     * saving text output.
     *
     * @param {string} name - Filename (optionally including an extension, e.g. `'log.txt'`) to save as.
     * @param {string} [extension='txt'] - File extension, used only if `name` doesn't already include one.
     * @returns {PrintWriter} A new print stream.
     */
    createWriter(name, extension = 'txt') {
        const { name: base, extension: ext } = splitExtension(name, extension);
        return new PrintWriter(base, ext);
    },

    // -----------------------------------------------------------
    // HTTP
    // -----------------------------------------------------------

    /**
     * Method for executing an HTTP request. This is the general-purpose
     * method that {@link IO.httpGet}/{@link IO.httpPost} wrap; use it
     * directly for other methods (`PUT`, `DELETE`, ...) or when you need
     * full control over the request.
     *
     * @param {string} path - URL to request.
     * @param {string} [method='GET'] - HTTP method (`'GET'`, `'POST'`, `'PUT'`, `'DELETE'`, ...).
     * @param {string} [datatype='text'] - How to parse the response: `'json'`, `'text'`, `'binary'` (ArrayBuffer), `'arrayBuffer'`, `'xml'`, or `'table'` (CSV/TSV, via {@link IO.loadTable}'s parser).
     * @param {*} [data] - Request body. Objects are sent as JSON; strings/`FormData`/`Blob` are sent as-is.
     * @param {function(*):void} [callback] - Called with the parsed response on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<*>} Resolves with the parsed response (in addition to `callback` firing).
     */
    httpDo(path, method = 'GET', datatype = 'text', data, callback, errorCallback) {
        // Signature is intentionally permissive about argument order/omission,
        // matching p5.js's httpDo(path, [method], [datatype], [data], [callback], [errorCallback]).
        const args = [method, datatype, data, callback, errorCallback];
        const strings = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH'];
        method = strings.includes(args[0]) ? args[0] : 'GET';
        datatype = typeof args[0] === 'string' && !strings.includes(args[0]) ? args[0]
            : typeof args[1] === 'string' ? args[1] : 'text';
        callback = args.find(a => typeof a === 'function' && a !== errorCallback);
        errorCallback = args.slice().reverse().find(a => typeof a === 'function' && a !== callback);
        data = args.find(a => a !== undefined && typeof a !== 'string' && typeof a !== 'function');

        const options = { method };
        if (data !== undefined) {
            if (typeof FormData !== 'undefined' && data instanceof FormData) options.body = data;
            else if (typeof Blob !== 'undefined' && data instanceof Blob) options.body = data;
            else if (typeof data === 'string') options.body = data;
            else {
                options.body = JSON.stringify(data);
                options.headers = { 'Content-Type': 'application/json' };
            }
        }

        const promise = getFetch()(path, options)
            .then(async response => {
                if (!response.ok) throw new Error(`httpDo(): ${response.status} ${response.statusText} for ${path}`);
                switch (datatype) {
                    case 'json': return response.json();
                    case 'binary':
                    case 'arrayBuffer': return response.arrayBuffer();
                    case 'xml': return IO._parseXML(await response.text());
                    case 'table': return IO._parseTable(await response.text(), path);
                    default: return response.text();
                }
            });

        promise.then(result => callback && callback(result))
            .catch(error => { if (errorCallback) errorCallback(error); else throw error; });

        return promise;
    },

    /**
     * Method for executing an HTTP GET request.
     *
     * @param {string} path - URL to request.
     * @param {string} [datatype='text'] - How to parse the response (see {@link IO.httpDo}).
     * @param {*} [data] - Query data. Plain objects are serialized and appended to `path` as a query string.
     * @param {function(*):void} [callback] - Called with the parsed response on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<*>} Resolves with the parsed response.
     */
    httpGet(path, datatype, data, callback, errorCallback) {
        if (data && typeof data === 'object') {
            const query = new URLSearchParams(data).toString();
            path += (path.includes('?') ? '&' : '?') + query;
            data = undefined;
        }
        return IO.httpDo(path, 'GET', datatype, data, callback, errorCallback);
    },

    /**
     * Method for executing an HTTP POST request.
     *
     * @param {string} path - URL to request.
     * @param {string} [datatype='text'] - How to parse the response (see {@link IO.httpDo}).
     * @param {*} [data] - Request body (sent as JSON if a plain object).
     * @param {function(*):void} [callback] - Called with the parsed response on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<*>} Resolves with the parsed response.
     */
    httpPost(path, datatype, data, callback, errorCallback) {
        return IO.httpDo(path, 'POST', datatype, data, callback, errorCallback);
    },

    // -----------------------------------------------------------
    // Loading
    // -----------------------------------------------------------

    /**
     * Loads a file at the given path as a `Blob`, then returns the
     * resulting data (via Promise) or passes it to `callback`, if provided.
     *
     * @param {string} path - URL/path to the file.
     * @param {function(Blob):void} [callback] - Called with the loaded `Blob` on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<Blob>} Resolves with the loaded `Blob`.
     */
    loadBlob(path, callback, errorCallback) {
        const promise = getFetch()(path).then(response => {
            if (!response.ok) throw new Error(`loadBlob(): ${response.status} ${response.statusText} for ${path}`);
            return response.blob();
        });
        promise.then(blob => callback && callback(blob))
            .catch(error => { if (errorCallback) errorCallback(error); else throw error; });
        return promise;
    },

    /**
     * Loads a file at the given path as raw bytes. Suitable for fetching
     * files up to 64MB.
     *
     * @param {string} path - URL/path to the file.
     * @param {function(Uint8Array):void} [callback] - Called with the loaded bytes on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<Uint8Array>} Resolves with the loaded bytes.
     */
    loadBytes(path, callback, errorCallback) {
        const promise = getFetch()(path).then(async response => {
            if (!response.ok) throw new Error(`loadBytes(): ${response.status} ${response.statusText} for ${path}`);
            return new Uint8Array(await response.arrayBuffer());
        });
        promise.then(bytes => callback && callback(bytes))
            .catch(error => { if (errorCallback) errorCallback(error); else throw error; });
        return promise;
    },

    /**
     * Loads a JSON file to create an Object (or Array).
     *
     * @param {string} path - URL/path to the `.json` file.
     * @param {function(*):void} [callback] - Called with the parsed JSON on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<*>} Resolves with the parsed JSON.
     */
    loadJSON(path, callback, errorCallback) {
        return IO.httpDo(path, 'GET', 'json', undefined, callback, errorCallback);
    },

    /**
     * Loads a text file to create an Array, one entry per line.
     *
     * @param {string} path - URL/path to the text file.
     * @param {function(string[]):void} [callback] - Called with the array of lines on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<string[]>} Resolves with the array of lines.
     */
    loadStrings(path, callback, errorCallback) {
        const promise = IO.httpDo(path, 'GET', 'text').then(text => text.replace(/\r\n/g, '\n').split('\n'));
        promise.then(lines => callback && callback(lines))
            .catch(error => { if (errorCallback) errorCallback(error); else throw error; });
        return promise;
    },

    /**
     * Reads the contents of a file or URL and creates a {@link Table}
     * object with its values. Supports CSV (`.csv`) and TSV (`.tsv`) by
     * extension, or pass `'csv'`/`'tsv'` explicitly in `options`.
     *
     * @param {string} path - URL/path to the delimited file.
     * @param {string|{separator: string, header: boolean}} [options] - `'csv'`/`'tsv'`, or an options object. `header` (default `true`) treats the first row as column names.
     * @param {function(Table):void} [callback] - Called with the parsed table on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<Table>} Resolves with the parsed table.
     */
    loadTable(path, options, callback, errorCallback) {
        if (typeof options === 'function') { errorCallback = callback; callback = options; options = undefined; }
        const promise = IO.httpDo(path, 'GET', 'text').then(text => IO._parseTable(text, path, options));
        promise.then(table => callback && callback(table))
            .catch(error => { if (errorCallback) errorCallback(error); else throw error; });
        return promise;
    },

    /**
     * Loads an XML file to create an XML document wrapper.
     *
     * @param {string} path - URL/path to the `.xml` file.
     * @param {function(Object):void} [callback] - Called with the parsed XML wrapper on success.
     * @param {function(Error):void} [errorCallback] - Called with the error on failure.
     * @returns {Promise<Object>} Resolves with the parsed XML wrapper (see {@link IO._parseXML}).
     */
    loadXML(path, callback, errorCallback) {
        const promise = IO.httpDo(path, 'GET', 'text').then(text => IO._parseXML(text));
        promise.then(xml => callback && callback(xml))
            .catch(error => { if (errorCallback) errorCallback(error); else throw error; });
        return promise;
    },

    // -----------------------------------------------------------
    // Saving
    // -----------------------------------------------------------

    /**
     * Saves a given piece of data (image, text, JSON, CSV, or HTML) to the
     * client's computer, inferring the format from `data`'s type and
     * `filename`'s extension.
     *
     * @param {*} data - What to save: a string, an Array/Object (saved as JSON), a {@link Table} (saved as CSV/TSV), an `HTMLCanvasElement`/`Blob` (saved as an image), or an `HTMLElement` (saved as `.outerHTML`).
     * @param {string} [filename='untitled'] - Filename (optionally including extension) to save as.
     * @param {string} [extension] - File extension, used only if `filename` doesn't already include one; also selects the image format (`'png'`/`'jpg'`) for canvas data.
     * @returns {boolean} `true` if a download was triggered (browser only).
     */
    save(data, filename = 'untitled', extension) {
        if (typeof HTMLCanvasElement !== 'undefined' && data instanceof HTMLCanvasElement) {
            const { name, extension: ext } = splitExtension(filename, extension || 'png');
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
            data.toBlob(blob => downloadBlob(blob, `${name}.${ext}`), mime);
            return true;
        }
        if (typeof Blob !== 'undefined' && data instanceof Blob) {
            const { name, extension: ext } = splitExtension(filename, extension || 'bin');
            return downloadBlob(data, `${name}.${ext}`);
        }
        if (typeof HTMLElement !== 'undefined' && data instanceof HTMLElement) {
            const { name, extension: ext } = splitExtension(filename, extension || 'html');
            return downloadBlob(new Blob([data.outerHTML], { type: 'text/html' }), `${name}.${ext}`);
        }
        if (data && data.rows && data.columns) return IO.saveTable(data, filename, extension);
        if (Array.isArray(data) && data.every(item => typeof item === 'string')) {
            return IO.saveStrings(data, filename, extension);
        }
        if (typeof data === 'object' && data !== null) return IO.saveJSON(data, filename);
        return IO.saveStrings([String(data)], filename, extension);
    },

    /**
     * Saves an Object or Array to a JSON file.
     *
     * @param {*} json - Data to serialize.
     * @param {string} [filename='data.json'] - Filename to save as.
     * @param {boolean} [optimize=false] - When `true`, omits whitespace (`JSON.stringify` with no indentation) instead of pretty-printing.
     * @returns {boolean} `true` if a download was triggered (browser only).
     */
    saveJSON(json, filename = 'data.json', optimize = false) {
        const { name, extension } = splitExtension(filename, 'json');
        const text = optimize ? JSON.stringify(json) : JSON.stringify(json, null, 2);
        return downloadBlob(new Blob([text], { type: 'application/json' }), `${name}.${extension}`);
    },

    /**
     * Saves an Array of Strings to a file, one per line.
     *
     * @param {string[]} list - Lines to save.
     * @param {string} [filename='data.txt'] - Filename to save as.
     * @param {string} [extension='txt'] - Extension used only if `filename` doesn't already include one.
     * @returns {boolean} `true` if a download was triggered (browser only).
     */
    saveStrings(list, filename = 'data.txt', extension = 'txt') {
        const { name, extension: ext } = splitExtension(filename, extension);
        return downloadBlob(new Blob([list.join('\n')], { type: 'text/plain' }), `${name}.${ext}`);
    },

    /**
     * Writes the contents of a {@link Table} object to a file (CSV by
     * default, or TSV if `extension`/`filename` says `'tsv'`).
     *
     * @param {Table} table - Table to save.
     * @param {string} [filename='table.csv'] - Filename to save as.
     * @param {string} [extension='csv'] - `'csv'` or `'tsv'`, used only if `filename` doesn't already include one.
     * @returns {boolean} `true` if a download was triggered (browser only).
     */
    saveTable(table, filename = 'table.csv', extension = 'csv') {
        const { name, extension: ext } = splitExtension(filename, extension);
        const separator = ext === 'tsv' ? '\t' : ',';
        const rows = [table.columns, ...table.rows.map(row => table.columns.map(column => row[column]))];
        const text = Delimited.stringify(rows, separator);
        const mime = ext === 'tsv' ? 'text/tab-separated-values' : 'text/csv';
        return downloadBlob(new Blob([text], { type: mime }), `${name}.${ext}`);
    },

    // -----------------------------------------------------------
    // DOM content
    // -----------------------------------------------------------

    /**
     * Sets an element's inner HTML content, optionally appending rather
     * than replacing.
     *
     * @param {HTMLElement|string} element - Target element, or a CSS selector identifying one.
     * @param {string} html - HTML/text content to set.
     * @param {boolean} [append=false] - When `true`, appends to the existing content instead of replacing it.
     * @returns {HTMLElement} The element that was updated.
     * @throws {Error} If `element` is a selector that matches nothing, or no DOM is available.
     */
    setContent(element, html, append = false) {
        if (typeof document === 'undefined') throw new Error('setContent() requires a DOM.');
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) throw new Error(`setContent(): no element found for "${element}".`);
        if (append) el.innerHTML += html;
        else el.innerHTML = html;
        return el;
    },

    // -----------------------------------------------------------
    // Internals
    // -----------------------------------------------------------

    /**
     * Parses delimited (CSV/TSV) text into a {@link Table}, choosing the
     * separator from `options.separator`/`options`, the file extension, or
     * `path`'s extension, in that order of priority.
     *
     * @private
     * @param {string} text - Raw file contents.
     * @param {string} path - Original path/filename (used to infer the format when `options` doesn't specify one).
     * @param {string|{separator: string, header: boolean}} [options] - `'csv'`/`'tsv'`, or `{separator, header}`.
     * @returns {Table}
     */
    _parseTable(text, path, options) {
        let separator = /\.tsv$/i.test(path) ? '\t' : ',';
        let header = true;
        if (typeof options === 'string') {
            separator = options === 'tsv' ? '\t' : ',';
        } else if (options && typeof options === 'object') {
            if (options.separator) separator = options.separator;
            if (options.header !== undefined) header = options.header;
        }

        const rows = Delimited.parse(text, separator).filter(row => row.length > 1 || row[0] !== '');
        const columns = header && rows.length ? rows.shift() : (rows[0] || []).map((_, i) => `col${i}`);
        return {
            columns,
            rows: rows.map(row => Object.fromEntries(columns.map((column, i) => [column, row[i] ?? ''])))
        };
    },

    /**
     * Parses XML text via `DOMParser` into a lightweight p5.XML-like
     * wrapper around the root element.
     *
     * @private
     * @param {string} text - Raw XML text.
     * @returns {{doc: XMLDocument, root: Element, getContent: function(): string, getChildren: function(string=): Element[], getChild: function(string): ?Element, getAttribute: function(string): ?string}}
     * @throws {Error} If no `DOMParser` is available, or the XML fails to parse.
     */
    _parseXML(text) {
        if (typeof DOMParser === 'undefined') throw new Error('loadXML()/httpDo(datatype: "xml") requires a DOMParser.');
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        const parserError = doc.querySelector('parsererror');
        if (parserError) throw new Error(`Failed to parse XML: ${parserError.textContent}`);

        const root = doc.documentElement;
        return {
            doc,
            root,
            getContent: () => root.textContent,
            getChildren: (tag) => Array.from(tag ? root.getElementsByTagName(tag) : root.children),
            getChild: (tag) => root.getElementsByTagName(tag)[0] || null,
            getAttribute: (name) => root.getAttribute(name)
        };
    }
};

return IO;
});
