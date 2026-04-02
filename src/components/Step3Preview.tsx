import { useState } from 'react';
import { OnCallSchedule } from '../lib/types';
import { parseISO } from 'date-fns';
import { generatePdf } from '../lib/pdfGenerator';

interface Step3PreviewProps {
  schedule: OnCallSchedule;
  onBack: () => void;
  onReset: () => void;
}

export function Step3Preview({ schedule, onBack, onReset }: Step3PreviewProps) {
  const [downloading, setDownloading] = useState<'excel' | 'pdf' | null>(null);

  const handleDownloadExcel = async () => {
    setDownloading('excel');
    try {
      const response = await fetch('/api/download/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule }),
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-${schedule.year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel download failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadPdf = () => {
    setDownloading('pdf');
    try {
      generatePdf(schedule);
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">
          Schedule Generated!
        </h2>
        <p className="text-gray-500 mt-1">
          {schedule.year} on-call schedule for {schedule.staff.length} staff members
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-semibold text-primary">{schedule.staff.length}</div>
          <div className="text-xs text-gray-500">Staff</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-semibold text-primary">{schedule.publicHolidays.length}</div>
          <div className="text-xs text-gray-500">PH Days</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <div className="text-2xl font-semibold text-primary">{schedule.entries.length}</div>
          <div className="text-xs text-gray-500">Total Days</div>
        </div>
      </div>

      {/* Staff breakdown */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">On-Call Distribution</h3>
        <div className="space-y-2">
          {schedule.staff.map(s => {
            const days = schedule.entries.filter(e => e.onCallStaffId === s.id).length;
            const ph = schedule.phWeekendsCount[s.id] || 0;
            return (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{s.name}</span>
                <span className="text-gray-500">
                  {days} days ({ph} PH weekends)
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly preview */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Monthly Preview</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {months.map(month => {
            const monthEntries = schedule.entries.filter(e => {
              const d = parseISO(e.date);
              return d.getMonth() + 1 === month;
            });
            return (
              <div key={month} className="bg-gray-50 rounded p-2 text-xs">
                <div className="font-medium text-gray-700">{monthNames[month - 1]}</div>
                <div className="text-gray-500">{monthEntries.length} days</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Download buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleDownloadExcel}
          disabled={downloading !== null}
          className="flex-1 px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {downloading === 'excel' ? 'Generating...' : 'Download Excel'}
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading !== null}
          className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {downloading === 'pdf' ? 'Generating...' : 'Download PDF'}
        </button>
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 text-gray-400 hover:text-gray-600 transition-colors text-sm"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
