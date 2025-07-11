import { createHeliaHTTP } from '@helia/http'
import { unixfs } from '@helia/unixfs'
import brotliDecompress from 'brotli/decompress'
import debug from 'debug'
import { CID } from 'multiformats/cid'

import { ArtifactCache } from './artifact-cache.js'
import type { Artifact } from './definitions.js'
import { ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName, RAILGUN_ARTIFACTS_CID_PPOI, RAILGUN_ARTIFACTS_CID_ROOT, VALID_PPOI_ARTIFACT_VARIANT } from './definitions.js'

const dbg = debug('ipfs-artifact-fetcher:downloader')

/**
 * ArtifactDownloader class for managing IPFS artifact downloads with caching
 */
class ArtifactDownloader {
  /** The Helia HTTP node instance */
  private heliaNode?: Awaited<ReturnType<typeof createHeliaHTTP>>
  /** The UnixFS interface for reading files from IPFS */
  private fs?: ReturnType<typeof unixfs>
  /** The artifact cache instance */
  private artifactCache: ArtifactCache

  /**
   * Creates a new ArtifactDownloader instance
   * @param cache Optional cache instance to use, creates new one if not provided
   */
  constructor (cache?: ArtifactCache) {
    this.artifactCache = cache ?? new ArtifactCache()
  }

  /**
   * Initializes the Helia node and UnixFS instance if they are not already initialized.
   */
  private async initHelia (): Promise<void> {
    if (!this.heliaNode) {
      dbg('Initializing Helia node...')
      this.heliaNode = await createHeliaHTTP({
        // Don't start up a node since we only fetch from the network
        start: false,
      })

      // Unix filestore interface to read files from IPFS
      this.fs = unixfs(this.heliaNode)
    } else {
      dbg('Helia node already initialized')
    }
  }

  /**
   * Decompresses a Brotli-compressed artifact if needed.
   * @param data The raw artifact data.
   * @param artifactName The name of the artifact.
   * @returns The decompressed data.
   */
  private decompressArtifact (data: Uint8Array, artifactName: ArtifactName): Uint8Array {
    dbg('Decompressing artifact:', artifactName)

    // Only vkey artifacts are not compressed as they are JSON files
    if (artifactName === ArtifactName.VKEY) {
      return data
    }

    // Decompress Brotli-compressed artifacts (zkey, wasm, dat)
    const decompress = brotliDecompress as (input: Uint8Array) => Uint8Array
    return decompress(Buffer.from(data))
  }

  /**
   * Downloads all artifacts (vkey, zkey, wasm/dat) for a given artifact variant from IPFS.
   * @param artifactVariantString The variant string representing the artifact variant.
   * @returns A promise that resolves to an Artifact object containing the downloaded artifacts.
   */
  async downloadArtifactsForVariant (artifactVariantString: string): Promise<Artifact> {
    dbg(`Downloading all artifacts for variant: ${artifactVariantString}`)

    const useNativeArtifacts = false // Replace with actual check if using native artifacts
    const cidRoot = artifactVariantString.startsWith(ARTIFACT_VARIANT_STRING_PPOI_PREFIX) ? RAILGUN_ARTIFACTS_CID_PPOI : RAILGUN_ARTIFACTS_CID_ROOT

    const [vkeyPath, zkeyPath, wasmOrDatPath] = await Promise.all([
      this.fetchFromIPFS(
        cidRoot,
        artifactVariantString,
        ArtifactName.VKEY
      ),
      this.fetchFromIPFS(
        cidRoot,
        artifactVariantString,
        ArtifactName.ZKEY
      ),
      this.fetchFromIPFS(
        cidRoot,
        artifactVariantString,
        useNativeArtifacts ? ArtifactName.DAT : ArtifactName.WASM
      ),
    ])

    return {
      vkey: vkeyPath,
      zkey: zkeyPath,
      wasm: useNativeArtifacts ? undefined : wasmOrDatPath,
      dat: useNativeArtifacts ? wasmOrDatPath : undefined,
    }
  }

  /**
   * Returns the IPFS path for a given artifact name and variant string.
   * @param artifactName The name of the artifact.
   * @param artifactVariantString The variant string representing the artifact.
   * @returns The constructed path string for the artifact.
   */
  private getPathForArtifactName (
    artifactName: ArtifactName,
    artifactVariantString: string
  ): string {
    if (artifactVariantString.startsWith(ARTIFACT_VARIANT_STRING_PPOI_PREFIX)) {
      // Check if its a PPOI Artifact and validate if it's a valid one.
      if (!VALID_PPOI_ARTIFACT_VARIANT.includes(artifactVariantString)) {
        throw new Error(`Invalid POI artifact variant: ${artifactVariantString}. Only POI_3x3 and POI_13x13 are supported.`)
      }

      switch (artifactName) {
        case ArtifactName.WASM:
          return `${artifactVariantString}/wasm.br`
        case ArtifactName.ZKEY:
          return `${artifactVariantString}/zkey.br`
        case ArtifactName.VKEY:
          return `${artifactVariantString}/vkey.json`
        case ArtifactName.DAT:
          return `${artifactVariantString}/dat.br`
      }
    }

    // Railgun artifacts
    switch (artifactName) {
      case ArtifactName.WASM:
        return `prover/snarkjs/${artifactVariantString}.${artifactName}.br`
      case ArtifactName.ZKEY:
        return `${artifactVariantString}/${artifactName}.br`
      case ArtifactName.VKEY:
        return `${artifactVariantString}/${artifactName}.json`
      case ArtifactName.DAT:
        return `prover/native/${artifactVariantString}.${artifactName}.br`
    }
  }

  /**
   * Fetches an artifact from IPFS, decompresses it if necessary, and returns its contents as a Uint8Array.
   * @param rootCid The root CID from which to fetch the artifact.
   * @param artifactVariantString The variant string representing the artifact.
   * @param artifactName The name of the artifact to fetch.
   * @returns A promise that resolves to the decompressed artifact data as a Uint8Array.
   */
  async fetchFromIPFS (
    rootCid: string,
    artifactVariantString: string,
    artifactName: ArtifactName
  ): Promise<Uint8Array> {
    // Check cache first
    const cached = this.artifactCache.get(rootCid, artifactVariantString, artifactName)
    if (cached) {
      dbg(`Cache hit for ${artifactName} (${artifactVariantString}) - ${cached.length} bytes`)
      return cached
    }

    await this.initHelia()

    if (!this.fs) throw new Error('Helia UnixFS not initialized')

    const cid = CID.parse(rootCid)
    const path = this.getPathForArtifactName(artifactName, artifactVariantString)

    dbg(`Fetching from IPFS CID: ${cid.toString()}${`/${path}`}`)

    try {
      const contents = this.fs.cat(cid, { path })

      const chunks: Uint8Array[] = []
      for await (const chunk of contents) {
        chunks.push(chunk)
      }

      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0

      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      const decompressedResult = this.decompressArtifact(result, artifactName)

      // Cache the result
      this.artifactCache.set(rootCid, artifactVariantString, artifactName, decompressedResult)

      // There's no need to validate the artifact hash here since it's already done by Helia node.
      // TODO: Store it and return path where it was stored.
      return decompressedResult
    } catch (error) {
      throw new Error(`IPFS fetch failed for ${artifactName} (${artifactVariantString}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Stops the Helia node and cleans up resources
   */
  async stop (): Promise<void> {
    if (this.heliaNode) {
      dbg('Stopping Helia node...')
      await this.heliaNode.stop()
      delete this.heliaNode
      delete this.fs
      dbg('Helia node stopped')
    } else {
      dbg('Helia node not initialized')
    }
  }

  /**
   * Clears the artifact cache
   */
  clearCache (): void {
    this.artifactCache.clear()
  }

  /**
   * Gets the number of items in the cache
   * @returns The cache size
   */
  getCacheSize (): number {
    return this.artifactCache.size()
  }
}

export {
  ArtifactDownloader,
}
