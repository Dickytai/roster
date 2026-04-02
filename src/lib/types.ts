export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  dayOfWeek: number; // 0=Sun, 1=Mon, ... 6=Sat
}

export interface AnnualLeave {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  blockId?: number; // Groups consecutive AL days into blocks
}

export interface Staff {
  id: string;
  name: string;
  annualLeaves: AnnualLeave[];
}

export interface RosterEntry {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  isPublicHoliday: boolean;
  phName?: string;
  onCallStaffId: string | null;
  onCallStaffName: string | null;
}

export interface OnCallSchedule {
  year: number;
  publicHolidays: PublicHoliday[];
  staff: Staff[];
  entries: RosterEntry[]; // All days of the year
  phWeekendsCount: Record<string, number>; // staffId -> count of PH weekends worked
}

export interface MonthlyRoster {
  month: number; // 1-12
  year: number;
  entries: RosterEntry[];
}

export interface GenerationState {
  step: 1 | 2 | 3;
  year: number;
  publicHolidays: PublicHoliday[];
  staff: Staff[];
  onCallSchedule: OnCallSchedule | null;
}
