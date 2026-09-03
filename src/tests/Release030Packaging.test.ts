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
    ]) {
      const document = read(file);
      expect(read('README.md')).toContain(`](${file})`);
      expect(document).toContain('XML Carousel 0.3.0');
      for (const [, link] of document.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
        if (!/^[a-z]+:/iu.test(link)) {
          expect(existsSync(`docs/${link}`), link).toBe(true);
        }
      }
    }
  });

  it('states standards, source fidelity, licensing, limitations and non-deployment truth', () => {
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
      'deployment is separate and has not been performed',
    ]) {
      expect(notes).toContain(claim);
    }
    expect(record.publication.deployment).toContain('not performed');
  });
});
