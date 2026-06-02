export const PLATFORM_NAME = 'HomebridgeTesvor';
export const PLUGIN_NAME = 'homebridge-tesvor';

export const CLEANING_STATES = [
  'AutoClean', 'EdgeClean', 'SpotClean', 'RoomClean', 'SmartClean', 'MopClean',
] as const;

export const CHARGING_STATES = [
  'Charging', 'PileCharging', 'DirCharging',
] as const;

export const DOCKED_STATES = [
  'Charging', 'PileCharging', 'DirCharging', 'Hibernating',
] as const;
