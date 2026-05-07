export const Text = class {
    constructor(){}
    /**
     * Checks if the string is empty
     * @param {String} str
     * @returns {Boolean}
     */
    static isEmpty(str){return !str||str.length === 0;}
    /**
     * Checks if the string is blank
     * @param {String} str
     * @returns {Boolean}
     */
    static isBlank(str){return !str||str.trim() === '';}
    /**
     * Checks if the value is a string
     * @param {*} value Value to check
     * @returns {Boolean}
     */
    static isStr(value){return typeof value==='string';}
    /**
     * Trims the string of a specific characters
     * @param {String} str
     * @param {String} [chars=" \n\r\t\v\x00"] Characters to trim
     * @returns {String}
     */
    static trim(str, chars=' \n\r\t\v\x00'){return str.replace(new RegExp(`^[${chars}]+|[${chars}]+$`,'g'),'');}
    /**
     * Trims the start of the string of a specific characters
     * @param {String} str
     * @param {String} [chars=" \n\r\t\v\x00"] Characters to trim
     * @returns {String}
     */
    static ltrim(str, chars=' \n\r\t\v\x00'){return str.replace(new RegExp(`^[${chars}]+`,'g'),'');}
    /**
     * Trims the end of the string of a specific characters
     * @param {String} str
     * @param {String} [chars=" \n\r\t\v\x00"] Characters to trim
     * @returns {String}
     */
    static rtrim(str, chars=' \n\r\t\v\x00'){return str.replace(new RegExp(`[${chars}]+$`,'g'),'');}
    /**
     * Normalizes whitespaces in a string
     * @param {String} str
     * @returns {String}
     */
    static normalizeWhitespace(str){return str.replace(/\s+/g,' ').trim();}
    /**
     * Converts string to uppercase
     * @param {String} str
     * @returns {String}
     */
    static upper(str){
        return str.toLocaleUpperCase();
    }
    /**
     * Converts string to lowercase
     * @param {String} str
     * @returns {String}
     */
    static lower(str){
        return str.toLocaleLowerCase();
    }
    /**
     * Converts a string to a case type
     * @param {String} str
     * @param {'Title'|'Camel'|'Pascal'|'Kebab'|'Snake'} type Case type
     * @returns {String}
     */
    static toCase(str, type){
        switch(Text.lower(type)){
            case 'title':
                return Text.#title(str);
            case 'camel':
                return Text.#camel(str);
            case 'pascal':
                return Text.#pascal(str);
            case 'kebab':
                return Text.#kebab(str);
            case 'snake':
                return Text.#snake(str);
            default:
                return str;
        }
    }
    static #title = str=>str.replace(/\w\S*/g,text=>`${Text.upper(text.charAt(0))}${Text.lower(text.substring(1))}`);
    static #camel = str=>Text.lower(str).replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => Text.upper(chr));
    static #pascal = str => Text.lower(str)
    .replace(/[^a-zA-Z0-9]+(.)/g, (match, chr) => Text.upper(chr))
    .replace(/^./, c => Text.upper(c));
    static #kebab = str => Text.lower(str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/gi, '-'))
    .replace(/^-+|-+$/g, '');
    static #snake = str => Text.lower(str
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_'))
    .replace(/^_+|_+$/g, '');  
    /**
     * Checks if the string includes key
     * @param {String} str
     * @param {String} search Search string
     * @param {boolean} [caseInsensitive=false] Case insensitivity
     * @returns {Boolean}
     */
    static includes(str, search, caseInsensitive=false){
        return caseInsensitive ? Text.lower(str).includes(Text.lower(str)) : str.includes(search);
    }
    /**
     * Checks if the string starts with by a specific word
     * @param {String} str
     * @param {String} search Search for word in the string
     * @param {Boolean} [caseInsensitive=false]  Case insensitivity
     * @returns {Boolean}
     */
    static startsWith(str,search,caseInsensitive=false){
        return caseInsensitive ? Text.lower(str).startsWith(Text.lower(search)) : str.startsWith(search);
    }
    /**
     * Checks if the string end with by a specific word
     * @param {String} str
     * @param {String} search Search for word in the string
     * @param {Boolean} [caseInsensitive=false]  Case insensitivity
     * @returns {Boolean}
     */
    static endsWith(str,search,caseInsensitive=false){
        return caseInsensitive ? Text.lower(str).endsWith(Text.lower(search)) : str.endsWith(search);
    }
    /**
     * Checks if the 2 strings are equal
     * @param {String} str1 String 1
     * @param {String} str2 String 2
     * @param {Boolean} caseInsensitive Case insensitivity
     */
    static equals(str1, str2, caseInsensitive = false) {
        const options = caseInsensitive ? { sensitivity: 'base' } : undefined;
        return str1.localeCompare(str2, undefined, options) === 0;
    }   
    /**
     * Replaces all searched string and replaces it
     * @param {String} str
     * @param {String} search Searched string
     * @param {String} replacement Replacement
     * @returns {String}
     */
    static replaceMany(str,search,replacement){
        return str.replace(new RegExp(search,'g'),replacement);
    }
    /**
     * Removes a certain string or pattern from the string
     * @param {String} str
     * @param {String} pattern Pattern to find
     * @returns {String}
     */
    static remove(str,pattern){
        return str.replace(new RegExp(pattern,'g'),'');
    }
    /**
     * Shortening a text by removing characters from the end, often to fit a specific display width or storage limit.
     * @param {String} str
     * @param {Number} length Length of the string
     * @param {String} [suffix='...'] Suffix at the end of the string 
     * @returns {String}
     */
    static truncate(str, length = 8, suffix = '...') {
        if (str.length <= length) return str;
        return `${str.substring(0, length - suffix.length)}${suffix}`;
    }
    /**
     * Returns the length of the string
     * @param {String} str 
     * @returns {Number}
     */
    static len = str=>str.length;
    /**
     * Returns the number of words
     * @param {String} str 
     * @returns {Number}
     */
    static words = str=>str.match(/\w+/g).length;
    /**
     * Returns the number of characters
     * @param {String} str 
     * @returns {Number}
     */
    static chars = str => (str.match(/./g) || []).length;   
    /**
     * Splits the string
     * @param {String} str 
     * @param {String|RegExp} delimiter Character/Pattern to split the string  
     * @returns {String[]}
     */
    static split = (str,delimiter)=>str.split(delimiter).filter(i=>i!=='');
    /**
     * Splits the string by lines
     * @param {String} str 
     * @returns {String[]}
     */
    static lines = str => str.split('\n').map(i=>i.trim()).filter(i=>i!=='');
    /**
     * Splits the string by words
     * @param {String} str 
     * @returns {String[]}
     */
    static words = (str) => {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
        return Array.from(segmenter.segment(str))
            .filter(segment => segment.isWordLike)
            .map(segment => segment.segment);
    };   
    /**
     * Adds character to fulfill the length of the string at the left of the string
     * @param {String} str 
     * @param {Number} len Max Length
     * @param {String} char Character to replace it with
     * @returns {String}
     */
    static lpad(str,len,char=" "){
        return str.padStart(len,char);
    }
    /**
     * Adds character to fulfill the length of the string at the left of the string
     * @param {String} str 
     * @param {Number} len Max Length
     * @param {String} char Character to replace it with
     * @returns {String}
     */
    static rpad(str,len,char=" "){
        return str.padEnd(len,char);
    }
    /**
     * Adds character to fulfill the length of the string from both ends of the string
     * @param {String} str
     * @param {Number} len Max length
     * @param {String} [char=" "] Character to replace
     * @returns {String}
     */
    static pad(str, len, char = " ") {
        // Convert str to string and handle edge cases
        str = String(str);
        if (str.length >= len) return str;

        // Calculate total padding and split between left and right
        const totalPad = len - str.length;
        const padLeft = Math.floor(totalPad / 2);
        const padRight = totalPad - padLeft; // Ensures the total length is exactly `len`

        return `${char.repeat(padLeft)}${str}${char.repeat(padRight)}`;
    }
    /**
     * Escapes HTML code
     * @param {String} str 
     * @returns {String}
     */
    static encodeHTML = str => str.replace(/[&<>"'`]/g,matches=>{
        const entries = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '`': '&#96;'
        };
        return entries[matches];
    });
    /**
     * Unescapes HTML string
     * @param {String} str 
     * @returns {String}
     */
    static decodeHTML = str =>str.replace(/&amp;|&lt;|&gt;|&#39;|&quot;/g,tag => ({
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&#39;': "'",
        '&quot;': '"'
        }[tag] || tag)
    );
    /**
     * Encodes URI
     * @param {String} str 
     * @returns {String}
     */
    static encodeURI = str =>encodeURI(str);
    /**
     * Decodes URI
     * @param {String} str 
     * @returns {String}
     */
    static decodeURI = str=>decodeURI(str);
    /**
     * Generate a UUID
     * @param {number} version UUID version (1,3,4,5,6,7)
     * @param {string} [namespace] Required for v3/v5
     * @param {string} [name] Required for v3/v5
     */
    static async UUID(version = 4, namespace, name) {
        switch (version) {
            case 1: return this.#v1();
            case 3: return await this.#nameBased(3, "MD5", namespace, name);
            case 4: return this.#v4();
            case 5: return await this.#nameBased(5, "SHA-1", namespace, name);
            case 6: return this.#v6();
            case 7: return this.#v7();
            default:
                throw new Error(`Unsupported UUID version: ${version}`);
        }
    }

    /* ---------- v4 (Random) ---------- */
    static #v4() {
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        return this.#format(b);
    }

    /* ---------- v1 (Time-based) ---------- */
    static #v1() {
        const b = crypto.getRandomValues(new Uint8Array(16));
        const ts = BigInt(Date.now()) * 10000n + 0x01B21DD213814000n;

        b[0] = Number((ts >> 24n) & 0xffn);
        b[1] = Number((ts >> 16n) & 0xffn);
        b[2] = Number((ts >> 8n) & 0xffn);
        b[3] = Number(ts & 0xffn);
        b[4] = Number((ts >> 40n) & 0xffn);
        b[5] = Number((ts >> 32n) & 0xffn);

        b[6] = (b[6] & 0x0f) | 0x10;
        b[8] = (b[8] & 0x3f) | 0x80;

        return this.#format(b);
    }

    /* ---------- v6 (Reordered v1, lexicographically sortable) ---------- */
    static #v6() {
        const b = crypto.getRandomValues(new Uint8Array(16));
        const ts = BigInt(Date.now()) * 10000n + 0x01B21DD213814000n;

        // High-to-low timestamp layout
        b[0] = Number((ts >> 56n) & 0xffn);
        b[1] = Number((ts >> 48n) & 0xffn);
        b[2] = Number((ts >> 40n) & 0xffn);
        b[3] = Number((ts >> 32n) & 0xffn);
        b[4] = Number((ts >> 24n) & 0xffn);
        b[5] = Number((ts >> 16n) & 0xffn);
        b[6] = Number((ts >> 8n) & 0x0fn) | 0x60;
        b[7] = Number(ts & 0xffn);

        b[8] = (b[8] & 0x3f) | 0x80;

        return this.#format(b);
    }

    /* ---------- v7 (Unix epoch time, recommended) ---------- */
    static #v7() {
        const b = crypto.getRandomValues(new Uint8Array(16));
        const ts = BigInt(Date.now()); // milliseconds since Unix epoch

        b[0] = Number((ts >> 40n) & 0xffn);
        b[1] = Number((ts >> 32n) & 0xffn);
        b[2] = Number((ts >> 24n) & 0xffn);
        b[3] = Number((ts >> 16n) & 0xffn);
        b[4] = Number((ts >> 8n) & 0xffn);
        b[5] = Number(ts & 0xffn);

        b[6] = 0x70 | (b[6] & 0x0f); // version 7
        b[8] = (b[8] & 0x3f) | 0x80;

        return this.#format(b);
    }

    /* ---------- v3 & v5 (Name-based) ---------- */
    static async #nameBased(version, algo, namespace, name) {
        if (!namespace || !name) {
            throw new Error(`UUID v${version} requires namespace and name`);
        }

        const nsBytes = this.parse(namespace);
        const input = new Uint8Array([...nsBytes, ...new TextEncoder().encode(name)]);
        const hash = await crypto.subtle.digest(algo, input);
        const b = new Uint8Array(hash.slice(0, 16));

        b[6] = (b[6] & 0x0f) | (version << 4);
        b[8] = (b[8] & 0x3f) | 0x80;

        return this.format(b);
    }

    /* ---------- Helpers ---------- */
    static #format(b) {
        return [...b].map((x, i) =>
            ([4, 6, 8, 10].includes(i) ? "-" : "") +
            x.toString(16).padStart(2, "0")
        ).join("");
    }

    static #parse(uuid) {
        return Uint8Array.from(
            uuid.replace(/-/g, "").match(/.{2}/g).map(h => parseInt(h, 16))
        );
    }
    /**
     * Reverse the string
     * @param {String} str 
     * @returns {String}
     */
    static reverse = str => str.split('').reverse().join('');
    /**
     * Repeat the string an X number of times
     * @param {String} str 
     * @param {Number} times Number of times to repeat
     * @returns {String}
     */
    static repeat = (str,times)=>str.repeat(times);
    
}