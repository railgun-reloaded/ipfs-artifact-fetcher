import type { BytesData } from './definitions.js'

/**
 * Ensure a value is not null or undefined.
 * @param value The value to check.
 * @returns boolean
 */
function isDefined (value: any): value is NonNullable<any> {
  return value !== null && value !== undefined
}

/**
 * Checks if a string is prefixed with '0x'.
 * @param str The string to check.
 * @returns True if the string starts with '0x', otherwise false.
 */
const isPrefixed = (str: string): boolean => str.startsWith('0x')

/**
 * Removes the '0x' prefix from a hexadecimal string if present.
 * @param str The hexadecimal string to process.
 * @returns The string without a leading '0x' prefix.
 */
function strip0x (str: string) {
  return (isPrefixed(str) ? str.slice(2) : str)
};

/**
 * Coerces BytesData into hex string format
 * @param data - bytes data to coerce
 * @param prefix - prefix with 0x
 * @returns hex string
 */
function hexlify (data: BytesData, prefix = false): string {
  let hexString = ''

  if (typeof data === 'string') {
    // If we're already a string return the string
    // Strip leading 0x if it exists before returning
    hexString = strip0x(data)
  } else if (typeof data === 'bigint' || typeof data === 'number') {
    hexString = data.toString(16)
    if (hexString.length % 2 === 1) {
      hexString = `0${hexString}`
    }
  } else {
    // We're an ArrayLike
    // Coerce ArrayLike to Array
    const dataArray: number[] = Array.from(data)

    // Convert array of bytes to hex string
    hexString = dataArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  // Return 0x prefixed hex string if specified
  if (prefix) {
    return `0x${hexString}`.toLowerCase()
  }

  // Else return plain hex string
  return hexString.toLowerCase()
}

export { isDefined, isPrefixed, strip0x, hexlify }
