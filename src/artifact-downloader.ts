import type { VerifiedFetch } from '@helia/verified-fetch'
import { createVerifiedFetch } from '@helia/verified-fetch'
import { decompress as brotliDecompress } from 'brotli'
import debug from 'debug'
import type { Helia } from 'helia'
import { CID } from 'multiformats/cid'

import type { ArtifactStore } from './artifact-store.js'
import type { ValidArtifactVariant } from './definitions.js'
import {
  ARTIFACT_VARIANT_STRING_PPOI_PREFIX,
  ArtifactName,
  PPOI_ARTIFACTS_CID,
  RAILGUN_ARTIFACTS_CID_ROOT,
  VALID_PPOI_ARTIFACT_VARIANT,
  VALID_RAILGUN_ARTIFACT_VARIANTS,
} from './definitions.js'

const dbg = debug('ipfs-artifact-fetcher:downloader')

/**
 * ArtifactDownloader class for managing IPFS artifact downloads with caching
 */
class ArtifactDownloader {
  /** The Helia instance for managing IPFS lifecycle */
  #helia: Helia | undefined
  /** The verified fetch instance for trustless IPFS retrieval */
  #verifiedFetch: VerifiedFetch | undefined
  /** The artifact cache instance */
  #artifactStore: ArtifactStore
  /**
   * Indicates whether to use native artifacts (e.g., .dat files) instead of WASM.
   */
  #useNativeArtifacts: boolean

  /**
   * Creates an instance of ArtifactDownloader to manage IPFS artifact downloads and caching.
   * @param artifactStore The artifact cache instance.
   * @param useNativeArtifacts Indicates whether to use native artifacts (e.g., .dat files) instead of WASM.
   */
  constructor (artifactStore: ArtifactStore, useNativeArtifacts: boolean) {
    this.#artifactStore = artifactStore
    this.#useNativeArtifacts = useNativeArtifacts
  }

  /**
   * Initializes the verified fetch instance if it is not already initialized.
   * Creates and manages a Helia instance for lifecycle management.
   * @throws Error if initialization fails
   */
  async #initVerifiedFetch (): Promise<void> {
    if (!this.#verifiedFetch) {
      try {
        dbg('Initializing verified fetch instance...')

        this.#verifiedFetch = await createVerifiedFetch({
          gateways: ['https://trustless-gateway.link'],
          routers: ['http://delegated-ipfs.dev'],
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
   * Validates that the artifact variant string is either a valid PPOI variant or a valid RAILGUN variant.
   * @param artifactVariantString The variant string to validate.
   * @throws Error if the variant string is not valid.
   */
  #validateArtifactVariant (artifactVariantString: string): void {
    const isPPOI = this.#isPPOIartifactVariant(artifactVariantString)

    if (isPPOI) {
      if (!VALID_PPOI_ARTIFACT_VARIANT.includes(artifactVariantString)) {
        throw new Error(
          `Invalid PPOI artifact variant: ${artifactVariantString}. Valid variants are: ${VALID_PPOI_ARTIFACT_VARIANT.join(', ')}`
        )
      }
    } else {
      if (!VALID_RAILGUN_ARTIFACT_VARIANTS.includes(artifactVariantString)) {
        throw new Error(
          `Invalid RAILGUN artifact variant: ${artifactVariantString}. Valid variants are: ${VALID_RAILGUN_ARTIFACT_VARIANTS.join(', ')}`
        )
      }
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
    this.#validateArtifactVariant(artifactVariantString)

    dbg(`Downloading all artifacts for variant: ${artifactVariantString}`)

    const cidRoot = this.#isPPOIartifactVariant(artifactVariantString)
      ? PPOI_ARTIFACTS_CID
      : RAILGUN_ARTIFACTS_CID_ROOT

    await this.fetchFromIPFS(cidRoot, artifactVariantString, ArtifactName.VKEY)
    await this.fetchFromIPFS(cidRoot, artifactVariantString, ArtifactName.ZKEY)
    await this.fetchFromIPFS(
      cidRoot,
      artifactVariantString,
      this.#useNativeArtifacts ? ArtifactName.DAT : ArtifactName.WASM
    )

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
   * Returns the directory path for storing downloaded artifacts for a given variant string.
   * @param artifactVariantString The variant string representing the artifact variant.
   * @returns The directory path for the artifact downloads.
   */
  #artifactDownloadsDir (artifactVariantString: string) {
    if (artifactVariantString.startsWith(ARTIFACT_VARIANT_STRING_PPOI_PREFIX)) {
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
    artifactVariantString: string
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
    artifactVariantString: string
  ): string {
    if (this.#isPPOIartifactVariant(artifactVariantString)) {
      // Check if its a PPOI Artifact and validate if it's a valid one.
      if (!VALID_PPOI_ARTIFACT_VARIANT.includes(artifactVariantString)) {
        throw new Error(
          `Invalid POI artifact variant: ${artifactVariantString}. Only POI_3x3 and POI_13x13 are supported.`
        )
      }

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
   * Checks if the given artifact variant string is a PPOI artifact variant.
   * @param artifactVariantString The variant string to check.
   * @returns True if the variant string is a PPOI artifact variant, false otherwise.
   */
  #isPPOIartifactVariant (artifactVariantString: string) {
    return artifactVariantString.startsWith(
      ARTIFACT_VARIANT_STRING_PPOI_PREFIX
    )
  }

  /**
   * Fetches an artifact from IPFS, decompresses it if necessary, and stores it in the provided artifact store.
   * Includes retry logic with exponential backoff for transient failures (429, 503, 504, timeouts, connection errors).
   * @param rootCid The root CID of the IPFS directory containing the artifacts.
   * @param artifactVariantString The variant string representing the artifact variant.
   * @param artifactName The name of the artifact to fetch.
   * @returns A promise that resolves to the decompressed artifact data.
   */
  async fetchFromIPFS (
    rootCid: string,
    artifactVariantString: string,
    artifactName: ArtifactName
  ): Promise<Uint8Array> {
    const storePath = this.#artifactDownloadsPath(
      artifactName,
      artifactVariantString
    )

    // Check if the artifact already exists in the store
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

    if (!this.#verifiedFetch) throw new Error('Verified fetch not initialized')

    const cid = CID.parse(rootCid)
    const ipfsPath = this.#getIPFSpathForArtifactName(
      artifactName,
      artifactVariantString
    )

    const ipfsUrl = `ipfs://${cid.toString()}/${ipfsPath}`

    dbg(`Fetching from IPFS URL: ${ipfsUrl}`)

    const maxRetries = 5
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Use verified fetch with the IPFS URL
        const response = await this.#verifiedFetch(ipfsUrl)

        if (!response.ok) {
          const statusCode = response.status
          // Retry on 429 (rate limit), 503/504 (service unavailable/gateway timeout)
          if ([429, 503, 504].includes(statusCode) && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1_000 // exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s
            dbg(`Fetch failed with ${statusCode}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
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

        dbg(`Fetched and stored ${artifactName} artifact for variant (${artifactVariantString}) - ${decompressedArtifact.length} bytes`)

        return decompressedArtifact
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 // exponential backoff
          dbg(`Fetch attempt ${attempt + 1} failed: ${lastError.message}, retrying in ${delay}ms`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw new Error(
      `IPFS fetch failed for ${artifactName} (${artifactVariantString}) after ${maxRetries + 1} attempts: ${
        lastError?.message ?? 'Unknown error'
      }`
    )
  }

  /**
   * Stops the Helia instance and cleans up resources
   */
  async stop (): Promise<void> {
    if (this.#helia) {
      dbg('Stopping Helia instance...')
      await this.#helia.stop()
      this.#helia = undefined
      this.#verifiedFetch = undefined
      dbg('Helia instance stopped')
    } else {
      dbg('Helia instance not initialized')
    }
  }
}

export { ArtifactDownloader }
