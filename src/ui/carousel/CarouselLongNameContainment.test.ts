import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SchemaNode } from '../../schema/model';
import ContextCard from './ContextCard.svelte';
import FocusCard from './FocusCard.svelte';
import type { FocusCardSummary } from './focusCardSummary';
import contextSource from './ContextCard.svelte?raw';
import focusSource from './FocusCard.svelte?raw';

const longName = 'spellMasterySpecialAbilityDefinitionType';

const summary: FocusCardSummary = {
  nodeId: 'long',
  displayName: longName,
  kind: 'complexType',
  showSourceFilename: false,
  contentModelParts: [],
  orderedDestinationSummaries: [],
  visibleRelationshipSummaries: [],
  hiddenRelationshipCount: 0,
  xsdProperties: [],
  hasXsdPresentation: true,
  destinationCount: 0,
  incomingUseCount: 0,
  attributeCount: 0,
  attributeCountKind: 'attribute',
  commentCount: 0,
  annotationCount: 0,
  isStructuralLeaf: true,
  leafStateLabel: 'No structural destinations',
};

const node: SchemaNode = {
  id: 'long-context',
  name: longName,
  kind: 'complexType',
};

const dtdNode: SchemaNode = {
  id: 'long-dtd-context',
  name: 'spellMasterySpecialAbilityDefinitionElement',
  kind: 'dtdElement',
};

describe('carousel long-name containment', () => {
  it('keeps the complete focused XSD name as ordinary wrapping text', () => {
    render(FocusCard, {
      props: {
        summary,
        isInspected: false,
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
        motionKey: 'long',
      },
    });
    expect(
      screen.getByRole('heading', { level: 2, name: longName }),
    ).toHaveTextContent(longName);
    expect(
      screen.getByRole('button', { name: `Inspect ${longName}` }),
    ).toBeVisible();
    expect(focusSource).toContain('max-width: 100%');
    expect(focusSource).toContain('overflow-wrap: anywhere');
  });

  it('keeps the complete focused Overview name and Inspect action at equivalent 200% text scale', () => {
    const previousFontSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = '200%';
    try {
      const { container } = render(FocusCard, {
        props: {
          summary,
          isInspected: false,
          onToggleInspection: vi.fn(),
          onCenterNode: vi.fn(),
          motionKey: 'long-overview',
          presentation: 'overview',
        },
      });
      container.style.width = '180px';
      const card = screen.getByRole('article', { name: longName });
      expect(
        screen.getByRole('heading', { level: 2, name: longName }),
      ).toHaveTextContent(longName);
      expect(
        screen.getByRole('button', { name: `Inspect ${longName}` }),
      ).toBeVisible();
      expect(card.querySelector('.card-topline')).not.toBeNull();
      expect(focusSource).toContain('.focus-card.overview .card-topline');
      expect(focusSource).toContain('flex-wrap: wrap');
      expect(focusSource).toContain('flex: 1 1 10rem');
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth,
      );
    } finally {
      document.documentElement.style.fontSize = previousFontSize;
    }
  });

  it('uses the same bounded focused-title treatment for DTD nodes', () => {
    const dtdSummary: FocusCardSummary = {
      ...summary,
      nodeId: 'long-dtd-focus',
      displayName: dtdNode.name,
      kind: 'dtdElement',
      hasXsdPresentation: false,
    };
    render(FocusCard, {
      props: {
        summary: dtdSummary,
        isInspected: true,
        onToggleInspection: vi.fn(),
        onCenterNode: vi.fn(),
        motionKey: 'long-dtd',
      },
    });
    expect(
      screen.getByRole('heading', { level: 2, name: dtdNode.name }),
    ).toHaveTextContent(dtdNode.name);
    expect(
      screen.getByRole('button', {
        name: `Close inspection for ${dtdNode.name}`,
      }),
    ).toBeVisible();
  });

  it('keeps complete DTD/XSD destination names wrapped in compact contexts', () => {
    render(ContextCard, {
      props: {
        node,
        direction: 'leafward',
        onActivate: vi.fn(),
        isInspected: false,
        onToggleInspection: vi.fn(),
        motionKey: 'context-long',
        showKind: true,
      },
    });
    expect(screen.getByText(longName)).toHaveTextContent(longName);
    expect(
      screen.getByRole('button', { name: `Inspect ${longName}` }),
    ).toBeVisible();
    expect(contextSource).toContain('overflow-wrap: anywhere');
    expect(contextSource).toContain('white-space: normal');
    expect(contextSource).not.toContain('text-overflow: ellipsis');
    expect(contextSource).not.toContain('white-space: nowrap');
  });

  it('keeps a complete DTD rootward name and its Inspect target inside the context card', () => {
    render(ContextCard, {
      props: {
        node: dtdNode,
        direction: 'rootward',
        onActivate: vi.fn(),
        isInspected: false,
        onToggleInspection: vi.fn(),
        motionKey: 'context-long-dtd',
        showKind: true,
      },
    });
    expect(screen.getByText(dtdNode.name)).toHaveTextContent(dtdNode.name);
    expect(
      screen.getByRole('button', { name: `Inspect ${dtdNode.name}` }),
    ).toBeVisible();
    expect(contextSource).toContain('@container carousel (max-width: 640px)');
    expect(contextSource).toContain('max-width: 100%');
  });
});
