import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ArtifactDownloader } from '../src/artifact-downloader.js'
import { ARTIFACT_VARIANT_STRING_PPOI_PREFIX } from '../src/definitions.js'

// Get the current test directory path
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('artifact-downloader', { timeout: 200000 }, () => {
  let downloader: ArtifactDownloader

  beforeEach(() => {
    downloader = new ArtifactDownloader()
  })

  afterEach(async () => {
    await downloader.stop()
  })

  it('should download RAILGUN 1x1 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = '1x1'
    const { vkey, zkey, dat, wasm } = await downloader.downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkey, 'vkey should be defined')
    assert.ok(zkey, 'zkey should be defined')
    assert.ok(wasm, 'wasm should be defined')
    assert.ok(dat === undefined, 'dat should be undefined when not using native artifacts')

    // Verify reasonable file sizes
    assert.ok(vkey.length > 0, 'RAILGUN vkey should not be empty')
    assert.ok(zkey.length > 0, 'RAILGUN zkey should not be empty')
    assert.ok(wasm && wasm.length > 0, 'RAILGUN wasm should not be empty')

    // Verify downloaded vkey matches local file
    const localFilePath = join(__dirname, '1x1-vkey.json')
    const localFile = await readFile(localFilePath)

    // Convert both to strings for comparison
    const downloadedContent = new TextDecoder().decode(vkey)
    const localContent = new TextDecoder().decode(localFile)

    // Parse both as JSON to compare structure (ignoring whitespace differences)
    const downloadedJson = JSON.parse(downloadedContent)
    const localJson = JSON.parse(localContent)

    // Assert they are equal
    assert.deepStrictEqual(downloadedJson, localJson, 'Downloaded vkey does not match local file')
  })

  it('should download PPOI 3x3 artifacts and verify vkey matches local file', async () => {
    const artifactVariantString = `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`
    const { vkey, zkey, wasm, dat } = await downloader.downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkey, 'PPOI vkey should be defined')
    assert.ok(zkey, 'PPOI zkey should be defined')
    assert.ok(wasm, 'PPOI wasm should be defined')
    assert.ok(dat === undefined, 'PPOI dat should be undefined when not using native artifacts')

    // Verify reasonable file sizes
    assert.ok(vkey.length > 0, 'PPOI vkey should not be empty')
    assert.ok(zkey.length > 0, 'PPOI zkey should not be empty')
    assert.ok(wasm && wasm.length > 0, 'PPOI wasm should not be empty')

    // Verify downloaded vkey matches local file
    const localFilePath = join(__dirname, '3x3-vkey-PPOI.json')
    const localFile = await readFile(localFilePath)

    // Convert both to strings for comparison
    const downloadedContent = new TextDecoder().decode(vkey)
    const localContent = new TextDecoder().decode(localFile)

    // Parse both as JSON to compare structure (ignoring whitespace differences)
    const downloadedJson = JSON.parse(downloadedContent)
    const localJson = JSON.parse(localContent)

    // Assert they are equal
    assert.deepStrictEqual(downloadedJson, localJson, 'Downloaded vkey does not match local file')
  })
})
