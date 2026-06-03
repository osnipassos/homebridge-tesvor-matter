import { API, Logger } from 'homebridge';
import type { MatterAccessory } from 'homebridge';

import { TesvorConfig, WebackDevice, VacuumWorkingStatus } from './types';
import { WsMonitor } from './lib/WsMonitor';
import { isCleaning, isCharging, isDocked } from './lib/vacuum';

// RvcRunMode mode IDs
const MODE_IDLE = 0;
const MODE_CLEANING = 1;

// RvcRunMode namespace ModeTag values (Matter spec §7.2.7.2)
const TAG_IDLE = 16384;
const TAG_CLEANING = 16385;

// RvcOperationalState IDs (Matter spec §7.4)
const OP_STOPPED = 0;
const OP_RUNNING = 1;
const OP_ERROR = 3;
const OP_SEEKING_CHARGER = 64;
const OP_CHARGING = 65;
const OP_DOCKED = 66;

// RvcOperationalState ErrorState IDs (Matter spec §7.4.7)
const ERR_NONE = 0;
const ERR_UNABLE_TO_COMPLETE = 2;

// PowerSource BatChargeState values
const BAT_IS_CHARGING = 1;
const BAT_NOT_CHARGING = 3;

// RvcCleanMode mode IDs — index = mode number sent to Matter
const CLEAN_MODES = ['AutoClean', 'EdgeClean', 'SpotClean', 'RoomClean', 'SmartClean'] as const;

export interface MatterAccessoryContext {
  device: WebackDevice;
}

export class TesvorVacuumAccessory {
  public readonly uuid: string;

  private currentStatus: VacuumWorkingStatus;
  private currentBattery: number;
  private currentCleanMode: number;

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
    this.currentCleanMode = Math.max(
      0,
      CLEAN_MODES.indexOf(config.startMode as typeof CLEAN_MODES[number]),
    );

    ws.on('notification', (obj: Record<string, unknown>) => {
      this.handleNotification(obj);
    });

    // Solicita o estado atual ao dispositivo quando o WebSocket conecta.
    // Garante que o Apple Home receba um estado confirmado e saia do "Atualizando...".
    ws.on('listening', () => {
      ws.getUpdate(this.device);
    });
  }

  buildMatterAccessory(): MatterAccessory<MatterAccessoryContext> {
    const { operationalState, runMode, errorId } = this.mapStatus(this.currentStatus);

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
        rvcCleanMode: {
          supportedModes: [
            { label: 'Auto Clean', mode: 0, modeTags: [{ value: 0 }] },
            { label: 'Edge Clean', mode: 1, modeTags: [{ value: 0 }] },
            { label: 'Spot Clean', mode: 2, modeTags: [{ value: 0 }] },
            { label: 'Room Clean', mode: 3, modeTags: [{ value: 0 }] },
            { label: 'Smart Clean', mode: 4, modeTags: [{ value: 0 }] },
          ],
          currentMode: this.currentCleanMode,
        },
        rvcOperationalState: {
          phaseList: null,
          currentPhase: null,
          operationalStateList: [
            { operationalStateId: 0 },
            { operationalStateId: 1 },
            { operationalStateId: 2 },
            { operationalStateId: 3 },
            { operationalStateId: 64 },
            { operationalStateId: 65 },
            { operationalStateId: 66 },
          ],
          operationalState,
          operationalError: { errorStateId: errorId },
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
              const cleanStatus = this.cleanModeToStatus(this.currentCleanMode);
              this.log.info(`[${this.device.thing_nickname}] Iniciando limpeza: ${cleanStatus}`);
              this.sendCommand(cleanStatus);
            } else {
              this.log.info(`[${this.device.thing_nickname}] Parando: ${this.config.stopMode}`);
              this.sendCommand(this.config.stopMode);
            }
          },
        },
        rvcCleanMode: {
          changeToMode: async (args: { newMode: number }) => {
            this.currentCleanMode = args.newMode;
            const cleanStatus = this.cleanModeToStatus(args.newMode);
            this.log.info(`[${this.device.thing_nickname}] Modo de limpeza selecionado: ${cleanStatus}`);
            // Se o robô já estiver limpando, troca o modo imediatamente
            if (isCleaning(this.currentStatus)) {
              this.sendCommand(cleanStatus);
            }
          },
        },
        rvcOperationalState: {
          pause: async () => {
            this.log.info(`[${this.device.thing_nickname}] Pausando`);
            this.sendCommand('Standby');
          },
          resume: async () => {
            const cleanStatus = this.cleanModeToStatus(this.currentCleanMode);
            this.log.info(`[${this.device.thing_nickname}] Retomando limpeza: ${cleanStatus}`);
            this.sendCommand(cleanStatus);
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

    const { operationalState, runMode, errorId } = this.mapStatus(this.currentStatus);

    void this.api.matter?.updateAccessoryState(this.uuid, 'rvcRunMode', {
      currentMode: runMode,
    });

    void this.api.matter?.updateAccessoryState(this.uuid, 'rvcOperationalState', {
      operationalState,
      operationalError: { errorStateId: errorId },
    });

    void this.api.matter?.updateAccessoryState(this.uuid, 'powerSource', {
      batPercentRemaining: this.currentBattery * 2,
      batChargeLevel: this.currentBattery < 20 ? 1 : 0,
      batChargeState: isCharging(this.currentStatus) ? BAT_IS_CHARGING : BAT_NOT_CHARGING,
    });

    this.log.debug(
      `[${this.device.thing_nickname}] status=${this.currentStatus} bat=${this.currentBattery}% opState=${operationalState} errId=${errorId} runMode=${runMode} cleanMode=${this.currentCleanMode}`,
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

  private cleanModeToStatus(mode: number): string {
    return CLEAN_MODES[mode] ?? this.config.startMode;
  }

  private mapStatus(status: VacuumWorkingStatus | string): { operationalState: number; runMode: number; errorId: number } {
    if (isCleaning(status as VacuumWorkingStatus)) {
      return { operationalState: OP_RUNNING, runMode: MODE_CLEANING, errorId: ERR_NONE };
    }
    if (status === 'BackCharging') {
      return { operationalState: OP_SEEKING_CHARGER, runMode: MODE_IDLE, errorId: ERR_NONE };
    }
    if (isCharging(status as VacuumWorkingStatus)) {
      return { operationalState: OP_CHARGING, runMode: MODE_IDLE, errorId: ERR_NONE };
    }
    if (isDocked(status as VacuumWorkingStatus)) {
      return { operationalState: OP_DOCKED, runMode: MODE_IDLE, errorId: ERR_NONE };
    }
    if (status === 'Standby') {
      return { operationalState: OP_STOPPED, runMode: MODE_IDLE, errorId: ERR_NONE };
    }
    // Status desconhecido — reporta erro para o Apple Home
    this.log.warn(`[${this.device.thing_nickname}] Status desconhecido recebido: "${status}"`);
    return { operationalState: OP_ERROR, runMode: MODE_IDLE, errorId: ERR_UNABLE_TO_COMPLETE };
  }
}
