import type { CSSProperties } from 'react';

export type IconName =
  | 'check'
  | 'x'
  | 'chevL'
  | 'chevR'
  | 'arrowL'
  | 'plus'
  | 'sun'
  | 'gear'
  | 'trash'
  | 'edit'
  | 'download'
  | 'logout'
  | 'sprout'
  | 'spark'
  | 'flame'
  | 'target'
  | 'cal'
  | 'chevD'
  | 'chevU'
  | 'moon';

// Single-path glyphs are a string; multi-path glyphs are an array of `d` values.
const ICONS: Record<IconName, string | string[]> = {
  check: 'M4 12.5 9 17.5 20 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  chevL: 'M15 5l-7 7 7 7',
  chevR: 'M9 5l7 7-7 7',
  arrowL: 'M19 12H5M11 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  gear: [
    'M4 8h9',
    'M17 8h3',
    'M4 16h3',
    'M11 16h9',
    'M13 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M7 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  ],
  trash:
    'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 5l4 4',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 12h10M16 8l4 4-4 4',
  sprout: 'M12 21v-7M12 14c0-3-2-5-6-5 0 3 2 5 6 5ZM12 12c0-3 2-6 7-6 0 4-3 6-7 6Z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  flame:
    'M12 22c4 0 6-2.7 6-6 0-3-2-5-3-7-1 1.5-2 2-3 2 .5-2.5-.5-5-3-7 .5 4-3 5.5-3 9.5C3 19.3 5.6 22 12 22Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  cal: [
    'M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z',
    'M5 9h14',
    'M9 3v3',
    'M15 3v3',
  ],
  chevD: 'M6 9l6 6 6-6',
  chevU: 'M6 15l6-6 6 6',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z',
};

interface IconProps {
  name: IconName;
  size?: number;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Icon({ name, size = 18, fill = false, className, style }: IconProps) {
  const d = ICONS[name];
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {paths.map((pd, i) => (
        <path
          key={i}
          d={pd}
          fill={fill ? 'currentColor' : 'none'}
          stroke={fill ? 'none' : 'currentColor'}
        />
      ))}
    </svg>
  );
}
