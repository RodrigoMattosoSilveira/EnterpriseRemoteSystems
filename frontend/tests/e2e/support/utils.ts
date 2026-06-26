import { chromium, Page } from 'playwright';

const GOLD_PRICE_DATE         = 0;
const GOLD_PRICE_BRL_PER_GRAM = 1;
const GOLD_PRICE_RECORDED_BY  = 2;
const GOLD_PRICE_NOTES        = 3;
const GOLD_PRICE_STATUS       = 4;

/**
 * Generates a unique 32-character alphanumeric string.
 * Uses cryptographically secure random values available in browser environments.
 */
export function generateUniqueString(): string {
    const randomBytes = new Uint8Array(48);
    crypto.getRandomValues(randomBytes);

    const str = btoa(String.fromCharCode(...randomBytes))
        .replace(/[^a-zA-Z0-9]/g, "");

    if (str.length < 32) {
        return generateUniqueString();
    }

    return str.substring(0, 32);
}