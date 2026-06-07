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
});
