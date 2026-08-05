import { describe, expect, it, vi } from 'vitest';
import type { ProjectSessionReplacementResult } from '../stores/projectSession';
import { activateBuiltInSample } from './sampleActivation';

const applied = {
  applied: true,
  state: {},
} as ProjectSessionReplacementResult;

describe('built-in sample activation', () => {
  it('activates DTD and XSD samples through one sample-origin replacement path', () => {
    for (const sampleId of ['book-dtd', 'library-xsd'] as const) {
      const activateDtd = vi.fn((...args: unknown[]) => {
        void args;
        return applied;
      });
      const activateXsd = vi.fn((...args: unknown[]) => {
        void args;
        return applied;
      });
      const clearImportFailure = vi.fn();
      const outcome = activateBuiltInSample(sampleId, {
        invalidateImport: () => true,
        clearImportFailure,
        activateDtd,
        activateXsd,
      });

      expect(outcome).toMatchObject({ status: 'success', sampleId });
      const activate = sampleId === 'book-dtd' ? activateDtd : activateXsd;
      expect(activate).toHaveBeenCalledOnce();
      expect(activate.mock.calls[0]?.[1]).toMatchObject({
        origin: 'sample',
        preparedSearchIndex: expect.objectContaining({
          projectId: expect.any(String),
        }),
      });
      expect(clearImportFailure).toHaveBeenCalledOnce();
    }
  });

  it('does not parse, activate, clear failure, or race while an import owns the session', () => {
    const prepare = vi.fn();
    const activateDtd = vi.fn();
    const clearImportFailure = vi.fn();
    const outcome = activateBuiltInSample('book-dtd', {
      prepare,
      invalidateImport: () => false,
      clearImportFailure,
      activateDtd,
    });

    expect(outcome).toEqual({ status: 'busy' });
    expect(prepare).not.toHaveBeenCalled();
    expect(activateDtd).not.toHaveBeenCalled();
    expect(clearImportFailure).not.toHaveBeenCalled();
  });

  it('keeps the active session and existing failure presentation when preparation or activation fails', () => {
    const invalidateImport = vi.fn(() => true);
    const clearImportFailure = vi.fn();
    const preparationFailure = activateBuiltInSample('book-dtd', {
      prepare: () => ({ status: 'failure', message: 'Sample is invalid.' }),
      invalidateImport,
      clearImportFailure,
    });
    expect(preparationFailure).toEqual({
      status: 'failure',
      message: 'Sample is invalid.',
    });
    expect(invalidateImport).toHaveBeenCalledOnce();

    const activationFailure = activateBuiltInSample('book-dtd', {
      invalidateImport,
      clearImportFailure,
      activateDtd: () => {
        throw new Error('activation failed');
      },
    });
    expect(activationFailure).toEqual({
      status: 'failure',
      message: 'The built-in sample could not replace the current project.',
    });
    expect(clearImportFailure).not.toHaveBeenCalled();
  });
});
