import { basename } from 'node:path'

import type { VerifiedFetch } from '@helia/verified-fetch'
import { createVerifiedFetch } from '@helia/verified-fetch'
import { decompress as brotliDecompress } from 'brotli'
import debug from 'debug'
import { CID } from 'multiformats/cid'

import type { ArtifactStore } from './artifact-store.js'
import type { ArtifactDownloaderOptions, RetryOptions, ValidArtifactVariant, ValidPPOIVariant } from './definitions.js'
import {
  ArtifactName,
  DEFAULT_RETRY_OPTIONS,
  IPFS_GATEWAY,
  PPOI_ARTIFACTS_CID,
  RAILGUN_ARTIFACTS_CID_ROOT,
  VALID_PPOI_ARTIFACT_VARIANT,
} from './definitions.js'
import {
  ipfsRetryHandler,
  isRetryableStatusCode,
  withRetry,
} from './retry-utils.js'

const dbg = debug('ipfs-artifact-fetcher:downloader')

/**
 * ArtifactDownloader class for managing IPFS artifact downloads with caching
 */
class ArtifactDownloader {
  /** The verified fetch instance for trustless IPFS retrieval */
  #verifiedFetch: VerifiedFetch | undefined
  /** The artifact cache instance */
  #artifactStore: ArtifactStore
  /**
   * Indicates whether to use native artifacts, if true will fetch .DAT files instead of WASM.
   */
  #useNativeArtifacts: boolean
  /**
   * Maximum number of retry attempts for failed fetches.
   */
  #maxRetries: number

  /**
   * Creates an instance of ArtifactDownloader to manage IPFS artifact downloads and caching.
   * @param options Configuration options for the downloader.
   */
  constructor (options: ArtifactDownloaderOptions) {
    this.#artifactStore = options.artifactStore
    this.#useNativeArtifacts = options.useNativeArtifacts
    this.#maxRetries = options.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries
  }

  /**
   * Initializes the verified fetch instance if it is not already initialized.
   * @throws Error if initialization fails
   */
  async #initVerifiedFetch (): Promise<void> {
    if (!this.#verifiedFetch) {
      try {
        dbg('Initializing verified fetch instance...')

        this.#verifiedFetch = await createVerifiedFetch({
          gateways: [IPFS_GATEWAY]
        })
      } catch (error) {
        this.#verifiedFetch = undefined

        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to initialize verified fetch: ${errorMessage}`)
      }
    } else {
      dbg('Verified fetch instance already initialized')
    }
  }

  /**
   * Decompresses a Brotli-compressed artifact if needed.
   * @param data The raw artifact data.
   * @param artifactName The name of the artifact.
   * @returns The decompressed data.
   */
  #decompressArtifact (
    data: Uint8Array,
    artifactName: ArtifactName
  ): Uint8Array {
    dbg('Decompressing artifact:', artifactName)

    // Only vkey artifacts are not compressed as they are JSON files
    if (artifactName === ArtifactName.VKEY) {
      return data
    }

    // Decompress Brotli-compressed artifacts (zkey, wasm, dat)
    return brotliDecompress(Buffer.from(data))
  }

  /**
   * Downloads all artifacts (vkey, zkey, wasm/dat) for a given artifact variant from IPFS.
   * @param artifactVariantString The variant string representing the artifact variant.
   * @returns A promise that resolves to an Artifact object containing the path to the downloaded artifacts.
   */
  async downloadArtifactsForVariant (artifactVariantString: ValidArtifactVariant): Promise<{
    vkeyStoredPath: string;
    zkeyStoredPath: string;
    wasmOrDatStoredPath: string;
  }> {
    dbg(`Downloading all artifacts for variant: ${artifactVariantString}`)

    const cidRoot = this.#isPPOIartifactVariant(artifactVariantString)
      ? PPOI_ARTIFACTS_CID
      : RAILGUN_ARTIFACTS_CID_ROOT

    await Promise.all([
      this.fetchFromIPFS(cidRoot, artifactVariantString, ArtifactName.VKEY),
      this.fetchFromIPFS(cidRoot, artifactVariantString, ArtifactName.ZKEY),
      this.fetchFromIPFS(
        cidRoot,
        artifactVariantString,
        this.#useNativeArtifacts ? ArtifactName.DAT : ArtifactName.WASM
      )
    ])

    return {
      vkeyStoredPath: this.#artifactDownloadsPath(
        ArtifactName.VKEY,
        artifactVariantString
      ),
      zkeyStoredPath: this.#artifactDownloadsPath(
        ArtifactName.ZKEY,
        artifactVariantString
      ),
      wasmOrDatStoredPath: this.#artifactDownloadsPath(
        this.#useNativeArtifacts ? ArtifactName.DAT : ArtifactName.WASM,
        artifactVariantString
      ),
    }
  }

  /**
   * Returns the directory path for storing artifacts based on the artifact variant.
   * @param artifactVariantString The variant string representing the artifact variant.
   * @returns The directory path string for the artifact variant.
   */
  #artifactDownloadsDir (artifactVariantString: ValidArtifactVariant) {
    // Validate against path traversal attacks by ensuring the string is a simple filename
    if (basename(artifactVariantString) !== artifactVariantString) {
      throw new Error(`Invalid artifact variant: contains path traversal characters: ${artifactVariantString}`)
    }

    if (this.#isPPOIartifactVariant(artifactVariantString)) {
      return `artifacts-v2.1/ppoi-nov-2-23/${artifactVariantString}`
    }

    return `artifacts-v2.1/${artifactVariantString}`
  }

  /**
   * Returns the local storage path for a specific artifact and variant string.
   * @param artifactName The name of the artifact.
   * @param artifactVariantString The variant string representing the artifact.
   * @returns The path string for storing the artifact.
   */
  #artifactDownloadsPath (
    artifactName: ArtifactName,
    artifactVariantString: ValidArtifactVariant
  ): string {
    switch (artifactName) {
      case ArtifactName.WASM:
        return `${this.#artifactDownloadsDir(artifactVariantString)}/wasm`
      case ArtifactName.ZKEY:
        return `${this.#artifactDownloadsDir(artifactVariantString)}/zkey`
      case ArtifactName.VKEY:
        return `${this.#artifactDownloadsDir(artifactVariantString)}/vkey.json`
      case ArtifactName.DAT:
        return `${this.#artifactDownloadsDir(artifactVariantString)}/dat`
    }
  }

  /**
   * Returns the IPFS path for a given artifact name and variant string.
   * @param artifactName The name of the artifact.
   * @param artifactVariantString The variant string representing the artifact.
   * @returns The constructed path string for the artifact.
   */
  #getIPFSpathForArtifactName (
    artifactName: ArtifactName,
    artifactVariantString: ValidArtifactVariant
  ): string {
    if (this.#isPPOIartifactVariant(artifactVariantString)) {
      // PPOI artifacts
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

    // RAILGUN artifacts
    switch (artifactName) {
      case ArtifactName.WASM:
        return `prover/snarkjs/${artifactVariantString}.${artifactName}.br`
      case ArtifactName.DAT:
        return `prover/native/${artifactVariantString}.${artifactName}.br`
      case ArtifactName.ZKEY:
        return `circuits/${artifactVariantString}/${artifactName}.br`
      case ArtifactName.VKEY:
        return `circuits/${artifactVariantString}/${artifactName}.json`
    }
  }

  /**
   * Checks if the given artifact variant string is a valid PPOI variant.
   * @param artifactVariantString The variant string to check.
   * @returns True if the variant is a PPOI variant, false otherwise.
   */
  #isPPOIartifactVariant (artifactVariantString: ValidArtifactVariant): artifactVariantString is ValidPPOIVariant {
    return (VALID_PPOI_ARTIFACT_VARIANT as readonly string[]).includes(artifactVariantString)
  }

  /**
   * Fetches an artifact from IPFS, decompresses it if necessary, and stores it in the provided artifact store.
   * Includes retry logic with exponential backoff for transient failures (429, 503, 504, timeouts, connection errors).
   * @param rootCid The root CID of the IPFS directory containing the artifacts.
   * @param artifactVariantString The valid artifact variant string.
   * @param artifactName The name of the artifact to fetch.
   * @returns A promise that resolves to the decompressed artifact data.
   */
  async fetchFromIPFS (
    rootCid: string,
    artifactVariantString: ValidArtifactVariant,
    artifactName: ArtifactName
  ): Promise<Uint8Array> {
    const storePath = this.#artifactDownloadsPath(
      artifactName,
      artifactVariantString
    )

    // Check if the artifact is already stored
    if (await this.#artifactStore.exists(storePath)) {
      dbg(
        `Already stored ${artifactName} artifact for variant (${artifactVariantString}) - reading from cache`
      )

      const cachedData = await this.#artifactStore.get(storePath)
      if (!cachedData) {
        throw new Error(`Failed to read cached artifact: ${storePath}`)
      }
      return cachedData
    }

    await this.#initVerifiedFetch()

    const cid = CID.parse(rootCid)
    const ipfsPath = this.#getIPFSpathForArtifactName(
      artifactName,
      artifactVariantString
    )

    const ipfsUrl = `ipfs://${cid.toString()}/${ipfsPath}`

    const retryOptions: RetryOptions = {
      maxRetries: this.#maxRetries,
      shouldRetry: ipfsRetryHandler
    }

    dbg(`Fetching from IPFS URL: ${ipfsUrl}`)

    try {
      return await withRetry(async () => {
        if (!this.#verifiedFetch) throw new Error('Verified fetch not initialized')

        const response = await this.#verifiedFetch(ipfsUrl)

        if (!response.ok) {
          const statusCode = response.status

          if (isRetryableStatusCode(statusCode)) {
            throw new Error(`Retryable fetch error status:${statusCode} ${response.statusText}`)
          }
          throw new Error(`Failed to fetch: ${statusCode} ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const result = new Uint8Array(arrayBuffer)

        const decompressedArtifact = this.#decompressArtifact(
          result,
          artifactName
        )

        // Artifact integrity is ensured by the Helia node, so explicit hash validation is unnecessary.
        await this.#artifactStore.store(
          this.#artifactDownloadsDir(artifactVariantString),
          storePath,
          decompressedArtifact
        )

        dbg(`Successfully fetched and stored ${artifactName} artifact for variant (${artifactVariantString}) - ${decompressedArtifact.length} bytes`)

        return decompressedArtifact
      }, retryOptions)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(
        `IPFS fetch failed for ${artifactName} (${artifactVariantString}) after ${this.#maxRetries + 1} attempts: ${errorMessage}`
      )
    }
  }

  /**
   * Stops the verified fetch instance and cleans up resources.
   */
  async stop (): Promise<void> {
    if (this.#verifiedFetch) {
      dbg('Stopping Helia verified fetch instance...')
      await this.#verifiedFetch.stop()
      this.#verifiedFetch = undefined
      dbg('Helia verified fetch instance stopped')
    }
  }
}

export { ArtifactDownloader }
