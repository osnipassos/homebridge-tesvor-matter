import { VacuumWorkingStatus } from '../types';
import { CLEANING_STATES, CHARGING_STATES, DOCKED_STATES } from '../settings';

export function isCleaning(status: VacuumWorkingStatus): boolean {
  return (CLEANING_STATES as readonly string[]).includes(status);
}

export function isCharging(status: VacuumWorkingStatus): boolean {
  return (CHARGING_STATES as readonly string[]).includes(status);
}

export function isDocked(status: VacuumWorkingStatus): boolean {
  return (DOCKED_STATES as readonly string[]).includes(status);
}
