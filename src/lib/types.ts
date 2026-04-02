// ============================================
// Staff Types
// ============================================

export type Position = 'GM' | 'SNO' | 'RN' | 'CA' | 'SSA' | 'Radiographer';

export interface Staff {
  id: string;
  name: string;           // Full name e.g., "Chan, Man Wai"
  shortName: string;     // Short name e.g., "Addie"
  position: Position;
  canOnCall: boolean;
  annualLeaves: AnnualLeave[];
}

export interface AnnualLeave {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

// ============================================
// Public Holiday Types
// ============================================

export interface PublicHoliday {
  date: string;        // YYYY-MM-DD
  name: string;        // English name
  dayOfWeek: number;   // 0=Sun, 1=Mon, ... 6=Sat
}

// ============================================
// On-Call Types
// ============================================

// On-call assignment for a single day
export interface OnCallDay {
  date: string;        // YYYY-MM-DD
  dayOfWeek: number;    // 0=Sun, 1=Mon, ... 6=Sat
  isPublicHoliday: boolean;
  phName?: string;
  onCallStaffIds: [string | null, string | null, string | null]; // Up to 3 people
}

// Weekly grouping of on-call days
export interface OnCallWeek {
  weekNumber: number;  // 1-52/53
  startDate: string;    // Monday
  endDate: string;      // Sunday
  isPhWeek: boolean;    // Contains any public holiday
  phDays: number;       // Number of PH days in this week
  days: OnCallDay[];
}

// Full year on-call schedule
export interface OnCallSchedule {
  year: number;
  publicHolidays: PublicHoliday[];
  staff: Staff[];
  weeks: OnCallWeek[];
  // Quick lookup maps
  dateToOnCall: Map<string, OnCallDay>;
  staffOnCallDates: Map<string, string[]>; // staffId -> dates they're on-call
}

// ============================================
// Shift Code Types
// ============================================

export type ShiftCode =
  | 'PH'    // Public Holiday - staff doesn't work, it's a holiday
  | 'HD'    // Half Day - GM/SNO on Saturday
  | 'HD1'   // Half Day variant 1
  | 'HD2'   // Half Day variant 2
  | 'HD3'   // Half Day variant 3
  | 'HD4'   // Half Day variant 4
  | 'HDAL'  // Half Day Annual Leave - on AL during PH
  | 'D'     // Day shift (standard)
  | 'D1'    // Day shift variant 1
  | 'D2'    // Day shift variant 2
  | 'D3'    // Day shift variant 3
  | 'E'     // Evening shift
  | 'E1'    // Evening shift variant 1
  | 'L'     // Late shift
  | 'B6'    // Special shift for Yoyo/Kathy
  | 'AL'    // Annual Leave
  | 'DO'    // Duty Off / Day Off
  | 'SL'    // Sick Leave
  | 'SD'    // Study Day
  | 'CT'    // Comp Time
  | 'ML'    // Maternity Leave
  | 'PL'    // Paternity Leave
  | 'JSL'   // Jury Service Leave
  | 'CL'    // Compassionate Leave
  | '';     // Empty - no shift assigned

// ============================================
// Roster Types
// ============================================

// Roster entry for a single staff on a single day
export interface RosterEntry {
  date: string;
  dayOfWeek: number;
  shiftCode: ShiftCode;
  isOnCall: boolean;     // True if this person is on-call that day
  isPhDay: boolean;
  phName?: string;
}

// Monthly roster for one staff member
export interface MonthlyRoster {
  year: number;
  month: number;          // 1-12
  staffId: string;
  entries: RosterEntry[];
}

// Full year roster
export interface YearlyRoster {
  year: number;
  monthlyRosters: MonthlyRoster[];
}

// ============================================
// Statistics Types
// ============================================

export interface StaffStatistics {
  staffId: string;
  staffName: string;
  position: Position;

  // On-call statistics
  onCallDaysMonthly: number[];  // 12 months
  onCallDaysYearly: number;

  onCallWeeksMonthly: number[];  // 12 months
  onCallWeeksYearly: number;

  onCallPhDaysMonthly: number[]; // PH days on-call
  onCallPhDaysYearly: number;

  // Working hours
  workDaysMonthly: number[];     // Days actually worked (not AL, not on-call)
  workDaysYearly: number;
  alDaysMonthly: number[];       // AL days taken
  alDaysYearly: number;

  // Balance
  totalWorkingHoursMonthly: number[];
  totalWorkingHoursYearly: number;
}

// ============================================
// Excel Generation Types
// ============================================

export interface ExcelGenerationOptions {
  year: number;
  publicHolidays: PublicHoliday[];
  staff: Staff[];
  onCallSchedule: OnCallSchedule;
  roster: YearlyRoster;
  statistics: StaffStatistics[];
}

// ============================================
// Store Types
// ============================================

// Extended OnCallSchedule type that includes flattened entries for UI/export
export interface OnCallScheduleWithEntries extends OnCallSchedule {
  entries: Array<{
    date: string;
    dayOfWeek: number;
    isPublicHoliday: boolean;
    phName?: string;
    onCallStaffId: string | null;
    onCallStaffName: string | null;
  }>;
  phWeekendsCount: Record<string, number>;
}

export interface GenerationState {
  step: 1 | 2 | 3;
  year: number;
  publicHolidays: PublicHoliday[];
  staff: Staff[];
  onCallSchedule: OnCallScheduleWithEntries | null;
}
