import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { format, parseISO, eachDayOfInterval, getDay, startOfMonth, endOfMonth } from 'date-fns';

interface FlatEntry {
  date: string;
  dayOfWeek: number;
  isPublicHoliday: boolean;
  phName?: string;
  onCallStaffId: string | null;
  onCallStaffName: string | null;
}

interface OnCallSchedule {
  year: number;
  publicHolidays: { date: string; name: string; dayOfWeek: number }[];
  staff: { id: string; name: string; shortName: string; position: string; canOnCall: boolean; annualLeaves: { startDate: string; endDate: string }[] }[];
  entries: FlatEntry[];
  phWeekendsCount: Record<string, number>;
}

interface RosterEntry {
  date: string;
  dayOfWeek: number;
  shiftCode: string;
  isOnCall: boolean;
  isPhDay: boolean;
  phName?: string;
}

interface MonthlyRoster {
  year: number;
  month: number;
  staffId: string;
  entries: RosterEntry[];
}

interface YearlyRoster {
  year: number;
  monthlyRosters: MonthlyRoster[];
}

interface StaffStatistics {
  staffId: string;
  staffName: string;
  position: string;
  onCallDaysMonthly: number[];
  onCallDaysYearly: number;
  onCallWeeksMonthly: number[];
  onCallWeeksYearly: number;
  onCallPhDaysMonthly: number[];
  onCallPhDaysYearly: number;
}

interface ExcelRequest {
  schedule: OnCallSchedule;
  roster: YearlyRoster;
  statistics: StaffStatistics[];
}

function getDayName(dayOfWeek: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
}

function getMonthName(month: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][month - 1];
}

function generateExcel(
  schedule: OnCallSchedule,
  roster: YearlyRoster,
  _statistics: StaffStatistics[]
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const { year, publicHolidays, staff, entries } = schedule;

  // Create lookup: date -> shift code for each staff
  const rosterLookup: Map<string, Map<string, string>> = new Map();
  for (const mr of roster.monthlyRosters) {
    for (const entry of mr.entries) {
      if (!rosterLookup.has(entry.date)) {
        rosterLookup.set(entry.date, new Map());
      }
      rosterLookup.get(entry.date)!.set(mr.staffId, entry.shiftCode);
    }
  }

  // 1. Master sheet
  const masterData: any[][] = [
    ['Nurse Roster - ' + year],
    [],
    ['Public Holidays'],
    ...publicHolidays.map(ph => [ph.date, ph.name, getDayName(ph.dayOfWeek)]),
    [],
    ['Staff List'],
    ['ID', 'Name', 'Short Name', 'Position', 'Can On-Call'],
    ...staff.map(s => [s.id, s.name, s.shortName, s.position, s.canOnCall ? 'Yes' : 'No']),
  ];
  const masterSheet = XLSX.utils.aoa_to_sheet(masterData);
  XLSX.utils.book_append_sheet(workbook, masterSheet, 'Master');

  // 2. Monthly sheets (horizontal layout: rows = staff, columns = dates)
  for (let month = 1; month <= 12; month++) {
    const monthStart = startOfMonth(new Date(year, month - 1, 1));
    const monthEnd = endOfMonth(monthStart);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const monthData: any[][] = [];

    // Row 1: Month title
    monthData.push([getMonthName(month) + ' ' + year]);
    monthData.push([]);

    // Row 2: Date header row
    const headerRow: any[] = ['Staff'];
    for (const day of daysInMonth) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const entry = entries.find(e => e.date === dateStr);
      const phMarker = entry?.isPublicHoliday ? '*' : '';
      headerRow.push(`${format(day, 'd')}${phMarker}`);
    }
    monthData.push(headerRow);

    // Row 3: Day of week
    const dowRow: any[] = ['Day'];
    for (const day of daysInMonth) {
      dowRow.push(getDayName(getDay(day)));
    }
    monthData.push(dowRow);

    // Rows 4+: Each staff member's shift codes
    for (const s of staff) {
      const staffRow: any[] = [s.shortName || s.name];
      for (const day of daysInMonth) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const shiftCode = rosterLookup.get(dateStr)?.get(s.id) || '';
        staffRow.push(shiftCode);
      }
      monthData.push(staffRow);
    }

    const monthSheet = XLSX.utils.aoa_to_sheet(monthData);

    // Set column widths
    const colWidths: any[] = [{ wch: 15 }];
    for (let i = 0; i < daysInMonth.length; i++) {
      colWidths.push({ wch: 5 });
    }
    monthSheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, monthSheet, getMonthName(month).substring(0, 3));
  }

  // 3. Statistics sheet
  const statData: any[][] = [];

  statData.push(['On-Call Statistics', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  statData.push([]);

  // On-Call Days (Monthly)
  statData.push(['On-Call Days (Monthly)']);
  const ocDaysHeader: any[] = ['Staff'];
  for (let m = 1; m <= 12; m++) ocDaysHeader.push(getMonthName(m).substring(0, 3));
  ocDaysHeader.push('Year Total');
  statData.push(ocDaysHeader);

  for (const s of staff) {
    const staffOcDays: any[] = [s.shortName || s.name];
    let yearlyTotal = 0;
    for (let m = 1; m <= 12; m++) {
      const monthRoster = roster.monthlyRosters.find(r => r.staffId === s.id && r.month === m);
      const monthDays = monthRoster?.entries.filter(e => e.isOnCall).length || 0;
      staffOcDays.push(monthDays);
      yearlyTotal += monthDays;
    }
    staffOcDays.push(yearlyTotal);
    statData.push(staffOcDays);
  }

  statData.push([]);

  // On-Call Weeks (Monthly)
  statData.push(['On-Call Weeks (Monthly)']);
  const ocWeeksHeader: any[] = ['Staff'];
  for (let m = 1; m <= 12; m++) ocWeeksHeader.push(getMonthName(m).substring(0, 3));
  ocWeeksHeader.push('Year Total');
  statData.push(ocWeeksHeader);

  for (const s of staff) {
    const staffOcWeeks: any[] = [s.shortName || s.name];
    let yearlyTotal = 0;
    for (let m = 1; m <= 12; m++) {
      const monthRoster = roster.monthlyRosters.find(r => r.staffId === s.id && r.month === m);
      const monthWeeks = monthRoster?.entries.filter(e => e.isOnCall).length || 0;
      const weeks = Math.round(monthWeeks / 7 * 10) / 10;
      staffOcWeeks.push(weeks);
      yearlyTotal += weeks;
    }
    staffOcWeeks.push(Math.round(yearlyTotal * 10) / 10);
    statData.push(staffOcWeeks);
  }

  statData.push([]);

  // On-Call PH Days (Monthly)
  statData.push(['On-Call PH Days (Monthly)']);
  const ocPhHeader: any[] = ['Staff'];
  for (let m = 1; m <= 12; m++) ocPhHeader.push(getMonthName(m).substring(0, 3));
  ocPhHeader.push('Year Total');
  statData.push(ocPhHeader);

  for (const s of staff) {
    const staffOcPh: any[] = [s.shortName || s.name];
    let yearlyTotal = 0;
    for (let m = 1; m <= 12; m++) {
      const monthRoster = roster.monthlyRosters.find(r => r.staffId === s.id && r.month === m);
      const monthPhDays = monthRoster?.entries.filter(e => e.isOnCall && e.isPhDay).length || 0;
      staffOcPh.push(monthPhDays);
      yearlyTotal += monthPhDays;
    }
    staffOcPh.push(yearlyTotal);
    statData.push(staffOcPh);
  }

  statData.push([]);
  statData.push(['* PH = Public Holiday']);

  const statSheet = XLSX.utils.aoa_to_sheet(statData);
  XLSX.utils.book_append_sheet(workbook, statSheet, 'Statistics');

  // 4. PH list sheet
  const phListData: any[][] = [
    ['Public Holidays ' + year],
    [],
    ['Date', 'Day', 'Holiday Name'],
    ...publicHolidays.map(ph => [
      ph.date,
      getDayName(ph.dayOfWeek),
      ph.name,
    ]),
  ];
  const phSheet = XLSX.utils.aoa_to_sheet(phListData);
  XLSX.utils.book_append_sheet(workbook, phSheet, 'PH List');

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { schedule, roster, statistics } = req.body as ExcelRequest;

    if (!schedule) {
      res.status(400).json({ error: 'Missing schedule' });
      return;
    }

    const buffer = generateExcel(schedule, roster, statistics);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="roster-${schedule.year}.xlsx"`);
    res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Excel generation error:', error);
    res.status(500).json({ error: 'Excel generation failed' });
  }
}