import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Logger } from 'homebridge';
import { WebackDevice } from '../types';
import { Weback } from './weback';

interface WsMonitorOptions {
  retryTime?: number;
}

export class WsMonitor extends EventEmitter {
  private readonly log: Logger;
  private readonly weback: Weback;
  private readonly retryTime: number;

  private ws?: WebSocket;
  private timeout?: ReturnType<typeof setTimeout>;

  constructor(log: Logger, weback: Weback, params: WsMonitorOptions = {}) {
    super();
    this.log = log;
    this.weback = weback;
    this.retryTime = params.retryTime ?? 15;
  }

  getUpdate(device: WebackDevice): void {
    this.send({
      opt: 'thing_status_get',
      sub_type: device.sub_type,
      thing_name: device.thing_name,
    });
  }

  send(payload: Record<string, unknown>): void {
    try {
      this.log.debug('WsMonitor send, readyState:', this.ws?.readyState);
      this.ws?.send(JSON.stringify(payload));
    } catch (error) {
      this.log.debug('WsMonitor send error:', error);
    }
  }

  async listen(): Promise<void> {
    const webackData = await this.weback.getData();
    const url = webackData.data.wss_url;

    this.ws = new WebSocket(url, undefined, {
      headers: {
        Authorization: 'Basic KG51bGwpOihudWxsKQ==',
        region: webackData.data.region_name,
        token: webackData.data.jwt_token,
        Connection: 'keep-alive, Upgrade',
      },
      handshakeTimeout: 10000,
    });

    this.ws
      .on('error', (error: Error) => {
        this.emit('error', error);
      })
      .on('open', () => {
        this.ws!.ping();
        this.emit('listening', url);
      })
      .on('ping', (data: Buffer) => {
        this.log.debug('ping', data.toString());
      })
      .on('pong', (data: Buffer) => {
        this.log.debug('pong', data.toString());
      })
      .on('message', (data: Buffer) => {
        clearTimeout(this.timeout);
        try {
          const obj = JSON.parse(data.toString()) as Record<string, unknown>;
          this.emit('notification', obj);
        } catch (error) {
          this.emit('error', error);
        }
        this.timeout = setTimeout(() => void this.close(), 60 * 1000);
      })
      .on('close', () => {
        this.emit('closed', url);
        if (this.retryTime > 0) {
          setTimeout(() => void this.listen(), this.retryTime * 1000);
        }
      });
  }

  async close(): Promise<void> {
    this.log.debug('no messages for 60s — closing WebSocket');
    if (this.ws) {
      this.ws.close();
      await EventEmitter.once(this.ws, 'close');
      this.ws.removeAllListeners();
      this.ws = undefined;
    }
  }
}
