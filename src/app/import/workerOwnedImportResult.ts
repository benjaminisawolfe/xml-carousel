const workerOwnedImportResults = new WeakSet<object>();

export function markWorkerOwnedImportResult(result: object): void {
  workerOwnedImportResults.add(result);
}

export function isWorkerOwnedImportResult(result: object): boolean {
  return workerOwnedImportResults.has(result);
}
