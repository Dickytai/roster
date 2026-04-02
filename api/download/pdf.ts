import { OnCallSchedule } from '../../src/lib/types';

interface PdfRequest {
  schedule: OnCallSchedule;
}

export default async function handler(req: { method: string; body: PdfRequest }) {
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

    // PDF generation would use pdfmake here
    // For now, return a placeholder message
    return new Response(JSON.stringify({
      error: 'PDF generation not yet implemented. Please use Excel download for now.'
    }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'PDF generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
