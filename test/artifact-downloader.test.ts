import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  downloadArtifactsForVariant,
  fetchFromIPFS,
  stopHelia
} from '../src/artifact-downloader.js'
import { ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName, RAILGUN_ARTIFACTS_CID_ROOT } from '../src/definitions.js'

// Get the current test directory path
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('artifact-downloader', () => {
  afterEach(async () => {
    await stopHelia()
  })

  it('should download RAILGUN 1x1 vkey artifact using IPFS CID and match local file', async () => {
    const artifactVariantString = '1x1'

    // Fetch from IPFS
    const downloadedFile = await fetchFromIPFS(RAILGUN_ARTIFACTS_CID_ROOT, artifactVariantString, ArtifactName.VKEY)

    // Read local file
    const localFilePath = join(__dirname, '1x1-vkey.json')
    const localFile = await readFile(localFilePath)

    console.log('Downloaded file size:', downloadedFile.length)
    console.log('Local file size:', localFile.length)

    // Convert both to strings for easier comparison
    const downloadedContent = new TextDecoder().decode(downloadedFile)
    const localContent = new TextDecoder().decode(localFile)

    // Parse both as JSON to compare structure (ignoring whitespace differences)
    const downloadedJson = JSON.parse(downloadedContent)
    const localJson = JSON.parse(localContent)

    // Assert they are equal
    assert.deepStrictEqual(downloadedJson, localJson, 'Downloaded file does not match local file')

    console.log('✅ Railgun 1x1 vkey artifact downloaded successfully!')
  })

  it('should download all RAILGUN 1x1 artifacts', async () => {
    const artifactVariantString = '1x1'
    const { vkey, zkey, dat, wasm } = await downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkey, 'vkey should be defined')
    assert.ok(zkey, 'zkey should be defined')
    assert.ok(wasm, 'wasm should be defined')
    assert.ok(dat === undefined, 'dat should be undefined when not using native artifacts')

    console.log('✅ All Railgun 1x1 artifacts downloaded successfully!')
  })

  it('should download all PPOI artifacts for 3x3 variant', async () => {
    const artifactVariantString = `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`
    const ppoiArtifacts = await downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(ppoiArtifacts.vkey, 'PPOI vkey should be defined')
    assert.ok(ppoiArtifacts.zkey, 'PPOI zkey should be defined')
    assert.ok(ppoiArtifacts.wasm, 'PPOI wasm should be defined')
    assert.ok(ppoiArtifacts.dat === undefined, 'PPOI dat should be undefined when not using native artifacts')

    // Verify reasonable file sizes
    assert.ok(ppoiArtifacts.vkey.length > 0, 'PPOI vkey should not be empty')
    assert.ok(ppoiArtifacts.zkey.length > 0, 'PPOI zkey should not be empty')
    assert.ok(ppoiArtifacts.wasm && ppoiArtifacts.wasm.length > 0, 'PPOI wasm should not be empty')

    console.log('✅ PPOI 3x3 artifacts downloaded successfully!')
    console.log(`- VKEY size: ${ppoiArtifacts.vkey.length} bytes`)
    console.log(`- ZKEY size: ${ppoiArtifacts.zkey.length} bytes`)
    console.log(`- WASM size: ${ppoiArtifacts.wasm?.length || 0} bytes`)
  })
})
