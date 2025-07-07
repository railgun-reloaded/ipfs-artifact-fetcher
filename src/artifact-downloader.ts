import { trustlessGateway } from '@helia/block-brokers'
import { createHeliaHTTP } from '@helia/http'
import { httpGatewayRouting } from '@helia/routers'
import type { unixfs } from '@helia/unixfs'
import { unixfs as createUnixfs } from '@helia/unixfs'
import debug from 'debug'
import { createHelia } from 'helia'
import { CID } from 'multiformats/cid'

import { RAILGUN_ARTIFACTS_CID_ROOT } from './definitions.js'

const dbg = debug('artifact-fetcher:downloader')

type HeliaNode = Awaited<ReturnType<typeof createHelia>> | Awaited<ReturnType<typeof createHeliaHTTP>>

let heliaNode: HeliaNode | undefined
let fs: ReturnType<typeof unixfs> | undefined

/**
 * Ensure a value is not null or undefined.
 * @param value The value to check.
 * @returns boolean
 */
function isDefined (value: any): value is NonNullable<any> {
  return value !== null && value !== undefined
}

/**
 * Initializes the Helia node and UnixFS API if not already initialized.
 * @param useHTTP Optional boolean to use HTTP transport for Helia.
 * @returns A promise that resolves to an object containing the Helia node and UnixFS API.
 */
async function initHelia (useHTTP?: boolean) {
  console.log('useHTTP:', useHTTP)
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
 * Downloads the vkey, zkey, and wasm artifacts for a given artifact variant string.
 * @param artifactVariantString The string representing the artifact variant (e.g., "2x16").
 * @returns An object containing the vkey, zkey, and wasm artifacts as Uint8Arrays.
 */
async function downloadArtifactsForVariant (artifactVariantString: string): Promise<{
  vkey: Uint8Array
  zkey: Uint8Array
  wasm: Uint8Array
}> {
  dbg(`Downloading artifacts: ${artifactVariantString}`)

  const [vkeyPath, zkeyPath, wasmPath] = await Promise.all([
    fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT
      // ArtifactName.VKEY + artifactVariantString
    ),
    fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT
      // ArtifactName.ZKEY + artifactVariantString
    ),
    fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT
      // ArtifactName.WASM + artifactVariantString
    ),
  ])

  if (!isDefined(vkeyPath)) {
    throw new Error('Could not download vkey artifact.')
  }
  if (!isDefined(zkeyPath)) {
    throw new Error('Could not download zkey artifact.')
  }
  if (!isDefined(wasmPath)) {
    throw new Error('Could not download wasm artifact.')
  }

  return {
    vkey: vkeyPath,
    zkey: zkeyPath,
    wasm: wasmPath,
  }
}

/**
 * Fetches a file from IPFS using the root CID and file path.
 * @param rootCid The root CID string (e.g., 'QmeBrG7pii1qTqsn7rusvDiqXopHPjCT9gR4PsmW7wXqZq')
 * @param path The specific file path within the IPFS root CID (optional).
 * @returns The full file as a Uint8Array
 */
async function fetchFromIPFS (
  rootCid: string,
  path?: string
): Promise<Uint8Array> {
  // Initialize Helia and UnixFS API if not already done
  await initHelia()

  // Ensure the Helia UnixFS API is initialized
  if (!fs) throw new Error('Helia UnixFS not initialized')

  // Parse only the root CID, not the concatenated path
  const cid = CID.parse(rootCid)

  console.log(`Fetching from IPFS CID: ${cid.toString()}${path ? `/${path}` : ''}`)

  // Add timeout wrapper
  const contents = path ? fs.cat(cid, { path }) : fs.cat(cid)

  // Collect all chunks from the async iterator
  // Parse the root CID separately
  const chunks: Uint8Array[] = []

  // Use the UnixFS API to navigate to the specific path within the CID
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

  return result
}

export { fetchFromIPFS, downloadArtifactsForVariant, initHelia }
