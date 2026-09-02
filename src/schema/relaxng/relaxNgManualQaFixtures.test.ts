import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createRelaxNgAdapter,
  type RelaxNgAdapter,
  type RelaxNgModuleFactory,
  type RelaxNgValidationRequest,
  validateWithProductionRelaxNg,
} from '../../standards/relaxng';
import type { SchemaPackageFileRelationship } from '../../app/import/schemaPackage';
import { buildRelaxNgPackageRelationships } from '../../app/import/schemaPackage/relaxNgPackageReferences';
import { selectSchemaPackageEntryRoots } from '../../app/import/schemaPackage/schemaPackageEntryRoots';
import { deriveSchemaPackageSourceFileId } from '../../app/import/schemaPackage/schemaPackageRemapping';
import type { SchemaPackageSourceText } from '../../app/import/schemaPackage/schemaPackageDecoding';
import {
  buildRelaxNgSemanticModel,
  validateRelaxNgSemanticModel,
  type RelaxNgSemanticModel,
} from './index';

interface ManifestEntry {
  readonly path: string;
  readonly kind: 'rng' | 'zip';
  readonly expectedOutcome: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly largeFixture: boolean;
  readonly primarySemanticAreas: readonly string[];
  readonly members?: readonly string[];
  readonly expectedRngRoots?: readonly string[];
  readonly expectedResolvedRelationships?: readonly string[];
  readonly expectedMissingOrBlockedRelationships?: readonly string[];
}

interface FixtureManifest {
  readonly formatVersion: 1;
  readonly provenance: string;
  readonly entries: readonly ManifestEntry[];
}

const fixtureRoot = join(
  process.cwd(),
  'tests',
  'fixtures',
  'relax-ng',
  'manual-qa',
);
let adapter: RelaxNgAdapter;

beforeAll(async () => {
  const runtimeRoot = join(
    process.cwd(),
    'src',
    'standards',
    'relaxng',
    'runtime',
  );
  const moduleUrl = pathToFileURL(
    join(runtimeRoot, 'libxml2-relaxng-runtime.js'),
  );
  const wasmUrl = pathToFileURL(
    join(runtimeRoot, 'libxml2-relaxng-runtime.wasm'),
  );
  const imported = (await import(moduleUrl.href)) as {
    default: RelaxNgModuleFactory;
  };
  adapter = await createRelaxNgAdapter(imported.default, moduleUrl, wasmUrl);
});

function validate(request: RelaxNgValidationRequest) {
  return validateWithProductionRelaxNg(request, async () => adapter);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function manifest(): Promise<FixtureManifest> {
  return JSON.parse(
    await readFile(join(fixtureRoot, 'manifest.json'), 'utf8'),
  ) as FixtureManifest;
}

function packageSource(
  path: string,
  sourceText: string,
  sourceOrder: number,
): SchemaPackageSourceText {
  const segments = path.split('/');
  const entry = {
    id: `manual-entry:${path}`,
    archivePath: path,
    packageRelativePath: path,
    ...(segments.length === 1
      ? {}
      : { directoryPath: segments.slice(0, -1).join('/') }),
    basename: segments[segments.length - 1]!,
    format: 'rng' as const,
    sourceOrder,
  };
  return {
    entry,
    sourceFileId: deriveSchemaPackageSourceFileId(entry),
    byteLength: new TextEncoder().encode(sourceText).byteLength,
    sourceText,
  };
}

function semanticCounts(model: RelaxNgSemanticModel) {
  const operatorKinds = new Set([
    'choice',
    'group',
    'interleave',
    'optional',
    'zeroOrMore',
    'oneOrMore',
    'mixed',
    'list',
  ]);
  return {
    grammarScopes: model.grammars.length,
    startClauses: model.startClauses.length,
    defineClauses: model.defineClauses.length,
    definitionGroups: model.definitionGroups.length,
    ref: model.patterns.filter(({ kind }) => kind === 'ref').length,
    parentRef: model.patterns.filter(({ kind }) => kind === 'parentRef').length,
    element: model.patterns.filter(({ kind }) => kind === 'element').length,
    attribute: model.patterns.filter(({ kind }) => kind === 'attribute').length,
    operatorPatterns: model.patterns.filter(({ kind }) =>
      operatorKinds.has(kind),
    ).length,
    dataValuePatterns: model.patterns.filter(
      ({ kind }) => kind === 'data' || kind === 'value',
    ).length,
    nameClasses: model.nameClasses.length,
    annotationsForeignMetadata:
      model.annotations.length + model.documentation.length,
    includeExternalRef:
      model.includes.length +
      model.patterns.filter(({ kind }) => kind === 'externalRef').length,
  };
}

function semanticRelationships(
  relationships: readonly SchemaPackageFileRelationship[],
) {
  return relationships.map((relationship) => ({
    id: relationship.id,
    kind: relationship.kind as 'rng-include' | 'rng-external-ref',
    rawTarget: relationship.rawTarget,
    sourcePath: relationship.sourcePath,
    ...(relationship.targetPath === undefined
      ? {}
      : { targetPath: relationship.targetPath }),
    status: relationship.status,
  }));
}

describe('Task 17.6 persistent manual-QA fixture pack', () => {
  it('pins every loose and ZIP fixture by deterministic size and SHA-256', async () => {
    const current = await manifest();
    expect(current.formatVersion).toBe(1);
    expect(current.provenance).toContain('Project-authored');
    expect(current.entries.filter(({ kind }) => kind === 'rng')).toHaveLength(
      10,
    );
    expect(current.entries.filter(({ kind }) => kind === 'zip')).toHaveLength(
      8,
    );
    for (const entry of current.entries) {
      const bytes = await readFile(join(fixtureRoot, entry.path));
      expect(bytes.byteLength, entry.path).toBe(entry.byteSize);
      expect(sha256(bytes), entry.path).toBe(entry.sha256);
    }
    const large = current.entries.filter(
      ({ kind, largeFixture }) => kind === 'rng' && largeFixture,
    );
    expect(large).toHaveLength(2);
    expect(large.every(({ byteSize }) => byteSize >= 5_120)).toBe(true);
    expect(large.some(({ byteSize }) => byteSize >= 8 * 1_024)).toBe(true);
  });

  it('validates every loose fixture with libxml2 and reports large semantic counts', async () => {
    const current = await manifest();
    for (const [index, entry] of current.entries
      .filter(({ kind }) => kind === 'rng')
      .entries()) {
      const bytes = await readFile(join(fixtureRoot, entry.path));
      const result = await validate({
        attemptId: `manual-loose:${index}`,
        entryPath: entry.path,
        files: [{ path: entry.path, bytes }],
      });
      const expectedStatus =
        entry.expectedOutcome === 'valid'
          ? 'valid'
          : entry.expectedOutcome === 'standards-invalid'
            ? 'invalid'
            : 'blocked';
      expect(result.status, entry.path).toBe(expectedStatus);
      if (result.status !== 'valid') continue;
      const sourceText = new TextDecoder().decode(bytes);
      const built = buildRelaxNgSemanticModel({
        sources: [
          {
            sourceFileId: `manual:${entry.path}`,
            path: entry.path,
            sourceText,
          },
        ],
      });
      expect(built.model, entry.path).toBeDefined();
      expect(validateRelaxNgSemanticModel(built.model!), entry.path).toEqual(
        [],
      );
      if (entry.largeFixture) {
        console.log(
          'RNG_LARGE_FIXTURE',
          JSON.stringify({
            path: entry.path,
            byteSize: entry.byteSize,
            sha256: entry.sha256,
            standaloneValid: true,
            usedInsideZip: '15-mixed-large-rng-project.zip',
            semanticConstructCounts: semanticCounts(built.model!),
          }),
        );
      }
    }
  });

  it('discovers every ZIP member, selects expected roots, validates outcomes, and builds eligible semantic closures', async () => {
    const current = await manifest();
    for (const entry of current.entries.filter(({ kind }) => kind === 'zip')) {
      const bytes = await readFile(join(fixtureRoot, entry.path));
      const archive = await JSZip.loadAsync(bytes);
      const memberPaths = Object.values(archive.files)
        .filter((member) => !member.dir && member.name.endsWith('.rng'))
        .map(({ name }) => name)
        .sort();
      expect(memberPaths, entry.path).toEqual(entry.members);
      const sources: SchemaPackageSourceText[] = [];
      for (const [index, path] of memberPaths.entries()) {
        sources.push(
          packageSource(path, await archive.file(path)!.async('string'), index),
        );
      }
      const relationships = buildRelaxNgPackageRelationships(
        sources,
        new Set(memberPaths),
      );
      const roots = selectSchemaPackageEntryRoots(sources).map(
        ({ entryPath }) => entryPath,
      );
      expect(roots, entry.path).toEqual(entry.expectedRngRoots);

      const validRoots: string[] = [];
      for (const [index, root] of roots.entries()) {
        const result = await validate({
          attemptId: `manual-zip:${entry.path}:${index}`,
          entryPath: root,
          files: await Promise.all(
            memberPaths.map(async (path) => ({
              path,
              bytes: await archive.file(path)!.async('uint8array'),
            })),
          ),
        });
        expect(result.status, `${entry.path}:${root}`).not.toBe(
          'internal-error',
        );
        if (
          ['11-', '12-', '13-', '14-', '15-'].some((prefix) =>
            entry.path.startsWith(prefix),
          )
        ) {
          expect(result.status, `${entry.path}:${root}`).toBe('valid');
        }
        if (result.status === 'valid') validRoots.push(root);
      }

      const dependencies = new Map<string, string[]>();
      for (const relationship of relationships) {
        if (relationship.status !== 'resolved' || !relationship.targetPath)
          continue;
        const targets = dependencies.get(relationship.sourcePath) ?? [];
        targets.push(relationship.targetPath);
        dependencies.set(relationship.sourcePath, targets);
      }
      const eligible = new Set<string>();
      const pending = [...validRoots];
      while (pending.length > 0) {
        const path = pending.pop()!;
        if (eligible.has(path)) continue;
        eligible.add(path);
        pending.push(...(dependencies.get(path) ?? []));
      }
      if (eligible.size > 0) {
        const semantic = buildRelaxNgSemanticModel({
          sources: sources
            .filter(({ entry: sourceEntry }) =>
              eligible.has(sourceEntry.packageRelativePath),
            )
            .map((source) => ({
              sourceFileId: source.sourceFileId,
              path: source.entry.packageRelativePath,
              sourceText: source.sourceText,
            })),
          relationships: semanticRelationships(relationships),
        });
        expect(semantic.model, entry.path).toBeDefined();
        expect(
          validateRelaxNgSemanticModel(semantic.model!),
          entry.path,
        ).toEqual([]);
      }
      if (entry.path === '15-mixed-large-rng-project.zip') {
        const largeMembers = await Promise.all(
          memberPaths.map(async (path) => ({
            path,
            size: (await archive.file(path)!.async('uint8array')).byteLength,
          })),
        );
        expect(largeMembers.filter(({ size }) => size >= 5_120)).toHaveLength(
          2,
        );
      }
    }
  });
});
