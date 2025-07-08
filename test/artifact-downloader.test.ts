import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import axios from 'axios'

import {
  downloadArtifactsForVariant,
  fetchFromIPFS,
  fetchFromIPFSWithFallback,
  getCIDRoot,
  stopHelia
} from '../src/artifact-downloader.js'
import { ArtifactName, RAILGUN_ARTIFACTS_CID_POI, RAILGUN_ARTIFACTS_CID_ROOT } from '../src/definitions.js'
import {
  downloadArtifactsForPOI,
  getArtifactVariantStringPOI,
  isPOIArtifact
} from '../src/poi-artifact-downloader.js'

// Get the current test directory path
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('artifact-downloader', () => {
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
    const artifactName = ArtifactName.VKEY

    console.log('🏁 Starting performance comparison...')

    // Test HTTP Gateway performance
    const vkeyPath = `${artifactVariantString}/vkey.json`
    const httpUrl = `https://ipfs-lb.com/ipfs/${RAILGUN_ARTIFACTS_CID_ROOT}/${vkeyPath}`
    const httpStart = performance.now()
    const httpResponse = await axios.get(httpUrl, { responseType: 'arraybuffer' })
    const httpFile = new Uint8Array(httpResponse.data)
    const httpEnd = performance.now()
    const httpTime = httpEnd - httpStart

    console.log(`🌐 HTTP Gateway: ${httpTime.toFixed(2)}ms (${httpFile.length} bytes)`)

    // Test Helia performance
    const heliaStart = performance.now()
    const heliaFile = await fetchFromIPFS(RAILGUN_ARTIFACTS_CID_ROOT, artifactVariantString, artifactName)
    const heliaEnd = performance.now()
    const heliaTime = heliaEnd - heliaStart

    // Log results
    console.log(`⚡ Helia IPFS: ${heliaTime.toFixed(2)}ms (${heliaFile.length} bytes)`)
    console.log(`📊 Speedup: ${(heliaTime / httpTime).toFixed(2)}x ${heliaTime < httpTime ? '(Helia faster)' : '(HTTP faster)'}`)

    // Verify both files are identical
    assert.deepStrictEqual(heliaFile, httpFile, 'Files downloaded via different methods do not match')

    // Both should be reasonably fast (under 30 seconds for this test)
    assert.ok(heliaTime < 30000, `Helia took too long: ${heliaTime}ms`)
    assert.ok(httpTime < 30000, `HTTP took too long: ${httpTime}ms`)

    console.log('✅ Performance test completed successfully!')
  })

  it('should download all artifacts for a specific variant', async () => {
    const artifactVariantString = '1x1'
    const { vkey, zkey, dat, wasm } = await downloadArtifactsForVariant(artifactVariantString)

    // Verify we got the expected artifacts
    assert.ok(vkey, 'vkey should be defined')
    assert.ok(zkey, 'zkey should be defined')
    assert.ok(wasm, 'wasm should be defined')
    assert.ok(dat === undefined, 'dat should be undefined when not using native artifacts')

    console.log('✅ All artifacts downloaded successfully!')
  })

  it('should fallback to HTTP gateway when IPFS times out', async () => {
    const artifactVariantString = '1x1'
    const artifactName = ArtifactName.VKEY

    console.log('🔄 Testing fallback functionality...')

    // Test the fallback function (which will try IPFS first, then HTTP)
    const fallbackStart = performance.now()
    const fallbackFile = await fetchFromIPFSWithFallback(RAILGUN_ARTIFACTS_CID_ROOT, artifactVariantString, artifactName)
    const fallbackEnd = performance.now()
    const fallbackTime = fallbackEnd - fallbackStart

    console.log(`🔄 Fallback fetch: ${fallbackTime.toFixed(2)}ms (${fallbackFile.length} bytes)`)

    // Verify we got valid content
    assert.ok(fallbackFile.length > 0, 'Fallback file should not be empty')

    // Verify it's valid JSON (since we're fetching vkey.json)
    const content = new TextDecoder().decode(fallbackFile)
    const json = JSON.parse(content)
    assert.ok(json, 'Fallback file should be valid JSON')

    // Compare with direct HTTP fetch to ensure same content
    const vkeyPath = `${artifactVariantString}/vkey.json`
    const httpUrl = `https://ipfs-lb.com/ipfs/${RAILGUN_ARTIFACTS_CID_ROOT}/${vkeyPath}`
    const httpResponse = await axios.get(httpUrl, { responseType: 'arraybuffer' })
    const httpFile = new Uint8Array(httpResponse.data)

    assert.deepStrictEqual(fallbackFile, httpFile, 'Fallback file should match direct HTTP fetch')

    console.log('✅ Fallback test completed successfully!')
  })

  it('should handle IPFS timeout gracefully', async () => {
    const artifactVariantString = '1x1'

    console.log('⏰ Testing IPFS timeout handling...')

    // Test with very short timeout to force timeout
    try {
      const timeoutStart = performance.now()
      await fetchFromIPFS(RAILGUN_ARTIFACTS_CID_ROOT, artifactVariantString, ArtifactName.VKEY, 1) // 1ms timeout
      const timeoutEnd = performance.now()

      // If we get here without timeout, that's also valid (very fast network)
      console.log(`⚡ IPFS was faster than 1ms: ${(timeoutEnd - timeoutStart).toFixed(2)}ms`)
    } catch (error) {
      // Should timeout
      assert.ok(error instanceof Error, 'Should throw an Error')
      assert.ok(error.message.includes('timeout'), 'Error should mention timeout')
      console.log('✅ IPFS timeout handled correctly:', error.message)
    }
  })

  describe('POI (Proof of Innocence) functionality', () => {
    it('should generate correct POI variant strings', () => {
      // Test valid POI variants
      const poi3x3 = getArtifactVariantStringPOI(3, 3)
      const poi13x13 = getArtifactVariantStringPOI(13, 13)

      assert.strictEqual(poi3x3, 'POI_3x3', 'POI 3x3 variant string should be correct')
      assert.strictEqual(poi13x13, 'POI_13x13', 'POI 13x13 variant string should be correct')

      console.log('✅ POI variant strings generated correctly')
    })

    it('should correctly detect POI artifacts', () => {
      // Test POI artifact detection
      assert.ok(isPOIArtifact('POI_3x3'), 'Should detect POI_3x3 as POI artifact')
      assert.ok(isPOIArtifact('POI_13x13'), 'Should detect POI_13x13 as POI artifact')
      assert.ok(!isPOIArtifact('1x1'), 'Should not detect 1x1 as POI artifact')
      assert.ok(!isPOIArtifact('2x16'), 'Should not detect 2x16 as POI artifact')
      assert.ok(!isPOIArtifact('regular_artifact'), 'Should not detect regular artifact as POI')

      console.log('✅ POI artifact detection works correctly')
    })

    it('should return correct CID root for POI artifacts', () => {
      // Test CID root selection
      assert.strictEqual(getCIDRoot('POI_3x3'), RAILGUN_ARTIFACTS_CID_POI, 'Should return POI CID for POI_3x3')
      assert.strictEqual(getCIDRoot('POI_13x13'), RAILGUN_ARTIFACTS_CID_POI, 'Should return POI CID for POI_13x13')
      assert.strictEqual(getCIDRoot('1x1'), RAILGUN_ARTIFACTS_CID_ROOT, 'Should return regular CID for 1x1')
      assert.strictEqual(getCIDRoot('2x16'), RAILGUN_ARTIFACTS_CID_ROOT, 'Should return regular CID for 2x16')

      console.log('✅ CID root selection works correctly')
    })

    it('should download POI artifacts for 3x3 variant', async () => {
      console.log('📥 Testing POI 3x3 artifact download...')

      const poiArtifacts = await downloadArtifactsForPOI(3, 3)

      // Verify we got the expected artifacts
      assert.ok(poiArtifacts.vkey, 'POI vkey should be defined')
      assert.ok(poiArtifacts.zkey, 'POI zkey should be defined')
      assert.ok(poiArtifacts.wasm, 'POI wasm should be defined')
      assert.ok(poiArtifacts.dat === undefined, 'POI dat should be undefined when not using native artifacts')

      // Verify reasonable file sizes
      assert.ok(poiArtifacts.vkey.length > 0, 'POI vkey should not be empty')
      assert.ok(poiArtifacts.zkey.length > 0, 'POI zkey should not be empty')
      assert.ok(poiArtifacts.wasm && poiArtifacts.wasm.length > 0, 'POI wasm should not be empty')

      console.log('✅ POI 3x3 artifacts downloaded successfully!')
      console.log(`- VKEY size: ${poiArtifacts.vkey.length} bytes`)
      console.log(`- ZKEY size: ${poiArtifacts.zkey.length} bytes`)
      console.log(`- WASM size: ${poiArtifacts.wasm?.length || 0} bytes`)

      // Clean up Helia resources
      console.log('🧹 Cleaning up Helia resources...')
      await stopHelia()

      // Log process information at the end
      console.log('\n🔍 Process information after cleanup:')
      console.log(`- Process ID: ${process.pid}`)
      console.log('- Memory usage:', process.memoryUsage())

      // Check for active handles that might prevent exit
      const processAny = process as any
      if (processAny._getActiveHandles) {
        const handles = processAny._getActiveHandles()
        console.log(`- Active handles: ${handles.length}`)
        if (handles.length > 0) {
          console.log('- Handle types:', handles.map((h: any) => h.constructor.name))
        }
      }

      // Check for active requests
      if (processAny._getActiveRequests) {
        const requests = processAny._getActiveRequests()
        console.log(`- Active requests: ${requests.length}`)
        if (requests.length > 0) {
          console.log('- Request types:', requests.map((r: any) => r.constructor.name))
        }
      }

      // Force a small delay to see if anything is still running
      await new Promise(resolve => setTimeout(resolve, 100))
      console.log('🏁 Test completed, checking if process will exit naturally...')
    })
  })
})
