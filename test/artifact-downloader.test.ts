import assert from 'node:assert'
import { setMaxListeners } from 'node:events'
import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ArtifactDownloader } from '../src/artifact-downloader.js'
import { ArtifactStore } from '../src/artifact-store.js'
import { ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName, PPOI_ARTIFACTS_CID, RAILGUN_ARTIFACTS_CID_ROOT } from '../src/definitions.js'

// Increase max listeners to handle concurrent IPFS fetches
setMaxListeners(50)

// Get the current test directory path
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Checks if a file exists at the given path.
 * @param path - The path to the file.
 * @returns A promise that resolves to true if the file exists, false otherwise.
 */
const fileExists = (path: string): Promise<boolean> => {
  return new Promise(resolve => {
    fs.promises
      .access(path)
      .then(() => resolve(true))
      .catch(() => resolve(false))
  })
}

const testArtifactStore = new ArtifactStore(
  fs.promises.readFile,
  async (dir, path, data) => {
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(path, data)
  },
  fileExists
)

describe('artifact-downloader for snarkjs artifacts', { timeout: 2000000 }, () => {
  let downloader: ArtifactDownloader

  before(() => {
    const useNativeArtifacts = false
    downloader = new ArtifactDownloader(testArtifactStore, useNativeArtifacts)
  })

  after(async () => {
    await downloader.stop()
  })

  it('should download RAILGUN 01x01 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = '01x01'
    const {
      vkeyStoredPath,
      zkeyStoredPath,
      wasmOrDatStoredPath
    } = await downloader.downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkeyStoredPath, 'vkey should be defined')
    assert.ok(zkeyStoredPath, 'zkey should be defined')
    assert.ok(wasmOrDatStoredPath, 'wasm should be defined')

    // Assert that the downloaded file name is 'wasm' since we are using snarkjs artifacts
    const fileName = wasmOrDatStoredPath.split('/').pop() || ''
    assert.ok(fileName === 'wasm', `Downloaded file name should be 'wasm' got: ${fileName}`)

    // Get downloaded and local artifacts
    const localArtifactPath = join(__dirname, '01x01-vkey.json')
    const localArtifact = await readFile(localArtifactPath)
    const downloadedArtifact = await readFile(vkeyStoredPath)

    // Transform both files for comparison
    const transformedLocalArtifact = new TextDecoder().decode(localArtifact)
    const transformedDownloadedArtifact = new TextDecoder().decode(downloadedArtifact)
    const downloadedArtifactJson = JSON.parse(transformedDownloadedArtifact)
    const localArtifactJson = JSON.parse(transformedLocalArtifact)

    assert.deepStrictEqual(downloadedArtifactJson, localArtifactJson, 'Downloaded vkey does not match local artifact')
  })

  it('should download PPOI 3x3 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`
    const {
      vkeyStoredPath,
      zkeyStoredPath,
      wasmOrDatStoredPath
    } = await downloader.downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkeyStoredPath, 'PPOI vkey should be defined')
    assert.ok(zkeyStoredPath, 'PPOI zkey should be defined')
    assert.ok(wasmOrDatStoredPath, 'PPOI wasm should be defined')

    // Get downloaded and local artifacts
    const localArtifactPath = join(__dirname, '3x3-vkey-PPOI.json')
    const localArtifact = await readFile(localArtifactPath)
    const downloadedFile = await readFile(vkeyStoredPath)

    // Transform both files for comparison
    const transformedLocalArtifact = new TextDecoder().decode(localArtifact)
    const transformedDownloadedArtifact = new TextDecoder().decode(downloadedFile)
    const downloadedArtifactJson = JSON.parse(transformedDownloadedArtifact)
    const localArtifactJson = JSON.parse(transformedLocalArtifact)

    assert.deepStrictEqual(downloadedArtifactJson, localArtifactJson, 'Downloaded vkey does not match local artifact')
  })

  it('should use already stored artifacts', async () => {
    const artifactVariantStrings = ['01x01', `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`]

    // Download artifacts for both variants
    for (const variant of artifactVariantStrings) {
      await downloader.downloadArtifactsForVariant(variant)
    }

    // Measure time for re-downloading (should use already stored artifacts)
    const start = process.hrtime.bigint()
    for (const variant of artifactVariantStrings) {
      await downloader.downloadArtifactsForVariant(variant)
    }
    const end = process.hrtime.bigint()
    const durationMs = Number(end - start) / 1_000_000 // Convert nanoseconds to milliseconds

    assert.ok(durationMs < 1000, `Artifacts should be fetched from cache in <1s, got ${durationMs.toFixed(2)}ms`)
  })
})

describe('artifact-downloader for native artifacts', { timeout: 200000 }, () => {
  let downloader: ArtifactDownloader

  before(() => {
    const useNativeArtifacts = true
    downloader = new ArtifactDownloader(testArtifactStore, useNativeArtifacts)
  })

  after(async () => {
    await downloader.stop()
  })

  it('should download RAILGUN 01x01 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = '01x01'
    const {
      vkeyStoredPath,
      zkeyStoredPath,
      wasmOrDatStoredPath
    } = await downloader.downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkeyStoredPath, 'vkey should be defined')
    assert.ok(zkeyStoredPath, 'zkey should be defined')
    assert.ok(wasmOrDatStoredPath, 'wasm should be defined')

    // Assert that the downloaded file name is 'dat' since we are using native artifacts
    const fileName = wasmOrDatStoredPath.split('/').pop() || ''
    assert.ok(fileName === 'dat', `Downloaded file name should be 'dat' got: ${fileName}`)

    // Get downloaded and local artifacts
    const localArtifactPath = join(__dirname, '01x01-vkey.json')
    const localArtifact = await readFile(localArtifactPath)
    const downloadedArtifact = await readFile(vkeyStoredPath)

    // Transform both files for comparison
    const transformedLocalArtifact = new TextDecoder().decode(localArtifact)
    const transformedDownloadedArtifact = new TextDecoder().decode(downloadedArtifact)
    const downloadedArtifactJson = JSON.parse(transformedDownloadedArtifact)
    const localArtifactJson = JSON.parse(transformedLocalArtifact)

    assert.deepStrictEqual(downloadedArtifactJson, localArtifactJson, 'Downloaded vkey does not match local artifact')
  })

  it('should download PPOI 3x3 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`
    const {
      vkeyStoredPath,
      zkeyStoredPath,
      wasmOrDatStoredPath
    } = await downloader.downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkeyStoredPath, 'PPOI vkey should be defined')
    assert.ok(zkeyStoredPath, 'PPOI zkey should be defined')
    assert.ok(wasmOrDatStoredPath, 'PPOI wasm should be defined')

    // Get downloaded and local artifacts
    const localArtifactPath = join(__dirname, '3x3-vkey-PPOI.json')
    const localArtifact = await readFile(localArtifactPath)
    const downloadedFile = await readFile(vkeyStoredPath)

    // Transform both files for comparison
    const transformedLocalArtifact = new TextDecoder().decode(localArtifact)
    const transformedDownloadedArtifact = new TextDecoder().decode(downloadedFile)
    const downloadedArtifactJson = JSON.parse(transformedDownloadedArtifact)
    const localArtifactJson = JSON.parse(transformedLocalArtifact)

    assert.deepStrictEqual(downloadedArtifactJson, localArtifactJson, 'Downloaded vkey does not match local artifact')
  })

  it('should download PPOI 3x3 native artifact', async () => {
    const artifactVariantString = `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`
    const file = await downloader.fetchFromIPFS(
      PPOI_ARTIFACTS_CID,
      artifactVariantString,
      ArtifactName.DAT
    )

    console.log('Downloaded PPOI 3x3 dat artifact size:', file.length)
    assert.ok(file.length > 0, 'Downloaded PPOI 3x3 dat artifact should have content')
  })

  it('should download RAILGUN 01x01 native artifact', async () => {
    const artifactVariantString = '01x01'
    const file = await downloader.fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT,
      artifactVariantString,
      ArtifactName.DAT
    )

    console.log('Downloaded RAILGUN 01x01 dat artifact size:', file.length)
    assert.ok(file.length > 0, 'Downloaded RAILGUN 01x01 dat artifact should have content')
  })
})
