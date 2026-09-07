import { useEffect, useRef, useState, useCallback } from "react";

export type WsConnectionStatus = "connected" | "connecting" | "disconnected";

export interface WebSocketEventMessage {
  event: string;
  timestamp: string;
  data: any;
}

type Listener = (event: WebSocketEventMessage) => void;

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/tracking/ws/events";
const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 30000;

/**
 * Shared singleton WebSocket event bus. Every useWebSocket caller subscribes
 * to ONE underlying socket (instead of opening N parallel connections), with
 * reference counting and exponential-backoff reconnection.
 */
class WebSocketBus {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: WsConnectionStatus) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private intentionallyClosed = false;
  private _status: WsConnectionStatus = "disconnected";

  get status(): WsConnectionStatus {
    return this._status;
  }

  subscribe(listener: Listener, onStatus: (s: WsConnectionStatus) => void): () => void {
    this.listeners.add(listener);
    this.statusListeners.add(onStatus);
    if (!this.socket) this.connect();
    return () => {
      this.listeners.delete(listener);
      this.statusListeners.delete(onStatus);
      if (this.listeners.size === 0) this.teardown();
    };
  }

  send(message: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(typeof message === "string" ? message : JSON.stringify(message));
    }
  }

  private setStatus(next: WsConnectionStatus) {
    this._status = next;
    this.statusListeners.forEach((cb) => cb(next));
  }

  private connect() {
    this.intentionallyClosed = false;
    this.setStatus("connecting");

    try {
      const socket = new WebSocket(WS_URL);
      this.socket = socket;

      socket.onopen = () => {
        this.retryCount = 0;
        this.setStatus("connected");
        // Heartbeat keeps proxies from idling the socket out
        this.socket?.send("ping");
      };

      socket.onmessage = (messageEvent) => {
        try {
          const parsed = JSON.parse(messageEvent.data);
          const eventMsg: WebSocketEventMessage = {
            event: parsed.event || "driver_location_updated",
            timestamp: parsed.timestamp || new Date().toISOString(),
            data: parsed.data || parsed,
          };
          this.listeners.forEach((listener) => {
            try {
              listener(eventMsg);
            } catch (e) {
              console.warn("[RouteIQ WS] listener error:", e);
            }
          });
        } catch (e) {
          console.warn("[RouteIQ WS] Non-JSON payload:", messageEvent.data);
        }
      };

      socket.onclose = () => {
        this.socket = null;
        if (this.intentionallyClosed) return;
        this.setStatus("disconnected");
        this.scheduleReconnect();
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch (err) {
      this.socket = null;
      this.setStatus("disconnected");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.listeners.size === 0) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.retryCount, RECONNECT_MAX_MS);
    this.retryCount += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size > 0 && !this.intentionallyClosed) this.connect();
    }, delay);
  }

  private teardown() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.setStatus("disconnected");
  }
}

// Module-level singleton shared by the whole app
const bus = new WebSocketBus();

export function useWebSocket(onEvent?: (event: WebSocketEventMessage) => void) {
  const [status, setStatus] = useState<WsConnectionStatus>(bus.status);
  const listenerRef = useRef(onEvent);
  listenerRef.current = onEvent;

  useEffect(() => {
    const handleEvent = (event: WebSocketEventMessage) => {
      if (listenerRef.current) listenerRef.current(event);
    };
    const handleStatus = (next: WsConnectionStatus) => setStatus(next);
    return bus.subscribe(handleEvent, handleStatus);
  }, []);

  const send = useCallback((message: any) => bus.send(message), []);

  return { status, send };
}