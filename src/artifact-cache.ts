import debug from 'debug'

import type { ArtifactName } from './definitions'

const dbg = debug('ipfs-artifact-fetcher:cache')

/**
 * Simple in-memory cache for artifacts
 */
class ArtifactCache {
  /**
   * Internal cache storage mapping, using unique keys per artifact.
   * Cache key format: `${rootCid}-${artifactVariantString}-${artifactName}`
   * @example
   * // Cache key examples:
   * // "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi-1x1-vkey"
   * // "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi-POI_3x3-zkey"
   */
  private cache = new Map<string, Uint8Array>()

  /**
   * Generates a cache key for an artifact
   * @param rootCid The root CID
   * @param artifactVariantString The artifact variant
   * @param artifactName The artifact name
   * @returns The cache key
   */
  private getCacheKey (rootCid: string, artifactVariantString: string, artifactName: ArtifactName): string {
    return `${rootCid}-${artifactVariantString}-${artifactName}`
  }

  /**
   * Gets an artifact from cache
   * @param rootCid The root CID
   * @param artifactVariantString The artifact variant
   * @param artifactName The artifact name
   * @returns The cached data or undefined if not found
   */
  public get (rootCid: string, artifactVariantString: string, artifactName: ArtifactName): Uint8Array | undefined {
    const key = this.getCacheKey(rootCid, artifactVariantString, artifactName)
    return this.cache.get(key)
  }

  /**
   * Sets an artifact in cache
   * @param rootCid The root CID
   * @param artifactVariantString The artifact variant
   * @param artifactName The artifact name
   * @param data The artifact data
   */
  public set (rootCid: string, artifactVariantString: string, artifactName: ArtifactName, data: Uint8Array): void {
    const key = this.getCacheKey(rootCid, artifactVariantString, artifactName)
    this.cache.set(key, data)
    dbg(`Cached ${artifactName} (${artifactVariantString}) - ${data.length} bytes`)
  }

  /**
   * Clears all cached artifacts
   */
  public clear (): void {
    this.cache.clear()
    dbg('Cache cleared')
  }

  /**
   * Returns the number of cached artifacts
   * @returns The cache size
   */
  public size (): number {
    return this.cache.size
  }
}

export { ArtifactCache }
