import type { ClientEvent, ServerEvent } from '@mahjong/shared';

type EventHandler = (event: ServerEvent) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private shouldReconnect = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(roomCode: string, playerId: string): void {
    this.shouldReconnect = true;
    const wsUrl = `${this.url}?roomCode=${encodeURIComponent(roomCode)}&playerId=${encodeURIComponent(playerId)}`;
    this.doConnect(wsUrl);
  }

  private doConnect(url: string): void {
    if (this.ws) {
      this.ws.close();
    }

    this.ws = new WebSocket(url);

    this.ws.onmessage = (evt) => {
      try {
        const event: ServerEvent = JSON.parse(evt.data);
        this.handlers.forEach(h => h(event));
      } catch {
        console.error('Failed to parse WS message:', evt.data);
      }
    };

    this.ws.onclose = (evt) => {
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

  send(event: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
