import * as XLSX from 'xlsx';
import { OnCallSchedule } from './types';
import { format, parseISO } from 'date-fns';

export function generateExcel(schedule: OnCallSchedule): ArrayBuffer {
  const workbook = XLSX.utils.book_new();

  // 1. Master sheet
  const masterData = [
    ['Nurse Roster - ' + schedule.year],
    [],
    ['Public Holidays'],
    ...schedule.publicHolidays.map(ph => [ph.date, ph.name, getDayName(ph.dayOfWeek)]),
    [],
    ['Staff'],
    ['ID', 'Name'],
    ...schedule.staff.map(s => [s.id, s.name]),
  ];
  const masterSheet = XLSX.utils.aoa_to_sheet(masterData);
  XLSX.utils.book_append_sheet(workbook, masterSheet, 'Master');

  // 2. Monthly sheets
  for (let month = 1; month <= 12; month++) {
    const monthEntries = schedule.entries.filter(e => {
      const d = parseISO(e.date);
      return d.getMonth() + 1 === month;
    });

    const monthData = [
      [format(parseISO(`${schedule.year}-${String(month).padStart(2, '0')}-01`), 'MMMM yyyy')],
      [],
      ['Date', 'Day', 'On-Call', 'PH'],
      ...monthEntries.map(e => [
        e.date,
        getDayName(e.dayOfWeek),
        e.onCallStaffName || '',
        e.phName || '',
      ]),
    ];

    const monthSheet = XLSX.utils.aoa_to_sheet(monthData);
    XLSX.utils.book_append_sheet(workbook, monthSheet, getMonthName(month));
  }

  // 3. On-Call Statistics
  const statData = [
    ['On-Call Statistics'],
    [],
    ['Staff', 'PH Weekends', 'Total Days'],
    ...schedule.staff.map(s => {
      const totalDays = schedule.entries.filter(e => e.onCallStaffId === s.id).length;
      return [s.name, schedule.phWeekendsCount[s.id] || 0, totalDays];
    }),
  ];
  const statSheet = XLSX.utils.aoa_to_sheet(statData);
  XLSX.utils.book_append_sheet(workbook, statSheet, 'Statistics');

  // 4. PH sheets (one per public holiday)
  schedule.publicHolidays.forEach(ph => {
    const phEntries = schedule.entries.filter(e => e.date === ph.date);
    const phData = [
      [ph.name],
      [ph.date],
      [],
      ['On-Call'],
      ...phEntries.map(e => [e.onCallStaffName || '']),
    ];
    const phSheet = XLSX.utils.aoa_to_sheet(phData);
    XLSX.utils.book_append_sheet(workbook, phSheet, sanitizeSheetName(ph.name));
  });

  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
}

function getDayName(dayOfWeek: number): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
}

function getMonthName(month: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1];
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?[\]]/g, '').slice(0, 31);
}
