import { useState } from 'react';
import { Staff } from '../lib/types';

interface Step2StaffProps {
  staff: Staff[];
  onAddStaff: (staff: Staff) => void;
  onRemoveStaff: (staffId: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function Step2Staff({ staff, onAddStaff, onRemoveStaff, onBack, onNext }: Step2StaffProps) {
  const [name, setName] = useState('');
  const [alStart, setAlStart] = useState('');
  const [alEnd, setAlEnd] = useState('');

  const handleAddStaff = () => {
    if (!name.trim()) return;

    const newStaff: Staff = {
      id: `staff-${Date.now()}`,
      name: name.trim(),
      annualLeaves: [],
    };

    if (alStart && alEnd) {
      newStaff.annualLeaves.push({
        startDate: alStart,
        endDate: alEnd,
      });
    }

    onAddStaff(newStaff);
    setName('');
    setAlStart('');
    setAlEnd('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Add Staff Member</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter name"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">AL Start</label>
            <input
              type="date"
              value={alStart}
              onChange={e => setAlStart(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">AL End</label>
            <input
              type="date"
              value={alEnd}
              onChange={e => setAlEnd(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAddStaff}
              disabled={!name.trim()}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Staff List ({staff.length})
        </h3>
        {staff.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">
            No staff added yet
          </p>
        ) : (
          <div className="space-y-3">
            {staff.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium text-gray-900">{s.name}</span>
                  {s.annualLeaves.length > 0 && (
                    <span className="ml-2 text-xs text-gray-500">
                      ({s.annualLeaves.length} AL block{s.annualLeaves.length > 1 ? 's' : ''})
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onRemoveStaff(s.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={staff.length === 0}
          className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate Schedule
        </button>
      </div>
    </div>
  );
}
