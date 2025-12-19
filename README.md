# `ipfs-artifact-fetcher`

> A simple module for fetching RAILGUN or PPOI circuit artifacts from IPFS

## Install

```sh
npm install @railgun-reloaded/ipfs-artifact-fetcher
```

## Deep Understanding

### What are RAILGUN Circuit Artifacts?

RAILGUN circuit artifacts are cryptographic files required for zero-knowledge proof generation and verification:

- **Verification Key (vkey)**: JSON file containing public parameters for proof verification
- **Proving Key (zkey)**: Binary file containing public parameters for proof generation
- **Circuit WASM**: WebAssembly implementation of the circuit for browser/Node.js
- **Circuit DAT**: Native binary implementation for optimal performance

### Storage and Compression

- `zkey`, `wasm`, and `dat` files are stored on IPFS for decentralized access as `.br` filetypes
- `vkey` files are stored uncompressed as JSON
- The module automatically decompresses artifacts after download

## Requirements

- [Node.js >=22.0.0](https://github.com/ipfs-examples/helia-examples/tree/main/examples/helia-ts-node)
- Network access to IPFS gateways

## Example Usage

### 1. Setting up ArtifactStore

First, create an `ArtifactStore` instance with file system operations:

```ts
import fs from 'node:fs'
import { ArtifactStore } from 'ipfs-artifact-fetcher'

const artifactStore = new ArtifactStore(
  fs.promises.readFile,  // get function
  async (dir, path, data) => {  
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(path, data)
  }, // store function
  (path: string): Promise<boolean> => {
    return new Promise(resolve => {
      fs.promises
        .access(path)
        .then(() => resolve(true))
        .catch(() => resolve(false))
    })
  } // exist function
)
```

### 2. Creating ArtifactDownloader

```ts
import { ArtifactDownloader } from 'ipfs-artifact-fetcher'

// For WASM artifacts (web/JavaScript environments)
const useNativeArtifacts = false
const downloader = new ArtifactDownloader(artifactStore, useNativeArtifacts)

// For native artifacts (Node.js/native environments)
const useNativeArtifacts = true
const nativeDownloader = new ArtifactDownloader(artifactStore, useNativeArtifacts)
```

### 3. Downloading Artifacts

```ts
// Download all RAILGUN 1x1 artifacts
const artifacts = await downloader.downloadArtifactsForVariant('1x1')

console.log('Downloaded RAILGUN artifacts:')
console.log('- Path to Verification Key file:', artifacts.vkeyStoredPath)
console.log('- Path to Proving Key file:', artifacts.zkeyStoredPath)
console.log('- Path to WASM/DAT file:', artifacts.wasmOrDatStoredPath)

// Download PPOI 3x3 artifacts
const ppoiArtifacts = await downloader.downloadArtifactsForVariant('POI_3x3')

console.log('Downloaded PPOI artifacts:')
console.log('- Path to Verification Key file:', ppoiArtifacts.vkeyStoredPath)
console.log('- Path to Proving Key file:', ppoiArtifacts.zkeyStoredPath)
console.log('- Path to WASM/DAT file:', ppoiArtifacts.wasmOrDatStoredPath)
```

## Cleanup

Always call the `stop()` method when you're finished using the `ArtifactDownloader` to ensure proper resource cleanup. This is important because:

- **Network Connections**: Helia manages P2P connections via libp2p. Stopping ensures all active connections are properly closed instead of being left hanging.
- **Memory Management**: Prevents resource leaks by releasing internal state like peer stores and routing tables.
- **Datastore Sync**: Ensures pending writes are flushed to prevent data consistency issues on restart.

```typescript
const downloader = new ArtifactDownloader(store, useNativeArtifacts);

try {
  // Use the downloader
  const artifacts = await downloader.downloadArtifactsForVariant('variant-name');
} finally {
  // Always stop to clean up network connections, memory, and gracefully close resources
  await downloader.stop();
}
```

### 4. Using fetchFromIPFS to fetch Individual Artifacts

If you need to download individual artifacts instead of all artifacts for a variant, you can use the `fetchFromIPFS` method:

```ts
import { ArtifactName, RAILGUN_ARTIFACTS_CID_ROOT, PPOI_ARTIFACTS_CID } from 'ipfs-artifact-fetcher'

// Download individual RAILGUN artifacts
const vkeyPath = await downloader.fetchFromIPFS(
  RAILGUN_ARTIFACTS_CID_ROOT,
  '1x1',
  ArtifactName.VKEY
)

const zkeyPath = await downloader.fetchFromIPFS(
  RAILGUN_ARTIFACTS_CID_ROOT,
  '1x1',
  ArtifactName.ZKEY
)

const wasmPath = await downloader.fetchFromIPFS(
  RAILGUN_ARTIFACTS_CID_ROOT,
  '1x1',
  ArtifactName.WASM
)

console.log('Individual RAILGUN artifacts:')
console.log('- Path to Verification Key file:', vkeyPath)
console.log('- Path to Proving Key file:', zkeyPath)
console.log('- Path to WASM file:', wasmPath)

// Download individual PPOI artifacts
const ppoiVkeyPath = await downloader.fetchFromIPFS(
  PPOI_ARTIFACTS_CID,
  'POI_3x3',
  ArtifactName.VKEY
)

const ppoiZkeyPath = await downloader.fetchFromIPFS(
  PPOI_ARTIFACTS_CID,
  'POI_3x3',
  ArtifactName.ZKEY
)

const ppoiWasmPath = await downloader.fetchFromIPFS(
  PPOI_ARTIFACTS_CID,
  'POI_3x3',
  ArtifactName.WASM
)

console.log('Individual PPOI artifacts:')
console.log('- Path to Verification Key file:', ppoiVkeyPath)
console.log('- Path to Proving Key file:', ppoiZkeyPath)
console.log('- Path to WASM file:', ppoiWasmPath)
```

## File Structure

Downloaded artifacts are stored in the following structure:

```text
artifacts-v2.1/
├── 1x1/
│   ├── vkey.json
│   ├── zkey
│   ├── dat
│   └── wasm
├── 2x2/
│   ├── vkey.json
│   ├── zkey
│   ├── dat
│   └── wasm
└── ppoi-nov-2-23/
    ├── POI_3x3/
    │   ├── vkey.json
    │   ├── zkey
    │   ├── dat
    │   └── wasm
    └── POI_13x13/
        ├── vkey.json
        ├── zkey
        ├── dat
        └── wasm
```

## License

[MIT](LICENSE)
