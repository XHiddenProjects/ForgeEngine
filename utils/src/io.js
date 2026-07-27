'use strict';

const fs = require('fs');
const constants = require('./constants.js');

/**
 * Determines whether a path is an HTTP or HTTPS URL.
 *
 * @param {string|number|*} p - P value.
 *
 * @returns {boolean} The resulting value.
 */
function isURL(p) { return /^https?:\/\//i.test(p); }

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
class Table {
  /**
   * Creates a new Table instance.
   *
   * @param {string|number|*} [columns=[]] - Columns value.
   */
  constructor(columns = []) {
    this.columnNames = columns.slice();
    this.data = []; // array of arrays (row-major), values as strings/numbers
  }

  /**
   * Parses delimited text into a table.
   *
   * @param {string|number|*} text - Text value.
   * @param {string|number|*} [delimiter='] - Field delimiter.
   * @param {string|number|*} ' - ' value.
   * @param {boolean} [hasHeader=true] - Whether the first row contains column names.
   *
   * @returns {Table} This instance for chaining.
   */
  static fromCSV(text, delimiter = ',', hasHeader = true) {
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.length > 0);
    const table = new Table();
    let start = 0;
    if (hasHeader && lines.length) {
      table.columnNames = lines[0].split(delimiter);
      start = 1;
    }
    for (let i = start; i < lines.length; i++) {
      table.data.push(lines[i].split(delimiter));
    }
    return table;
  }

  /**
   * Serializes the table as delimited text.
   *
   * @param {string|number|*} [delimiter='] - Field delimiter.
   * @param {string|number|*} ' - ' value.
   *
   * @returns {string} The resulting value.
   */
  toCSV(delimiter = ',') {
    const rows = [];
    if (this.columnNames.length) rows.push(this.columnNames.join(delimiter));
    for (const row of this.data) rows.push(row.join(delimiter));
    return rows.join('\n');
  }

  /**
   * Returns the current columns value.
   *
   * @returns {string[]} The resulting value.
   */
  get columns() { return this.columnNames.slice(); }
  /**
   * Returns the effective number of columns.
   *
   * @returns {number} The resulting value.
   */
  getColumnCount() { return this.columnNames.length || (this.data[0] ? this.data[0].length : 0); }
  /**
   * Returns the number of rows.
   *
   * @returns {number} The resulting value.
   */
  getRowCount() { return this.data.length; }

  /**
   * Resolves a column name or index to a numeric index.
   *
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {number} The resulting value.
   */
  _colIndex(col) {
    return typeof col === 'number' ? col : this.columnNames.indexOf(col);
  }

  /**
   * Appends a column and initializes existing rows.
   *
   * @param {string|number|*} [title=''] - Title value.
   * @param {string|number|*} type - Type value.
   *
   * @returns {number} The resulting value.
   */
  addColumn(title = '', type) {
    this.columnNames.push(title);
    for (const row of this.data) row.push('');
    return this.columnNames.length - 1;
  }
  /**
   * Removes a column by name or index.
   *
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {number} The resulting value.
   */
  removeColumn(col) {
    const idx = this._colIndex(col);
    this.columnNames.splice(idx, 1);
    for (const row of this.data) row.splice(idx, 1);
    return idx;
  }
  /**
   * Appends a row.
   *
   * @param {Array} [rowArray=[]] - Rowarray value.
   *
   * @returns {number} The resulting value.
   */
  addRow(rowArray = []) {
    this.data.push(rowArray.slice());
    return this.data.length - 1;
  }
  /**
   * Removes and returns a row.
   *
   * @param {number} index - Index value.
   *
   * @returns {Array|undefined} The resulting value.
   */
  removeRow(index) { return this.data.splice(index, 1)[0]; }
  /**
   * Removes all rows.
   *
   * @returns {Table} This instance for chaining.
   */
  clearRows() { this.data = []; return this; }

  /**
   * Returns the image, a cropped image, or a pixel value.
   *
   * @param {number} row - Zero-based row index.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {Images|number[]} The resulting value.
   */
  get(row, col) { return this.data[row][this._colIndex(col)]; }
  /**
   * Returns a cell converted to a number.
   *
   * @param {number} row - Zero-based row index.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {number} The resulting value.
   */
  getNum(row, col) { return parseFloat(this.get(row, col)); }
  /**
   * Returns a cell converted to text.
   *
   * @param {number} row - Zero-based row index.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {*} The resulting value.
   */
  getString(row, col) { return String(this.get(row, col)); }
  /**
   * Sets one pixel from RGBA channels or a color-like object.
   *
   * @param {number} row - Zero-based row index.
   * @param {string|number|*} col - Column name or zero-based index.
   * @param {number} value - Value value.
   *
   * @returns {Images} The resulting value.
   */
  set(row, col, value) { this.data[row][this._colIndex(col)] = value; return this; }
  /**
   * Stores a numeric cell value.
   *
   * @param {number} row - Zero-based row index.
   * @param {string|number|*} col - Column name or zero-based index.
   * @param {number} value - Value value.
   *
   * @returns {*} The resulting value.
   */
  setNum(row, col, value) { return this.set(row, col, Number(value)); }
  /**
   * Stores a string cell value.
   *
   * @param {number} row - Zero-based row index.
   * @param {string|number|*} col - Column name or zero-based index.
   * @param {number} value - Value value.
   *
   * @returns {*} The resulting value.
   */
  setString(row, col, value) { return this.set(row, col, String(value)); }

  /**
   * Returns a copy of the values in a column.
   *
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {Array} The resulting value.
   */
  getColumn(col) { const idx = this._colIndex(col); return this.data.map(r => r[idx]); }
  /**
   * Returns a copy of a row.
   *
   * @param {number} index - Index value.
   *
   * @returns {Array} The resulting value.
   */
  getRow(index) { return this.data[index].slice(); }
  /**
   * Returns indexed row descriptors.
   *
   * @returns {Object[]} The resulting value.
   */
  rows() { return this.data.map((r, i) => ({ index: i, values: r.slice() })); }

  /**
   * Returns a deep-enough row-wise copy of the table data.
   *
   * @returns {Array[]} The resulting value.
   */
  getArray() { return this.data.map(r => r.slice()); }
  /**
   * Converts rows to objects, optionally keyed by a column.
   *
   * @param {string|number|*} keyColumn - Keycolumn value.
   *
   * @returns {Object|Object[]} The resulting value.
   */
  getObject(keyColumn) {
    if (keyColumn === undefined) return this.data.map(r => this._rowToObject(r));
    const idx = this._colIndex(keyColumn);
    const out = {};
    for (const row of this.data) out[row[idx]] = this._rowToObject(row);
    return out;
  }
  /**
   * Converts one row to an object using column names.
   *
   * @param {number} row - Zero-based row index.
   *
   * @returns {Object} The resulting value.
   */
  _rowToObject(row) {
    const obj = {};
    this.columnNames.forEach((name, i) => { obj[name || i] = row[i]; });
    return obj;
  }

  /**
   * Finds the first row containing an exact value in a column.
   *
   * @param {number} value - Value value.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {Array|null} The resulting value.
   */
  findRow(value, col) {
    const idx = this._colIndex(col);
    const i = this.data.findIndex(r => r[idx] === value);
    return i === -1 ? null : this.getRow(i);
  }
  /**
   * Finds all rows containing an exact value in a column.
   *
   * @param {number} value - Value value.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {Array[]} The resulting value.
   */
  findRows(value, col) {
    const idx = this._colIndex(col);
    return this.data.filter(r => r[idx] === value).map(r => r.slice());
  }
  /**
   * Finds the first row whose selected cell matches a regular expression.
   *
   * @param {string|number|*} regex - Regular-expression pattern.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {Array|null} The resulting value.
   */
  matchRow(regex, col) {
    const idx = this._colIndex(col);
    const re = new RegExp(regex);
    const row = this.data.find(r => re.test(r[idx]));
    return row ? row.slice() : null;
  }
  /**
   * Finds all rows whose selected cells match a regular expression.
   *
   * @param {string|number|*} regex - Regular-expression pattern.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {Array[]} The resulting value.
   */
  matchRows(regex, col) {
    const idx = this._colIndex(col);
    const re = new RegExp(regex);
    return this.data.filter(r => re.test(r[idx])).map(r => r.slice());
  }
  /**
   * Removes selected characters from one or all columns.
   *
   * @param {string|number|*} tokens - Characters to remove.
   * @param {string|number|*} col - Column name or zero-based index.
   *
   * @returns {*} The resulting value.
   */
  removeTokens(tokens, col) {
    const cols = col === undefined ? this.columnNames.map((_, i) => i) : [this._colIndex(col)];
    const re = new RegExp(`[${tokens.split('').map(c => '\\' + c).join('')}]`, 'g');
    for (const row of this.data) for (const c of cols) row[c] = String(row[c]).replace(re, '');
    return this;
  }
  /**
   * Trims whitespace from every cell.
   *
   * @returns {Table} This instance for chaining.
   */
  trim() {
    for (const row of this.data) {
      for (let i = 0; i < row.length; i++) row[i] = String(row[i]).trim();
    }
    return this;
  }
}

// ---------------------------------------------------------------------------
// XML — minimal hand-written parser (no dependency), sufficient for basic
// well-formed documents (elements, attributes, text content).
// ---------------------------------------------------------------------------
class XML {
  /**
   * Creates a new XML instance.
   *
   * @param {string|number|*} [name=''] - Name value.
   * @param {string|number|*} [attributes={}] - Attributes value.
   * @param {string|number|*} [parent=null] - Parent value.
   */
  constructor(name = '', attributes = {}, parent = null) {
    this.name = name;
    this.attributes = attributes;
    this.parent = parent;
    this.children = [];
    this.content = '';
  }
  /**
   * Parses an XML document into a tree.
   *
   * @param {string|number|*} str - Str value.
   *
   * @returns {XML} This instance for chaining.
   */
  static parse(str) {
    let i = 0;
    const len = str.length;
    function skipProlog() {
      while (str[i] === '<' && (str[i + 1] === '?' || str[i + 1] === '!')) {
        const end = str.indexOf('>', i);
        i = end + 1;
        while (/\s/.test(str[i])) i++;
      }
    }
    function parseAttributes(tag) {
      const attrs = {};
      const re = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
      let m;
      while ((m = re.exec(tag))) {
        if (m[1]) attrs[m[1]] = m[2]; else attrs[m[3]] = m[4];
      }
      return attrs;
    }
    function parseElement(parent) {
      const openMatch = /^<([\w:-]+)((?:\s+[^>]*)?)\/?>/.exec(str.slice(i));
      const tagStr = str.slice(i, str.indexOf('>', i) + 1);
      const selfClosing = /\/>$/.test(tagStr);
      const nameMatch = /^<([\w:-]+)/.exec(tagStr);
      const name = nameMatch[1];
      const attrs = parseAttributes(tagStr);
      const node = new XML(name, attrs, parent);
      i += tagStr.length;
      if (selfClosing) return node;
      while (i < len) {
        if (str.slice(i, i + 2 + name.length + 1) === `</${name}>`) {
          i += name.length + 3;
          break;
        }
        if (str[i] === '<') {
          node.children.push(parseElement(node));
        } else {
          const nextTag = str.indexOf('<', i);
          node.content += str.slice(i, nextTag === -1 ? len : nextTag);
          i = nextTag === -1 ? len : nextTag;
        }
      }
      return node;
    }
    skipProlog();
    while (i < len && str[i] !== '<') i++;
    return parseElement(null);
  }

  /**
   * Returns the element name.
   *
   * @returns {string} The resulting value.
   */
  getName() { return this.name; }
  /**
   * Renames the XML element.
   *
   * @param {string|number|*} name - Name value.
   *
   * @returns {XML} This instance for chaining.
   */
  setName(name) { this.name = name; return this; }
  /**
   * Returns trimmed text content.
   *
   * @returns {string} The resulting value.
   */
  getContent() { return this.content.trim(); }
  /**
   * Returns the parent XML node.
   *
   * @returns {XML|null} The resulting value.
   */
  getParent() { return this.parent; }
  /**
   * Returns child nodes, optionally filtered by name.
   *
   * @param {string|number|*} name - Name value.
   *
   * @returns {XML[]} The resulting value.
   */
  getChildren(name) {
    return name ? this.children.filter(c => c.name === name) : this.children.slice();
  }
  /**
   * Returns a child by name or index.
   *
   * @param {string|number|*} nameOrIndex - Nameorindex value.
   *
   * @returns {XML|null} The resulting value.
   */
  getChild(nameOrIndex) {
    if (typeof nameOrIndex === 'number') return this.children[nameOrIndex];
    return this.children.find(c => c.name === nameOrIndex) || null;
  }
  /**
   * Checks whether the node contains children.
   *
   * @returns {boolean} The resulting value.
   */
  hasChildren() { return this.children.length > 0; }
  /**
   * Lists child element names.
   *
   * @returns {string[]} The resulting value.
   */
  listChildren() { return this.children.map(c => c.name); }
  /**
   * Appends a child node and assigns its parent.
   *
   * @param {XML} child - Child value.
   *
   * @returns {XML} This instance for chaining.
   */
  addChild(child) { child.parent = this; this.children.push(child); return child; }
  /**
   * Removes a child by name or index.
   *
   * @param {string|number|*} nameOrIndex - Nameorindex value.
   *
   * @returns {XML|null} The resulting value.
   */
  removeChild(nameOrIndex) {
    const idx = typeof nameOrIndex === 'number' ? nameOrIndex : this.children.findIndex(c => c.name === nameOrIndex);
    return idx === -1 ? null : this.children.splice(idx, 1)[0];
  }
  /**
   * Checks whether an attribute exists.
   *
   * @param {string|number|*} name - Name value.
   *
   * @returns {boolean} The resulting value.
   */
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  /**
   * Returns the number of attributes.
   *
   * @returns {number} The resulting value.
   */
  getAttributeCount() { return Object.keys(this.attributes).length; }
  /**
   * Lists attribute names.
   *
   * @returns {string[]} The resulting value.
   */
  listAttributes() { return Object.keys(this.attributes); }
  /**
   * Returns a cell converted to text.
   *
   * @param {string|number|*} name - Name value.
   * @param {string|number|*} def - Def value.
   *
   * @returns {*} The resulting value.
   */
  getString(name, def) { return this.hasAttribute(name) ? this.attributes[name] : def; }
  /**
   * Returns a cell converted to a number.
   *
   * @param {string|number|*} name - Name value.
   * @param {string|number|*} def - Def value.
   *
   * @returns {number} The resulting value.
   */
  getNum(name, def) { return this.hasAttribute(name) ? parseFloat(this.attributes[name]) : def; }
  /**
   * Sets an XML attribute.
   *
   * @param {string|number|*} name - Name value.
   * @param {number} value - Value value.
   *
   * @returns {XML} This instance for chaining.
   */
  setAttribute(name, value) { this.attributes[name] = String(value); return this; }

  /**
   * Serializes the XML subtree with indentation.
   *
   * @param {number} [indent=0] - Indent value.
   *
   * @returns {string} The resulting value.
   */
  serialize(indent = 0) {
    const pad = '  '.repeat(indent);
    const attrs = Object.entries(this.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
    if (!this.children.length && !this.content.trim()) return `${pad}<${this.name}${attrs}/>`;
    const inner = [
      ...(this.content.trim() ? [pad + '  ' + this.content.trim()] : []),
      ...this.children.map(c => c.serialize(indent + 1))
    ].join('\n');
    return `${pad}<${this.name}${attrs}>\n${inner}\n${pad}</${this.name}>`;
  }
}

// ---------------------------------------------------------------------------
// DateTime — thin wrapper around the native Date object
// ---------------------------------------------------------------------------
class DateTime {
  /**
   * Creates a new DateTime instance.
   *
   * @param {string|number|*} [date=new Date(] - Date value.
   */
  constructor(date = new Date()) { this.date = date; }
  /**
   * Returns the local day of the month.
   *
   * @returns {number} The resulting value.
   */
  day() { return this.date.getDate(); }
  /**
   * Returns the local month number.
   *
   * @returns {number} The resulting value.
   */
  month() { return this.date.getMonth() + 1; }
  /**
   * Returns the local four-digit year.
   *
   * @returns {number} The resulting value.
   */
  year() { return this.date.getFullYear(); }
  /**
   * Returns the local hour.
   *
   * @returns {number} The resulting value.
   */
  hour() { return this.date.getHours(); }
  /**
   * Returns the local minute.
   *
   * @returns {number} The resulting value.
   */
  minute() { return this.date.getMinutes(); }
  /**
   * Returns the local second.
   *
   * @returns {number} The resulting value.
   */
  second() { return this.date.getSeconds(); }
  /**
   * Returns milliseconds since the Unix epoch.
   *
   * @returns {number} The resulting value.
   */
  millis() { return this.date.getTime(); }
}

// ---------------------------------------------------------------------------
// IO — file + network operations
// ---------------------------------------------------------------------------
class Writer {
  /**
   * Creates a new Writer instance.
   *
   * @param {string|number|*} filePath - Destination or source file path.
   */
  constructor(filePath) {
    this.filePath = filePath;
    this.lines = [];
  }
  /**
   * Appends data to the writer buffer.
   *
   * @param {Buffer|Uint8Array|*} data - Data value.
   *
   * @returns {Writer} This instance for chaining.
   */
  write(data) { this.lines.push(Array.isArray(data) ? data.join('') : String(data)); return this; }
  /**
   * Flushes buffered data or closes a writer.
   *
   * @returns {Writer} This instance for chaining.
   */
  close() {
    fs.writeFileSync(this.filePath, this.lines.join(''), 'utf8');
    return this;
  }
}

class IO {
  /**
   * Creates a buffered UTF-8 file writer.
   *
   * @param {string|number|*} filePath - Destination or source file path.
   *
   * @returns {Writer} The resulting value.
   */
  createWriter(filePath) { return new Writer(filePath); }

  /**
   * Loads and parses JSON from a file or URL.
   *
   * @param {string|number|*} pathOrUrl - Local file path or HTTP(S) URL.
   *
   * @returns {Promise<*>} A promise resolving to the requested result.
   */
  async loadJSON(pathOrUrl) {
    const text = isURL(pathOrUrl)
      ? await (await fetch(pathOrUrl)).text()
      : fs.readFileSync(pathOrUrl, 'utf8');
    return JSON.parse(text);
  }
  /**
   * Serializes JSON to a UTF-8 file.
   *
   * @param {Object} json - Json value.
   * @param {string|number|*} filePath - Destination or source file path.
   * @param {boolean} [pretty=true] - Pretty value.
   *
   * @returns {boolean} The resulting value.
   */
  saveJSON(json, filePath, pretty = true) {
    fs.writeFileSync(filePath, JSON.stringify(json, null, pretty ? 2 : 0), 'utf8');
    return true;
  }

  /**
   * Loads text as an array of lines.
   *
   * @param {string|number|*} pathOrUrl - Local file path or HTTP(S) URL.
   *
   * @returns {Promise<string[]>} A promise resolving to the requested result.
   */
  async loadStrings(pathOrUrl) {
    const text = isURL(pathOrUrl)
      ? await (await fetch(pathOrUrl)).text()
      : fs.readFileSync(pathOrUrl, 'utf8');
    return text.split(/\r\n|\r|\n/);
  }
  /**
   * Saves lines to a UTF-8 text file.
   *
   * @param {Array} lines - Lines value.
   * @param {string|number|*} filePath - Destination or source file path.
   *
   * @returns {boolean} The resulting value.
   */
  saveStrings(lines, filePath) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return true;
  }

  /**
   * Loads binary data from a file or URL.
   *
   * @param {string|number|*} pathOrUrl - Local file path or HTTP(S) URL.
   *
   * @returns {Promise<Buffer>} A promise resolving to the requested result.
   */
  async loadBytes(pathOrUrl) {
    if (isURL(pathOrUrl)) return Buffer.from(await (await fetch(pathOrUrl)).arrayBuffer());
    return fs.readFileSync(pathOrUrl);
  }
  /**
   * Loads binary data as a Buffer.
   *
   * @param {string|number|*} pathOrUrl - Local file path or HTTP(S) URL.
   *
   * @returns {Promise<Buffer>} A promise resolving to the requested result.
   */
  async loadBlob(pathOrUrl) { return this.loadBytes(pathOrUrl); }

  /**
   * Loads CSV or TSV data into a table.
   *
   * @param {string|number|*} pathOrUrl - Local file path or HTTP(S) URL.
   * @param {string|number|*} [format='csv'] - Input or output format.
   * @param {boolean} [hasHeader=true] - Whether the first row contains column names.
   *
   * @returns {Promise<Table>} A promise resolving to the requested result.
   */
  async loadTable(pathOrUrl, format = 'csv', hasHeader = true) {
    const text = isURL(pathOrUrl)
      ? await (await fetch(pathOrUrl)).text()
      : fs.readFileSync(pathOrUrl, 'utf8');
    const delimiter = format === 'tsv' ? '\t' : ',';
    return Table.fromCSV(text, delimiter, hasHeader);
  }
  /**
   * Saves a table as CSV or TSV.
   *
   * @param {Table} table - Table value.
   * @param {string|number|*} filePath - Destination or source file path.
   * @param {string|number|*} [format='csv'] - Input or output format.
   *
   * @returns {boolean} The resulting value.
   */
  saveTable(table, filePath, format = 'csv') {
    const delimiter = format === 'tsv' ? '\t' : ',';
    fs.writeFileSync(filePath, table.toCSV(delimiter), 'utf8');
    return true;
  }

  /**
   * Loads and parses XML from a file or URL.
   *
   * @param {string|number|*} pathOrUrl - Local file path or HTTP(S) URL.
   *
   * @returns {Promise<XML>} A promise resolving to the requested result.
   */
  async loadXML(pathOrUrl) {
    const text = isURL(pathOrUrl)
      ? await (await fetch(pathOrUrl)).text()
      : fs.readFileSync(pathOrUrl, 'utf8');
    return XML.parse(text);
  }

  /**
   * Performs an HTTP GET request.
   *
   * @param {string|number|*} url - Url value.
   * @param {Object} [options={}] - Options value.
   *
   * @returns {Promise<*>} A promise resolving to the requested result.
   */
  async httpGet(url, options = {}) {
    const res = await fetch(url, { ...options, method: 'GET' });
    return this._parseResponse(res, options.dataType);
  }
  /**
   * Performs an HTTP POST request.
   *
   * @param {string|number|*} url - Url value.
   * @param {Buffer|Uint8Array|*} data - Data value.
   * @param {Object} [options={}] - Options value.
   *
   * @returns {Promise<*>} A promise resolving to the requested result.
   */
  async httpPost(url, data, options = {}) {
    const body = options.dataType === 'json' || (data && typeof data === 'object')
      ? JSON.stringify(data)
      : data;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const res = await fetch(url, { ...options, method: 'POST', body, headers });
    return this._parseResponse(res, options.dataType);
  }
  /**
   * Performs an HTTP request using the specified method.
   *
   * @param {string|number|*} url - Url value.
   * @param {string|number|*} [method='GET'] - Method value.
   * @param {Buffer|Uint8Array|*} data - Data value.
   * @param {Object} [options={}] - Options value.
   *
   * @returns {Promise<*>} A promise resolving to the requested result.
   */
  async httpDo(url, method = 'GET', data, options = {}) {
    const res = await fetch(url, { ...options, method, body: data ? JSON.stringify(data) : undefined });
    return this._parseResponse(res, options.dataType);
  }
  /**
   * Parses an HTTP response according to the requested data type.
   *
   * @param {string|number|*} res - Res value.
   * @param {string|number|*} dataType - Expected response representation.
   *
   * @returns {Promise<*>} A promise resolving to the requested result.
   */
  async _parseResponse(res, dataType) {
    if (dataType === 'text') return res.text();
    if (dataType === 'binary') return Buffer.from(await res.arrayBuffer());
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { return text; }
  }

  /**
   * Saves an image to disk.
   *
   * @param {Buffer|Uint8Array|*} data - Data value.
   * @param {string|number|*} filePath - Destination or source file path.
   *
   * @returns {boolean|string} The resulting value.
   */
  save(data, filePath) {
    if (Buffer.isBuffer(data)) { fs.writeFileSync(filePath, data); return true; }
    if (typeof data === 'object') return this.saveJSON(data, filePath);
    fs.writeFileSync(filePath, String(data), 'utf8');
    return true;
  }
  /**
   * Provides a no-op compatibility hook in headless Node.
   *
   * @returns {null} The resulting value.
   */
  setContent() {
    // No DOM in Node; content targets are the caller's responsibility.
    return null;
  }
  /**
   * Flushes buffered data or closes a writer.
   *
   * @param {string|number|*} writer - Writer value.
   *
   * @returns {*} The resulting value.
   */
  close(writer) { if (writer instanceof Writer) writer.close(); return true; }
}

module.exports = { IO, Table, XML, DateTime, Writer };
