import { generateOnCallSchedule } from '../src/lib/rosterAlgorithm';
import { Staff, PublicHoliday } from '../src/lib/types';

interface GenerateRequest {
  year: number;
  publicHolidays: PublicHoliday[];
  staff: Staff[];
}

export default async function handler(req: { method: string; body: GenerateRequest }) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { year, publicHolidays, staff } = req.body;

    if (!year || !staff || staff.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const schedule = generateOnCallSchedule(year, staff);

    return new Response(JSON.stringify({ success: true, schedule }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
