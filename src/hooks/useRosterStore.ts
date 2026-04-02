import { useState, useCallback } from 'react';
import { GenerationState, Staff, PublicHoliday } from '../lib/types';
import { hongKong2026Holidays } from '../lib/holidays';
import { generateOnCallSchedule } from '../lib/rosterAlgorithm';

const initialState: GenerationState = {
  step: 1,
  year: 2026,
  publicHolidays: hongKong2026Holidays,
  staff: [],
  onCallSchedule: null,
};

export function useRosterStore() {
  const [state, setState] = useState<GenerationState>(initialState);

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
    const schedule = generateOnCallSchedule(state.year, state.staff);
    setState(s => ({ ...s, onCallSchedule: schedule, step: 3 }));
  }, [state.year, state.staff]);

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
