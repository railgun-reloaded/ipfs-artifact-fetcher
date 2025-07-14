# `ipfs-artifact-fetcher`

> A simple module for fetching RAILGUN or PPOI circuit artifacts from IPFS

## Install

```sh
npm install @railgun-reloaded/ipfs-artifact-fetcher
```

## Example Usage

### `downloadArtifactsForVariant`

Download all artifacts (vkey, zkey, wasm/dat) for a specific circuit variant (ex. `1x1`):

```ts
import { downloadArtifactsForVariant, stopHelia } from 'ipfs-artifact-fetcher';

async function main() {
  try {
    // Download RAILGUN 1x1 circuit artifacts
    const artifacts = await downloadArtifactsForVariant('1x1');

    console.log('Downloaded artifacts:', {
      vkey: artifacts.vkey ? `${artifacts.vkey.length} bytes` : 'undefined',
      zkey: artifacts.zkey ? `${artifacts.zkey.length} bytes` : 'undefined',
      wasm: artifacts.wasm ? `${artifacts.wasm.length} bytes` : 'undefined',
      dat: artifacts.dat ? `${artifacts.dat.length} bytes` : 'undefined',
    });

    // Use the artifacts for circuit operations
    // artifacts.vkey contains the verification key (JSON)
    // artifacts.zkey contains the proving key (binary)
    // artifacts.wasm contains the circuit WASM (binary)
  } finally {
    // Clean up Helia node resources
    await stopHelia();
  }
}

main().catch(console.error);
```

#### Output

```sh
Downloaded artifacts: {
  vkey: "2847 bytes",
  zkey: "3891234 bytes",
  wasm: "1234567 bytes",
  dat: "undefined"
}
```

### PPOI (Private Proof of Innocence) Artifacts

Download PPOI circuit artifacts for privacy-preserving compliance:

```ts
import { downloadArtifactsForVariant, stopHelia } from 'ipfs-artifact-fetcher';

async function main() {
  try {
    // Download PPOI 3x3 circuit artifacts
    const ppoiArtifacts = await downloadArtifactsForVariant('POI_3x3');

    console.log('PPOI artifacts downloaded:', {
      vkey: ppoiArtifacts.vkey
        ? `${ppoiArtifacts.vkey.length} bytes`
        : 'undefined',
      zkey: ppoiArtifacts.zkey
        ? `${ppoiArtifacts.zkey.length} bytes`
        : 'undefined',
      wasm: ppoiArtifacts.wasm
        ? `${ppoiArtifacts.wasm.length} bytes`
        : 'undefined',
    });
  } finally {
    await stopHelia();
  }
}

main().catch(console.error);
```

### `fetchFromIPFS`

Fetch individual artifacts by name:

```ts
import {
  fetchFromIPFS,
  stopHelia,
  ArtifactName,
  RAILGUN_ARTIFACTS_CID_ROOT,
} from 'ipfs-artifact-fetcher';

async function main() {
  try {
    // Fetch only the verification key for 1x1 circuit
    const vkey = await fetchFromIPFS(
      RAILGUN_ARTIFACTS_CID_ROOT,
      '1x1',
      ArtifactName.VKEY
    );

    // Parse the vkey JSON
    const vkeyData = JSON.parse(new TextDecoder().decode(vkey));
    console.log('Verification key:', vkeyData);
  } finally {
    await stopHelia();
  }
}

main().catch(console.error);
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

- Node.js >=22.0.0
- Network access to IPFS gateways

## License

[MIT](LICENSE)
