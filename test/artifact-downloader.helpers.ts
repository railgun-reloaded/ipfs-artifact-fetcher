import fs from 'node:fs'

import type { ArtifactDownloaderFetch } from '../src/artifact-downloader-fetch.js'
import type { ArtifactDownloaderHeliaHTTP } from '../src/artifact-downloader-helia-http.js'
import type { ArtifactDownloader } from '../src/artifact-downloader.js'
import { ArtifactStore } from '../src/artifact-store.js'

type DownloaderImplementation = ArtifactDownloader | ArtifactDownloaderHeliaHTTP | ArtifactDownloaderFetch

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

/**
 * Creates a test artifact store for testing purposes.
 * @returns An ArtifactStore instance configured for testing.
 */
const createTestArtifactStore = (): ArtifactStore => {
  return new ArtifactStore(
    fs.promises.readFile,
    async (dir, path, data) => {
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(path, data)
    },
    fileExists
  )
}

/**
 * Factory function to create a downloader instance based on implementation type.
 * @param implementationType - The type of downloader to create ('verified-fetch', 'helia-http', or 'fetch')
 * @param artifactStore - The artifact store instance to use
 * @param useNativeArtifacts - Whether to use native artifacts instead of WASM
 * @returns A downloader instance of the specified type
 */
const createDownloader = async (
  implementationType: 'verified-fetch' | 'helia-http' | 'fetch',
  artifactStore: ArtifactStore,
  useNativeArtifacts: boolean
): Promise<DownloaderImplementation> => {
  switch (implementationType) {
    case 'verified-fetch': {
      const { ArtifactDownloader } = await import('../src/artifact-downloader.js')
      return new ArtifactDownloader(artifactStore, useNativeArtifacts)
    }
    case 'helia-http': {
      const { ArtifactDownloaderHeliaHTTP } = await import('../src/artifact-downloader-helia-http.js')
      return new ArtifactDownloaderHeliaHTTP(artifactStore, useNativeArtifacts)
    }
    case 'fetch': {
      const { ArtifactDownloaderFetch } = await import('../src/artifact-downloader-fetch.js')
      return new ArtifactDownloaderFetch(artifactStore, useNativeArtifacts)
    }
  }
}

export type { DownloaderImplementation }
export { fileExists, createTestArtifactStore, createDownloader }
