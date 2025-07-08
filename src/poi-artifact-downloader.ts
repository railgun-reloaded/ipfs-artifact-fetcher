import { fetchFromIPFSWithFallback, getCIDRoot } from './artifact-downloader.js'
import type { Artifact } from './definitions.js'
import { ARTIFACT_VARIANT_STRING_POI_PREFIX, ArtifactName } from './definitions.js'
import { isDefined } from './utils.js'

/**
 * Gets the artifact variant string for POI artifacts.
 * @param maxInputs The maximum number of inputs.
 * @param maxOutputs The maximum number of outputs.
 * @returns The POI artifact variant string.
 */
function getArtifactVariantStringPOI (maxInputs: number, maxOutputs: number): string {
  // Only POI_3x3 and POI_13x13 variants are supported
  if (!((maxInputs === 3 && maxOutputs === 3) || (maxInputs === 13 && maxOutputs === 13))) {
    throw new Error(`Invalid POI artifact variant: only 3x3 and 13x13 are supported, got ${maxInputs}x${maxOutputs}`)
  }
  return `${ARTIFACT_VARIANT_STRING_POI_PREFIX}_${maxInputs}x${maxOutputs}`
}

/**
 * Checks if an artifact variant string is for a POI (Proof of Innocence) artifact.
 * @param artifactVariantString The variant string to check.
 * @returns True if the artifact is a POI artifact, false otherwise.
 */
function isPOIArtifact (artifactVariantString: string): boolean {
  return artifactVariantString.startsWith(ARTIFACT_VARIANT_STRING_POI_PREFIX)
}

/**
 * Returns the IPFS path for POI artifacts.
 * @param artifactName The name of the artifact.
 * @param artifactVariantString The variant string representing the artifact.
 * @returns The constructed path string for the POI artifact.
 */
function getPathForPOIArtifact (
  artifactName: ArtifactName,
  artifactVariantString: string
): string {
  // Validate POI artifact variant - only POI_3x3 and POI_13x13 are supported
  const validPOIVariants = [
    getArtifactVariantStringPOI(3, 3),
    getArtifactVariantStringPOI(13, 13)
  ]

  if (!validPOIVariants.includes(artifactVariantString)) {
    throw new Error(`Invalid POI artifact variant: ${artifactVariantString}. Only POI_3x3 and POI_13x13 are supported.`)
  }

  switch (artifactName) {
    case ArtifactName.ZKEY:
      // NOTE: POI only has .br for zkey, wasm and dat
      return `${artifactVariantString}/zkey.br`
    case ArtifactName.WASM:
      return `${artifactVariantString}/wasm.br`
    case ArtifactName.VKEY:
      return `${artifactVariantString}/vkey.json`
    case ArtifactName.DAT:
      return `${artifactVariantString}/dat.br`
    default:
      throw new Error(`Unsupported artifact name for POI: ${artifactName}`)
  }
}

/**
 * Downloads all artifacts for a POI variant from IPFS.
 * @param maxInputs The maximum number of inputs.
 * @param maxOutputs The maximum number of outputs.
 * @returns A promise that resolves to an Artifact object containing the downloaded artifacts.
 */
async function downloadArtifactsForPOI (maxInputs: number, maxOutputs: number): Promise<Artifact> {
  const artifactVariantString = getArtifactVariantStringPOI(maxInputs, maxOutputs)
  return downloadArtifactsForPOIVariant(artifactVariantString)
}

/**
 * Downloads all artifacts (vkey, zkey, wasm/dat) for a given POI artifact variant from IPFS.
 * @param artifactVariantString The POI variant string representing the artifact variant.
 * @returns A promise that resolves to an Artifact object containing the downloaded artifacts.
 */
async function downloadArtifactsForPOIVariant (artifactVariantString: string): Promise<Artifact> {
  if (!isPOIArtifact(artifactVariantString)) {
    throw new Error(`Invalid POI artifact variant: ${artifactVariantString}`)
  }

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

export {
  getArtifactVariantStringPOI,
  isPOIArtifact,
  getPathForPOIArtifact,
  downloadArtifactsForPOI,
  downloadArtifactsForPOIVariant
}
