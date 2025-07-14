import assert from 'node:assert'
import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ArtifactDownloader } from '../src/artifact-downloader.js'
import { ArtifactStore } from '../src/artifact-store.js'
import { ARTIFACT_VARIANT_STRING_PPOI_PREFIX } from '../src/definitions.js'

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

describe('artifact-downloader for snarkjs artifacts', () => {
  let downloader: ArtifactDownloader

  before(() => {
    const useNativeArtifacts = false
    downloader = new ArtifactDownloader(testArtifactStore, useNativeArtifacts)
  })

  after(async () => {
    await downloader.stop()
  })

  it('should download RAILGUN 1x1 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = '1x1'
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
    const localArtifactPath = join(__dirname, '1x1-vkey.json')
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
})

describe('artifact-downloader for native artifacts', () => {
  let downloader: ArtifactDownloader

  before(() => {
    const useNativeArtifacts = true
    downloader = new ArtifactDownloader(testArtifactStore, useNativeArtifacts)
  })

  after(async () => {
    await downloader.stop()
  })

  it('should download RAILGUN 1x1 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = '1x1'
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
    const localArtifactPath = join(__dirname, '1x1-vkey.json')
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
})
