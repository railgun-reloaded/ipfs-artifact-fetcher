const RAILGUN_ARTIFACTS_CID_ROOT =
  'QmeBrG7pii1qTqsn7rusvDiqXopHPjCT9gR4PsmW7wXqZq'

const RAILGUN_ARTIFACTS_CID_PPOI =
  'QmZrP9zaZw2LwErT2yA6VpMWm65UdToQiKj4DtStVsUJHr'

const ARTIFACT_VARIANT_STRING_PPOI_PREFIX = 'POI' // Note: this should be changed to 'PPOI' when the artifacts are updated in IPFS

const VALID_PPOI_ARTIFACT_VARIANT = [
  `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`,
  `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_13x13`,
]

enum ArtifactName {
  ZKEY = 'zkey',
  WASM = 'wasm',
  VKEY = 'vkey',
  DAT = 'dat',
}

type Artifact = {
  zkey: Uint8Array;
  wasm: Optional<Uint8Array>;
  dat: Optional<Uint8Array>;
  vkey: Uint8Array;
}

type GetArtifact = (path: string) => Promise<Uint8Array | null>

type StoreArtifact = (
  dir: string,
  path: string,
  item: Uint8Array,
) => Promise<void>

type ArtifactExists = (path: string) => Promise<boolean>

export type { GetArtifact, StoreArtifact, ArtifactExists, Artifact }
export { RAILGUN_ARTIFACTS_CID_ROOT, RAILGUN_ARTIFACTS_CID_PPOI, VALID_PPOI_ARTIFACT_VARIANT, ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName }
