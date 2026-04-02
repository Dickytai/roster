import { useState, useCallback } from 'react';
import { GenerationState, Staff, PublicHoliday, YearlyRoster, StaffStatistics } from '../lib/types';
import { hongKong2026Holidays } from '../lib/holidays';
import { generateOnCallSchedule, generateYearlyRoster, calculateStatistics } from '../lib/rosterAlgorithm';

interface FullGenerationState extends GenerationState {
  roster: YearlyRoster | null;
  statistics: StaffStatistics[] | null;
}

const initialState: FullGenerationState = {
  step: 1,
  year: 2026,
  publicHolidays: hongKong2026Holidays,
  staff: [],
  onCallSchedule: null,
  roster: null,
  statistics: null,
};

export function useRosterStore() {
  const [state, setState] = useState<FullGenerationState>(initialState);

  const setYear = useCallback((year: number) => {
    setState(s => ({ ...s, year }));
  }, []);

  const setPublicHolidays = useCallback((holidays: PublicHoliday[]) => {
    setState(s => ({ ...s, publicHolidays: holidays }));
  }, []);

  const setStaff = useCallback((staff: Staff[]) => {
    setState(s => ({ ...s, staff }));
  }, []);

  const addStaff = useCallback((staffMember: Staff) => {
    setState(s => ({ ...s, staff: [...s.staff, staffMember] }));
  }, []);

  const removeStaff = useCallback((staffId: string) => {
    setState(s => ({ ...s, staff: s.staff.filter(st => st.id !== staffId) }));
  }, []);

  const nextStep = useCallback(() => {
    setState(s => ({ ...s, step: Math.min(s.step + 1, 3) as 1 | 2 | 3 }));
  }, []);

  const prevStep = useCallback(() => {
    setState(s => ({ ...s, step: Math.max(s.step - 1, 1) as 1 | 2 | 3 }));
  }, []);

  const generate = useCallback(() => {
    const onCallSchedule = generateOnCallSchedule(state.year, state.publicHolidays, state.staff);
    const roster = generateYearlyRoster(onCallSchedule);
    const statistics = calculateStatistics(onCallSchedule, roster);
    setState(s => ({ ...s, onCallSchedule, roster, statistics, step: 3 }));
  }, [state.year, state.publicHolidays, state.staff]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    setYear,
    setPublicHolidays,
    setStaff,
    addStaff,
    removeStaff,
    nextStep,
    prevStep,
    generate,
    reset,
  };
}
