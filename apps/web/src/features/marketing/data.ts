import type { IconName } from '../../shared/components/Icon';

export interface LpStep {
  t: string;
  d: string;
}

export interface LpFeat {
  ico: IconName;
  t: string;
  d: string;
}

export interface LpFaq {
  q: string;
  a: string;
}

export const LP_STEPS: LpStep[] = [
  {
    t: 'Name two habits',
    d: 'One to build, one to break. Pick a daily, weekly, or monthly cadence; that’s the whole setup.',
  },
  {
    t: 'Mark the days',
    d: 'One tap to log a day done, or stayed clean. No streaks to protect, no streak-anxiety.',
  },
  {
    t: 'See the pattern',
    d: 'A calm day-of-week grid surfaces where you slip, so you fix the cause instead of starting over.',
  },
];

export const LP_FEATS: LpFeat[] = [
  {
    ico: 'spark',
    t: 'Day-of-week insights',
    d: 'The grid quietly reveals which days you miss. That’s the difference between knowing you slipped and knowing why.',
  },
  {
    ico: 'flame',
    t: 'Streaks & consistency',
    d: 'Current streak, rolling consistency, and all-time completion. Honest numbers, never inflated.',
  },
  {
    ico: 'cal',
    t: 'Full calendar history',
    d: 'Review any month. Missed periods are gently tinted so trends are obvious at a glance.',
  },
  {
    ico: 'target',
    t: 'Build and break, together',
    d: 'Positive and negative habits share one grid, so your whole picture lives in a single calm view.',
  },
  {
    ico: 'download',
    t: 'Private, yours to export',
    d: 'Your data is private by default and never sold. Export everything to one file whenever you like.',
  },
  {
    ico: 'moon',
    t: 'Quiet by design',
    d: 'No ads, no guilt-trip notifications, light and dark themes. It waits for you, not the other way around.',
  },
];

export const LP_FAQ: LpFaq[] = [
  {
    q: 'What makes Habitpair different from other habit trackers?',
    a: 'Most trackers only tell you that you missed a day. Habitpair shows you why: a calm day-of-week grid reveals the patterns behind your misses, like consistently slipping on Wednesdays, so you can fix the cause instead of just resetting a streak.',
  },
  {
    q: 'Can Habitpair help me break a bad habit, not just build a good one?',
    a: 'Yes. Habitpair tracks both. “Building” habits count the days you show up; “breaking” habits count the days you stay clean. Both live in the same honest grid.',
  },
  {
    q: 'Is Habitpair free?',
    a: 'Yes. Habitpair is free to use. There are no ads and no motivational spam.',
  },
  {
    q: 'Is my habit data private?',
    a: 'Your data is private by default and never sold. You can export everything you’ve logged to a single file at any time.',
  },
  {
    q: 'Does Habitpair send reminders or notifications?',
    a: 'No nagging. Habitpair is intentionally quiet. You open it when you want to mark a day, and it shows you what’s happening without guilt-tripping notifications.',
  },
];
