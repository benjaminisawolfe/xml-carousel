import { existsSync, readFileSync } from 'node:fs';
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

const readme = read('README.md');
const packageJson = JSON.parse(read('package.json')) as { version: string };
const packageLock = JSON.parse(read('package-lock.json')) as {
  version: string;
  packages: { '': { version: string } };
};
const releaseNotes = read('docs/second-public-alpha.md');
const releaseChecklist = read('docs/release-0.2.0-checklist.md');
const candidateReport = read('docs/release-0.2.0-candidate-report.md');
const browserHarness = read('scripts/audit-standards-engine-lifecycle.mjs');
const currentCandidateDocuments = [
  readme,
  releaseNotes,
  releaseChecklist,
  candidateReport,
].join('\n');

describe('0.2.0 release-candidate packaging contracts', () => {
  it('uses the approved candidate version without changing lockfile identity levels', () => {
    expect(packageJson.version).toBe('0.2.0');
    expect(packageLock.version).toBe('0.2.0');
    expect(packageLock.packages[''].version).toBe('0.2.0');
  });

  it('creates and links the current version-specific release documents', () => {
    for (const file of [
      'docs/second-public-alpha.md',
      'docs/release-0.2.0-checklist.md',
      'docs/release-0.2.0-candidate-report.md',
    ]) {
      expect(existsSync(path.join(repositoryRoot, file))).toBe(true);
      expect(readme).toContain(`](${file})`);
    }

    expect(readme).toContain('0.1.0 is the first public alpha');
    expect(readme).toContain('currently published and');
    expect(readme).toContain('Version 0.2.0 is a prepared release candidate');
    expect(readme).toMatch(/publication and deployment are pending/iu);
  });

  it('records the approved candidate identity and user-facing boundaries', () => {
    expect(releaseNotes).toContain(
      '# XML Carousel 0.2.0 — Second Public Alpha',
    );
    for (const contract of [
      'Candidate preparation date: 2026-08-09',
      'Release date: pending publication',
      'Planned tag: `v0.2.0`',
      'Planned GitHub Release: prerelease',
      'https://xmlcarousel.wolfshafenpress.com/',
      '221/221',
      'Apache Xerces-C++ 3.3.0',
      'Full, Compact, and Overview',
      'Copy source',
      'Copy node summary',
      'XSD 1.1 is not supported',
      'binary/image mode',
    ]) {
      expect(releaseNotes).toContain(contract);
    }
    expect(releaseNotes).toMatch(/projects are read-only/iu);
  });

  it('separates candidate, manual, integration, publication, and deployment authority', () => {
    for (const marker of [
      '[Codex—instructed]',
      '[Manual QA]',
      '[Explicit authorization]',
    ]) {
      expect(releaseChecklist).toContain(marker);
    }
    for (const heading of [
      'Candidate preparation',
      'Candidate automated validation',
      'Controlled browser evidence',
      "Ben's final release QA",
      'Release-candidate integration and exact-SHA CI',
      'Tag and publication authorization',
      'Manual deployment authorization',
      'Deployed-byte verification',
      'Live-site smoke',
      'Final release closure',
    ]) {
      expect(releaseChecklist).toContain(`## ${heading}`);
    }
    expect(releaseChecklist).toContain(
      'Use binary/image transfer mode for all release',
    );
    expect(releaseChecklist).toMatch(
      /cache bypass and\s+compare its bytes and SHA-256/iu,
    );
    expect(releaseChecklist).toContain(
      'Candidate-stage publication and deployment actions intentionally remain',
    );
  });

  it('keeps every public-state transition explicitly pending', () => {
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

    for (const falseClaim of [
      'v0.2.0 has been published',
      'GitHub Release: published',
      'Deployment: completed',
      'Deployed-byte verification: passed',
      'canonical site is running 0.2.0',
    ]) {
      expect(currentCandidateDocuments).not.toContain(falseClaim);
    }
  });

  it('requires the controlled-browser release gate to exercise focused Overview Inspect', () => {
    expect(browserHarness).toContain('focusedInspectCount');
    expect(browserHarness).toContain('contextInspectCount');
    expect(browserHarness).toContain('overviewInspection');
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
    expect(browserHarness).toContain('developerHandoff.copiedSource ===');
    expect(browserHarness).toContain('developerHandoff.nodeSummary.first ===');
  });
});
