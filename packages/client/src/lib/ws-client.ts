import type { ClientEvent, ServerEvent } from '@mahjong/shared';

type EventHandler = (event: ServerEvent) => void;
type StatusHandler = (connected: boolean) => void;

const HEARTBEAT_INTERVAL = 15_000; // 15s ping
const HEARTBEAT_TIMEOUT = 5_000;   // 5s to receive pong

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private shouldReconnect = false;
  private wasConnected = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(roomCode: string, playerId: string, playerCapability: string, hostCapability?: string): void {
    this.shouldReconnect = true;
    const params = new URLSearchParams({ roomCode, playerId, playerCapability });
    if (hostCapability) params.set('hostCapability', hostCapability);
    const wsUrl = `${this.url}?${params.toString()}`;
    this.doConnect(wsUrl);
  }

  private doConnect(url: string): void {
    this.cleanup();

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.wasConnected = true;
      this.notifyStatus(true);
      this.startHeartbeat();
    };

    this.ws.onmessage = (evt) => {
      try {
        // Handle pong response from server
        if (evt.data === 'pong') {
          this.clearPongTimer();
          return;
        }
        const event: ServerEvent = JSON.parse(evt.data);
        this.handlers.forEach(h => h(event));
      } catch {
        console.error('Failed to parse WS message:', evt.data);
      }
    };

    this.ws.onclose = (evt) => {
      this.stopHeartbeat();
      // Notify disconnected if we were previously connected
      if (this.wasConnected) {
        this.wasConnected = false;
        this.notifyStatus(false);
      }
      // Don't reconnect if server rejected the room/player (4001)
      if (evt.code === 4001) {
        this.shouldReconnect = false;
      }
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.doConnect(url);
        }, 2000);
      }
    };

    this.ws.onerror = () => {
      // onclose will handle reconnection
    };
  }

  /** Send an event. Returns true if sent, false if connection is not open. */
  send(event: ClientEvent): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
      return true;
    }
    return false;
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Subscribe to connection status changes (connected/disconnected). */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wasConnected = false;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private notifyStatus(connected: boolean): void {
    this.statusHandlers.forEach(h => h(connected));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
        // Start a timeout waiting for pong
        this.pongTimer = setTimeout(() => {
          // No pong received — connection is dead, force close
          console.warn('WS heartbeat timeout, forcing reconnect');
          if (this.ws) {
            this.ws.close();
          }
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearPongTimer();
  }

  private clearPongTimer(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
