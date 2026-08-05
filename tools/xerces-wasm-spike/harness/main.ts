import JSZip from 'jszip';
import { normalizeProjectPath } from '../src/pathPolicy';
import {
  XercesSpikeWorkerClient,
  type SpikeWorkerLike,
} from '../src/workerClient';
import type {
  XercesSpikeDiagnostic,
  XercesSpikeFile,
  XercesSpikeFormat,
} from '../src/types';
import './style.css';

const maximumFiles = 1_000;
const maximumBytes = 64 * 1024 * 1024;
const encoder = new TextEncoder();
let projectFiles: XercesSpikeFile[] = [];
let attemptSequence = 0;
let running = false;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing harness element: ${id}`);
  return found as T;
}

const filesInput = element<HTMLInputElement>('files');
const directoryInput = element<HTMLInputElement>('directory');
const zipInput = element<HTMLInputElement>('zip');
const entrySelect = element<HTMLSelectElement>('entry');
const formatSelect = element<HTMLSelectElement>('format');
const projectSummary = element<HTMLParagraphElement>('project-summary');
const runButton = element<HTMLButtonElement>('run');
const cancelButton = element<HTMLButtonElement>('cancel');
const clearButton = element<HTMLButtonElement>('clear');
const engineOutput = element<HTMLElement>('engine');
const statusOutput = element<HTMLElement>('status');
const timingOutput = element<HTMLElement>('timing');
const metricsOutput = element<HTMLElement>('metrics');
const diagnosticsOutput = element<HTMLOListElement>('diagnostics');
const standaloneNote = element<HTMLParagraphElement>('standalone-note');

const client = new XercesSpikeWorkerClient(
  () =>
    new Worker(new URL('../src/worker.ts', import.meta.url), {
      type: 'module',
      name: 'xerces-wasm-feasibility-spike',
    }) as unknown as SpikeWorkerLike,
);

function setRunning(next: boolean): void {
  running = next;
  runButton.disabled = next || projectFiles.length === 0 || !entrySelect.value;
  cancelButton.disabled = !next;
  filesInput.disabled = next;
  directoryInput.disabled = next;
  zipInput.disabled = next;
  entrySelect.disabled = next;
  formatSelect.disabled = next;
}

function updateEntryOptions(): void {
  const candidates = projectFiles
    .filter(({ path }) => /\.(?:xsd|dtd)$/iu.test(path))
    .map(({ path }) => path)
    .sort((left, right) => left.localeCompare(right));
  entrySelect.replaceChildren();
  for (const path of candidates) {
    const option = document.createElement('option');
    option.value = path;
    option.textContent = path;
    entrySelect.append(option);
  }
  if (candidates.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No XSD or DTD entry found';
    entrySelect.append(option);
  }
  selectEntryFormat();
  runButton.disabled = running || candidates.length === 0;
}

function selectEntryFormat(): void {
  formatSelect.value = entrySelect.value.toLowerCase().endsWith('.dtd')
    ? 'dtd'
    : 'xsd';
  standaloneNote.hidden = formatSelect.value !== 'dtd';
}

function acceptProject(files: XercesSpikeFile[]): void {
  if (files.length > maximumFiles) {
    throw new Error(
      `Project exceeds the experimental ${maximumFiles}-file limit.`,
    );
  }
  const totalBytes = files.reduce(
    (sum, file) => sum + file.bytes.byteLength,
    0,
  );
  if (totalBytes > maximumBytes) {
    throw new Error('Project exceeds the experimental 64 MiB aggregate limit.');
  }
  const seen = new Set<string>();
  projectFiles = files.map((file) => {
    const path = normalizeProjectPath(file.path);
    if (seen.has(path)) throw new Error(`Duplicate project path: ${path}`);
    seen.add(path);
    return { path, bytes: file.bytes };
  });
  projectSummary.textContent = `${projectFiles.length} file(s), ${totalBytes.toLocaleString()} bytes.`;
  updateEntryOptions();
  engineOutput.textContent = 'Not initialized';
  timingOutput.textContent = '—';
  metricsOutput.textContent = '—';
  renderDiagnostics([]);
  statusOutput.textContent = 'Ready';
}

async function browserFiles(list: FileList): Promise<XercesSpikeFile[]> {
  return Promise.all(
    [...list].map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

async function zipFiles(file: File): Promise<XercesSpikeFile[]> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const members: XercesSpikeFile[] = [];
  for (const member of Object.values(archive.files)) {
    if (member.dir) continue;
    const path = normalizeProjectPath(member.name);
    if (!/\.(?:xsd|dtd|ent|xml)$/iu.test(path)) continue;
    members.push({ path, bytes: await member.async('uint8array') });
  }
  return members;
}

function renderDiagnostics(
  diagnostics: readonly XercesSpikeDiagnostic[],
): void {
  diagnosticsOutput.replaceChildren();
  if (diagnostics.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No diagnostics.';
    diagnosticsOutput.append(item);
    return;
  }
  for (const diagnostic of diagnostics) {
    const item = document.createElement('li');
    item.className = `diagnostic diagnostic--${diagnostic.severity}`;
    const heading = document.createElement('strong');
    heading.textContent = diagnostic.severity;
    const location = [
      diagnostic.fileName,
      diagnostic.line === undefined ? undefined : `line ${diagnostic.line}`,
      diagnostic.column === undefined
        ? undefined
        : `column ${diagnostic.column}`,
      diagnostic.code,
    ]
      .filter(Boolean)
      .join(' · ');
    const metadata = document.createElement('span');
    metadata.textContent = location;
    const message = document.createElement('p');
    message.textContent = diagnostic.message;
    item.append(heading, metadata, message);
    diagnosticsOutput.append(item);
  }
}

async function loadSelection(
  action: () => Promise<XercesSpikeFile[]>,
): Promise<void> {
  try {
    acceptProject(await action());
  } catch (error) {
    statusOutput.textContent = 'Blocked';
    renderDiagnostics([
      {
        id: 'harness:selection',
        severity: 'error',
        message: error instanceof Error ? error.message : 'Selection failed.',
        source: 'project',
      },
    ]);
  }
}

filesInput.addEventListener('change', () => {
  if (filesInput.files)
    void loadSelection(() => browserFiles(filesInput.files!));
});
directoryInput.addEventListener('change', () => {
  if (directoryInput.files)
    void loadSelection(() => browserFiles(directoryInput.files!));
});
zipInput.addEventListener('change', () => {
  const file = zipInput.files?.[0];
  if (file) void loadSelection(() => zipFiles(file));
});
entrySelect.addEventListener('change', selectEntryFormat);
formatSelect.addEventListener('change', () => {
  standaloneNote.hidden = formatSelect.value !== 'dtd';
});

runButton.addEventListener('click', () => {
  const attemptNumber = ++attemptSequence;
  const attemptId = `harness-${attemptNumber}`;
  const wallStarted = performance.now();
  setRunning(true);
  statusOutput.textContent = 'Running';
  renderDiagnostics([]);
  void client
    .run({
      attemptId,
      format: formatSelect.value as XercesSpikeFormat,
      entryPath: entrySelect.value,
      files: projectFiles.map((file) => ({
        path: file.path,
        bytes: new Uint8Array(file.bytes),
      })),
    })
    .then((result) => {
      if (attemptNumber !== attemptSequence) return;
      engineOutput.textContent = `${result.engine.name} ${result.engine.version}`;
      statusOutput.textContent = result.status;
      timingOutput.textContent = `${result.metrics.elapsedMs.toFixed(3)} ms engine · ${(performance.now() - wallStarted).toFixed(3)} ms wall`;
      metricsOutput.textContent = `${result.metrics.fileCount} file(s) · ${result.metrics.inputBytes.toLocaleString()} bytes`;
      renderDiagnostics(result.diagnostics);
    })
    .catch((error: unknown) => {
      if (attemptNumber !== attemptSequence) return;
      statusOutput.textContent =
        error instanceof Error ? error.message : 'Cancelled';
    })
    .finally(() => {
      if (attemptNumber === attemptSequence) setRunning(false);
    });
});

cancelButton.addEventListener('click', () => {
  attemptSequence += 1;
  client.cancel();
  statusOutput.textContent = 'Cancelled; worker recreated';
  engineOutput.textContent = 'Not initialized';
  timingOutput.textContent = '—';
  metricsOutput.textContent = '—';
  renderDiagnostics([]);
  setRunning(false);
});

clearButton.addEventListener('click', () => {
  attemptSequence += 1;
  if (running) client.cancel();
  projectFiles = [];
  filesInput.value = '';
  directoryInput.value = '';
  zipInput.value = '';
  projectSummary.textContent = 'No project files selected.';
  engineOutput.textContent = 'Not initialized';
  statusOutput.textContent = 'Idle';
  timingOutput.textContent = '—';
  metricsOutput.textContent = '—';
  updateEntryOptions();
  renderDiagnostics([]);
  setRunning(false);
});

// Keeps TextEncoder in the emitted harness capability audit and confirms UTF-8 availability.
if (encoder.encode('Xerces').byteLength !== 6) {
  statusOutput.textContent = 'UTF-8 encoding is unavailable.';
}
