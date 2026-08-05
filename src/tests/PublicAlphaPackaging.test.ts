import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  extractAssetReferences,
  normalizeBase,
  resolveAssetReference,
  verifyBranchWindowRangeBuildOutput,
} from '../../scripts/verify-static-build.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

const readme = read('README.md');
const packageJson = JSON.parse(read('package.json')) as {
  private: boolean;
  version: string;
  description: string;
  author: string;
  license: string;
  repository: { type: string; url: string };
  bugs: { url: string };
  homepage: string;
  engines: { node: string };
  scripts: Record<string, string>;
};
const nodeVersion = read('.node-version').trim();
const ciWorkflow = read('.github/workflows/ci.yml');
const workflowDirectory = path.join(repositoryRoot, '.github', 'workflows');
const workflowFiles = readdirSync(workflowDirectory).filter((entry) =>
  /\.ya?ml$/iu.test(entry),
);
const repositoryWorkflows = workflowFiles.map((entry) => ({
  entry,
  source: read(path.join('.github', 'workflows', entry)),
}));
const packageLock = JSON.parse(read('package-lock.json')) as {
  version: string;
  packages: { '': { version: string } };
};
const releaseNotes = read('docs/first-public-alpha.md');
const releaseChecklist = read('docs/release-checklist.md');
const candidateReport = read('docs/release-candidate-report.md');
const thirdPartyLicensing = read('docs/third-party-licensing.md');
const architecture = read('docs/architecture.md');
const validationScript = read('scripts/run-validation.mjs');

function actionUses(workflow: string): string[] {
  return [...workflow.matchAll(/^\s*uses:\s*(\S+)/gmu)].map(
    (match) => match[1],
  );
}

describe('public alpha documentation and package contracts', () => {
  it('publishes the required README sections and distribution boundary', () => {
    for (const heading of [
      'Overview',
      'Privacy',
      'Try it',
      'Supported capabilities',
      'Development',
      'Distribution',
      'Project documentation',
      'Status',
      'Licence',
    ]) {
      expect(readme).toContain(`## ${heading}`);
    }

    expect(readme).not.toMatch(/[A-Z]:\\(?:Work|Users)\\/u);
    expect(readme).toContain(
      'Version 0.1.0 is the planned first public alpha.',
    );
    expect(readme).toContain(
      "XML Carousel's post-Xerces extraction and presentation",
    );
    expect(readme).toContain('are not a second validator');
    expect(readme).toContain('npm run build');
    expect(readme).toContain('npm run verify:dist -- --base=./');
    expect(readme).toContain('`dist/`');
    expect(readme).toMatch(
      /any\s+directory\s+served\s+by\s+a\s+static\s+web\s+server/iu,
    );
    expect(readme).toMatch(/domain root or a nested directory/iu);
    expect(readme).toContain('https://xmlcarousel.wolfshafenpress.com/');
    expect(readme).toMatch(/No\s+application\s+backend\s+is\s+required/iu);
  });

  it('keeps every repository-local README link resolvable', () => {
    const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
      .map((match) => match[1])
      .filter(
        (target) => !/^[a-z]+:/iu.test(target) && !target.startsWith('#'),
      );

    expect(links).toContain('docs/architecture.md');
    expect(links).toContain('docs/known-limitations.md');
    expect(links).toContain('docs/first-public-alpha.md');
    expect(links).toContain('docs/release-candidate-report.md');
    expect(links).toContain('docs/release-checklist.md');
    expect(links).toContain('docs/development-plan.md');
    expect(links).toContain('docs/style-guide.md');
    for (const target of links) {
      expect(existsSync(path.resolve(repositoryRoot, target))).toBe(true);
    }
  });

  it('keeps accurate private-package metadata and build scripts', () => {
    expect(packageJson.private).toBe(true);
    expect(packageJson.version).toBe('0.1.0');
    expect(packageLock.version).toBe('0.1.0');
    expect(packageLock.packages[''].version).toBe('0.1.0');
    expect(packageJson.description).toContain('DTD, XSD, and ZIP');
    expect(packageJson.author).toBe('Ben Wolfe');
    expect(packageJson.license).toBe('CC0-1.0');
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'https://github.com/benjaminisawolfe/xml-carousel.git',
    });
    expect(packageJson.bugs.url).toBe(
      'https://github.com/benjaminisawolfe/xml-carousel/issues',
    );
    expect(packageJson.homepage).toBe(
      'https://xmlcarousel.wolfshafenpress.com/',
    );
    expect(packageJson.engines.node).toBe('>=24.0.0 <25');
    expect(packageJson.scripts.build).toBe('vite build --base=./');
    expect(packageJson.scripts).not.toHaveProperty('build:pages');
    expect(packageJson.scripts['verify:dist']).toContain(
      'verify-static-build.mjs',
    );
    expect(packageJson.scripts.validate).toContain('run-validation.mjs');
  });

  it('records the limitations baseline and candidate release boundary', () => {
    const limitations = read('docs/known-limitations.md');
    expect(limitations).toContain('XSD 1.1 is not supported');
    expect(limitations).toMatch(/closes the former unresolved historical/iu);
    expect(releaseNotes).toContain('# XML Carousel 0.1.0 — First Public Alpha');
    expect(releaseNotes).toContain('Release date: pending publication');
    expect(releaseNotes).toContain('`v0.1.0`');
    expect(releaseNotes).toContain('GitHub Release: not yet created');
    expect(releaseNotes).toContain(
      'Current candidate deployment: not yet performed',
    );
    expect(releaseNotes).toContain('[Standards support](standards-support.md)');
    expect(releaseNotes).toContain('[Known limitations](known-limitations.md)');
    expect(releaseNotes).toContain(
      '[release-candidate report](release-candidate-report.md)',
    );
    expect(releaseNotes).toContain(
      '[Third-party licensing](third-party-licensing.md)',
    );
    expect(releaseNotes).toMatch(
      /any directory served by\s+a static web server/iu,
    );
    expect(releaseNotes).not.toMatch(
      /https:\/\/benjaminisawolfe\.github\.io/iu,
    );
  });

  it('makes release authority and the required QA gates explicit', () => {
    for (const marker of [
      '[Codex—instructed]',
      '[Manual QA]',
      '[Explicit authorization]',
    ]) {
      expect(releaseChecklist).toContain(marker);
    }
    for (const gate of [
      'npm ci',
      'npm run validate',
      'npm run build',
      'npm run verify:dist -- --base=./',
      '40,000-node',
      'schemaImportWorker-*.js',
      'GitHub Release',
      'rollback',
    ]) {
      expect(releaseChecklist).toContain(gate);
    }
    expect(releaseChecklist).toMatch(/web-served\s+directory/iu);
    expect(releaseChecklist).toContain('Version: `0.1.0`');
    expect(releaseChecklist).toContain('Planned tag: `v0.1.0`');
    expect(releaseChecklist).toContain('Tag policy: annotated');
    expect(releaseChecklist).toContain(
      '[release-candidate report](release-candidate-report.md)',
    );
  });

  it('keeps publication actions explicitly unchecked', () => {
    for (const action of [
      'Create the approved optional annotated or',
      'Create and publish the GitHub Release',
    ]) {
      expect(releaseChecklist).toContain(
        `- [ ] **[Explicit authorization]** ${action}`,
      );
    }
  });

  it('records a complete release-candidate report structure', () => {
    for (const heading of [
      'Candidate identity',
      'Source and scope',
      'Audit and integrity',
      'Automated validation',
      'Standards and visualization evidence',
      'Regression evidence',
      'Deterministic candidate build',
      'Browser evidence',
      'Manual QA pending',
      'Publication gates',
      'Candidate conclusion',
    ]) {
      expect(candidateReport).toContain(`## ${heading}`);
    }
    for (const evidence of [
      'npm run validate',
      'npm audit --json',
      'npm run acceptance:complete-visualization',
      'Relative path',
      'Chrome',
      'Firefox',
      'manual QA',
    ]) {
      expect(candidateReport).toContain(evidence);
    }
    expect(candidateReport).not.toMatch(/[A-Z]:\\(?:Work|Users)\\/u);
    expect(candidateReport).toMatch(/not tagged/iu);
    expect(candidateReport).toMatch(/not published as a GitHub Release/iu);
    expect(candidateReport).toMatch(
      /not\s+deployed as the current candidate/iu,
    );
  });

  it('documents one portable artifact with hosting-neutral distribution', () => {
    const distributionDocuments = [
      readme,
      architecture,
      releaseNotes,
      releaseChecklist,
      candidateReport,
    ].join('\n');

    expect(distributionDocuments).toContain(
      'https://xmlcarousel.wolfshafenpress.com/',
    );
    expect(readme).toContain('npm run verify:dist -- --base=./');
    expect(architecture).toContain('relative public base');
    expect(architecture).toMatch(
      /Transfer and hosting tooling are outside the application\s+architecture/iu,
    );
    expect(releaseChecklist).toContain('contents of `dist/`');
    expect(candidateReport).toMatch(/automated candidate preparation passed/iu);
    expect(distributionDocuments).not.toMatch(/actions\/deploy-pages/iu);
  });

  it('does not claim publication state in public release documents', () => {
    const publicReleaseDocuments = [
      readme,
      releaseNotes,
      releaseChecklist,
      candidateReport,
    ].join('\n');
    expect(publicReleaseDocuments).not.toMatch(
      /\b(?:repository is now public|Pages deployment passed|GitHub Release exists|successfully uploaded and loaded)\b/iu,
    );

    const currentReleaseDocuments = [
      readme,
      releaseNotes,
      candidateReport,
      thirdPartyLicensing,
    ].join('\n');
    for (const staleEvidence of [
      '121 test files and 1,799 tests',
      '271 transformed modules',
      'schemaImportWorker-ll5tt6Dr.js',
      '246,258 bytes',
      'successfully uploaded and loaded',
      'c6af0c4cded3445478fa74a3cc737378e1c61af4',
      '08bf2c235d12dc0ad01aeb661abee2e3ed1bc078',
      'No distribution blocker remains for revision `0.1.0`.',
    ]) {
      expect(currentReleaseDocuments).not.toContain(staleEvidence);
    }

    for (const currentHistoryContract of [
      'parentless',
      'c87854ecd922ca916a6f28c176281c10a6af0970',
      'xml-carousel-history-private',
      'private and archived',
      'replacement public repository',
      'Independent third-party',
      'caches or clones',
    ]) {
      expect(thirdPartyLicensing).toContain(currentHistoryContract);
    }
    expect(thirdPartyLicensing).not.toContain(
      'This is an **unresolved historical redistribution**',
    );
  });

  it('does not track generated dist output', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'dist'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(tracked.trim()).toBe('');
    expect(read('.gitignore').split(/\r?\n/u)).toContain('dist/');
  });
});

describe('repository workflow contracts', () => {
  it('uses the checked-in supported Node version in CI', () => {
    expect(nodeVersion).toMatch(/^24\.\d+\.\d+$/u);
    expect(ciWorkflow).toContain('node-version-file: .node-version');
    expect(ciWorkflow).not.toMatch(/node-version:\s*latest/iu);
  });

  it('pins every official CI action to a full commit with a version comment', () => {
    const uses = actionUses(ciWorkflow);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) {
      expect(action).toMatch(/^actions\/[\w-]+@[0-9a-f]{40}$/u);
    }
    const usesLines = ciWorkflow
      .split(/\r?\n/u)
      .filter((line) => line.includes('uses:'));
    expect(usesLines.every((line) => /# v\d+\.\d+\.\d+\s*$/u.test(line))).toBe(
      true,
    );
  });

  it('keeps CI read-only, root-validating, and non-deploying', () => {
    expect(ciWorkflow).toMatch(
      /\bpull_request:\s*\n\s+branches:\s*\n\s+- main/gu,
    );
    expect(ciWorkflow).toMatch(/\bpush:\s*\n\s+branches:\s*\n\s+- main/gu);
    expect(ciWorkflow).toContain('workflow_dispatch:');
    expect(ciWorkflow).toMatch(/permissions:\s*\n\s+contents: read/gu);
    expect(ciWorkflow).toContain('cancel-in-progress: true');
    expect(ciWorkflow).toContain('run: npm ci');
    expect(ciWorkflow).toContain('run: npm run validate');
    expect(ciWorkflow).not.toMatch(/\bpages:\s*write\b/gu);
    expect(ciWorkflow).not.toMatch(/\bid-token:\s*write\b/gu);
    expect(ciWorkflow).not.toContain('actions/deploy-pages');
  });

  it('uses portable verification in aggregate validation', () => {
    expect(validationScript).toContain(
      "['run', 'verify:dist', '--', '--base=./']",
    );
    expect(validationScript).not.toContain('--base=/xml-carousel/');
    expect(validationScript).not.toContain("'--base=/'");
  });

  it('keeps deployment outside repository workflows', () => {
    expect(existsSync(path.join(workflowDirectory, 'ci.yml'))).toBe(true);
    expect(existsSync(path.join(workflowDirectory, 'deploy-pages.yml'))).toBe(
      false,
    );
    expect(workflowFiles).toContain('ci.yml');
    for (const workflow of repositoryWorkflows) {
      expect(workflow.source, workflow.entry).not.toMatch(
        /\bdeploy-pages\b|\bpages:\s*write\b|\bid-token:\s*write\b|\bgithub-pages\b|actions\/upload-pages-artifact/iu,
      );
    }
  });
});

describe('static-build verifier path logic', () => {
  it('normalizes portable mode and supported diagnostic absolute bases', () => {
    expect(normalizeBase('.')).toBe('./');
    expect(normalizeBase('./')).toBe('./');
    expect(normalizeBase('/')).toBe('/');
    expect(normalizeBase('/xml-carousel')).toBe('/xml-carousel/');
    expect(normalizeBase('xml-carousel/')).toBe('/xml-carousel/');
    expect(() => normalizeBase('https://example.test/')).toThrow(
      /site-relative/iu,
    );
    expect(() => normalizeBase('/../escape/')).toThrow(/traversal/iu);
  });

  it('extracts script and stylesheet references without hardcoded hashes', () => {
    expect(
      extractAssetReferences(
        '<link rel="stylesheet" href="./assets/app-a.css">' +
          '<script type="module" src="./assets/app-b.js"></script>',
      ),
    ).toEqual(['./assets/app-a.css', './assets/app-b.js']);
  });

  it('requires the rendered branch-range hook and scoped production declarations', () => {
    const javascript =
      '<p class="branch-window-range svelte-range" data-branch-window-range data-branch-window-large-total role="status">';
    const stylesheet =
      '.branch-window-range.svelte-range{' +
      'justify-self:end;' +
      'inline-size:max-content;' +
      'max-inline-size:calc(100% + var(--space-10));' +
      'color:var(--colour-accent);' +
      'font-size:var(--font-size-xs);' +
      'font-weight:700;' +
      'line-height:1.25}' +
      '.branch-window-range[data-branch-window-large-total].svelte-range{' +
      'inline-size:100%;max-inline-size:100%}';

    expect(() =>
      verifyBranchWindowRangeBuildOutput(javascript, stylesheet),
    ).not.toThrow();
    expect(() =>
      verifyBranchWindowRangeBuildOutput(
        '<p class="visually-hidden" role="status">',
        stylesheet,
      ),
    ).toThrow(/element hook/iu);
    expect(() =>
      verifyBranchWindowRangeBuildOutput(javascript, 'body{color:#17212b}'),
    ).toThrow(/scoped branch-window range rule/iu);
  });

  it('maps portable references and retained diagnostic bases safely', () => {
    expect(resolveAssetReference('./assets/app.js?v=1', './')).toBe(
      path.join('assets', 'app.js'),
    );
    expect(resolveAssetReference('assets/app.css#sheet', '.')).toBe(
      path.join('assets', 'app.css'),
    );
    expect(resolveAssetReference('/assets/app.js?v=1', '/')).toBe(
      path.join('assets', 'app.js'),
    );
    expect(
      resolveAssetReference(
        '/xml-carousel/assets/app.css#sheet',
        '/xml-carousel/',
      ),
    ).toBe(path.join('assets', 'app.css'));
    expect(() =>
      resolveAssetReference('/xml-carousel/assets/app.js', '/'),
    ).toThrow(/safe file path/iu);
    expect(() =>
      resolveAssetReference('/assets/app.js', '/xml-carousel/'),
    ).toThrow(/outside expected base/iu);
    expect(() =>
      resolveAssetReference('/xml-carousel/../secret', '/xml-carousel/'),
    ).toThrow(/safe file path/iu);
  });

  it('rejects location-specific, remote, traversal, and unsafe portable paths', () => {
    for (const reference of [
      '/assets/app.js',
      '/xml-carousel/assets/app.js',
      'https://example.test/assets/app.js',
      '//example.test/assets/app.js',
    ]) {
      expect(() => resolveAssetReference(reference, './')).toThrow(
        /relative|safe URL/iu,
      );
    }
    for (const reference of [
      './assets/../secret',
      './assets/%2e%2e/secret',
      './assets/%2Fsecret',
      './assets//app.js',
      '../assets/app.js',
    ]) {
      expect(() => resolveAssetReference(reference, './')).toThrow(
        /safe file path/iu,
      );
    }
  });
});
