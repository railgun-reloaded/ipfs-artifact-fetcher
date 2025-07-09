import { unixfs } from '@helia/unixfs'
import brotliDecompress from 'brotli/decompress'
import debug from 'debug'
import { createHelia } from 'helia'
import { CID } from 'multiformats/cid'

import type { Artifact } from './definitions.js'
import { ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName, RAILGUN_ARTIFACTS_CID_PPOI, RAILGUN_ARTIFACTS_CID_ROOT, VALID_PPOI_ARTIFACT_VARIANT } from './definitions.js'
import { isDefined } from './utils.js'

const dbg = debug('artifact-fetcher:downloader')

let heliaNode: Awaited<ReturnType<typeof createHelia>> | undefined
let fs: ReturnType<typeof unixfs> | undefined

/**
 * Initializes the Helia node and UnixFS instance if they are not already initialized.
 */
async function initHelia () {
  if (!heliaNode) {
    dbg('Initializing Helia node...')
    heliaNode = await createHelia()
    fs = unixfs(heliaNode)
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
function decompressArtifact (data: Uint8Array, artifactName: ArtifactName): Uint8Array {
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
async function downloadArtifactsForVariant (artifactVariantString: string): Promise<Artifact> {
  dbg(`Downloading all artifacts for variant: ${artifactVariantString}`)

  const useNativeArtifacts = false // Replace with actual check if using native artifacts
  const cidRoot = artifactVariantString.startsWith(ARTIFACT_VARIANT_STRING_PPOI_PREFIX) ? RAILGUN_ARTIFACTS_CID_PPOI : RAILGUN_ARTIFACTS_CID_ROOT

  const [vkeyPath, zkeyPath, wasmOrDatPath] = await Promise.all([
    fetchFromIPFS(
      cidRoot,
      artifactVariantString,
      ArtifactName.VKEY
    ),
    fetchFromIPFS(
      cidRoot,
      artifactVariantString,
      ArtifactName.ZKEY
    ),
    fetchFromIPFS(
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

    const decompressedResult = decompressArtifact(result, artifactName)

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
async function stopHelia (): Promise<void> {
  if (heliaNode) {
    dbg('Stopping Helia node...')
    await heliaNode.stop()
    heliaNode = undefined
    fs = undefined
    dbg('Helia node stopped')
  } else {
    dbg('Helia node not initialized')
  }
}

export {
  fetchFromIPFS,
  downloadArtifactsForVariant,
  initHelia,
  stopHelia,
}
