import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function gitBlob(relativePath: string): string {
  const bytes = readFileSync(path.join(repositoryRoot, relativePath));
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

// Historical expectations bind to the recorded pre-0.3 packaging identity.
// The current package has its own Release030Packaging contract.
const { packageJson, packageLock } = JSON.parse(
  read('docs/release-0.3.0-source-record.json'),
).historicalPackaging;
const candidateReportPath = 'docs/release-0.2.0-candidate-report.md';
const candidateReport = read(candidateReportPath);
const browserHarness = read('scripts/audit-standards-engine-lifecycle.mjs');

describe('historical 0.2.0 release-candidate packaging contracts', () => {
  it('preserves the exact reviewed candidate report', () => {
    expect(gitBlob(candidateReportPath)).toBe(
      '894c86a2971abd805b6bc5989e974ea8b6e2b262',
    );
    expect(candidateReport).toContain('# XML Carousel 0.2.0 Candidate Report');
    expect(candidateReport).toContain(
      'Candidate preparation began on 2026-08-09',
    );
  });

  it('records the exact candidate branch, baseline, commit boundary, and version', () => {
    for (const identity of [
      'release-0.2.0-candidate',
      'ad46fd4cbb94b7460089cf241f0897930661ecdd',
      'b5c0425220514490a6a64b4f3538df5e4d625356',
      'Package version: `0.2.0`',
    ]) {
      expect(candidateReport).toContain(identity);
    }
    expect(packageJson.version).toBe('0.2.0');
    expect(packageLock.version).toBe('0.2.0');
    expect(packageLock.packages[''].version).toBe('0.2.0');
  });

  it('keeps publication and deployment pending only as historical candidate-stage evidence', () => {
    for (const state of [
      'Ben final release QA: pending',
      'Release-candidate integration: pending',
      'Hosted CI on exact candidate merge SHA: pending',
      'Annotated v0.2.0 tag: not created',
      'GitHub Release: not created',
      'Deployment: not performed',
      'Live-site verification: not performed',
    ]) {
      expect(candidateReport).toContain(state);
    }
    expect(candidateReport).toMatch(
      /candidate-only\s+evidence; it is not a publication or deployment record/iu,
    );
  });

  it('preserves controlled-browser candidate evidence and focused Overview Inspect coverage', () => {
    for (const evidence of [
      'Controlled Chrome evidence',
      'Controlled Firefox evidence',
      'focused Overview Inspect',
      'deterministic node-summary',
      'retained-source copy',
    ]) {
      expect(candidateReport).toContain(evidence);
    }

    expect(browserHarness).toContain('Copy node summary');
    expect(browserHarness).toContain('Copy source');
    expect(browserHarness).toContain(
      'compactSemanticZoom.overview.focusedInspectCount === 1',
    );
    expect(browserHarness).toContain(
      'compactSemanticZoom.overview.contextInspectCount === 0',
    );
    expect(browserHarness).toContain(
      'compactSemanticZoom.overviewInspection.opened.inspected ===',
    );
    expect(browserHarness).toContain('developerHandoffAudit');
  });
});
