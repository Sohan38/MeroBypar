import { normalize } from './normalize';

export interface SearchableItem {
    name: string;
    barcode?: string | null;
    category?: string | null;
    phone?: string | null;
    /** Optional catch-all search blob (e.g. invoice #, product names, notes) */
    searchText?: string | null;
}

export function getSearchScore<T extends SearchableItem>(
    item: T,
    query: string
): number {
    if (!query.trim()) return 0;

    const q = normalize(query);

    const rawName = item.name.toLowerCase().trim();
    const normalizedName = normalize(item.name);

    const barcode = normalize(item.barcode);
    const category = normalize(item.category);
    const phone = normalize(item.phone);
    // Keep raw searchText for word-level splitting; also normalize for contains checks
    const rawSearchText = item.searchText ? item.searchText.toLowerCase().trim() : '';
    const searchText = normalize(item.searchText);

    // Highest priority: exact barcode or phone
    if (barcode === q || (phone && phone === q)) return 100;

    // Exact primary name
    if (normalizedName === q) return 95;

    // Primary name starts with query
    if (normalizedName.startsWith(q)) return 90;

    // Any word in primary name starts with query
    const words = rawName
        .replace(/[-_]/g, ' ')
        .split(/\s+/);

    if (words.some(word => normalize(word).startsWith(q))) {
        return 80;
    }

    // searchText word-starts-with (e.g. product name inside an invoice)
    if (rawSearchText) {
        const stWords = rawSearchText
            .replace(/[-_]/g, ' ')
            .split(/\s+/);
        if (stWords.some(w => normalize(w).startsWith(q))) {
            return 70;
        }
    }

    // Primary name contains query (3+ chars)
    if (q.length >= 3 && normalizedName.includes(q)) {
        return 60;
    }

    // searchText contains query (3+ chars)
    if (q.length >= 3 && searchText && searchText.includes(q)) {
        return 40;
    }

    if (q.length >= 3 && phone && phone.includes(q)) {
        return 50;
    }

    if (q.length >= 3 && category.startsWith(q)) {
        return 30;
    }

    if (q.length >= 3 && category.includes(q)) {
        return 20;
    }

    if (q.length >= 3 && barcode.includes(q)) {
        return 10;
    }

    return 0;
}