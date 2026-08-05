import { describe, expect, it } from 'vitest';
import mixedDtd from '../../../tests/fixtures/dtd/visualization/mixed-supported-unsupported.dtd?raw';
import unsupportedOnlyDtd from '../../../tests/fixtures/dtd/visualization/unsupported-only.dtd?raw';
import mixedXsd from '../../../tests/fixtures/xsd/visualization/mixed-supported-unsupported.xsd?raw';
import manyFindingsXsd from '../../../tests/fixtures/xsd/visualization/many-findings.xsd?raw';
import lintAndVisualizationDtd from '../../../tests/fixtures/dtd/visualization/lint-and-visualization.dtd?raw';
import { buildProjectSearchIndex } from '../../app/search';
import {
  dtdBuildDiagnosticCodes,
  dtdParseDiagnosticCodes,
  importDtdSource,
} from '../dtd';
import {
  importXsdSource,
  xsdBuildDiagnosticCodes,
  xsdDiagnosticCodes,
} from '../xsd';
import {
  createVisualizationResult,
  archiveDiagnosticPolicy,
  dtdBuildDiagnosticPolicy,
  dtdImportDiagnosticPolicy,
  dtdParseDiagnosticPolicy,
  MAX_RETAINED_VISUALIZATION_FINDINGS,
  packageDiagnosticPolicy,
  xsdBuildDiagnosticPolicy,
  xsdDiagnosticPolicy,
  xsdImportDiagnosticPolicy,
} from './index';

const options = {
  projectId: 'visualization:test',
  displayName: 'visualization test',
  sourceFileId: 'visualization-source',
  sourceFilename: 'visualization.dtd',
  standardsAccepted: true,
} as const;

describe('post-Xerces diagnostic policy', () => {
  it('classifies every DTD, XSD, import, and package extraction code explicitly', () => {
    expect(Object.keys(dtdParseDiagnosticPolicy).sort()).toEqual(
      [...dtdParseDiagnosticCodes].sort(),
    );
    expect(Object.keys(dtdBuildDiagnosticPolicy).sort()).toEqual(
      [...dtdBuildDiagnosticCodes].sort(),
    );
    expect(Object.keys(xsdDiagnosticPolicy).sort()).toEqual(
      [...xsdDiagnosticCodes].sort(),
    );
    expect(Object.keys(xsdBuildDiagnosticPolicy).sort()).toEqual(
      [...xsdBuildDiagnosticCodes].sort(),
    );
    expect(Object.keys(dtdImportDiagnosticPolicy)).toEqual([
      'no-importable-elements',
    ]);
    expect(Object.keys(xsdImportDiagnosticPolicy).sort()).toEqual([
      'invalid-initial-focus',
      'no-importable-schema',
    ]);
    expect(Object.keys(packageDiagnosticPolicy)).toHaveLength(17);
    expect(Object.keys(archiveDiagnosticPolicy)).toHaveLength(11);
    expect(dtdParseDiagnosticPolicy['unexpected-token']).not.toBe(
      'visualization-warning',
    );
    expect(xsdDiagnosticPolicy['unsupported-structure']).toBe(
      'internal-extraction-failure',
    );
  });

  it('caps retained detail without losing the full deterministic total', () => {
    const result = createVisualizationResult(
      Array.from({ length: 73 }, (_, index) => ({
        code: 'xsd:unsupported-xsd-component',
        message: `Finding ${index}`,
        sourceFileId: 'large.xsd',
        constructKind: 'group',
        constructName: `group-${String(index).padStart(3, '0')}`,
      })),
    );
    expect(result.summary).toMatchObject({
      completeness: 'partial',
      totalFindingCount: 73,
      retainedFindingCount: MAX_RETAINED_VISUALIZATION_FINDINGS,
      omittedConstructCount: 73,
      placeholderCount: 0,
    });
    expect(new Set(result.findings.map(({ id }) => id)).size).toBe(
      MAX_RETAINED_VISUALIZATION_FINDINGS,
    );
    expect(structuredClone(result)).toEqual(result);
  });
});

describe('tolerant visualization extraction', () => {
  it('opens every supported DTD declaration without visualization findings', () => {
    const result = importDtdSource(mixedDtd, options);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.nodes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['root', 'child', 'id']),
    );
    expect(result.visualization.summary.completeness).toBe('complete');
    expect(result.visualization.summary.totalFindingCount).toBe(0);
    expect(result.visualization.findings).toEqual([]);
    expect(result.sourceMarkupByNodeId).not.toEqual({});
    const searchIndex = buildProjectSearchIndex({
      project: result.project,
      sourceFilename: options.sourceFilename,
      dtdAttributesByNodeId: result.dtdAttributesByNodeId,
    });
    expect(searchIndex.documents.map(({ nodeName }) => nodeName)).toEqual(
      expect.arrayContaining(['author', 'png', 'logo']),
    );
  });

  it('keeps DTD lint warnings while complete extraction adds no visualization warning', () => {
    const result = importDtdSource(lintAndVisualizationDtd, options);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.diagnostics.some(({ stage }) => stage === 'lint')).toBe(true);
    expect(
      result.diagnostics.some(({ stage }) => stage === 'visualization'),
    ).toBe(false);
    expect(result.visualization.summary.totalFindingCount).toBe(0);
  });

  it('visualizes a valid DTD containing only entities and notations', () => {
    const result = importDtdSource(unsupportedOnlyDtd, options);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.visualization.summary.completeness).toBe('complete');
    expect(result.project.nodes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['author', 'png', 'logo']),
    );
  });

  it('keeps supported XSD siblings around unsupported valid components', () => {
    const result = importXsdSource(mixedXsd, {
      ...options,
      sourceFilename: 'visualization.xsd',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.nodes.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['before', 'after', 'Label', 'Choice']),
    );
    expect(result.visualization.summary.completeness).toBe('partial');
    expect(result.visualization.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ constructKind: 'substitutionGroup' }),
      ]),
    );
    expect(result.visualization.findings).toHaveLength(1);
    expect(result.project.nodes.map(({ kind }) => kind)).toContain('union');
    expect(result.project.nodes.map(({ name }) => name)).toContain(
      'contentGroup',
    );
    expect(
      result.visualization.findings.every(
        ({ sourceMarkup, range }) => sourceMarkup && range,
      ),
    ).toBe(true);
  });

  it('tolerates schema-level annotation ordering after Xerces acceptance', () => {
    const result = importXsdSource(
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:annotation><xs:documentation>First</xs:documentation></xs:annotation><xs:annotation><xs:documentation>Second</xs:documentation></xs:annotation><xs:element name="root" type="xs:string"/></xs:schema>',
      { ...options, sourceFilename: 'annotations.xsd' },
    );

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.nodes.some(({ name }) => name === 'root')).toBe(true);
    expect(result.visualization.summary.findingCountsByCode).toEqual({});
    expect(
      result.project.nodes.filter(({ kind }) => kind === 'xsdAnnotation'),
    ).toHaveLength(2);
  });

  it('visualizes broad valid XSD group inventories without findings', () => {
    const result = importXsdSource(manyFindingsXsd, {
      ...options,
      sourceFilename: 'many-findings.xsd',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.project.nodes.some(({ name }) => name === 'root')).toBe(true);
    expect(result.visualization.summary).toMatchObject({
      completeness: 'complete',
      totalFindingCount: 0,
      retainedFindingCount: 0,
    });
    expect(
      result.project.nodes.filter(({ kind }) => kind === 'group'),
    ).toHaveLength(55);
  });
});
