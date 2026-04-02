import { PublicHoliday } from '../lib/types';

interface Step1BasicProps {
  year: number;
  publicHolidays: PublicHoliday[];
  onYearChange: (year: number) => void;
  onNext: () => void;
}

export function Step1Basic({ year, publicHolidays, onYearChange, onNext }: Step1BasicProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Year
        </label>
        <input
          type="number"
          value={year}
          onChange={e => onYearChange(parseInt(e.target.value))}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Public Holidays ({publicHolidays.length} days)
        </label>
        <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="pb-2">Date</th>
                <th className="pb-2">Holiday</th>
                <th className="pb-2">Day</th>
              </tr>
            </thead>
            <tbody>
              {publicHolidays.map(ph => (
                <tr key={ph.date} className="border-t border-gray-100">
                  <td className="py-2 text-gray-600">{ph.date}</td>
                  <td className="py-2">{ph.name}</td>
                  <td className="py-2 text-gray-500">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][ph.dayOfWeek]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Using Hong Kong {year} public holidays preset
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Next: Add Staff
        </button>
      </div>
    </div>
  );
}
