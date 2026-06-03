import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';
import type { MatterAccessory } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { TesvorConfig, WebackDevice, WebackDeviceListBody } from './types';
import { Weback } from './lib/weback';
import { WsMonitor } from './lib/WsMonitor';
import { TesvorVacuumAccessory } from './vacuumAccessory';

export class TesvorPlatform implements DynamicPlatformPlugin {
  public readonly matterAccessories: MatterAccessory[] = [];

  private readonly vacuumConfig: TesvorConfig;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.vacuumConfig = {
      username: config['username'],
      password: config['password'],
      country: config['country'],
      startMode: config['startMode'] ?? 'AutoClean',
      stopMode: config['stopMode'] ?? 'BackCharging',
      fanMode: config['fanMode'] ?? 'Normal',
      appName: config['appName'] ?? 'WeBack',
    };

    this.log.debug('Iniciando plataforma:', PLATFORM_NAME);

    this.api.on('didFinishLaunching', () => {
      void this.discoverDevices();
    });
  }

  // Required by DynamicPlatformPlugin — not used in Matter-only mode
  configureAccessory(_accessory: PlatformAccessory): void { /* no-op */ }

  configureMatterAccessory(accessory: MatterAccessory): void {
    this.log.info('Carregando aspirador Matter do cache:', accessory.displayName);
    this.matterAccessories.push(accessory);
  }

  private async discoverDevices(): Promise<void> {
    if (!this.api.isMatterEnabled()) {
      this.log.error(
        'Matter não está habilitado neste bridge. ' +
        'Habilite Matter nas configurações do Homebridge para usar este plugin.',
      );
      return;
    }

    const weback = new Weback(
      this.log,
      this.vacuumConfig.username,
      this.vacuumConfig.password,
      this.vacuumConfig.country,
      this.vacuumConfig.appName,
    );

    const ws = new WsMonitor(this.log, weback, { retryTime: 15 });

    ws.on('error', (error: Error) => {
      this.log.error('Erro na comunicação WebSocket:', error?.message ?? String(error));
    });

    ws.on('closed', (url: string) => {
      this.log.warn('Conexão WebSocket encerrada (%s) — reconectando em 15s', url);
    });

    try {
      const body = await weback.deviceList() as WebackDeviceListBody;
      ws.listen();

      for (const device of body.data.thing_list) {
        await this.registerDevice(device, ws);
      }
    } catch (error) {
      this.log.error('Falha ao descobrir dispositivos WeBack:', error);
    }
  }

  private async registerDevice(device: WebackDevice, ws: WsMonitor): Promise<void> {
    const vacuum = new TesvorVacuumAccessory(
      this.log,
      this.api,
      ws,
      this.vacuumConfig,
      device,
    );

    const existingAccessory = this.matterAccessories.find(a => a.UUID === vacuum.uuid);

    if (existingAccessory) {
      this.log.info('Restaurando aspirador Matter do cache:', existingAccessory.displayName);
      const updated = vacuum.buildMatterAccessory();
      await this.api.matter!.updatePlatformAccessories([updated]);
    } else {
      this.log.info('Registrando novo aspirador Matter:', device.thing_nickname);
      const matterAccessory = vacuum.buildMatterAccessory();
      await this.api.matter!.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [matterAccessory]);
    }

    // Força push do estado atual 2s após o registro para garantir que o Apple Home
    // receba uma confirmação de estado e saia do "Atualizando...".
    setTimeout(() => vacuum.pushCurrentState(), 2000);
  }
}
