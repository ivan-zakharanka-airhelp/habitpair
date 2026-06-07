import { Icon } from '../../../shared/components/Icon';
import type { StreakUnit } from '../types';

const STREAK_ABBR: Record<StreakUnit, string> = { DAY: 'd', WEEK: 'w', MONTH: 'mo' };
const STREAK_NOUN: Record<StreakUnit, string> = { DAY: 'day', WEEK: 'week', MONTH: 'month' };

export function StreakChip({ streak, unit }: { streak: number; unit: StreakUnit }) {
  const cold = !streak;
  return (
    <span
      className={`streakc${cold ? ' streakc--cold' : ''}`}
      title={
        cold
          ? 'No active streak'
          : `${streak} ${STREAK_NOUN[unit]}${streak === 1 ? '' : 's'} streak`
      }
    >
      <Icon name="flame" size={15} />
      {cold ? 'No streak' : `${streak}${STREAK_ABBR[unit]}`}
    </span>
  );
}
