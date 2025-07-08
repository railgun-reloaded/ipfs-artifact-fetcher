import { createHash } from 'node:crypto'

import { createHeliaHTTP } from '@helia/http'
import type { unixfs } from '@helia/unixfs'
import { unixfs as createUnixfs } from '@helia/unixfs'
import axios from 'axios'
import debug from 'debug'
import { CID } from 'multiformats/cid'

import { decompressIfNeeded } from './brotli-decompress.js'
import type { Artifact, ArtifactHashesJson } from './definitions.js'
import { ArtifactName, RAILGUN_ARTIFACTS_CID_POI, RAILGUN_ARTIFACTS_CID_ROOT } from './definitions.js'
import ARTIFACT_V2_HASHES from './json/artifact-v2-hashes.json'
import { getPathForPOIArtifact, isPOIArtifact } from './poi-artifact-downloader.js'
import { isDefined } from './utils.js'

const dbg = debug('artifact-fetcher:downloader')

type HeliaNode = Awaited<ReturnType<typeof createHeliaHTTP>>

let heliaNode: HeliaNode | undefined
let fs: ReturnType<typeof unixfs> | undefined

/**
 * Initializes the Helia node and UnixFS API if not already initialized.
 * @returns A promise that resolves to an object containing the Helia node and UnixFS API.
 */
async function initHelia () {
  if (heliaNode) {
    return { heliaNode, fs }
  }

  // Create Helia with optimized block brokers
  // TODO ensure node instance doesn't persist after file fetch
  heliaNode = await createHeliaHTTP()

  // UnixFS allows you to encode files and directories such that they are
  // addressed by CIDs and can be retrieved by other nodes on the network
  fs = createUnixfs(heliaNode)

  return { heliaNode, fs }
}

/**
 * Retrieves the expected hash for a given artifact name and variant string from the artifact hashes JSON.
 * @param artifactName The name of the artifact to retrieve the hash for.
 * @param artifactVariantString The variant string representing the artifact variant.
 * @returns The expected hash string for the specified artifact and variant.
 */
const getExpectedArtifactHash = (
  artifactName: ArtifactName,
  artifactVariantString: string
): string => {
  const hashes = ARTIFACT_V2_HASHES as ArtifactHashesJson
  const variantHashes = hashes[artifactVariantString]

  if (!isDefined(variantHashes)) {
    throw new Error(
      `No hashes for variant ${artifactName}: ${artifactVariantString}`
    )
  }

  if (artifactName === ArtifactName.VKEY) {
    throw new Error('There are no artifact hashes for vkey.')
  }

  const hash = variantHashes ? variantHashes[artifactName] : undefined
  if (!hash) {
    throw new Error(
      `No hash for artifact ${artifactName}: ${artifactVariantString}`
    )
  }

  return hash
}

/**
 * Validates the downloaded artifact by comparing its SHA-256 hash to the expected value for the given artifact name and variant.
 * @param data The artifact data as a Uint8Array.
 * @param artifactName The name of the artifact being validated.
 * @param artifactVariantString The variant string representing the artifact.
 * @returns A promise that resolves to true if the artifact hash matches the expected value, otherwise throws an error.
 */
async function validateArtifactDownload (
  data: Uint8Array<ArrayBufferLike>,
  artifactName: ArtifactName,
  artifactVariantString: string
): Promise<boolean> {
  // Only vkey artifacts don't have hash validation
  if (artifactName === ArtifactName.VKEY) {
    return true
  }

  // const isReactNative = false // Replace with actual check if running in React Native
  // const hash = isReactNative
  //   ? hexlify(sha256(data))
  //   : createHash('sha256').update(data).digest('hex')

  const hash = createHash('sha256').update(data).digest('hex')

  const expectedHash = getExpectedArtifactHash(
    artifactName,
    artifactVariantString
  )
  const isSameHash = hash === expectedHash

  if (!isSameHash) {
    throw new Error(`Validate artifact blob for ${artifactName}: ${artifactVariantString}. Got ${hash}, expected ${expectedHash}.`)
  }

  return isSameHash
};

/**
 * Downloads all artifacts (vkey, zkey, wasm/dat) for a given artifact variant from IPFS.
 * @param artifactVariantString The variant string representing the artifact variant.
 * @returns A promise that resolves to an Artifact object containing the downloaded artifacts.
 */
async function downloadArtifactsForVariant (artifactVariantString: string): Promise<Artifact> {
  dbg(`Downloading all artifacts for variant: ${artifactVariantString}`)

  const useNativeArtifacts = false // Replace with actual check if using native artifacts
  const cidRoot = getCIDRoot(artifactVariantString)

  const [vkeyPath, zkeyPath, wasmOrDatPath] = await Promise.all([
    fetchFromIPFSWithFallback(
      cidRoot,
      artifactVariantString,
      ArtifactName.VKEY
    ),
    fetchFromIPFSWithFallback(
      cidRoot,
      artifactVariantString,
      ArtifactName.ZKEY
    ),
    fetchFromIPFSWithFallback(
      cidRoot,
      artifactVariantString,
      useNativeArtifacts ? ArtifactName.DAT : ArtifactName.WASM
    ),
  ])

  if (!isDefined(vkeyPath)) {
    throw new Error('Could not download vkey artifact.')
  }
  if (!isDefined(zkeyPath)) {
    throw new Error('Could not download zkey artifact.')
  }
  if (!isDefined(wasmOrDatPath)) {
    throw new Error(
      useNativeArtifacts
        ? 'Could not download dat artifact.'
        : 'Could not download wasm artifact.'
    )
  }

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
function getPathForArtifactName (
  artifactName: ArtifactName,
  artifactVariantString: string
) {
  // Handle POI artifacts
  if (isPOIArtifact(artifactVariantString)) {
    return getPathForPOIArtifact(artifactName, artifactVariantString)
  }

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
 * Fetches a file from IPFS using the root CID, artifact variant string, and artifact name with timeout.
 * @param rootCid The root CID string (e.g., 'QmeBrG7pii1qTqsn7rusvDiqXopHPjCT9gR4PsmW7wXqZq').
 * @param artifactVariantString The string representing the artifact variant (e.g., "2x16").
 * @param artifactName The name of the artifact to fetch.
 * @param timeoutMs Timeout in milliseconds (default: 10000)
 * @returns The full file as a Uint8Array.
 */
async function fetchFromIPFS (
  rootCid: string,
  artifactVariantString: string,
  artifactName: ArtifactName,
  timeoutMs: number = 10000
): Promise<Uint8Array> {
  // TODO: Make cache implementation and return path to cached file if it exists

  await initHelia()

  if (!fs) throw new Error('Helia UnixFS not initialized')

  const cid = CID.parse(rootCid)
  const path = getPathForArtifactName(artifactName, artifactVariantString)

  dbg(`Fetching from IPFS CID: ${cid.toString()}${`/${path}`}`)

  // Create timeout promise
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error(`IPFS fetch timeout after ${timeoutMs}ms`)), timeoutMs)
  })

  // Fetch with timeout
  const fetchPromise = (async () => {
    try {
      const contents = fs.cat(cid, { path })

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

      // Decompress the artifact if needed
      const decompressedResult = decompressIfNeeded(result, artifactName)

      const isValid = await validateArtifactDownload(
        decompressedResult,
        artifactName,
        artifactVariantString
      )

      if (isValid) {
      // TODO: Store it and return path where it was stored.
        return result
      } else {
        throw new Error(
        `Invalid hash for artifact download: ${artifactName} for ${artifactVariantString}.`
        )
      }
    } catch (error) {
      throw new Error(`IPFS fetch failed for ${artifactName} (${artifactVariantString}): ${error instanceof Error ? error.message : String(error)}`)
    }
  })()

  return await Promise.race([fetchPromise, timeoutPromise])
}

/**
 * Fetches from IPFS with HTTP gateway fallback for reliability
 * @param rootCid The root CID string (e.g., 'QmeBrG7pii1qTqsn7rusvDiqXopHPjCT9gR4PsmW7wXqZq')
 * @param artifactVariantString The string representing the artifact variant (e.g., "2x16").
 * @param artifactName The name of the artifact to fetch.
 * @returns The full file as a Uint8Array
 */
async function fetchFromIPFSWithFallback (
  rootCid: string,
  artifactVariantString: string,
  artifactName: ArtifactName
): Promise<Uint8Array> {
  // Try fetching from IPFS first, with a fallback to HTTP gateway if it fails
  try {
    console.log('trying ipfs')
    // Try IPFS first with 10s timeout
    return await fetchFromIPFS(rootCid, artifactVariantString, artifactName, 10000)
  } catch (error) {
    // TODO only perform axios call if IPFS failed due to timeout/network error
    console.log('ipfs failed')
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Log the actual error to understand what's happening
    console.log('IPFS Error Details:', errorMessage)
    console.log('Error Stack:', error instanceof Error ? error.stack : 'No stack')

    dbg('IPFS fetch failed, falling back to HTTP gateway:', error)

    // Fallback to direct HTTP gateway
    const path = getPathForArtifactName(artifactName, artifactVariantString)
    const httpUrl = `https://ipfs-lb.com/ipfs/${rootCid}/${path}`

    // Try fetching from HTTP gateway using axios
    try {
      const response = await axios.get(httpUrl, { responseType: 'arraybuffer' })
      if (response.status !== 200) {
        throw new Error(`HTTP fetch failed with status ${response.status}`)
      }
      dbg(`Fetched from HTTP gateway: ${httpUrl}`)

      // Decompress the artifact if needed
      const result = new Uint8Array(response.data)
      const decompressedResult = decompressIfNeeded(result, artifactName)

      // Validate the downloaded artifact
      const isValid = await validateArtifactDownload(
        decompressedResult,
        artifactName,
        artifactVariantString
      )

      if (isValid) {
        return result
      } else {
        throw new Error(
          `Invalid hash for artifact download: ${artifactName} for ${artifactVariantString}.`
        )
      }
    } catch (error) {
      throw new Error(`HTTP gateway fetch failed for ${artifactName} (${artifactVariantString}): ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/**
 * Gets the appropriate CID root for the given artifact variant.
 * @param artifactVariantString The variant string to get the CID for.
 * @returns The CID root string for the artifact variant.
 */
function getCIDRoot (artifactVariantString: string): string {
  return isPOIArtifact(artifactVariantString) ? RAILGUN_ARTIFACTS_CID_POI : RAILGUN_ARTIFACTS_CID_ROOT
}

/**
 * Stops the Helia node and cleans up resources
 */
async function stopHelia (): Promise<void> {
  if (heliaNode) {
    dbg('Stopping Helia node...')
    await heliaNode.stop()
    heliaNode = undefined
    fs = undefined
    dbg('Helia node stopped')
  }
}

export {
  fetchFromIPFS,
  fetchFromIPFSWithFallback,
  downloadArtifactsForVariant,
  initHelia,
  stopHelia,
  validateArtifactDownload,
  getCIDRoot
}
