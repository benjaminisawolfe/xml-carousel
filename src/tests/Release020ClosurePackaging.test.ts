import { createHash } from 'node:crypto';
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

function gitBlob(relativePath: string): string {
  const bytes = readFileSync(path.join(repositoryRoot, relativePath));
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

// Preserve the original 0.2 expectations against their recorded source state.
const { readme, packageJson, packageLock } = JSON.parse(
  read('docs/release-0.3.0-source-record.json'),
).historicalPackaging;
const releaseNotes = read('docs/second-public-alpha.md');
const releaseChecklist = read('docs/release-0.2.0-checklist.md');
const releaseReportPath = 'docs/release-0.2.0-release-report.md';
const releaseReport = read(releaseReportPath);
const candidateReport = read('docs/release-0.2.0-candidate-report.md');
const currentFacingDocuments = [
  readme,
  releaseNotes,
  releaseChecklist,
  releaseReport,
].join('\n');

describe('0.2.0 release-closure packaging contracts', () => {
  it('keeps package identity at 0.2.0 and adds the authoritative final report', () => {
    expect(packageJson.version).toBe('0.2.0');
    expect(packageLock.version).toBe('0.2.0');
    expect(packageLock.packages[''].version).toBe('0.2.0');
    expect(existsSync(path.join(repositoryRoot, releaseReportPath))).toBe(true);
    expect(readme).toContain(`](${releaseReportPath})`);
  });

  it('identifies 0.2.0 as the current published and deployed public alpha', () => {
    for (const contract of [
      'Version 0.2.0 is the current second public alpha.',
      'Version 0.2.0 is the current public alpha.',
      'https://github.com/benjaminisawolfe/xml-carousel/releases/tag/v0.2.0',
      'canonical site',
      'deployed-byte verification passed',
      'Chrome 151.0.7922.77',
      'Firefox 153.0.3',
      '39f0f141b99f43aaeec8de09a189ec4f6ba65b06edbb55008179b8cf3147ddd9',
    ]) {
      expect(readme.toLowerCase()).toContain(contract.toLowerCase());
    }
  });

  it('records actual release metadata and completed distribution state in release notes', () => {
    for (const contract of [
      'Release date: 2026-08-10',
      'Annotated tag: `v0.2.0`',
      'Published source commit: `1c744fd16079cbefcaf1f4c96d69c1897e9727ab`',
      'GitHub Release: published as a prerelease',
      'GitHub Release ID: `367670853`',
      'Deployment: completed by manual FTP',
      'Deployed-byte verification: passed',
      '3,257,270 bytes',
      'release-0.2.0-release-report.md',
    ]) {
      expect(releaseNotes).toContain(contract);
    }
  });

  it('keeps every release gate checked and records final identities', () => {
    expect(releaseChecklist).not.toContain('- [ ]');
    expect(releaseChecklist.match(/^- \[x\]/gmu)?.length).toBeGreaterThan(30);
    for (const contract of [
      '[Codex—instructed]',
      '[Manual QA]',
      '[Explicit authorization]',
      'Release commit: `1c744fd16079cbefcaf1f4c96d69c1897e9727ab`',
      'Tag object: `8584d805caa734edbab712c6b4e2b16667304ff9`',
      'GitHub Release ID: `367670853`',
      'No rollback',
      'release-0.2.0-release-report.md',
    ]) {
      expect(releaseChecklist.toLowerCase()).toContain(contract.toLowerCase());
    }
  });

  it('records exact publication, deployment, distribution, and hosted-CI identities', () => {
    for (const identity of [
      '8584d805caa734edbab712c6b4e2b16667304ff9',
      '1c744fd16079cbefcaf1f4c96d69c1897e9727ab',
      '1d246721ef83911fc358bafe3539d01149edec37',
      '367670853',
      '31353414205',
      '93348391714',
      '173 test files and 2,295 tests passed',
      '14 files totalling',
      '3,257,270 bytes',
      '98c40bfd13142a1288e1672f3ce32f1f084cf52af529c2499484a55566ecbe7d',
    ]) {
      expect(releaseReport).toContain(identity);
    }
    const distributionRows = releaseReport.match(
      /^\| `(?:assets\/[^`]+|index\.html|LICENSE\.txt|THIRD_PARTY_NOTICES\.txt)` \|/gmu,
    );
    expect(distributionRows).toHaveLength(14);
  });

  it('records deployed-byte, MIME, live-browser, and zero-violation evidence', () => {
    for (const evidence of [
      'Matched release files: 14 / 14',
      'Missing release files: 0',
      'Byte-mismatched release files: 0',
      'Chrome `151.0.7922.77` passed 15/15 lifecycle assertions',
      'Firefox `153.0.3` with geckodriver `0.37.1` passed 15/15 lifecycle assertions',
      'Chrome captured 243 application requests',
      'Firefox captured 575',
      'Schema-upload requests: 0',
      'Remote-schema requests: 0',
      'Analytics, telemetry, or crash-reporting requests: 0',
      '`file:` requests: 0',
      'Unexpected application-origin requests: 0',
      'Old primary-bundle requests: 0',
      'No rollback is required.',
    ]) {
      expect(releaseReport).toContain(evidence);
    }
  });

  it('removes stale candidate state from current-facing documents without rewriting history', () => {
    for (const stalePhrase of [
      'Version 0.2.0 is a prepared release candidate',
      'publication pending',
      'deployment pending',
      'canonical site continues to publish 0.1.0',
      'Ben final release QA: pending',
    ]) {
      expect(currentFacingDocuments).not.toContain(stalePhrase);
    }
    expect(currentFacingDocuments).not.toMatch(
      /(?:[A-Z]:\\(?:Work|Users)\\|\/(?:home|Users)\/)/u,
    );
    expect(candidateReport).toContain('Ben final release QA: pending');
    expect(candidateReport).toContain('Deployment: not performed');
  });

  it('links and preserves historical candidate and 0.1.0 release records', () => {
    expect(readme).toContain(
      '0.2.0 historical: [Candidate report](docs/release-0.2.0-candidate-report.md)',
    );
    for (const [relativePath, expectedBlob] of [
      [
        'docs/release-0.2.0-candidate-report.md',
        '894c86a2971abd805b6bc5989e974ea8b6e2b262',
      ],
      [
        'docs/first-public-alpha.md',
        '9886527e4746e86d746c39ab4782904ad2ee607e',
      ],
      [
        'docs/release-candidate-report.md',
        '9a37e9936bf249c61d475d0580f9c7963d47f530',
      ],
      ['docs/release-checklist.md', '05de57faf7dae13d2417a9e4d02247bb2746a864'],
    ]) {
      expect(readme).toContain(`](${relativePath})`);
      expect(gitBlob(relativePath)).toBe(expectedBlob);
    }
  });
});
