import assert from 'node:assert'
import { setMaxListeners } from 'node:events'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { dbg } from '../src/artifact-downloader.js'
import { ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName, PPOI_ARTIFACTS_CID, RAILGUN_ARTIFACTS_CID_ROOT } from '../src/definitions.js'

import { createDownloader, createTestArtifactStore } from './artifact-downloader.helpers.js'

// Increase max listeners to handle concurrent IPFS fetches
setMaxListeners(100)

// Get the current test directory path
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Test suite factory that creates tests for any downloader implementation.
 * @param implementationType asdasd
 */
const createTestSuite = (implementationType: 'verified-fetch' | 'helia-http' | 'fetch') => {
  dbg(`Creating test suite for implementation: ${implementationType}`)

  describe(`artifact-downloader (${implementationType}) for snarkjs artifacts`, { timeout: 2000000 }, () => {
    let artifactStore = createTestArtifactStore()

    before(() => {
      artifactStore = createTestArtifactStore()
    })

    describe('snarkjs tests', () => {
      it('should download RAILGUN 01x01 artifacts and verify vkey matches local file', async () => {
        const downloader = await createDownloader(implementationType, artifactStore, false)

        try {
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
        } finally {
          const downloader = await createDownloader(implementationType, artifactStore, false)
          await downloader.stop()
        }
      })

      it('should download PPOI 3x3 artifacts and verify vkey matches local file', async () => {
        const downloader = await createDownloader(implementationType, artifactStore, false)

        try {
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
        } finally {
          const downloader = await createDownloader(implementationType, artifactStore, false)
          await downloader.stop()
        }
      })

      it('should use already stored artifacts', async () => {
        const downloader = await createDownloader(implementationType, artifactStore, false)

        try {
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
        } finally {
          const downloader = await createDownloader(implementationType, artifactStore, false)
          await downloader.stop()
        }
      })
    })
  })

  describe(`artifact-downloader (${implementationType}) for native artifacts`, { timeout: 200000 }, () => {
    let artifactStore = createTestArtifactStore()

    before(() => {
      artifactStore = createTestArtifactStore()
    })

    it('should download RAILGUN 01x01 artifacts and verify vkey matches local file', async () => {
      const downloader = await createDownloader(implementationType, artifactStore, true)

      try {
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
      } finally {
        const downloader = await createDownloader(implementationType, artifactStore, true)
        await downloader.stop()
      }
    })

    it('should download PPOI 3x3 artifacts and verify vkey matches local file', async () => {
      const downloader = await createDownloader(implementationType, artifactStore, true)

      try {
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
      } finally {
        const downloader = await createDownloader(implementationType, artifactStore, true)
        await downloader.stop()
      }
    })

    it('should download PPOI 3x3 native artifact', async () => {
      const downloader = await createDownloader(implementationType, artifactStore, true)

      try {
        const artifactVariantString = `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`
        const file = await downloader.fetchFromIPFS(
          PPOI_ARTIFACTS_CID,
          artifactVariantString,
          ArtifactName.DAT
        )

        console.log(`[${implementationType}] Downloaded PPOI 3x3 dat artifact size:`, file.length)
        assert.ok(file.length > 0, 'Downloaded PPOI 3x3 dat artifact should have content')
      } finally {
        const downloader = await createDownloader(implementationType, artifactStore, true)
        await downloader.stop()
      }
    })

    it('should download RAILGUN 01x01 native artifact', async () => {
      const downloader = await createDownloader(implementationType, artifactStore, true)

      try {
        const artifactVariantString = '01x01'
        const file = await downloader.fetchFromIPFS(
          RAILGUN_ARTIFACTS_CID_ROOT,
          artifactVariantString,
          ArtifactName.DAT
        )

        console.log(`[${implementationType}] Downloaded RAILGUN 01x01 dat artifact size:`, file.length)
        assert.ok(file.length > 0, 'Downloaded RAILGUN 01x01 dat artifact should have content')
      } finally {
        const downloader = await createDownloader(implementationType, artifactStore, true)
        await downloader.stop()
      }
    })
  })
}

// Create test suites for all implementations
createTestSuite('fetch')
createTestSuite('helia-http')
createTestSuite('verified-fetch')
