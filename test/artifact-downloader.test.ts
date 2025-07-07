import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import axios from 'axios'

import { downloadArtifactsForVariant, fetchFromIPFS } from '../src/artifact-downloader.js'
import { ArtifactName, RAILGUN_ARTIFACTS_CID_ROOT } from '../src/definitions.js'

// Get the current test directory path
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe.only('artifact-downloader', () => {
  it('should fetch artifacts using IPFS CID and match local file', async () => {
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

    console.log('✓ Files match!')
  })

  it('should compare performance: Helia vs HTTP Gateway', async () => {
    const artifactVariantString = '1x1'
    const vkeyPath = `${artifactVariantString}/vkey.json`
    const httpUrl = `https://ipfs-lb.com/ipfs/${RAILGUN_ARTIFACTS_CID_ROOT}/${vkeyPath}`

    console.log('🏁 Starting performance comparison...')

    // Test Helia performance
    const heliaStart = performance.now()
    const heliaFile = await fetchFromIPFS(RAILGUN_ARTIFACTS_CID_ROOT, artifactVariantString, ArtifactName.VKEY)
    const heliaEnd = performance.now()
    const heliaTime = heliaEnd - heliaStart

    // Test HTTP Gateway performance
    const httpStart = performance.now()
    const httpResponse = await axios.get(httpUrl, { responseType: 'arraybuffer' })
    const httpFile = new Uint8Array(httpResponse.data)
    const httpEnd = performance.now()
    const httpTime = httpEnd - httpStart

    // Log results
    console.log(`⚡ Helia IPFS: ${heliaTime.toFixed(2)}ms (${heliaFile.length} bytes)`)
    console.log(`🌐 HTTP Gateway: ${httpTime.toFixed(2)}ms (${httpFile.length} bytes)`)
    console.log(`📊 Speedup: ${(heliaTime / httpTime).toFixed(2)}x ${heliaTime < httpTime ? '(Helia was faster)' : '(HTTP was faster)'}`)

    // Verify both files are identical
    assert.deepStrictEqual(heliaFile, httpFile, 'Files downloaded via different methods do not match')

    // Both should be reasonably fast (under 30 seconds for this test)
    assert.ok(heliaTime < 30000, `Helia took too long: ${heliaTime}ms`)
    assert.ok(httpTime < 30000, `HTTP took too long: ${httpTime}ms`)

    console.log('✅ Performance test completed successfully!')
  })

  it.only('should download all artifacts for a specific variant', async () => {
    const artifactVariantString = '1x1'
    const { vkey, zkey, dat, wasm } = await downloadArtifactsForVariant(artifactVariantString)

    console.log('dat: ', dat)
    console.log('wasm: ', wasm)
    console.log('vkey', vkey)
    console.log('zkey', zkey)
  })
})
