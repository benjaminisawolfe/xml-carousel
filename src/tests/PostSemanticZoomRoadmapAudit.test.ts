import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

function read(relativePath: string): string {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

const audit = read('docs/technical/post-semantic-zoom-roadmap-gap-audit.md');
const plan = read('docs/development-plan.md');
const roadmap = read('docs/post-alpha-roadmap.md');
const documents = `${audit}\n${roadmap}`;

const baselineCommit = 'b0e20bc9326fbb57db07018946b38ee84b2b1086';
const baselineTree = '433c9e945f9043b096db3087c06115197990b23b';

describe('post-semantic-zoom roadmap audit', () => {
  it('binds both documents to the accepted completed baseline', () => {
    for (const document of [audit, roadmap]) {
      expect(document).toContain(baselineCommit);
      expect(document).toContain(baselineTree);
      expect(document).toContain('0.1.0');
    }

    expect(audit).toContain('zero open issues');
    expect(roadmap).toContain('Semantic-zoom milestone acceptance is closed');
  });

  it('contains every required technical-audit section', () => {
    for (const heading of [
      '1. Baseline identity',
      '2. Audit method',
      '3. Reviewed sources',
      '4. Original Spiral 0–12 reconciliation',
      '5. Post-alpha sequence reconciliation',
      '6. Known-limitations classification',
      '7. Source-marker findings',
      '8. Open-issue findings',
      '9. Standards and visualization findings',
      '10. Workflow and product findings',
      '11. Accessibility and platform findings',
      '12. Performance and capacity findings',
      '13. Documentation, release, and process findings',
      '14. Candidate scoring',
      '15. Rejected and deferred candidates',
      '16. Recommended next milestone',
      '17. Alternative milestones',
      '18. Unresolved product decisions',
      '19. Conclusion',
    ]) {
      expect(audit).toContain(`## ${heading}`);
    }
  });

  it('uses the complete classification and scoring vocabulary', () => {
    for (const disposition of [
      'complete',
      'partially complete',
      'approved future feature',
      'evidence-only gap',
      'release/process debt',
      'documentation debt',
      'deliberate product boundary',
      'standards boundary',
      'security boundary',
      'obsolete/superseded',
      'new proposal',
    ]) {
      expect(audit).toContain(`\`${disposition}\``);
    }

    for (const dimension of [
      'User value',
      'Strategic fit',
      'Technical risk, reverse-scored',
      'Implementation size, reverse-scored',
      'Testability',
      'Independence from unresolved product decisions',
      'Release-readiness benefit',
    ]) {
      expect(audit).toContain(dimension);
    }
  });

  it('reconciles every original spiral and the exhausted enhancement sequence', () => {
    for (let spiral = 0; spiral <= 12; spiral += 1) {
      expect(audit).toContain(`### Spiral ${spiral} —`);
    }

    for (const sequenceItem of [
      'Xerces-C++ WebAssembly feasibility and architecture',
      'Authoritative standards-validation boundary',
      'Tolerant visualization extraction',
      'Complete problem-report modal',
      'Persistent Problems access',
      'Desktop semantic zoom',
    ]) {
      expect(audit).toContain(`| ${sequenceItem} |`);
    }
  });

  it('preserves the original audit ranking and recommendation evidence', () => {
    const rankedRows = audit.match(/^\| \d+ \| .+ \|$/gmu) ?? [];
    expect(rankedRows.length).toBeGreaterThanOrEqual(3);
    expect(rankedRows).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Developer handoff utilities'),
        expect.stringContaining(
          'Large-project performance and capacity hardening',
        ),
        expect.stringContaining('Accessibility and platform evidence'),
      ]),
    );

    expect(audit).toContain('### Audit recommendation');
    expect(audit).toMatch(
      /original audit recommendation was \*\*Developer handoff utilities\*\*, awaiting\s+Ben’s approval/iu,
    );
    expect(audit).toMatch(
      /the\s+later decision does not change the original scoring exercise/iu,
    );
    expect(audit).toContain('## 17. Alternative milestones');
  });

  it('records exactly one approved milestone from Ben’s manual plan', () => {
    expect(
      plan.match(/^The next approved milestone is:$/gmu) ?? [],
    ).toHaveLength(1);
    expect(plan).toMatch(
      /The next approved milestone is:\s+> \*\*Developer Handoff Utilities\*\*/u,
    );
    expect(plan).toContain('Approval date: **2026-08-06**');
    expect(roadmap.match(/^## Approved next milestone$/gmu) ?? []).toHaveLength(
      1,
    );
    expect(roadmap).toMatch(
      /\*\*Status:\*\* approved in Ben’s development plan on 2026-08-06; implementation has\s+not started/iu,
    );
    expect(audit).toContain('### Ben’s approved development-plan decision');
  });

  it('follows the approved task order and boundaries without starting Task 15.2', () => {
    const taskHeadings = [
      'Task 15.2 — Visible Source Identity, Location, and Source Modal Foundation',
      'Task 15.3 — Safe Copy-Source Action',
      'Task 15.4 — Deterministic Copy-Node-Summary Action',
      'Task 15.5 — Developer Handoff Utilities Stabilization and Acceptance',
    ];

    for (const document of [plan, audit]) {
      const positions = taskHeadings.map((heading) =>
        document.indexOf(heading),
      );
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual(
        [...positions].sort((left, right) => left - right),
      );
    }

    expect(plan).toContain(
      'The following remain roadmap candidates and are not approved implementation work:',
    );
    expect(documents).toMatch(
      /Task 15\.2 or any later task has started or completed/iu,
    );
    expect(documents).not.toMatch(
      /\*\*Status:\*\*\s*(?:underway|started|complete|completed)/iu,
    );
  });

  it('represents the dedicated readable source-view modal and truthful source identity', () => {
    for (const requirement of [
      'dedicated modal',
      'substantially more screen space',
      'large, scrollable reading area',
      'safe escaped rendering',
      'preserved whitespace',
      'focus trap',
      'restore focus',
    ]) {
      expect(plan).toMatch(new RegExp(requirement, 'iu'));
    }

    expect(plan).toContain(
      'Source-view state should be independent from inspection state.',
    );
    expect(plan).toContain('Do not expose absolute local filesystem paths.');
    expect(plan).toContain('Do not fabricate source coordinates.');
    expect(plan).toContain(
      'when line 1 is merely a default, placeholder, or inferred value rather than a retained source location.',
    );
    expect(roadmap).toMatch(
      /dedicated, substantially more readable source-view modal/iu,
    );
  });

  it('keeps retained source, summary, and clipboard contracts distinct', () => {
    expect(plan).toContain(
      'Source display and copying use retained source text whenever available.',
    );
    expect(plan).toContain(
      'XML or DTD declarations must not be reconstructed from the normalized graph and presented as original source.',
    );
    expect(plan).toContain('The summary must be deterministic plain text.');
    expect(plan).toContain(
      'Clipboard writes occur only after an explicit user action.',
    );
    expect(plan).toContain(
      'It must not replace **Copy source**. The two actions serve different purposes.',
    );
  });

  it('surfaces unresolved product decisions without answering them for Ben', () => {
    for (const decision of [
      'reopen recent local projects',
      'remain read-only',
      'XSD 1.1',
      'Safari/WebKit',
      'screen-reader',
      'documentation/appinfo',
      'comparison/diff',
      '0.2.0',
    ]) {
      expect(audit).toContain(decision);
    }

    expect(plan).toContain(
      'These decisions must not be inferred from approval',
    );
    expect(roadmap).toMatch(/Later candidate\s+milestones remain unapproved/iu);
    expect(roadmap).toContain('No design is selected here.');
  });

  it('defines the roadmap states, alternatives, gates, and bounded task sequence', () => {
    for (const state of [
      'Approved next work',
      'Recommended, awaiting Ben’s approval',
      'Deferred',
      'Non-goal',
      'Evidence-only',
    ]) {
      expect(roadmap).toContain(`**${state}:**`);
    }

    for (const task of ['15.2', '15.3', '15.4', '15.5']) {
      expect(roadmap).toContain(`### Task ${task} —`);
    }
    for (const field of [
      'Implementation boundary',
      'Visible result',
      'Tests',
      'Manual-QA focus',
      'Dependency',
      'Integration boundary',
    ]) {
      expect(roadmap).toContain(`**${field}:**`);
    }
    for (const gate of [
      'Roadmap approval gate',
      'Task-design gate',
      'Architecture and safety gate',
      'Acceptance gate',
      'Release gate',
    ]) {
      expect(roadmap).toContain(`### ${gate}`);
    }
  });

  it('preserves current orientation, read-only scope, and local-first security', () => {
    expect(audit).toMatch(
      /rootward context is visually left and leafward context visually\s+right/iu,
    );
    expect(documents).toMatch(/static, local-first, read-only/iu);
    expect(documents).toMatch(/no backend/iu);
    expect(documents).toMatch(/supplied-files-only/iu);
    expect(documents).toMatch(/remote schema retrieval/iu);
    expect(documents).toMatch(/XSD 1\.0/iu);
    expect(roadmap).toContain('Do not reconstruct source from');
    expect(plan).toMatch(
      /rootward \/ previous step\s+←\s+current focus\s+→\s+leafward \/ children/iu,
    );
    expect(plan).toContain(
      'This orientation supersedes older passages that describe rootward context on the right and leafward context on the left.',
    );
  });

  it('contains no private-history identity or release/deployment mutation recipe', () => {
    expect(documents).not.toMatch(/history[-_ ]private/iu);
    expect(documents).not.toMatch(/[A-Z]:\\[^\r\n]*\\(?:archive|history)\b/iu);

    for (const mutationCommand of [
      'git push',
      'git tag',
      'gh release create',
      'npm version',
      'deploy now',
      'upload the build',
    ]) {
      expect(documents).not.toContain(mutationCommand);
    }
  });
});
