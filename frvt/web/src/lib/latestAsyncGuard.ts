/**
 * Serialize overlapping async loads so only the newest request may commit UI state.
 * Use when mount effects and post-mutation refreshes can run concurrently.
 */
export function createLatestAsyncGuard() {
  let generation = 0;
  return {
    /** Begin a new logical request and return its generation id. */
    start(): number {
      generation += 1;
      return generation;
    },
    /** Return whether ``id`` is still the newest started request. */
    isLatest(id: number): boolean {
      return id === generation;
    },
  };
}
