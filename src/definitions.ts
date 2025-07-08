const RAILGUN_ARTIFACTS_CID_ROOT =
  'QmeBrG7pii1qTqsn7rusvDiqXopHPjCT9gR4PsmW7wXqZq'

const RAILGUN_ARTIFACTS_CID_POI =
  'QmZrP9zaZw2LwErT2yA6VpMWm65UdToQiKj4DtStVsUJHr'

const ARTIFACT_VARIANT_STRING_POI_PREFIX = 'POI'

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
export { RAILGUN_ARTIFACTS_CID_ROOT, RAILGUN_ARTIFACTS_CID_POI, ARTIFACT_VARIANT_STRING_POI_PREFIX, ArtifactName }
