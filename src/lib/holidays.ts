import { PublicHoliday } from './types';

// Hong Kong 2026 Public Holidays
export const hongKong2026Holidays: PublicHoliday[] = [
  { date: '2026-01-01', name: 'New Year\'s Day', dayOfWeek: 4 },
  { date: '2026-01-29', name: 'Lunar New Year\'s Day', dayOfWeek: 3 },
  { date: '2026-01-30', name: 'Second Day of Lunar New Year', dayOfWeek: 4 },
  { date: '2026-01-31', name: 'Third Day of Lunar New Year', dayOfWeek: 5 },
  { date: '2026-02-14', name: 'Valentine\'s Day', dayOfWeek: 6 }, // Not a PH, but falls on Saturday
  { date: '2026-04-03', name: 'Good Friday', dayOfWeek: 5 },
  { date: '2026-04-04', name: 'Day after Good Friday', dayOfWeek: 6 },
  { date: '2026-04-05', name: 'Ching Ming Festival', dayOfWeek: 0 },
  { date: '2026-05-01', name: 'Labour Day', dayOfWeek: 5 },
  { date: '2026-05-03', name: 'Birthday of Buddha', dayOfWeek: 0 },
  { date: '2026-05-31', name: 'Dragon Boat Festival', dayOfWeek: 0 },
  { date: '2026-07-01', name: 'Hong Kong Special Administrative Region Establishment Day', dayOfWeek: 3 },
  { date: '2026-09-28', name: 'Day after Mid-Autumn Festival', dayOfWeek: 2 },
  { date: '2026-10-01', name: 'National Day', dayOfWeek: 4 },
  { date: '2026-10-07', name: 'Chung Yeung Festival', dayOfWeek: 3 },
  { date: '2026-12-25', name: 'Christmas Day', dayOfWeek: 5 },
  { date: '2026-12-26', name: 'First Weekday after Christmas Day', dayOfWeek: 6 },
];

// Actual statutory public holidays (weekend PHs that are observed)
export const statutoryHolidays2026 = hongKong2026Holidays.filter(
  h => h.dayOfWeek === 0 || h.dayOfWeek === 6 || !h.date.includes('Valentine')
);

export function getHolidayByDate(date: string): PublicHoliday | undefined {
  return hongKong2026Holidays.find(h => h.date === date);
}

export function isPublicHoliday(date: string): boolean {
  return hongKong2026Holidays.some(h => h.date === date);
}

export function isWeekend(date: string): boolean {
  const d = new Date(date);
  return d.getDay() === 0 || d.getDay() === 6;
}
