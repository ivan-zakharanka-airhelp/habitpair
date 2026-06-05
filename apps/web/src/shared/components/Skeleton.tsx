import type { CSSProperties } from 'react';

interface SkeletonProps {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton({ w, h = 16, r, className, style }: SkeletonProps) {
  return (
    <div
      className={['skel', className].filter(Boolean).join(' ')}
      style={{ width: w, height: h, borderRadius: r, ...style }}
    />
  );
}
