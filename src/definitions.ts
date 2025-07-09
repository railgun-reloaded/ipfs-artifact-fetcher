const RAILGUN_ARTIFACTS_CID_ROOT =
  'QmeBrG7pii1qTqsn7rusvDiqXopHPjCT9gR4PsmW7wXqZq'

const RAILGUN_ARTIFACTS_CID_PPOI =
  'QmZrP9zaZw2LwErT2yA6VpMWm65UdToQiKj4DtStVsUJHr'

const ARTIFACT_VARIANT_STRING_PPOI_PREFIX = 'POI'

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
  zkey: ArrayLike<number>;
  wasm: Optional<ArrayLike<number>>;
  dat: Optional<ArrayLike<number>>;
  vkey: ArrayLike<number>;
}

 type BytesData = bigint | number | ArrayLike<number> | string

 type ArtifactHashesJson = Record<
  string,
  Record<ArtifactName.DAT | ArtifactName.WASM | ArtifactName.ZKEY, string>
>

export type { Artifact, BytesData, ArtifactHashesJson }
export { RAILGUN_ARTIFACTS_CID_ROOT, RAILGUN_ARTIFACTS_CID_PPOI, VALID_PPOI_ARTIFACT_VARIANT, ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName }
