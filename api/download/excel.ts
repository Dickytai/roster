import { OnCallSchedule } from '../../src/lib/types';
import { generateExcel } from '../../src/lib/excelGenerator';

interface ExcelRequest {
  schedule: OnCallSchedule;
}

export default async function handler(req: { method: string; body: ExcelRequest }) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { schedule } = req.body;

    if (!schedule) {
      return new Response(JSON.stringify({ error: 'Missing schedule' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = generateExcel(schedule);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="roster-${schedule.year}.xlsx"`,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Excel generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
