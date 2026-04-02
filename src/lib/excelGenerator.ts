import * as XLSX from 'xlsx';
import { OnCallSchedule, YearlyRoster } from './types';
import { format, eachDayOfInterval, getDay, startOfMonth, endOfMonth } from 'date-fns';

interface FlatEntry {
  date: string;
  dayOfWeek: number;
  isPublicHoliday: boolean;
  phName?: string;
  onCallStaffId: string | null;
  onCallStaffName: string | null;
}

export function generateExcel(
  schedule: OnCallSchedule & { entries: FlatEntry[]; phWeekendsCount: Record<string, number> },
  roster: YearlyRoster
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const { year, publicHolidays, staff, entries } = schedule;

  // Helper functions
  const getDayName = (d: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d];
  const getMonthName = (m: number) => ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'][m - 1];

  // 1. Create lookup: date -> shift code for each staff
  const rosterLookup: Map<string, Map<string, string>> = new Map(); // date -> (staffId -> shiftCode)
  for (const mr of roster.monthlyRosters) {
    for (const entry of mr.entries) {
      if (!rosterLookup.has(entry.date)) {
        rosterLookup.set(entry.date, new Map());
      }
      rosterLookup.get(entry.date)!.set(mr.staffId, entry.shiftCode);
    }
  }

  // 2. Master sheet
  const masterData = [
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

  // 3. Monthly sheets (horizontal layout: rows = staff, columns = dates)
  for (let month = 1; month <= 12; month++) {
    const monthStart = startOfMonth(new Date(year, month - 1, 1));
    const monthEnd = endOfMonth(monthStart);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const monthData: any[][] = [];

    // Row 1: Month title
    monthData.push([getMonthName(month) + ' ' + year]);
    monthData.push([]); // Empty row

    // Row 2: Header row (dates)
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
    const colWidths: any[] = [{ wch: 15 }]; // Staff name column
    for (let i = 0; i < daysInMonth.length; i++) {
      colWidths.push({ wch: 5 });
    }
    monthSheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, monthSheet, getMonthName(month).substring(0, 3));
  }

  // 4. Statistics sheet
  // Layout: Staff | Jan | Feb | ... | Dec | Year Total
  const statData: any[][] = [];

  // Header row
  statData.push(['On-Call Statistics', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  statData.push([]);

  // Sub-header for On-Call Days
  statData.push(['On-Call Days (Monthly)']);
  const ocDaysHeader: any[] = ['Staff'];
  for (let m = 1; m <= 12; m++) ocDaysHeader.push(getMonthName(m).substring(0, 3));
  ocDaysHeader.push('Year Total');
  statData.push(ocDaysHeader);

  // Find statistics for each staff
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

  // Sub-header for On-Call Weeks
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

  // Sub-header for On-Call PH Days
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

  // 5. PH list sheet
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

export function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?[\]]/g, '').slice(0, 31);
}