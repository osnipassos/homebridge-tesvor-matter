import got from 'got';
import * as crypto from 'crypto';
import { Logger } from 'homebridge';
import { WebackAuthBody, WebackDeviceListBody, AppName } from '../types';

interface DeviceListBody extends WebackDeviceListBody {
  msg: string;
}

export class Weback {
  private readonly log: Logger;
  private readonly username: string;
  private readonly password: string;
  private readonly countryCode: string;
  private readonly appName: AppName;

  private webackData: WebackAuthBody | null = null;

  constructor(log: Logger, username: string, password: string, countryCode: string, appName: AppName) {
    this.log = log;
    this.username = username;
    this.password = password;
    this.countryCode = countryCode;
    this.appName = appName;
  }

  async auth(): Promise<WebackAuthBody> {
    this.log.debug('auth() ...');

    if (!this.username) throw new Error('Username not provided');
    if (!this.password) throw new Error('Password not provided');
    if (!this.countryCode) throw new Error('Country code not provided');

    const payload = {
      payload: {
        opt: 'login',
        pwd: crypto.createHash('md5').update(this.password).digest('hex'),
      },
      header: {
        language: 'de',
        app_name: this.appName,
        calling_code: this.countryCode,
        api_version: '1.0',
        account: this.username,
        client_id: 'yugong_app',
      },
    };

    const { body } = await got.post<WebackAuthBody>('https://user.grit-cloud.com/oauth', {
      json: payload,
      responseType: 'json',
    });

    if (body.msg !== 'success') {
      throw new Error(`Auth failed: ${JSON.stringify(body)}`);
    }

    this.webackData = body;
    return body;
  }

  async deviceList(): Promise<DeviceListBody> {
    this.log.debug('deviceList() ...');

    if (!this.webackData) {
      await this.auth();
    }

    const data = this.webackData!;

    if (data.msg !== 'success') {
      throw new Error(`WeBack session invalid: ${JSON.stringify(data)}`);
    }

    const { body } = await got.post<DeviceListBody>('https://user.grit-cloud.com/api', {
      headers: {
        Accept: 'application/json',
        region: data.data.region_name,
        token: data.data.jwt_token,
      },
      json: { opt: 'user_thing_list_get' },
      responseType: 'json',
    });

    if (body.msg !== 'success') {
      throw new Error(`Device list failed: ${JSON.stringify(body)}`);
    }

    return body;
  }

  async getData(): Promise<WebackAuthBody> {
    this.log.debug('getData() - checking token ...');

    if (!this.webackData) {
      await this.auth();
    } else if (this.isTokenExpired()) {
      await this.auth();
    }

    return this.webackData!;
  }

  isTokenExpired(): boolean {
    if (!this.webackData) return true;
    const token = this.webackData.data.jwt_token;
    const payloadBase64 = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64').toString()) as { exp: number };
    return Date.now() >= decoded.exp * 1000;
  }
}
