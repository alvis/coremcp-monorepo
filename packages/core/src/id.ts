import { randomUUID } from 'node:crypto';

const BASE62_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE62_RADIX = 62n;

/**
 * generates a unique session identifier in base62 format
 * @returns unique session id in base62 encoding
 */
export function generateBase62Uuid(): string {
  const uuid = randomUUID().replace(/-/g, '');
  let num = BigInt('0x' + uuid);
  let result = '';
  while (num > 0) {
    result = BASE62_CHARS[Number(num % BASE62_RADIX)] + result;
    num = num / BASE62_RADIX;
  }
  return result;
}
