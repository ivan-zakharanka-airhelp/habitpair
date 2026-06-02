export type Modality = 'POSITIVE' | 'NEGATIVE';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type MarkStatus = 'COMPLETED' | 'MISSED';

export interface CreateHabitInput {
  name: string;
  modality: Modality;
  frequency: Frequency;
  targetCount?: number;
}

export interface HabitListItem {
  id: string;
  name: string;
  modality: Modality;
  frequency: Frequency;
  targetCount: number | null;
  todayStatus: MarkStatus | null;
  currentPeriod: {
    kind: Frequency;
    completedCount: number;
    target: number;
  };
}
