import { describe, expect, it } from 'vitest';
import controllerSource from '../app/import/schemaFileImportController.ts?raw';
import clientSource from '../app/import/schemaImportWorkerClient.ts?raw';
import projectSessionSource from '../app/stores/projectSession.ts?raw';
import appShellSource from '../ui/layout/AppShell.svelte?raw';
import workerEntrySource from './schemaImportWorker.ts?raw';
import workerRuntimeSource from './schemaImportWorkerRuntime.ts?raw';

describe('production schema import worker source contracts', () => {
  it('keeps production importer calls out of the coordinated controller', () => {
    expect(controllerSource).not.toContain('importDtdSource');
    expect(controllerSource).not.toContain('importXsdSource');
    expect(controllerSource).not.toContain('importSchemaArchivePackage');
    expect(controllerSource).toContain('startWorkerImport');
  });

  it('places all three existing import pipelines in the worker runtime', () => {
    expect(workerRuntimeSource).toContain('importDtdSource');
    expect(workerRuntimeSource).toContain('importXsdSource');
    expect(workerRuntimeSource).toContain('importSchemaArchivePackage');
    expect(workerRuntimeSource).not.toMatch(
      /projectSession|activeProjectStore|navigationStore|inspectorStore/,
    );
  });

  it('keeps worker modules free of Svelte, store, UI, and activation imports', () => {
    for (const source of [workerEntrySource, workerRuntimeSource]) {
      expect(source).not.toMatch(/from ['"]svelte/);
      expect(source).not.toMatch(/\/stores\//);
      expect(source).not.toMatch(/\/ui\//);
      expect(source).not.toMatch(/activateImported|replaceProjectSession/);
    }
  });

  it('constructs the exact Vite module worker in the client', () => {
    expect(clientSource).toMatch(
      /new Worker\(\s*new URL\('\.\.\/\.\.\/workers\/schemaImportWorker\.ts', import\.meta\.url\),/,
    );
    expect(clientSource).toContain("type: 'module'");
    expect(clientSource).toContain("name: 'xml-carousel-schema-import'");
    expect(clientSource).not.toMatch(/SharedWorker|ServiceWorker/);
  });

  it('retains one AppShell controller and main-thread ProjectSession activation', () => {
    expect(
      appShellSource.match(/createSchemaFileImportController\(/g),
    ).toHaveLength(1);
    expect(controllerSource).toContain('dependencies.activateDtd');
    expect(controllerSource).toContain('dependencies.activateXsd');
    expect(controllerSource).toContain('dependencies.activatePackage');
    expect(projectSessionSource).toContain('activeProject.replace');
    expect(workerRuntimeSource).not.toContain('activeProject.replace');
  });
});
