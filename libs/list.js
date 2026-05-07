import { Text } from "./text.js";
import { math } from "./math.js";

export const List = class {
    constructor() {}

    /**
     * Creates a typed text list with 1-based indexing
     * @param {...String} list - Initial items
     * @returns {{
     *   type: StringConstructor,
     *   set: (...items: String[]) => void,
     *   push: (item: String) => void,
     *   all: () => String[],
     *   one: (index: Number) => String,
     *   pop: () => String,
     *   join: (delimiter: String) => String,
     *   find: (item: String) => Number
     * }}
     */
    static textList(...list) {
        list = list.flat().map(String);
        return Object.freeze({
            type: String,
            set:  (...items) => list = items.flat().map(String),
            push: (item)     => list.push(String(item)),
            all:  ()         => list,
            one:  (index)    => list[Math.max(index - 1, 0)] ?? '',
            pop:  ()         => list.pop(),
            join: (delimiter)=> list.join(delimiter),
            find: (string)   => list.indexOf(String(string)) + 1
        });
    }

    /**
     * Creates a typed number list with 1-based indexing
     * @param {...Number} list - Initial items
     * @returns {{
     *   type: NumberConstructor,
     *   set: (...items: Number[]) => void,
     *   push: (item: Number) => void,
     *   all: () => Number[],
     *   one: (index: Number) => Number,
     *   pop: () => Number,
     *   join: (delimiter: String) => String,
     *   find: (item: Number) => Number
     * }}
     */
    static numberList(...list) {
        list = list.flat().map(Number);
        return Object.freeze({
            type: Number,
            set:  (...items) => list = items.flat().map(Number),
            push: (item)     => list.push(Number(item)),
            all:  ()         => list,
            one:  (index)    => list[Math.max(index - 1, 0)] ?? '',
            pop:  ()         => list.pop(),
            join: (delimiter)=> list.join(delimiter),
            find: (number)   => list.indexOf(Number(number)) + 1
        });
    }

    /**
     * Inserts, removes, or replaces an item in a list at a given index
     * @param {Object}                    list   - A `textList` or `numberList`
     * @param {'Insert'|'Remove'|'Replace'} modify - Operation to perform
     * @param {Number}                    [index] - 1-based index to target (defaults to end of list)
     * @param {String|Number}             [value] - Value to insert or replace with (ignored for Remove)
     * @returns {String[]|Number[]} The modified list
     */
    static modify(list, modify = 'Insert', index, value) {
        const i    = Math.max((index ?? list.all().length + 1) - 1, 0);
        const cast = list.type === Number ? Number : String;
        const op   = Text.lower(modify);
        const temp = list.all();

        if      (op === 'insert')  temp.splice(i, 0, cast(value ?? 0));
        else if (op === 'remove')  temp.splice(i, 1);
        else if (op === 'replace') temp[i] = cast(value ?? 0);

        list.set(...temp);
        return list.all();
    }

    /**
     * Sorts a list in place
     * @param {Object}                      list              - A `textList` or `numberList`
     * @param {'Normal'|'Reverse'|'Shuffle'} [sort='Normal']  - Sort mode:
     *   - `'Normal'`  — ascending (A→Z or 0→9)
     *   - `'Reverse'` — descending (Z→A or 9→0)
     *   - `'Shuffle'` — randomize order (Fisher-Yates)
     * @param {Boolean} [sortTextAsNumber=false] - When sorting a `textList`, cast items to
     *   numbers before comparing (e.g. `"10"` > `"9"` instead of `"10"` < `"9"`)
     * @returns {String[]|Number[]} The sorted list
     */
    static sort(list, sort = 'Normal', sortTextAsNumber = false) {
        const temp = list.all();
        const op   = Text.lower(sort);

        if (op === 'shuffle') {
            for (let i = temp.length - 1; i > 0; i--) {
                const j = math.randomInt(0, i);
                [temp[i], temp[j]] = [temp[j], temp[i]];
            }
        } else {
            const dir = op === 'reverse' ? -1 : 1;
            temp.sort(list.type === Number || sortTextAsNumber
                ? (a, b) => (Number(a) - Number(b)) * dir
                : (a, b) => a.localeCompare(b) * dir
            );
        }

        list.set(...temp);
        return list.all();
    }
    static each(list, delay = 0) {
        const callbacks = { index: null, out: null, done: null };
        const items = list.all();

        const run = async () => {
            for (let i = 0; i < items.length; i++) {
                callbacks.index?.(i + 1);
                callbacks.out?.(items[i]);
                if (delay > 0 && i < items.length - 1)
                    await new Promise(resolve => setTimeout(resolve, delay));
            }
            callbacks.done?.();
        };

        setTimeout(run, 0);

        const api = Object.freeze({
            index: (cb) => { callbacks.index = cb; return api; },
            out:   (cb) => { callbacks.out   = cb; return api; },
            done:  (cb) => { callbacks.done  = cb; return api; }
        });

        return api;
    }
    /**
     * Returns the number of items in the list
     * @param {Object} list Text or Number list
     * @returns {Number}
     */
    static count(list){
        return list.all().length;
    }
}