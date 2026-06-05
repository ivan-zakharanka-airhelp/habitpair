import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  pad?: boolean;
}

export function Card({ pad = false, className, ...rest }: CardProps) {
  const classes = ['card', pad ? 'card--pad' : '', className].filter(Boolean).join(' ');
  return <div className={classes} {...rest} />;
}
