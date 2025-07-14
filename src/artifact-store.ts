import type { ArtifactExists, GetArtifact, StoreArtifact } from './definitions'

/**
 * Represents a store for managing artifacts, providing methods to get, store, and check existence.
 */
export class ArtifactStore {
  /**
   * Function to retrieve an artifact from the store.
   */
  get: GetArtifact;

  /**
   * Function to store an artifact in the store.
   */
  store: StoreArtifact

  /**
   * Function to check if an artifact exists in the store.
   */
  exists: ArtifactExists

  /**
   * Creates an instance of ArtifactStore with provided get, store, and exists methods.
   * @param get Function to retrieve an artifact.
   * @param store Function to store an artifact.
   * @param exists Function to check if an artifact exists.
   */
  constructor (get: GetArtifact, store: StoreArtifact, exists: ArtifactExists) {
    this.get = get
    this.store = store
    this.exists = exists
  }
}
