// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Toast } from './Toast';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('Toast', () => {
  it('renders the message with a status role', () => {
    render(<Toast message="Changes saved." onDone={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Changes saved.');
  });

  it('calls onDone once after the duration elapses', () => {
    const onDone = vi.fn();
    render(<Toast message="Changes saved." duration={2600} onDone={onDone} />);
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('renders an action button and uses the alert role', () => {
    render(
      <Toast
        message="A new version is available."
        onDone={() => {}}
        action={{ label: 'Reload', onClick: () => {} }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A new version is available.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('fires the action onClick when its button is clicked', () => {
    const onClick = vi.fn();
    render(<Toast message="A new version is available." action={{ label: 'Reload', onClick }} />);
    act(() => {
      screen.getByRole('button', { name: 'Reload' }).click();
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss an action toast on the short default duration', () => {
    const onDone = vi.fn();
    render(
      <Toast
        message="A new version is available."
        duration={2600}
        onDone={onDone}
        action={{ label: 'Reload', onClick: () => {} }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});
