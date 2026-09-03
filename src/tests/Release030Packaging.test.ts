import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  productionSourceDigest,
  serialize,
  verifyReleaseAcceptance,
} from '../../scripts/relax-ng-release-acceptance.mjs';

const read = (file: string) =>
  readFileSync(file, 'utf8').replace(/\r\n/gu, '\n');
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const record = JSON.parse(read('docs/release-0.3.0-source-record.json'));

describe('0.3.0 release packaging and immutable historical authority', () => {
  it('changes only the three root package version fields', () => {
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    expect(pkg.version).toBe('0.3.0');
    expect(lock.version).toBe('0.3.0');
    expect(lock.packages[''].version).toBe('0.3.0');
    pkg.version = '0.2.0';
    lock.version = '0.2.0';
    lock.packages[''].version = '0.2.0';
    for (const [file, value] of [
      ['package.json', pkg],
      ['package-lock.json', lock],
    ] as const) {
      const original = record.historicalPackaging.sourceFiles.find(
        (entry: { path: string }) => entry.path === file,
      );
      expect(sha256(serialize(value))).toBe(original.sha256);
    }
    expect(existsSync('pnpm-lock.yaml')).toBe(false);
  });

  it('binds unchanged product inputs to the accepted candidate after version normalization', async () => {
    expect(await productionSourceDigest('0.2.0')).toBe(
      'c628736f9d80c6e00fce2017ff98caffa45d84dee837726d01b1ac7f6ef65d67',
    );
    expect(await productionSourceDigest()).toBe(
      '5df05a36560cdbe07e623bb0af461d5507bdc327fff66260fd395660dbf96840',
    );
    expect(await verifyReleaseAcceptance()).toMatchObject({
      rows: 60,
      digest:
        '032bedd8e0dcb32d753a718861d9d311010c5dbed8eb89aeecf1a1dd0fb91397',
      recommendation: 'READY_FOR_0_3_0_RELEASE',
      version: '0.3.0',
    });
  });

  it('pins historical packaging inputs and preserves all historical release and candidate records', () => {
    expect(sha256(JSON.stringify(record.historicalPackaging))).toBe(
      'b7921d10429391ec98d474d48d683b21bccade7c3c233cb0534e0b990ff6886c',
    );
    for (const entry of record.preservedRecords) {
      const source = read(entry.path);
      expect(sha256(source), entry.path).toBe(entry.sha256);
      expect(
        createHash('sha1')
          .update(`blob ${Buffer.byteLength(source)}\0`)
          .update(source)
          .digest('hex'),
        entry.path,
      ).toBe(entry.blob);
    }
  });

  it('identifies the current alpha and resolves all new release document links', () => {
    expect(read('README.md')).toContain('0.3.0 is the current public alpha');
    for (const file of [
      'docs/third-public-alpha.md',
      'docs/release-0.3.0-checklist.md',
      'docs/release-0.3.0-release-report.md',
      'docs/using-xml-carousel.md',
    ]) {
      const document = read(file);
      expect(read('README.md')).toContain(`](${file})`);
      expect(document).toContain(
        file === 'docs/using-xml-carousel.md'
          ? 'Using XML Carousel'
          : 'XML Carousel 0.3.0',
      );
      for (const [, link] of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
        if (!/^[a-z]+:/iu.test(link)) {
          expect(existsSync(`docs/${link}`), link).toBe(true);
        }
      }
    }
  });

  it('states standards, source fidelity, licensing, limitations and completed deployment', () => {
    const notes = read('docs/third-public-alpha.md');
    for (const claim of [
      'XML Carousel 0.3.0 — Third Public Alpha',
      'Release date: 2026-09-02',
      'Annotated tag: `v0.3.0`',
      'non-draft GitHub',
      'release-0.3.0-candidate.md',
      'Apache Xerces-C++ WASM',
      'libxml2 WASM\n2.15.3',
      'Generated RNC validation XML is never user-facing source',
      '475 selected; 0 excluded',
      '77 / 77; 0 findings',
      '72 representative screens with 0 serious/critical findings',
      'supplied-files-only',
      'XSD 1.1 is unsupported',
      'third-party-licensing.md',
      'https://xmlcarousel.knowone.ca',
      '19/19 byte-verified',
      'Chrome live smoke passed; Firefox live smoke passed',
      'No rollback is required',
    ]) {
      expect(notes).toContain(claim);
    }
    // This immutable source record describes preparation before deployment.
    expect(record.publication.deployment).toContain('not performed');
  });

  it('routes new users to the canonical site and complete guide without stale deployment claims', () => {
    const readme = read('README.md');
    const guide = read('docs/using-xml-carousel.md');
    expect(
      readme.match(/\]\(docs\/using-xml-carousel\.md\)/gu)?.length,
    ).toBeGreaterThanOrEqual(2);
    for (const file of [
      'README.md',
      'docs/using-xml-carousel.md',
      'docs/third-public-alpha.md',
      'docs/release-0.3.0-release-report.md',
      'docs/release-0.3.0-checklist.md',
    ]) {
      const text = read(file).replace(/\s+/gu, ' ');
      expect(text, file).toContain('https://xmlcarousel.knowone.ca');
      expect(text, file).not.toMatch(
        /deployment (?:is separate and )?has not been performed/iu,
      );
    }
    for (const claim of [
      'Open RNG accepts both `.rng` and `.rnc` files.',
      'rootward / previous journey step ← current focus → leafward / available destinations',
      'Inspecting a node does not change the current carousel journey.',
      '## Multi-File Projects',
      '## Missing and Blocked References',
      '## Troubleshooting',
    ]) {
      expect(guide).toContain(claim);
    }
    expect(guide).not.toMatch(/Codex|Task 17\.|Git-integrity|test matrix/iu);
  });

  it('pins the closed deployment to the immutable release source and exact distribution', () => {
    const report = read('docs/release-0.3.0-release-report.md');
    for (const claim of [
      '09ba96274e61f8c6486f2fe6eb0a498ed9412e67',
      '5bf3a2ba8935e2456f245fd5ebdc1fe87ac3cfd5',
      '6aae292e03910458b28328f419833b688bb14c16',
      '381707566',
      '19/19 files / 3,826,638 bytes',
      '250c34a66ec6240ef63bb08553d49ae7fb3cee4cbda28405b6e6ba29fbed3804',
      'No rollback is required.',
    ]) {
      expect(report).toContain(claim);
    }
    const checklist = read('docs/release-0.3.0-checklist.md').replace(
      /\s+/gu,
      ' ',
    );
    for (const completed of [
      'Create and push annotated `v0.3.0`',
      'Publish non-draft GitHub prerelease',
      'Canonical-site deployment completed',
      '19/19 deployed files byte-verified',
      'Deployed inventory SHA-256 verified',
      'Chrome live smoke passed',
      'Firefox live smoke passed',
      'Privacy/network checks passed',
      'No rollback required',
      'Add [Using XML Carousel]',
    ]) {
      const item = checklist
        .split('- ')
        .find((entry) => entry.includes(completed));
      expect(item, completed).toMatch(/^\[x\]/u);
    }
    expect(checklist).toContain(
      '0.3.0 publication and deployment are complete. No rollback is required.',
    );
  });
});
