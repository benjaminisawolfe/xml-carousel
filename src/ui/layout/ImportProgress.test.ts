import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import componentSource from './ImportProgress.svelte?raw';
import ImportProgress from './ImportProgress.svelte';

const indeterminate = {
  heading: 'Opening schema.xsd',
  message: 'Parsing schema.xsd.',
  progressLabel: 'Schema import progress: Parsing schema.xsd.',
  determinate: false,
  cancelAccessibleName: 'Cancel opening schema.xsd',
};

describe('ImportProgress', () => {
  it('renders a polite atomic status with visible copy and labelled native indeterminate progress', () => {
    render(ImportProgress, {
      props: { presentation: indeterminate, onCancel: vi.fn() },
    });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(
      screen.getByRole('heading', { name: 'Opening schema.xsd' }),
    ).toBeVisible();
    expect(screen.getByText('Parsing schema.xsd.')).toBeVisible();
    const progress = screen.getByRole('progressbar', {
      name: indeterminate.progressLabel,
    });
    expect(progress).not.toHaveAttribute('value');
    expect(progress).not.toHaveAttribute('max');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders truthful native value and max for package source progress', () => {
    render(ImportProgress, {
      props: {
        presentation: {
          ...indeterminate,
          message: 'Importing schema 3 of 12: schemas/types.xsd.',
          progressLabel:
            'Schema import progress: Importing schema 3 of 12: schemas/types.xsd.',
          determinate: true,
          value: 3,
          max: 12,
        },
        onCancel: vi.fn(),
      },
    });
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('value', '3');
    expect(progress).toHaveAttribute('max', '12');
  });

  it('uses a native Cancel button with the filename-specific accessible name', async () => {
    const onCancel = vi.fn();
    render(ImportProgress, {
      props: { presentation: indeterminate, onCancel },
    });
    const cancel = screen.getByRole('button', {
      name: 'Cancel opening schema.xsd',
    });
    expect(cancel.tagName).toBe('BUTTON');
    await fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders malicious-looking copy literally without HTML execution', () => {
    const { container } = render(ImportProgress, {
      props: {
        presentation: {
          ...indeterminate,
          heading: 'Opening <img src=x onerror=alert(1)>',
          message: '<script>private()</script>',
        },
        onCancel: vi.fn(),
      },
    });
    expect(
      screen.getByText('Opening <img src=x onerror=alert(1)>'),
    ).toBeVisible();
    expect(screen.getByText('<script>private()</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not steal existing focus when mounted', () => {
    const origin = document.createElement('button');
    document.body.append(origin);
    origin.focus();
    render(ImportProgress, {
      props: { presentation: indeterminate, onCancel: vi.fn() },
    });
    expect(document.activeElement).toBe(origin);
    origin.remove();
  });

  it('keeps the 44px native target and contains no spinner or animation contract', () => {
    expect(componentSource).toMatch(/min-height:\s*var\(--control-min-size\)/);
    expect(componentSource).toMatch(/<progress/);
    expect(componentSource).not.toMatch(/spinner|@keyframes|animation:/i);
    expect(componentSource).not.toMatch(/role=["']alert["']/);
  });
});
