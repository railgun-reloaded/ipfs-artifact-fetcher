import brotliDecompress from 'brotli/decompress'

import { ArtifactName } from './definitions'

/**
 * Decompresses a Brotli-compressed artifact if needed.
 * @param data The raw artifact data.
 * @param artifactName The name of the artifact.
 * @returns The decompressed data.
 */
function decompressIfNeeded (data: Uint8Array, artifactName: ArtifactName): Uint8Array {
  // Only vkey artifacts are not compressed as they are JSON files
  if (artifactName === ArtifactName.VKEY) {
    return data
  }

  // Decompress Brotli-compressed artifacts (zkey, wasm, dat)
  const decompress = brotliDecompress as (input: Uint8Array) => Uint8Array
  return decompress(Buffer.from(data))
}

export { decompressIfNeeded }
