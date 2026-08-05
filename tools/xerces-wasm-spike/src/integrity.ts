export function assertSha256(
  label: string,
  actual: string,
  expected: string,
): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `${label} SHA-256 mismatch. Expected ${expected.toLowerCase()} but found ${actual.toLowerCase()}.`,
    );
  }
}

export function assertToolVersion(
  label: string,
  output: string,
  expected: string,
): void {
  if (!output.includes(expected)) {
    throw new Error(`${label} ${expected} is required; received: ${output}`);
  }
}
