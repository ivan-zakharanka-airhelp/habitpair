import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

interface FieldControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  // A single form control (Input/Select/Textarea). Field owns label association
  // and aria wiring, injecting `id`/`aria-*` so call sites stay declarative.
  children: ReactElement<FieldControlProps>;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const generatedId = useId();
  const controlId = children.props.id ?? generatedId;
  const hintId = hint != null ? `${controlId}-hint` : undefined;
  const errId = error != null ? `${controlId}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;

  const control = cloneElement(children, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error != null ? true : undefined,
  });

  return (
    <div className="field">
      {label != null ? (
        <label className="label" htmlFor={controlId}>
          {label}
        </label>
      ) : null}
      {control}
      {hint != null ? (
        <div className="field__hint" id={hintId}>
          {hint}
        </div>
      ) : null}
      {error != null ? (
        <div className="field__err" id={errId} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
