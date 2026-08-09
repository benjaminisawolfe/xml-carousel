import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import source from '../../../tests/fixtures/xsd/task-13.15-annotation-completeness.xsd?raw';
import { importXsdSource } from '../../schema/xsd';
import NodeInspector from './NodeInspector.svelte';
import { buildInspectorSummary } from './inspectorSummary';
import SourceViewDialog from '../source/SourceViewDialog.svelte';
import { selectSourceViewPresentation } from '../presentation/sourceMarkupPresentation';

describe('Task 13.15 opaque annotation inspector safety', () => {
  it('renders hostile-looking foreign content only as inert text and escaped source', () => {
    const imported = importXsdSource(source, {
      projectId: 'task-13.15-ui',
      displayName: 'Task 13.15 UI',
      sourceFileId: 'task-13.15-ui.xsd',
      sourceFilename: 'task-13.15-ui.xsd',
      standardsAccepted: true,
    });
    expect(imported.status).toBe('success');
    if (imported.status !== 'success') return;
    const appInfo = imported.project.nodes.find(
      ({ kind, name }) =>
        kind === 'xsdAppInfo' && name.includes('machine data'),
    )!;
    const summary = buildInspectorSummary(
      imported.project,
      appInfo.id,
      {},
      {},
      imported.sourceMarkupByNodeId,
      imported.xsdMetadataByNodeId,
    )!;
    const originalExecuted = Reflect.get(globalThis, '__xmlCarouselExecuted');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const sourcePresentation = selectSourceViewPresentation(
      {
        project: imported.project,
        origin: 'imported',
        sourceFilename: 'task-13.15-ui.xsd',
        sourceMarkupByNodeId: imported.sourceMarkupByNodeId,
        xsdMetadataByNodeId: imported.xsdMetadataByNodeId,
      },
      appInfo.id,
    );
    expect(sourcePresentation?.sourceAvailable).toBe(true);

    const { container } = render(NodeInspector, {
      summary,
      isCurrentFocus: false,
      onCenter: vi.fn(),
      onCenterNode: vi.fn(),
      onClose: vi.fn(),
      sourcePresentation,
    });

    render(SourceViewDialog, {
      open: true,
      presentation: sourcePresentation,
      onClose: vi.fn(),
    });

    expect(container.textContent).toContain(
      'Machine/private uninterpreted XSD appinfo',
    );
    expect(container.textContent).toContain('globalThis.__xmlCarouselExecuted');
    expect(container.querySelector('script, a, svg, math')).toBeNull();
    const dialog = screen.getByRole('dialog', { name: appInfo.name });
    expect(dialog.textContent).toContain('javascript:alert(1)');
    expect(dialog.querySelector('script, a, img, svg, math')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Reflect.get(globalThis, '__xmlCarouselExecuted')).toBe(
      originalExecuted,
    );
    fetchSpy.mockRestore();
  });
});
