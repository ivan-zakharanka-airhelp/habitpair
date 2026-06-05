// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Segmented } from './Segmented';

afterEach(cleanup);

describe('Segmented', () => {
  it('marks the selected option with aria-pressed and groups under the label', () => {
    render(
      <Segmented
        value="dark"
        options={['light', 'dark', 'system']}
        onChange={() => {}}
        ariaLabel="Theme"
      />,
    );
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'light' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked value', () => {
    const onChange = vi.fn();
    render(<Segmented value="light" options={['light', 'dark']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('renders object options and never fires onChange for a disabled one', () => {
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
    const disabled = screen.getByRole('button', { name: 'B' });
    expect(disabled).toBeDisabled();
    fireEvent.click(disabled);
    expect(onChange).not.toHaveBeenCalled();
  });
});
