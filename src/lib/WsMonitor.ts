import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Logger } from 'homebridge';
import { WebackDevice } from '../types';
import { Weback } from './weback';

interface WsMonitorOptions {
  retryTime?: number;
}

const MAX_RETRY_DELAY = 5 * 60; // 5 minutos
const MAX_CONSECUTIVE_ERRORS = 10;

export class WsMonitor extends EventEmitter {
  private readonly log: Logger;
  private readonly weback: Weback;
  private readonly baseRetryTime: number;

  private ws?: WebSocket;
  private timeout?: ReturnType<typeof setTimeout>;
  private keepAlive?: ReturnType<typeof setInterval>;

  private consecutiveErrors = 0;
  private lastErrorWas403 = false;

  constructor(log: Logger, weback: Weback, params: WsMonitorOptions = {}) {
    super();
    this.log = log;
    this.weback = weback;
    this.baseRetryTime = params.retryTime ?? 15;
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
    // 403 = token rejeitado pelo servidor → força re-autenticação antes de reconectar
    if (this.lastErrorWas403) {
      this.log.warn('WebSocket rejeitado com 403 — renovando token WeBack...');
      try {
        await this.weback.auth();
        this.log.info('Token WeBack renovado com sucesso');
      } catch (error) {
        this.log.error('Falha ao renovar token WeBack:', error);
      }
      this.lastErrorWas403 = false;
    }

    const webackData = await this.weback.getData();
    // A API retorna /prod/wss mas o endpoint ativo é /wss (sem /prod)
    const url = webackData.data.wss_url.replace('/prod/wss', '/wss');

    this.ws = new WebSocket(url, undefined, {
      headers: {
        region: webackData.data.region_name,
        token: webackData.data.jwt_token,
        Connection: 'keep-alive, Upgrade',
      },
      handshakeTimeout: 10000,
    });

    this.ws
      .on('error', (error: Error) => {
        this.lastErrorWas403 = error.message.includes('403');
        this.emit('error', error);
      })
      .on('open', () => {
        this.consecutiveErrors = 0; // reset backoff ao conectar com sucesso
        this.ws!.ping();
        this.emit('listening', url);
        this.keepAlive = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.ping();
          }
        }, 30 * 1000);
      })
      .on('ping', (data: Buffer) => {
        this.log.debug('ping', data.toString());
      })
      .on('pong', (data: Buffer) => {
        this.log.debug('pong', data.toString());
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => void this.close(), 5 * 60 * 1000);
      })
      .on('message', (data: Buffer) => {
        clearTimeout(this.timeout);
        try {
          const obj = JSON.parse(data.toString()) as Record<string, unknown>;
          this.emit('notification', obj);
        } catch (error) {
          this.emit('error', error);
        }
        this.timeout = setTimeout(() => void this.close(), 5 * 60 * 1000);
      })
      .on('close', () => {
        clearInterval(this.keepAlive);
        this.keepAlive = undefined;
        this.emit('closed', url);

        if (this.baseRetryTime <= 0) return;

        this.consecutiveErrors++;

        if (this.consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
          this.log.error(
            `WebSocket falhou ${this.consecutiveErrors} vezes consecutivas — verifique credenciais WeBack e reinicie o Homebridge`,
          );
          return;
        }

        // Backoff exponencial: 15 → 30 → 60 → 120 → 300s (máximo)
        const delay = Math.min(
          this.baseRetryTime * Math.pow(2, this.consecutiveErrors - 1),
          MAX_RETRY_DELAY,
        );

        this.log.warn(`Reconectando WebSocket em ${delay}s (tentativa ${this.consecutiveErrors})`);
        setTimeout(() => void this.listen(), delay * 1000);
      });
  }

  async close(): Promise<void> {
    this.log.debug('WebSocket inativo por 5min — fechando');
    clearInterval(this.keepAlive);
    this.keepAlive = undefined;
    if (this.ws) {
      this.ws.close();
      await EventEmitter.once(this.ws, 'close');
      this.ws.removeAllListeners();
      this.ws = undefined;
    }
  }
}
