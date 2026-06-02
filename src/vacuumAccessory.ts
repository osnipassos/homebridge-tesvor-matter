import { API, Logger } from 'homebridge';
import type { MatterAccessory } from 'homebridge';

import { TesvorConfig, WebackDevice, VacuumWorkingStatus } from './types';
import { WsMonitor } from './lib/WsMonitor';
import { isCleaning, isCharging, isDocked } from './lib/vacuum';

// RvcRunMode mode IDs — must match the supportedModes list below
const MODE_IDLE = 0;
const MODE_CLEANING = 1;

// RvcRunMode namespace ModeTag values (Matter spec §7.2.7.2)
const TAG_IDLE = 16384;
const TAG_CLEANING = 16385;

// RvcOperationalState IDs (Matter spec §7.4)
const OP_STOPPED = 0;
const OP_RUNNING = 1;
const OP_SEEKING_CHARGER = 64;
const OP_CHARGING = 65;
const OP_DOCKED = 66;

// PowerSource BatChargeState values
const BAT_CHARGE_UNKNOWN = 0;
const BAT_IS_CHARGING = 1;
const BAT_NOT_CHARGING = 3;

export interface MatterAccessoryContext {
  device: WebackDevice;
}

export class TesvorVacuumAccessory {
  public readonly uuid: string;

  private currentStatus: VacuumWorkingStatus;
  private currentBattery: number;

  constructor(
    private readonly log: Logger,
    private readonly api: API,
    private readonly ws: WsMonitor,
    private readonly config: TesvorConfig,
    private readonly device: WebackDevice,
  ) {
    this.uuid = this.api.hap.uuid.generate(device.thing_name);
    this.currentStatus = device.thing_status.working_status;
    this.currentBattery = device.thing_status.battery_level ?? 0;

    ws.on('notification', (obj: Record<string, unknown>) => {
      this.handleNotification(obj);
    });
  }

  buildMatterAccessory(): MatterAccessory<MatterAccessoryContext> {
    const { operationalState, runMode } = this.mapStatus(this.currentStatus);

    return {
      UUID: this.uuid,
      displayName: this.device.thing_nickname,
      deviceType: this.api.matter!.deviceTypes.RoboticVacuumCleaner,
      serialNumber: this.device.thing_name,
      manufacturer: 'Tesvor',
      model: this.device.sub_type,
      firmwareRevision: this.device.thing_status.sw_version,
      context: { device: this.device },
      clusters: {
        rvcRunMode: {
          supportedModes: [
            { label: 'Idle', mode: MODE_IDLE, modeTags: [{ value: TAG_IDLE }] },
            { label: 'Cleaning', mode: MODE_CLEANING, modeTags: [{ value: TAG_CLEANING }] },
          ],
          currentMode: runMode,
        },
        rvcOperationalState: {
          phaseList: null,
          currentPhase: null,
          operationalStateList: [
            { operationalStateId: 0, operationalStateLabel: 'Stopped' },
            { operationalStateId: 1, operationalStateLabel: 'Running' },
            { operationalStateId: 2, operationalStateLabel: 'Paused' },
            { operationalStateId: 3, operationalStateLabel: 'Error' },
            { operationalStateId: 64, operationalStateLabel: 'Seeking Charger' },
            { operationalStateId: 65, operationalStateLabel: 'Charging' },
            { operationalStateId: 66, operationalStateLabel: 'Docked' },
          ],
          operationalState,
          operationalError: { errorStateId: 0 },
        },
        powerSource: {
          status: 1,
          order: 0,
          description: 'Battery',
          batPercentRemaining: this.currentBattery * 2,
          batChargeLevel: this.currentBattery < 20 ? 1 : 0,
          batChargeState: isCharging(this.currentStatus) ? BAT_IS_CHARGING : BAT_NOT_CHARGING,
        },
      },
      handlers: {
        rvcRunMode: {
          changeToMode: async (args: { newMode: number }) => {
            if (args.newMode === MODE_CLEANING) {
              this.log.info(`[${this.device.thing_nickname}] Iniciando limpeza: ${this.config.startMode}`);
              this.sendCommand(this.config.startMode);
            } else {
              this.log.info(`[${this.device.thing_nickname}] Parando: ${this.config.stopMode}`);
              this.sendCommand(this.config.stopMode);
            }
          },
        },
        rvcOperationalState: {
          pause: async () => {
            this.log.info(`[${this.device.thing_nickname}] Pausando`);
            this.sendCommand('Standby');
          },
          resume: async () => {
            this.log.info(`[${this.device.thing_nickname}] Retomando limpeza`);
            this.sendCommand(this.config.startMode);
          },
          goHome: async () => {
            this.log.info(`[${this.device.thing_nickname}] Retornando à base`);
            this.sendCommand('BackCharging');
          },
        },
      },
    };
  }

  private handleNotification(obj: Record<string, unknown>): void {
    if (obj['thing_name'] !== this.device.thing_name) return;
    if (obj['notify_info'] !== 'thing_status_update') return;

    const status = obj['thing_status'] as Partial<{
      working_status: VacuumWorkingStatus;
      battery_level: number;
    }> | undefined;

    if (!status) return;

    let changed = false;

    if (status.working_status !== undefined && status.working_status !== this.currentStatus) {
      this.currentStatus = status.working_status;
      changed = true;
    }

    if (status.battery_level !== undefined && status.battery_level !== this.currentBattery) {
      this.currentBattery = status.battery_level;
      changed = true;
    }

    if (!changed) return;

    const { operationalState, runMode } = this.mapStatus(this.currentStatus);

    void this.api.matter?.updateAccessoryState(this.uuid, 'rvcRunMode', {
      currentMode: runMode,
    });

    void this.api.matter?.updateAccessoryState(this.uuid, 'rvcOperationalState', {
      operationalState,
      operationalError: { errorStateId: 0 },
    });

    void this.api.matter?.updateAccessoryState(this.uuid, 'powerSource', {
      batPercentRemaining: this.currentBattery * 2,
      batChargeLevel: this.currentBattery < 20 ? 1 : 0,
      batChargeState: isCharging(this.currentStatus) ? BAT_IS_CHARGING : BAT_NOT_CHARGING,
    });

    this.log.debug(
      `[${this.device.thing_nickname}] status=${this.currentStatus} bat=${this.currentBattery}% opState=${operationalState} runMode=${runMode}`,
    );
  }

  private sendCommand(workingStatus: string): void {
    this.ws.send({
      topic_name: `$aws/things/${this.device.thing_name}/shadow/update`,
      opt: 'send_to_device',
      sub_type: this.device.sub_type as unknown as Record<string, unknown>,
      topic_payload: { state: { working_status: workingStatus } },
      thing_name: this.device.thing_name,
    });
  }

  private mapStatus(status: VacuumWorkingStatus): { operationalState: number; runMode: number } {
    if (isCleaning(status)) {
      return { operationalState: OP_RUNNING, runMode: MODE_CLEANING };
    }
    if (status === 'BackCharging') {
      return { operationalState: OP_SEEKING_CHARGER, runMode: MODE_IDLE };
    }
    if (isCharging(status)) {
      return { operationalState: OP_CHARGING, runMode: MODE_IDLE };
    }
    if (isDocked(status)) {
      return { operationalState: OP_DOCKED, runMode: MODE_IDLE };
    }
    return { operationalState: OP_STOPPED, runMode: MODE_IDLE };
  }
}
