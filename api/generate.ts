import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eachDayOfInterval, parseISO, format, getDay, differenceInDays } from 'date-fns';

// Types
interface PublicHoliday {
  date: string;
  name: string;
  dayOfWeek: number;
}

interface AnnualLeave {
  startDate: string;
  endDate: string;
}

interface Staff {
  id: string;
  name: string;
  annualLeaves: AnnualLeave[];
}

interface RosterEntry {
  date: string;
  dayOfWeek: number;
  isPublicHoliday: boolean;
  phName?: string;
  onCallStaffId: string | null;
  onCallStaffName: string | null;
}

interface OnCallSchedule {
  year: number;
  publicHolidays: PublicHoliday[];
  staff: Staff[];
  entries: RosterEntry[];
  phWeekendsCount: Record<string, number>;
}

interface ScoreContext {
  staffId: string;
  consecutiveDays: number;
  lastOnCallDate: string | null;
  phWeekendsWorked: number;
  alBlocks: Map<string, number>;
}

// Hong Kong 2026 Public Holidays
const hongKong2026Holidays: PublicHoliday[] = [
  { date: '2026-01-01', name: "New Year's Day", dayOfWeek: 4 },
  { date: '2026-01-29', name: "Lunar New Year's Day", dayOfWeek: 3 },
  { date: '2026-01-30', name: "Second Day of Lunar New Year", dayOfWeek: 4 },
  { date: '2026-01-31', name: "Third Day of Lunar New Year", dayOfWeek: 5 },
  { date: '2026-04-03', name: "Good Friday", dayOfWeek: 5 },
  { date: '2026-04-04', name: "Day after Good Friday", dayOfWeek: 6 },
  { date: '2026-04-05', name: "Ching Ming Festival", dayOfWeek: 0 },
  { date: '2026-05-01', name: "Labour Day", dayOfWeek: 5 },
  { date: '2026-05-03', name: "Birthday of Buddha", dayOfWeek: 0 },
  { date: '2026-05-31', name: "Dragon Boat Festival", dayOfWeek: 0 },
  { date: '2026-07-01', name: "Hong Kong Special Administrative Region Establishment Day", dayOfWeek: 3 },
  { date: '2026-09-28', name: "Day after Mid-Autumn Festival", dayOfWeek: 2 },
  { date: '2026-10-01', name: "National Day", dayOfWeek: 4 },
  { date: '2026-10-07', name: "Chung Yeung Festival", dayOfWeek: 3 },
  { date: '2026-12-25', name: "Christmas Day", dayOfWeek: 5 },
  { date: '2026-12-26', name: "First Weekday after Christmas Day", dayOfWeek: 6 },
];

// Algorithm functions
function generateOnCallSchedule(year: number, staff: Staff[]): OnCallSchedule {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const allDays = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  }).map(d => format(d, 'yyyy-MM-dd'));

  const publicHolidays = hongKong2026Holidays.filter(h => h.date.startsWith(String(year)));
  const entries: RosterEntry[] = allDays.map(date => ({
    date,
    dayOfWeek: getDay(parseISO(date)),
    isPublicHoliday: publicHolidays.some(ph => ph.date === date),
    phName: publicHolidays.find(ph => ph.date === date)?.name,
    onCallStaffId: null,
    onCallStaffName: null,
  }));

  const staffContexts = new Map<string, ScoreContext>();
  staff.forEach(s => {
    const alBlocks = groupAnnualLeaves(s.annualLeaves);
    staffContexts.set(s.id, {
      staffId: s.id,
      consecutiveDays: 0,
      lastOnCallDate: null,
      phWeekendsWorked: 0,
      alBlocks,
    });
  });

  assignPHWeekends(entries, staff, staffContexts);
  assignALDays(entries, staff);
  fillRemainingDays(entries, staff, staffContexts);
  markConsecutiveOnCall(entries);

  const phWeekendsCount: Record<string, number> = {};
  staff.forEach(s => {
    phWeekendsCount[s.id] = staffContexts.get(s.id)!.phWeekendsWorked;
  });

  return { year, publicHolidays, staff, entries, phWeekendsCount };
}

function groupAnnualLeaves(leaves: AnnualLeave[]): Map<string, number> {
  const sorted = [...leaves].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const blocks = new Map<string, number>();
  let currentBlock = 0;

  sorted.forEach(leave => {
    const lastEnd = Array.from(blocks.entries()).pop()?.[1];
    if (lastEnd === undefined || differenceInDays(parseISO(leave.startDate), parseISO(lastEnd as unknown as string)) > 13) {
      currentBlock++;
    }
    blocks.set(leave.startDate, currentBlock);
  });

  return blocks;
}

function assignPHWeekends(entries: RosterEntry[], staff: Staff[], staffContexts: Map<string, ScoreContext>) {
  const phWeekendDays = entries.filter(e => e.isPublicHoliday && (e.dayOfWeek === 0 || e.dayOfWeek === 6));
  const phWeekendAssignments = new Map<string, number>();

  phWeekendDays.forEach(day => {
    const sortedStaff = [...staff].sort((a, b) => {
      const aCount = phWeekendAssignments.get(a.id) || 0;
      const bCount = phWeekendAssignments.get(b.id) || 0;
      return aCount - bCount;
    });

    const availableStaff = sortedStaff.filter(s => !isOnAL(s, day.date));
    if (availableStaff.length > 0) {
      const chosen = availableStaff[0];
      assignOnCall(entries, day.date, chosen.id, chosen.name);
      phWeekendAssignments.set(chosen.id, (phWeekendAssignments.get(chosen.id) || 0) + 1);
      staffContexts.get(chosen.id)!.phWeekendsWorked++;
    }
  });
}

function assignALDays(entries: RosterEntry[], staff: Staff[]) {
  entries.forEach(entry => {
    if (entry.onCallStaffId) return;
    const availableStaff = staff.filter(s => !isOnAL(s, entry.date));
    if (availableStaff.length === 1) {
      const chosen = availableStaff[0];
      assignOnCall(entries, entry.date, chosen.id, chosen.name);
    }
  });
}

function fillRemainingDays(entries: RosterEntry[], staff: Staff[], staffContexts: Map<string, ScoreContext>) {
  entries.forEach(entry => {
    if (entry.onCallStaffId) return;

    const scores = staff.map(s => ({
      staff: s,
      score: calculateScore(s, entry, staffContexts),
    }));

    scores.sort((a, b) => a.score - b.score);

    if (scores.length > 0 && scores[0].score < Infinity) {
      const chosen = scores[0].staff;
      assignOnCall(entries, entry.date, chosen.id, chosen.name);
    }
  });
}

function calculateScore(staff: Staff, entry: RosterEntry, staffContexts: Map<string, ScoreContext>): number {
  const ctx = staffContexts.get(staff.id)!;
  let score = 0;

  if (ctx.consecutiveDays > 0) {
    score += 100 * ctx.consecutiveDays;
  }

  if (isOnAL(staff, entry.date)) {
    score += 1000;
  }

  score -= (10 - ctx.phWeekendsWorked);

  return score;
}

function markConsecutiveOnCall(entries: RosterEntry[]) {
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    if (prev.onCallStaffId === curr.onCallStaffId && prev.onCallStaffId !== null) {
      // Consecutive on-call tracked
    }
  }
}

function isOnAL(staff: Staff, date: string): boolean {
  return staff.annualLeaves.some(al => {
    return date >= al.startDate && date <= al.endDate;
  });
}

function assignOnCall(entries: RosterEntry[], date: string, staffId: string, staffName: string) {
  const entry = entries.find(e => e.date === date);
  if (entry) {
    entry.onCallStaffId = staffId;
    entry.onCallStaffName = staffName;
  }
}

// Handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { year, staff } = req.body;

    if (!year || !staff || staff.length === 0) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const schedule = generateOnCallSchedule(year, staff);

    res.status(200).json({ success: true, schedule });
  } catch (error) {
    res.status(500).json({ error: 'Generation failed', details: String(error) });
  }
}
