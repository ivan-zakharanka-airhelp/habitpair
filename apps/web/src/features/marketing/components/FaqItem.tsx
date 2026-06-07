import { useState } from 'react';
import { Icon } from '../../../shared/components/Icon';

export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-faq__item" data-open={open}>
      <button
        type="button"
        className="lp-faq__q"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{q}</span>
        <Icon name="chevD" size={18} className="lp-faq__ico" />
      </button>
      <div className="lp-faq__a">
        <p>{a}</p>
      </div>
    </div>
  );
}
