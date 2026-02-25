/** number of decimal digits (0-9) */
const DIGIT_COUNT = 10;
/** number of letters in the english alphabet */
const LETTER_COUNT = 26;

const DIGITS = Array.from({ length: DIGIT_COUNT }, (_, i) =>
  String.fromCharCode('0'.charCodeAt(0) + i),
).join('');
const UPPER_LETTERS = Array.from({ length: LETTER_COUNT }, (_, i) =>
  String.fromCharCode('A'.charCodeAt(0) + i),
).join('');
const LOWER_LETTERS = Array.from({ length: LETTER_COUNT }, (_, i) =>
  String.fromCharCode('a'.charCodeAt(0) + i),
).join('');

const BASE62_CHARS = `${DIGITS}${UPPER_LETTERS}${LOWER_LETTERS}`;
const BASE62_RADIX = 62n;

/**
 * generates a unique session identifier in base62 format
 * @returns unique session id in base62 encoding
 */
export function generateBase62Uuid(): string {
  const uuid = globalThis.crypto.randomUUID().replace(/-/g, '');
  let num = BigInt(`0x${uuid}`);
  let result = '';
  while (num > 0) {
    result = BASE62_CHARS[Number(num % BASE62_RADIX)] + result;
    num = num / BASE62_RADIX;
  }

  return result;
}
