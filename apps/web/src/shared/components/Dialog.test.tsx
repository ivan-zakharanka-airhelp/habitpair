// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from './Dialog';

afterEach(cleanup);

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(<Dialog open={false} title="Hidden" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and body when open', () => {
    render(
      <Dialog open title="Delete habit">
        <p>This cannot be undone.</p>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Delete habit' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(<Dialog open title="Confirm" onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on backdrop mousedown but not when the dialog itself is pressed', () => {
    const onCancel = vi.fn();
    render(<Dialog open title="Confirm" onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog');

    fireEvent.mouseDown(dialog);
    expect(onCancel).not.toHaveBeenCalled();

    // The scrim is the dialog's parent; pressing it should dismiss.
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
