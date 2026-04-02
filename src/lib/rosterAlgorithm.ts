import {
  Staff,
  PublicHoliday,
  AnnualLeave,
  OnCallSchedule,
  OnCallDay,
  OnCallWeek,
  ShiftCode,
  YearlyRoster,
  MonthlyRoster,
  RosterEntry,
  StaffStatistics,
  Position,
} from './types';
import { eachDayOfInterval, parseISO, format, getDay, differenceInDays, addDays, isWithinInterval } from 'date-fns';

// ============================================
// Constants
// ============================================

const STAFF_WITH_HD_ON_SAT: string[] = ['Chan, Man Wai', 'Ng Suet Ping, Yoko', 'Li Mui Ying'];
const SHIFT_HOURS: Record<string, number> = {
  'D': 8, 'D1': 8.5, 'D2': 9, 'D3': 9,
  'E': 8.5, 'E1': 8.5,
  'L': 11,
  'HD': 4, 'HD1': 4, 'HD2': 5, 'HD3': 4, 'HD4': 4,
  'B6': 8,
  'PH': 0, 'AL': 0, 'DO': 0, 'SL': 0, 'SD': 0, 'CT': 0, 'ML': 0, 'PL': 0, 'JSL': 0, 'CL': 0, 'HDAL': 4,
};

// ============================================
// Helper Functions
// ============================================

function isDateInAl(date: string, al: AnnualLeave[]): boolean {
  return al.some(a => date >= a.startDate && date <= a.endDate);
}

function getAlDatesInRange(startDate: string, endDate: string, al: AnnualLeave[]): string[] {
  const dates: string[] = [];
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const allDays = eachDayOfInterval({ start, end });

  for (const day of allDays) {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (isDateInAl(dateStr, al)) {
      dates.push(dateStr);
    }
  }
  return dates;
}

function mergeAlBlocks(al: AnnualLeave[]): AnnualLeave[] {
  if (al.length === 0) return [];

  // Flatten all AL dates
  const allDates: Date[] = [];
  for (const leave of al) {
    const start = parseISO(leave.startDate);
    const end = parseISO(leave.endDate);
    let current = start;
    while (current <= end) {
      allDates.push(new Date(current));
      current = addDays(current, 1);
    }
  }

  // Sort and merge blocks within 13 days
  allDates.sort((a, b) => a.getTime() - b.getTime());
  const blocks: AnnualLeave[] = [];
  let currentBlock: Date[] = [allDates[0]];

  for (let i = 1; i < allDates.length; i++) {
    const diff = differenceInDays(allDates[i], currentBlock[currentBlock.length - 1]);
    if (diff <= 13) {
      currentBlock.push(allDates[i]);
    } else {
      blocks.push({
        startDate: format(currentBlock[0], 'yyyy-MM-dd'),
        endDate: format(currentBlock[currentBlock.length - 1], 'yyyy-MM-dd'),
      });
      currentBlock = [allDates[i]];
    }
  }
  blocks.push({
    startDate: format(currentBlock[0], 'yyyy-MM-dd'),
    endDate: format(currentBlock[currentBlock.length - 1], 'yyyy-MM-dd'),
  });

  return blocks;
}

// ============================================
// Week Generation
// ============================================

function generateWeeks(year: number): OnCallWeek[] {
  const weeks: OnCallWeek[] = [];
  let weekNumber = 1;

  // First partial week: Jan 1-4 (if needed to complete the first week)
  const jan1 = parseISO(`${year}-01-01`);
  const firstDayOfWeek = getDay(jan1); // 0=Sun, 1=Mon, ...

  // Find first Monday
  let currentDate = jan1;
  if (firstDayOfWeek !== 1) {
    // Go to next Monday
    currentDate = addDays(jan1, (8 - firstDayOfWeek) % 7);
  }

  while (currentDate.getFullYear() === year) {
    const weekStart = currentDate;
    const weekEnd = addDays(weekStart, 6);

    if (weekEnd.getFullYear() > year) {
      // Only include days that are still in this year
      break;
    }

    weeks.push({
      weekNumber,
      startDate: format(weekStart, 'yyyy-MM-dd'),
      endDate: format(weekEnd, 'yyyy-MM-dd'),
      isPhWeek: false,
      phDays: 0,
      days: [],
    });

    currentDate = addDays(weekEnd, 1);
    weekNumber++;
  }

  return weeks;
}

// ============================================
// On-Call Assignment Algorithm
// ============================================

function assignOnCallToWeeks(
  year: number,
  weeks: OnCallWeek[],
  publicHolidays: PublicHoliday[],
  staff: Staff[]
): OnCallSchedule {
  const onCallStaff = staff.filter(s => s.canOnCall);
  const nStaff = onCallStaff.length;

  if (nStaff === 0) {
    throw new Error('No staff available for on-call assignment');
  }

  // Create PH date set
  const phDates = new Set(publicHolidays.map(ph => ph.date));

  // Build week structures with days
  for (const week of weeks) {
    const weekStart = parseISO(week.startDate);
    const weekEnd = parseISO(week.endDate);
    const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    for (const day of allDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayOfWeek = getDay(day);
      const isPh = phDates.has(dateStr);
      const ph = publicHolidays.find(p => p.date === dateStr);

      week.days.push({
        date: dateStr,
        dayOfWeek,
        isPublicHoliday: isPh,
        phName: ph?.name,
        onCallStaffIds: [null, null, null],
      });

      if (isPh) {
        week.isPhWeek = true;
        week.phDays++;
      }
    }
  }

  // Initialize tracking maps
  const assigned: Map<string, string[]> = new Map(); // weekStart -> staffIds
  const phAssigned: Map<string, number> = new Map(onCallStaff.map(s => [s.id, 0]));
  const onCallWeeksCount: Map<string, number> = new Map(onCallStaff.map(s => [s.id, 0]));

  // Build AL date lookup
  const alDatesMap: Map<string, Set<string>> = new Map();
  for (const s of onCallStaff) {
    alDatesMap.set(s.id, new Set());
    for (const al of s.annualLeaves) {
      const alDates = getAlDatesInRange(al.startDate, al.endDate, s.annualLeaves);
      alDates.forEach(d => alDatesMap.get(s.id)!.add(d));
    }
  }

  // Can assign function
  function canAssignWeek(staffId: string, week: OnCallWeek): boolean {
    const alDates = alDatesMap.get(staffId) || new Set();
    for (const day of week.days) {
      if (alDates.has(day.date)) {
        return false;
      }
    }
    return true;
  }

  // Calculate PH target
  const totalPhDays = publicHolidays.length * 3;
  const phPerPerson = totalPhDays / nStaff;
  const basePh = Math.floor(phPerPerson);
  const extraPh = Math.floor(totalPhDays % nStaff);

  const targetPh: Map<string, number> = new Map();
  onCallStaff.forEach((s, i) => {
    targetPh.set(s.id, i < extraPh ? basePh + 3 : basePh);
  });

  // Phase 1: Assign PH weeks
  const phWeeks = weeks.filter(w => w.isPhWeek).sort((a, b) => b.phDays - a.phDays);

  for (const week of phWeeks) {
    // Find candidates: not on AL and under target
    const candidates = onCallStaff
      .filter(s => {
        const currentPh = phAssigned.get(s.id) || 0;
        return canAssignWeek(s.id, week) && currentPh + week.phDays <= targetPh.get(s.id)!;
      })
      .sort((a, b) => (phAssigned.get(a.id) || 0) - (phAssigned.get(b.id) || 0));

    // Fallback: any available
    const fallback = onCallStaff
      .filter(s => canAssignWeek(s.id, week))
      .sort((a, b) => (phAssigned.get(a.id) || 0) - (phAssigned.get(b.id) || 0));

    const available = candidates.length >= 3 ? candidates : fallback;
    const selected = available.slice(0, 3);

    assigned.set(week.startDate, selected.map(s => s.id));
    selected.forEach(s => {
      phAssigned.set(s.id, (phAssigned.get(s.id) || 0) + week.phDays);
      onCallWeeksCount.set(s.id, (onCallWeeksCount.get(s.id) || 0) + 1);
    });
  }

  // Phase 2: Assign AL blocks (before/after)
  for (const s of onCallStaff) {
    const blocks = mergeAlBlocks(s.annualLeaves);

    for (const block of blocks) {
      // Find the week containing the AL block start and end
      let firstWeek: OnCallWeek | undefined;
      let lastWeek: OnCallWeek | undefined;

      for (const w of weeks) {
        const wStart = parseISO(w.startDate);
        const wEnd = parseISO(w.endDate);
        const blockStart = parseISO(block.startDate);
        const blockEnd = parseISO(block.endDate);

        if (!firstWeek && isWithinInterval(blockStart, { start: wStart, end: wEnd })) {
          firstWeek = w;
        }
        if (!lastWeek && isWithinInterval(blockEnd, { start: wStart, end: wEnd })) {
          lastWeek = w;
        }
      }

      // Before AL: assign on-call to week before first AL week
      if (firstWeek) {
        const prevWeekStart = addDays(parseISO(firstWeek.startDate), -7);
        const prevWeek = weeks.find(w => w.startDate === format(prevWeekStart, 'yyyy-MM-dd'));
        if (prevWeek && prevWeek.startDate >= `${year}-01-01`) {
          if (!assigned.has(prevWeek.startDate)) {
            assigned.set(prevWeek.startDate, []);
          }
          const current = assigned.get(prevWeek.startDate)!;
          if (!current.includes(s.id) && current.length < 3) {
            current.push(s.id);
            onCallWeeksCount.set(s.id, (onCallWeeksCount.get(s.id) || 0) + 1);
          }
        }
      }

      // After AL: assign on-call to week after last AL week
      if (lastWeek) {
        const nextWeekStart = addDays(parseISO(lastWeek.endDate), 1);
        const nextWeek = weeks.find(w => w.startDate === format(nextWeekStart, 'yyyy-MM-dd'));
        if (nextWeek && nextWeek.endDate <= `${year}-12-31`) {
          if (!assigned.has(nextWeek.startDate)) {
            assigned.set(nextWeek.startDate, []);
          }
          const current = assigned.get(nextWeek.startDate)!;
          if (!current.includes(s.id) && current.length < 3) {
            current.push(s.id);
            onCallWeeksCount.set(s.id, (onCallWeeksCount.get(s.id) || 0) + 1);
          }
        }
      }
    }
  }

  // Phase 3: Fill remaining weeks (target weeks = 52 * 3 / nStaff)
  const totalTarget = Math.floor(52 * 3 / nStaff);

  for (const week of weeks) {
    if (assigned.has(week.startDate) && assigned.get(week.startDate)!.length >= 3) {
      continue;
    }

    const currentAssigned = assigned.get(week.startDate) || [];
    const need = 3 - currentAssigned.length;
    if (need <= 0) continue;

    // Find candidates: under target, not on AL, not already assigned, not consecutive
    const candidates = onCallStaff
      .filter(s => {
        if (onCallWeeksCount.get(s.id)! >= totalTarget) return false;
        if (!canAssignWeek(s.id, week)) return false;
        if (currentAssigned.includes(s.id)) return false;

        // Check consecutive weeks
        const prevWeekStart = addDays(parseISO(week.startDate), -7);
        const prevAssigned = assigned.get(format(prevWeekStart, 'yyyy-MM-dd'));
        if (prevAssigned?.includes(s.id)) return false;

        return true;
      })
      .sort((a, b) => (onCallWeeksCount.get(a.id) || 0) - (onCallWeeksCount.get(b.id) || 0));

    for (const s of candidates) {
      if (currentAssigned.length >= 3) break;
      currentAssigned.push(s.id);
      onCallWeeksCount.set(s.id, (onCallWeeksCount.get(s.id) || 0) + 1);
    }

    assigned.set(week.startDate, currentAssigned);
  }

  // Assign to days
  for (const week of weeks) {
    const assignedIds = assigned.get(week.startDate) || [];
    for (const day of week.days) {
      day.onCallStaffIds = [
        assignedIds[0] || null,
        assignedIds[1] || null,
        assignedIds[2] || null,
      ];
    }
  }

  // Build date to on-call lookup
  const dateToOnCall: Map<string, OnCallDay> = new Map();
  for (const week of weeks) {
    for (const day of week.days) {
      dateToOnCall.set(day.date, day);
    }
  }

  // Build staff on-call dates lookup
  const staffOnCallDates: Map<string, string[]> = new Map();
  for (const s of onCallStaff) {
    staffOnCallDates.set(s.id, []);
  }
  for (const week of weeks) {
    for (const day of week.days) {
      for (const staffId of day.onCallStaffIds) {
        if (staffId) {
          staffOnCallDates.get(staffId)!.push(day.date);
        }
      }
    }
  }

  return {
    year,
    publicHolidays,
    staff,
    weeks,
    dateToOnCall,
    staffOnCallDates,
  };
}

// ============================================
// Shift Code Calculation
// ============================================

export function calculateShiftCode(
  staffId: string,
  staffName: string,
  _position: Position,
  date: string,
  dayOfWeek: number,
  isPublicHoliday: boolean,
  onCallSchedule: OnCallSchedule
): ShiftCode {
  const { dateToOnCall, staff } = onCallSchedule;
  const dayData = dateToOnCall.get(date);
  const isOnCall = dayData?.onCallStaffIds.includes(staffId) || false;

  const staffMember = staff.find(s => s.id === staffId);
  const isOnAl = staffMember ? isDateInAl(date, staffMember.annualLeaves) : false;

  // Find which week this date belongs to and get week number
  let weekNumber = 0;
  for (const week of onCallSchedule.weeks) {
    if (date >= week.startDate && date <= week.endDate) {
      weekNumber = week.weekNumber;
      break;
    }
  }

  // PH Day logic
  if (isPublicHoliday) {
    if (isOnAl) {
      return 'HDAL'; // On AL during PH
    }
    if (dayOfWeek === 0) { // Sunday
      return 'DO';
    }
    if (dayOfWeek === 6) { // Saturday
      if (STAFF_WITH_HD_ON_SAT.includes(staffName)) {
        return 'HD';
      }
    }
    // Staff is on PH - they work
    return 'PH';
  }

  // AL Day
  if (isOnAl) {
    return 'AL';
  }

  // Sunday logic
  if (dayOfWeek === 0) {
    return 'DO';
  }

  // Saturday logic
  if (dayOfWeek === 6) {
    if (STAFF_WITH_HD_ON_SAT.includes(staffName)) {
      return 'HD';
    }
    if (staffName === 'Li Mui Ying') {
      return 'HD1';
    }
    if (isOnCall) {
      // Yoyo, Kathy, Ivy patterns
      if (staffName === 'Huang Huanrao, Yoyo') {
        return weekNumber % 2 === 1 ? 'HD2' : 'B6';
      }
      if (staffName === 'Lee Ka Po, Kathy') {
        return weekNumber % 2 === 0 ? 'HD2' : 'B6';
      }
      if (staffName === 'Fan Hoi Wan, Ivy') {
        return weekNumber % 2 === 0 ? 'D' : 'DO';
      }
      return 'D';
    }
    return 'DO';
  }

  // Weekday logic
  if (isOnCall) {
    // Yoyo, Kathy patterns for weekdays
    if (staffName === 'Huang Huanrao, Yoyo') {
      return weekNumber % 2 === 1 ? 'D1' : 'B6';
    }
    if (staffName === 'Lee Ka Po, Kathy') {
      return weekNumber % 2 === 0 ? 'D1' : 'B6';
    }
    // Others get E if on-call, D otherwise
    return 'D';
  }

  // Not on-call on weekday
  if (staffName === 'Fan Hoi Wan, Ivy') {
    return 'DO';
  }

  return 'DO';
}

// ============================================
// Roster Generation
// ============================================

export function generateYearlyRoster(onCallSchedule: OnCallSchedule): YearlyRoster {
  const { year, staff, weeks } = onCallSchedule;
  const monthlyRosters: MonthlyRoster[] = [];

  for (const s of staff) {
    for (let month = 1; month <= 12; month++) {
      const monthWeeks = weeks.filter(w => {
        const wStart = parseISO(w.startDate);
        return wStart.getMonth() + 1 === month;
      });

      const entries: RosterEntry[] = [];

      for (const week of monthWeeks) {
        for (const day of week.days) {
          const shiftCode = calculateShiftCode(
            s.id,
            s.name,
            s.position,
            day.date,
            day.dayOfWeek,
            day.isPublicHoliday,
            onCallSchedule
          );

          entries.push({
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            shiftCode,
            isOnCall: day.onCallStaffIds.includes(s.id),
            isPhDay: day.isPublicHoliday,
            phName: day.phName,
          });
        }
      }

      monthlyRosters.push({
        year,
        month,
        staffId: s.id,
        entries,
      });
    }
  }

  return { year, monthlyRosters };
}

// ============================================
// Statistics Calculation
// ============================================

export function calculateStatistics(
  onCallSchedule: OnCallSchedule,
  roster: YearlyRoster
): StaffStatistics[] {
  const { staff } = onCallSchedule;
  const statistics: StaffStatistics[] = [];

  for (const s of staff) {
    const monthData = roster.monthlyRosters.filter(r => r.staffId === s.id);
    if (monthData.length === 0) continue;

    const onCallDaysMonthly: number[] = [];
    const onCallWeeksMonthly: number[] = [];
    const onCallPhDaysMonthly: number[] = [];
    const workDaysMonthly: number[] = [];
    const alDaysMonthly: number[] = [];
    const totalWorkingHoursMonthly: number[] = [];

    let onCallDaysYearly = 0;
    let onCallWeeksYearly = 0;
    let onCallPhDaysYearly = 0;
    let workDaysYearly = 0;
    let alDaysYearly = 0;
    let totalWorkingHoursYearly = 0;

    for (let month = 1; month <= 12; month++) {
      const monthRoster = monthData.find(r => r.month === month);
      if (!monthRoster) {
        onCallDaysMonthly.push(0);
        onCallWeeksMonthly.push(0);
        onCallPhDaysMonthly.push(0);
        workDaysMonthly.push(0);
        alDaysMonthly.push(0);
        totalWorkingHoursMonthly.push(0);
        continue;
      }

      let monthOnCallDays = 0;
      let monthPhDays = 0;
      let monthWorkDays = 0;
      let monthAlDays = 0;
      let monthHours = 0;

      for (const entry of monthRoster.entries) {
        if (entry.isOnCall) {
          monthOnCallDays++;
          if (entry.isPhDay) {
            monthPhDays++;
          }
          monthHours += SHIFT_HOURS['D'] || 8; // On-call day = standard D hours
        } else if (entry.shiftCode === 'AL') {
          monthAlDays++;
          monthHours += SHIFT_HOURS['AL'] || 0;
        } else if (['D', 'D1', 'D2', 'D3', 'E', 'E1', 'L', 'HD', 'HD1', 'HD2', 'HD3', 'HD4', 'B6'].includes(entry.shiftCode)) {
          monthWorkDays++;
          monthHours += SHIFT_HOURS[entry.shiftCode] || 8;
        } else if (entry.shiftCode === 'HDAL') {
          monthHours += SHIFT_HOURS['HDAL'] || 4;
        }
      }

      onCallDaysMonthly.push(monthOnCallDays);
      onCallWeeksMonthly.push(Math.round(monthOnCallDays / 7 * 10) / 10); // Approximate weeks
      onCallPhDaysMonthly.push(monthPhDays);
      workDaysMonthly.push(monthWorkDays);
      alDaysMonthly.push(monthAlDays);
      totalWorkingHoursMonthly.push(monthHours);

      onCallDaysYearly += monthOnCallDays;
      onCallPhDaysYearly += monthPhDays;
      workDaysYearly += monthWorkDays;
      alDaysYearly += monthAlDays;
      totalWorkingHoursYearly += monthHours;
    }

    onCallWeeksYearly = onCallDaysYearly / 7;

    statistics.push({
      staffId: s.id,
      staffName: s.shortName,
      position: s.position,
      onCallDaysMonthly,
      onCallDaysYearly,
      onCallWeeksMonthly,
      onCallWeeksYearly,
      onCallPhDaysMonthly,
      onCallPhDaysYearly,
      workDaysMonthly,
      workDaysYearly,
      alDaysMonthly,
      alDaysYearly,
      totalWorkingHoursMonthly,
      totalWorkingHoursYearly,
    });
  }

  return statistics;
}

// ============================================
// Main Export Function
// ============================================

export function generateOnCallSchedule(
  year: number,
  publicHolidays: PublicHoliday[],
  staff: Staff[]
): OnCallSchedule & { entries: any[]; phWeekendsCount: Record<string, number> } {
  // Generate weeks
  const weeks = generateWeeks(year);

  // Assign on-call
  const onCallSchedule = assignOnCallToWeeks(year, weeks, publicHolidays, staff);

  // Flatten to entries for backwards compatibility
  const entries: any[] = [];
  const phWeekendsCount: Record<string, number> = {};
  staff.forEach(s => phWeekendsCount[s.id] = 0);

  for (const week of weeks) {
    for (const day of week.days) {
      for (const staffId of day.onCallStaffIds) {
        if (staffId) {
          const staffMember = staff.find(s => s.id === staffId);
          entries.push({
            date: day.date,
            dayOfWeek: day.dayOfWeek,
            isPublicHoliday: day.isPublicHoliday,
            phName: day.phName,
            onCallStaffId: staffId,
            onCallStaffName: staffMember?.name || '',
          });
          // Count PH weekends
          if (day.isPublicHoliday && (day.dayOfWeek === 0 || day.dayOfWeek === 6)) {
            phWeekendsCount[staffId] = (phWeekendsCount[staffId] || 0) + 1;
          }
        }
      }
    }
  }

  return {
    ...onCallSchedule,
    entries,
    phWeekendsCount,
  };
}

export function generateFullRosterSystem(
  year: number,
  publicHolidays: PublicHoliday[],
  staff: Staff[]
): {
  onCallSchedule: OnCallSchedule;
  roster: YearlyRoster;
  statistics: StaffStatistics[];
} {
  // Generate weeks
  const weeks = generateWeeks(year);

  // Assign on-call
  const onCallSchedule = assignOnCallToWeeks(year, weeks, publicHolidays, staff);

  // Generate roster with shift codes
  const roster = generateYearlyRoster(onCallSchedule);

  // Calculate statistics
  const statistics = calculateStatistics(onCallSchedule, roster);

  return { onCallSchedule, roster, statistics };
}
