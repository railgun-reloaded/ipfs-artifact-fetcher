import { createHash } from 'node:crypto'

import { trustlessGateway } from '@helia/block-brokers'
import { createHeliaHTTP } from '@helia/http'
import { httpGatewayRouting } from '@helia/routers'
import type { unixfs } from '@helia/unixfs'
import { unixfs as createUnixfs } from '@helia/unixfs'
import debug from 'debug'
import { createHelia } from 'helia'
import { CID } from 'multiformats/cid'

import type { Artifact, ArtifactHashesJson } from './definitions.js'
import { ArtifactName, RAILGUN_ARTIFACTS_CID_ROOT } from './definitions.js'
import ARTIFACT_V2_HASHES from './json/artifact-v2-hashes.json'
import { isDefined } from './json/utils.js'

const dbg = debug('artifact-fetcher:downloader')

type HeliaNode = Awaited<ReturnType<typeof createHelia>> | Awaited<ReturnType<typeof createHeliaHTTP>>

let heliaNode: HeliaNode | undefined
let fs: ReturnType<typeof unixfs> | undefined

/**
 * Initializes the Helia node and UnixFS API if not already initialized.
 * @param useHTTP Optional boolean to use HTTP transport for Helia.
 * @returns A promise that resolves to an object containing the Helia node and UnixFS API.
 */
async function initHelia (useHTTP?: boolean) {
  dbg('useHTTP:', useHTTP)
  if (heliaNode) {
    return { heliaNode, fs }
  }

  // Create Helia with optimized block brokers
  heliaNode = useHTTP
    ? await createHeliaHTTP()
    : await createHelia({
      blockBrokers: [trustlessGateway()],
      routers: [httpGatewayRouting({ gateways: ['https://ipfs-lb.com'] })],
    })

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

  const [vkeyPath, zkeyPath, wasmOrDatPath] = await Promise.all([
    fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT,
      artifactVariantString,
      ArtifactName.VKEY
    ),
    fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT,
      artifactVariantString,
      ArtifactName.ZKEY
    ),
    fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT,
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
  // TODO: When using the .br files, the hashes are different, don't delete the comments in this function.
  switch (artifactName) {
    case ArtifactName.WASM:
      // return `prover/snarkjs/${artifactVariantString}.${artifactName}.br`
      return `prover/snarkjs/${artifactVariantString}.${artifactName}`
    case ArtifactName.ZKEY:
      // return `${artifactVariantString}/${artifactName}.br`
      return `${artifactVariantString}/${artifactName}`
    case ArtifactName.VKEY:
      return `${artifactVariantString}/${artifactName}.json`
    case ArtifactName.DAT:
      // return `prover/native/${artifactVariantString}.${artifactName}.br`
      return `prover/native/${artifactVariantString}.${artifactName}`
  }
}

/**
 * Fetches a file from IPFS using the root CID, artifact variant string, and artifact name.
 * @param rootCid The root CID string (e.g., 'QmeBrG7pii1qTqsn7rusvDiqXopHPjCT9gR4PsmW7wXqZq').
 * @param artifactVariantString The string representing the artifact variant (e.g., "2x16").
 * @param artifactName The name of the artifact to fetch.
 * @returns The full file as a Uint8Array.
 */
async function fetchFromIPFS (
  rootCid: string,
  artifactVariantString: string,
  artifactName: ArtifactName
): Promise<Uint8Array> {
  // TODO: Make cache implementation and return path to cached file if it exists

  await initHelia()

  if (!fs) throw new Error('Helia UnixFS not initialized')

  const cid = CID.parse(rootCid)
  const path = getPathForArtifactName(artifactName, artifactVariantString)

  dbg(`Fetching from IPFS CID: ${cid.toString()}${`/${path}`}`)

  // Fetch the contents of the CID using the UnixFS API
  const contents = fs.cat(cid, { path })

  const chunks: Uint8Array[] = []
  for await (const chunk of contents) {
    chunks.push(chunk)
  }

  // Combine all chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  const isValid = await validateArtifactDownload(
    result,
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
}

export { fetchFromIPFS, downloadArtifactsForVariant, initHelia, validateArtifactDownload }
