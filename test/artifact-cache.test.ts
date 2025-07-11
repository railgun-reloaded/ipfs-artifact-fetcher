import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { ArtifactDownloader } from '../src/artifact-downloader.js'

describe('artifact-cache', { timeout: 100000 }, () => {
  let downloader: ArtifactDownloader

  beforeEach(() => {
    downloader = new ArtifactDownloader()
  })

  afterEach(async () => {
    await downloader.stop()
  })

  it('should cache artifacts and reuse them on subsequent downloads', async () => {
    const artifactVariantString = '1x1'

    // Clear cache before test
    downloader.clearCache()
    assert.strictEqual(downloader.getCacheSize(), 0, 'Cache should be empty initially')

    // First download - should fetch from IPFS
    const artifacts1 = await downloader.downloadArtifactsForVariant(artifactVariantString)

    // Check that cache has items now
    assert.ok(downloader.getCacheSize() > 0, 'Cache should contain artifacts after first download')

    // Second download - should use cache
    const start2 = Date.now()
    const artifacts2 = await downloader.downloadArtifactsForVariant(artifactVariantString)
    const time2 = Date.now() - start2

    // Verify artifacts are identical
    assert.deepStrictEqual(artifacts1.vkey, artifacts2.vkey, 'Cached vkey should match original')
    assert.deepStrictEqual(artifacts1.zkey, artifacts2.zkey, 'Cached zkey should match original')
    assert.deepStrictEqual(artifacts1.wasm, artifacts2.wasm, 'Cached wasm should match original')

    // Second download should be instant since it's cached
    assert.strictEqual(time2, 0, 'Cached download should be 0ms since no network request is needed')

    // Clean up
    downloader.clearCache()
    assert.strictEqual(downloader.getCacheSize(), 0, 'Cache should be empty after clearing')
  })
})
