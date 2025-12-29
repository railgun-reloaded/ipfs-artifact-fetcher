const IPFS_GATEWAY = 'https://ipfs-lb.com'

const RAILGUN_ARTIFACTS_CID_ROOT =
'QmUsmnK4PFc7zDp2cmC4wBZxYLjNyRgWfs5GNcJJ2uLcpU'

const PPOI_ARTIFACTS_CID =
  'QmZrP9zaZw2LwErT2yA6VpMWm65UdToQiKj4DtStVsUJHr'

const ARTIFACT_VARIANT_STRING_PPOI_PREFIX = 'POI' // Note: this should be changed to 'PPOI' when the artifacts are updated in IPFS

const VALID_PPOI_ARTIFACT_VARIANT = [
  `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_3x3`,
  `${ARTIFACT_VARIANT_STRING_PPOI_PREFIX}_13x13`,
]

const VALID_RAILGUN_ARTIFACT_VARIANTS = [
  '01x01', '01x02', '01x03', '01x04', '01x05', '01x06', '01x07', '01x08', '01x09', '01x10',
  '01x11', '01x12', '01x13',
  '02x01', '02x02', '02x03', '02x04', '02x05', '02x06', '02x07', '02x08', '02x09', '02x10',
  '02x11', '02x12',
  '03x01', '03x02', '03x03', '03x04', '03x05', '03x06', '03x07', '03x08', '03x09', '03x10',
  '03x11',
  '04x01', '04x02', '04x03', '04x04', '04x05', '04x06', '04x07', '04x08', '04x09', '04x10',
  '05x01', '05x02', '05x03', '05x04', '05x05', '05x06', '05x07', '05x08', '05x09',
  '06x01', '06x02', '06x03', '06x04', '06x05', '06x06', '06x07', '06x08',
  '07x01', '07x02', '07x03', '07x04', '07x05', '07x06', '07x07',
  '08x01', '08x02', '08x03', '08x04', '08x05', '08x06',
  '09x01', '09x02', '09x03', '09x04', '09x05',
  '10x01', '10x02', '10x03', '10x04',
  '11x01', '11x02', '11x03',
  '12x01', '12x02',
  '13x01',
]

type ValidPPOIVariant = (typeof VALID_PPOI_ARTIFACT_VARIANT)[number]
type ValidRailgunVariant = (typeof VALID_RAILGUN_ARTIFACT_VARIANTS)[number]
type ValidArtifactVariant = ValidPPOIVariant | ValidRailgunVariant

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

export type { GetArtifact, StoreArtifact, ArtifactExists, Artifact, ValidArtifactVariant, ValidPPOIVariant, ValidRailgunVariant }
export { IPFS_GATEWAY, RAILGUN_ARTIFACTS_CID_ROOT, PPOI_ARTIFACTS_CID, VALID_PPOI_ARTIFACT_VARIANT, VALID_RAILGUN_ARTIFACT_VARIANTS, ARTIFACT_VARIANT_STRING_PPOI_PREFIX, ArtifactName }
