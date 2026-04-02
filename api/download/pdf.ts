import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore - pdfmake types are incomplete
import pdfMake from 'pdfmake/build/pdfmake';
// @ts-ignore
import pdfFonts from 'pdfmake/build/vfs_fonts';

interface OnCallSchedule {
  year: number;
  publicHolidays: { date: string; name: string; dayOfWeek: number }[];
  staff: { id: string; name: string; annualLeaves: { startDate: string; endDate: string }[] }[];
  entries: { date: string; dayOfWeek: number; isPublicHoliday: boolean; phName?: string; onCallStaffId: string | null; onCallStaffName: string | null }[];
  phWeekendsCount: Record<string, number>;
}

interface PdfRequest {
  schedule: OnCallSchedule;
}

// Initialize pdfMake with fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

function getDayName(dayOfWeek: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
}

function getMonthName(month: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1];
}

function parseISO(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function generatePdfContent(schedule: OnCallSchedule): any {
  const { year, publicHolidays, staff, entries, phWeekendsCount } = schedule;

  // Group entries by month
  const monthlyData: Record<number, typeof entries> = {};
  for (let m = 1; m <= 12; m++) {
    monthlyData[m] = entries.filter(e => {
      const d = parseISO(e.date);
      return d.getMonth() + 1 === m;
    });
  }

  // Build PDF content
  const content: any[] = [
    { text: `Nurse Roster - ${year}`, style: 'title' },
    { text: `Generated on ${new Date().toLocaleDateString()}`, style: 'subtitle' },
    { text: ' ', style: 'spacer' },
  ];

  // Summary statistics
  content.push(
    { text: 'Summary', style: 'header' },
    {
      table: {
        headerRows: 1,
        widths: ['*', 'auto', 'auto'],
        body: [
          [{ text: 'Staff', bold: true }, { text: 'PH Weekends', bold: true }, { text: 'Total Days', bold: true }],
          ...staff.map(s => [
            s.name,
            phWeekendsCount[s.id] || 0,
            entries.filter(e => e.onCallStaffId === s.id).length,
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
    { text: ' ', style: 'spacer' },
  );

  // Monthly rosters
  for (let month = 1; month <= 12; month++) {
    const monthEntries = monthlyData[month];
    if (monthEntries.length === 0) continue;

    content.push(
      { text: getMonthName(month), style: 'header' },
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', 'auto'],
          body: [
            [{ text: 'Date', bold: true }, { text: 'Day', bold: true }, { text: 'On-Call', bold: true }, { text: 'PH', bold: true }],
            ...monthEntries.map(e => [
              e.date,
              getDayName(e.dayOfWeek),
              e.onCallStaffName || '-',
              e.phName || '-',
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      { text: ' ', style: 'spacer' },
    );
  }

  // Public Holidays section
  content.push(
    { text: 'Public Holidays', style: 'header' },
    {
      table: {
        headerRows: 1,
        widths: ['auto', '*'],
        body: [
          [{ text: 'Date', bold: true }, { text: 'Holiday', bold: true }],
          ...publicHolidays.map(ph => [ph.date, ph.name]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
  );

  return {
    content,
    styles: {
      title: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
      subtitle: { fontSize: 12, italics: true, margin: [0, 0, 0, 10] },
      header: { fontSize: 14, bold: true, margin: [0, 10, 0, 5] },
      spacer: { fontSize: 8 },
    },
    defaultStyle: {
      fontSize: 10,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { schedule } = req.body as PdfRequest;

    if (!schedule) {
      res.status(400).json({ error: 'Missing schedule' });
      return;
    }

    const docDefinition = generatePdfContent(schedule);
    const pdfDoc = (pdfMake as any).createPdf(docDefinition);

    pdfDoc.getBuffer((buffer: Buffer) => {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="roster-${schedule.year}.pdf"`);
      res.status(200).send(buffer);
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
}
