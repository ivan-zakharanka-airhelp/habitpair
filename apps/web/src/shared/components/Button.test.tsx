// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

afterEach(cleanup);

describe('Button', () => {
  it('renders the variant and size modifier classes', () => {
    render(
      <Button variant="danger" size="sm">
        Delete
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass(
      'btn',
      'btn--danger',
      'btn--sm',
    );
  });

  it('defaults to a primary, md, type=button button', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveClass('btn', 'btn--primary');
    expect(btn).not.toHaveClass('btn--sm');
    expect(btn).not.toHaveClass('btn--lg');
    expect(btn).not.toHaveClass('btn--block');
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('adds the block modifier when block is set', () => {
    render(<Button block>Wide</Button>);
    expect(screen.getByRole('button', { name: 'Wide' })).toHaveClass('btn--block');
  });

  it('fires onClick when pressed', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
