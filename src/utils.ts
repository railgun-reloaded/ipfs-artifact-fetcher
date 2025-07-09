/**
 * Ensure a value is not null or undefined.
 * @param value The value to check.
 * @returns boolean
 */
function isDefined (value: any): value is NonNullable<any> {
  return value !== null && value !== undefined
}

export { isDefined, }
