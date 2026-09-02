import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import WelcomeHelpDialog from './WelcomeHelpDialog.svelte';
import dialogSource from './WelcomeHelpDialog.svelte?raw';

describe('reusable welcome and Help dialog', () => {
  it('presents one semantic, associated, plain-language modal', async () => {
    render(WelcomeHelpDialog, { props: { open: true } });
    const dialog = await screen.findByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'welcome-help-title');
    expect(dialog).toHaveAttribute(
      'aria-describedby',
      'welcome-help-description welcome-help-privacy welcome-help-instructions',
    );
    expect(
      within(dialog).getByRole('heading', {
        name: 'Welcome to XML Carousel',
      }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      'Your schema files stay in your browser. XML Carousel does not upload them to a server.',
    );
    expect(dialog).toHaveTextContent('Click a card to centre it.');
    expect(dialog).toHaveTextContent(
      'Use Inspect to open details without changing carousel focus.',
    );
    expect(dialog).toHaveTextContent(
      'Use Up and Down to select a leafward branch.',
    );
    expect(dialog).toHaveTextContent(
      'Right enters the first or selected leafward destination; Left returns toward the previous journey step.',
    );
    expect(dialog).toHaveTextContent('Search jumps to declarations.');
    expect(dialog).toHaveTextContent(
      'Apache Xerces-C++ is the authoritative XML, DTD, and XML Schema 1.0 validator.',
    );
    expect(dialog).toHaveTextContent(
      'libxml2 RELAX NG is the authoritative standalone and ZIP-package .rng validator.',
    );
    expect(dialog).toHaveTextContent(
      'Standards-valid RELAX NG XML syntax is presented through its retained semantic model',
    );
    expect(
      within(dialog).getByRole('link', { name: 'XML Carousel licence' }),
    ).toHaveAttribute('href', './LICENSE.txt');
    expect(
      within(dialog).getByRole('link', { name: 'third-party notices' }),
    ).toHaveAttribute('href', './THIRD_PARTY_NOTICES.txt');
    expect(
      within(dialog).getByRole('button', { name: 'Load sample DTD' }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole('button', { name: 'Load sample XSD' }),
    ).toBeEnabled();
    expect(
      within(dialog).getByRole('button', { name: 'Start exploring' }),
    ).toBeEnabled();
    const preference = within(dialog).getByRole('checkbox', {
      name: "Don't Show This Again",
    });
    expect(preference).not.toBeChecked();
    expect(preference.tagName).toBe('INPUT');
    expect(preference.closest('label')).toHaveTextContent(
      "Don't Show This Again",
    );
  });

  it('enters focus, contains Tab in both directions, and reports Escape', async () => {
    const onClose = vi.fn();
    render(WelcomeHelpDialog, { props: { open: true, onClose } });
    const dialog = await screen.findByRole('dialog');
    const close = within(dialog).getByRole('button', {
      name: 'Close XML Carousel help',
    });
    const start = within(dialog).getByRole('button', {
      name: 'Start exploring',
    });
    const preference = within(dialog).getByRole('checkbox', {
      name: "Don't Show This Again",
    });

    await waitFor(() => expect(close).toHaveFocus());
    preference.focus();
    await fireEvent.keyDown(preference, { key: ' ' });
    await fireEvent.click(preference);
    expect(preference).toBeChecked();
    close.focus();
    await fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(start).toHaveFocus();
    await fireEvent.keyDown(start, { key: 'Tab' });
    expect(close).toHaveFocus();
    await fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
  });

  it('disables and explains sample actions while import work owns the session', async () => {
    render(WelcomeHelpDialog, {
      props: { open: true, sampleActionsDisabled: true },
    });
    const dialog = await screen.findByRole('dialog');
    const note = within(dialog).getByText(
      'Finish or cancel the current import before loading a sample.',
    );

    for (const button of [
      within(dialog).getByRole('button', { name: 'Load sample DTD' }),
      within(dialog).getByRole('button', { name: 'Load sample XSD' }),
    ]) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-describedby', note.id);
    }
  });

  it('keeps one dialog node across repeated open and close cycles', async () => {
    const rendered = render(WelcomeHelpDialog, { props: { open: true } });
    await screen.findByRole('dialog');
    expect(document.querySelectorAll('dialog')).toHaveLength(1);

    await rendered.rerender({ open: false });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await rendered.rerender({ open: true });
    await screen.findByRole('dialog');
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
  });

  it('provides internal short-screen scrolling without unsafe HTML or animation', () => {
    expect(dialogSource).toContain('.dialog-content');
    expect(dialogSource).toContain('overflow: auto');
    expect(dialogSource).toContain('max-height: calc(100dvh');
    expect(dialogSource).toContain('min-height: var(--control-min-size)');
    expect(dialogSource).toContain('input:focus-visible');
    expect(dialogSource).toContain('a:focus-visible');
    expect(dialogSource).toContain(
      '@media (orientation: landscape) and (max-height: 300px)',
    );
    expect(dialogSource).not.toContain('@html');
    expect(dialogSource).not.toMatch(/\banimation\s*:/);
  });
});
