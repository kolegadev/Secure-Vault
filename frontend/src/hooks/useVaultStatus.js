import { useState, useEffect, useRef } from 'react';

/**
 * Hook for real-time vault and USB status via WebSocket.
 * @returns {{vaultState: object, usbState: object, connected: boolean, wsError: string|null}}
 */
export function useVaultStatus() {
  const [vaultState, setVaultState] = useState(null);
  const [usbState, setUsbState] = useState({ present: false });
  const [connected, setConnected] = useState(false);
  const [wsError, setWsError] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setWsError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'vault-state') {
            setVaultState(message.payload);
          } else if (message.type === 'usb-status') {
            setUsbState(message.payload);
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        setWsError('WebSocket connection error');
        console.error('WebSocket error:', err);
      };
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return { vaultState, usbState, connected, wsError };
}
