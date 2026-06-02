export type VacuumWorkingStatus =
  | 'AutoClean'
  | 'EdgeClean'
  | 'SpotClean'
  | 'RoomClean'
  | 'SmartClean'
  | 'MopClean'
  | 'Standby'
  | 'BackCharging'
  | 'Charging'
  | 'PileCharging'
  | 'DirCharging'
  | 'Hibernating';

export type FanMode = 'Normal' | 'Strong';
export type StartMode = 'AutoClean' | 'EdgeClean' | 'SpotClean' | 'RoomClean' | 'SmartClean';
export type StopMode = 'BackCharging' | 'Standby';
export type AppName = 'WeBack' | 'Redmond';

export interface WebackDeviceStatus {
  working_status: VacuumWorkingStatus;
  battery_level: number;
  fan_status: FanMode;
  sw_version?: string;
  voice_version?: string;
}

export interface WebackDevice {
  thing_name: string;
  thing_nickname: string;
  sub_type: string;
  thing_status: WebackDeviceStatus;
}

export interface WebackDeviceListBody {
  data: {
    thing_list: WebackDevice[];
  };
}

export interface WebackAuthBody {
  msg: string;
  data: {
    jwt_token: string;
    region_name: string;
    wss_url: string;
    expired_time: number;
  };
}

export interface TesvorConfig {
  username: string;
  password: string;
  country: string;
  startMode: StartMode;
  stopMode: StopMode;
  fanMode: FanMode;
  appName: AppName;
}

export interface VacuumModes {
  startMode: StartMode;
  stopMode: StopMode;
}

