// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Segmented } from './Segmented';

afterEach(cleanup);

describe('Segmented', () => {
  it('exposes a radiogroup and marks the selected option with aria-checked', () => {
    render(
      <Segmented
        value="dark"
        options={['light', 'dark', 'system']}
        onChange={() => {}}
        ariaLabel="Theme"
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'dark' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'light' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the clicked value', () => {
    const onChange = vi.fn();
    render(<Segmented value="light" options={['light', 'dark']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('moves selection with arrow keys, wrapping at the ends', () => {
    const onChange = vi.fn();
    render(<Segmented value="light" options={['light', 'dark', 'system']} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'light' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('dark');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'light' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('system');
  });

  it('renders object options and never selects a disabled one', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        value="a"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
        onChange={onChange}
      />,
    );
    const disabled = screen.getByRole('radio', { name: 'B' });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });
});
