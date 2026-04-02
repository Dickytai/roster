import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';

interface OnCallSchedule {
  year: number;
  publicHolidays: { date: string; name: string; dayOfWeek: number }[];
  staff: { id: string; name: string; annualLeaves: { startDate: string; endDate: string }[] }[];
  entries: { date: string; dayOfWeek: number; isPublicHoliday: boolean; phName?: string; onCallStaffId: string | null; onCallStaffName: string | null }[];
  phWeekendsCount: Record<string, number>;
}

interface ExcelRequest {
  schedule: OnCallSchedule;
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

function parseISO(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function generateExcel(schedule: OnCallSchedule): ArrayBuffer {
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
      [getMonthName(month) + ' ' + schedule.year],
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { schedule } = req.body as ExcelRequest;

    if (!schedule) {
      res.status(400).json({ error: 'Missing schedule' });
      return;
    }

    const buffer = generateExcel(schedule);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="roster-${schedule.year}.xlsx"`);
    res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Excel generation error:', error);
    res.status(500).json({ error: 'Excel generation failed' });
  }
}
