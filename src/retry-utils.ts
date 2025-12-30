import debug from 'debug'

import type { RetryOptions } from './definitions.js'
import { DEFAULT_RETRY_OPTIONS, RETRYABLE_STATUS_CODES } from './definitions.js'

const dbg = debug('ipfs-artifact-fetcher:retry')

/**
 * Calculates the delay for a retry attempt using exponential backoff with optional jitter.
 * @param attempt The current attempt number (0-indexed)
 * @param baseDelayMs The base delay in milliseconds
 * @param addJitter Whether to add random jitter
 * @returns The calculated delay in milliseconds
 */
function calculateRetryDelay (
  attempt: number,
  baseDelayMs: number,
  addJitter: boolean
): number {
  const exponentialDelay = Math.pow(2, attempt) * baseDelayMs
  const jitter = addJitter ? Math.random() * baseDelayMs : 0
  return exponentialDelay + jitter
}

/**
 * Executes a function with retry logic and exponential backoff.
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 */
async function withRetry<T> (
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries,
    baseDelayMs,
    addJitter,
    shouldRetry
  } = { ...DEFAULT_RETRY_OPTIONS, ...options }

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxRetries && shouldRetry(error)) {
        const delay = calculateRetryDelay(attempt, baseDelayMs, addJitter)
        dbg(`Attempt ${attempt + 1} failed: ${lastError.message}, retrying in ${Math.round(delay)}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

/**
 * Determines if an HTTP response status code should trigger a retry.
 * @param statusCode The HTTP status code
 * @returns True if the status code is retryable
 */
function isRetryableStatusCode (statusCode: number): boolean {
  return (RETRYABLE_STATUS_CODES as readonly number[]).includes(statusCode)
}

/**
 * Determines if an IPFS fetch error should trigger a retry.
 * Retries on retryable HTTP status codes (429, 503, 504) or network errors (connection issues, timeouts).
 * @param error The error that occurred during the fetch operation
 * @returns True if the error should be retried
 */
function ipfsRetryHandler (error: unknown): boolean {
  // Retry on retryable HTTP status codes or network errors
  if (error instanceof Error && error.message.includes('status:')) {
    const statusMatch = error.message.match(/status:(\d+)/)

    if (statusMatch?.[1]) {
      return isRetryableStatusCode(parseInt(statusMatch[1], 10))
    }
  }

  // Retry on network errors (connection issues, timeouts)
  return true
}

export { withRetry, isRetryableStatusCode, calculateRetryDelay, ipfsRetryHandler }
