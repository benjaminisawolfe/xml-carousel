import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { SchemaProject } from '../../schema/model';
import type { ProjectSearchIndex } from '../search';
import { freezeOwnedPlainGraph } from './freezeOwnedPlainGraph';
import { createActiveProjectStore } from './projectStore';
import { createProjectSession } from './projectSession';
import { createProjectSessionResetStore } from './projectSessionResetStore';

const sample: SchemaProject = {
  id: 'sample',
  displayName: 'Sample',
  nodes: [{ id: 'root', kind: 'dtdElement', name: 'root' }],
  edges: [],
  rootNodeIds: ['root'],
};

describe('large project validation and owned adoption', () => {
  it('freezes large, repeated, and deeply nested plain graphs iteratively', () => {
    const repeated = { value: 1 };
    const record: Record<string, unknown> = {};
    for (let index = 0; index < 40_000; index += 1) {
      record[`entry:${index}`] = index % 2 === 0 ? repeated : { index };
    }
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let index = 0; index < 20_000; index += 1) {
      const next: Record<string, unknown> = {};
      deep.next = next;
      deep = next;
    }
    const value = { record, root, repeated };
    expect(freezeOwnedPlainGraph(value)).toBe(value);
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(repeated)).toBe(true);
    expect(Object.isFrozen(deep)).toBe(true);
    expect(() => {
      repeated.value = 2;
    }).toThrow();
    expect(repeated.value).toBe(1);
  });

  it('validates once, primes queries, and adopts worker-owned values in place', () => {
    const activeProject = createActiveProjectStore({
      project: sample,
      origin: 'sample',
      sourceFilename: 'sample.dtd',
    });
    const validateProject = vi.fn(() => []);
    const navigation = {
      resetForProject: vi.fn((project: SchemaProject, nodeId: string) => ({
        applied: true as const,
        state: {
          projectId: project.id,
          navigationPath: [nodeId] as readonly [string],
        },
      })),
    };
    const inspector = { resetForProject: vi.fn() };
    const session = createProjectSession({
      activeProject,
      navigation,
      inspector,
      presentation: createProjectSessionResetStore(),
      validateProject,
    });
    const imported: SchemaProject = {
      ...sample,
      id: 'imported',
      nodes: [{ id: 'imported-root', kind: 'dtdElement', name: 'imported' }],
      rootNodeIds: ['imported-root'],
    };
    const preparedSearchIndex: ProjectSearchIndex = {
      projectId: imported.id,
      documents: [],
    };
    const result = session.replace({
      project: imported,
      initialFocusNodeId: 'imported-root',
      ownership: 'worker',
      metadata: {
        origin: 'imported',
        sourceFilename: 'imported.dtd',
        contentKindsByNodeId: { 'imported-root': 'empty' },
        preparedSearchIndex,
      },
    });

    expect(result.applied).toBe(true);
    expect(validateProject).toHaveBeenCalledTimes(1);
    const state = get(activeProject);
    expect(state.project).toBe(imported);
    expect(state.preparedSearchIndex).toBe(preparedSearchIndex);
    expect(Object.isFrozen(state.project.nodes)).toBe(true);
    expect(Object.isFrozen(state.contentKindsByNodeId)).toBe(true);
  });

  it('keeps defensive cloning for direct store replacements', () => {
    const store = createActiveProjectStore({
      project: sample,
      origin: 'sample',
      sourceFilename: 'sample.dtd',
    });
    const metadata = { root: 'empty' as const };
    store.replace(sample, {
      origin: 'imported',
      sourceFilename: 'direct.dtd',
      contentKindsByNodeId: metadata,
    });
    expect(get(store).contentKindsByNodeId).not.toBe(metadata);
  });
});
