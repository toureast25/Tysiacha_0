// hooks/useMqtt.js
// !!! ВНИМАНИЕ: Этот файл теперь содержит логику для WebSocket, а не MQTT. !!!
// Название файла сохранено для минимизации изменений в структуре проекта.
import React from 'react';
import { WEBSOCKET_URL } from '../../constants.js';

const useMqtt = (roomCode, playerName, mySessionId) => {
  const [connectionStatus, setConnectionStatus] = React.useState('connecting');
  const [lastReceivedState, setLastReceivedState] = React.useState(null);
  const [lastReceivedAction, setLastReceivedAction] = React.useState(null);
  const [lastReceivedSyncRequest, setLastReceivedSyncRequest] = React.useState(null);
  const [lastLobbyPing, setLastLobbyPing] = React.useState(null);

  const wsRef = React.useRef(null);
  const reconnectTimeoutRef = React.useRef(null);
  const isStateReceivedRef = React.useRef(false);
  const lastReceivedStateRef = React.useRef(lastReceivedState);
  React.useEffect(() => {
    lastReceivedStateRef.current = lastReceivedState;
  }, [lastReceivedState]);

  const sendMessage = React.useCallback((type, payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = {
        roomCode,
        senderId: mySessionId,
        type,
        payload,
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, [roomCode, mySessionId]);

  const connect = React.useCallback(() => {
    clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
        wsRef.current.onclose = null; 
        wsRef.current.close();
    }

    setConnectionStatus('connecting');
    const ws = new WebSocket(WEBSOCKET_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      sendMessage('sync_request', { type: 'requestState' });
      setTimeout(() => {
        if (!isStateReceivedRef.current) {
          setLastReceivedState({ isInitial: true });
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }

      if (data.roomCode !== roomCode || data.senderId === mySessionId) {
        return;
      }

      switch (data.type) {
        case 'state':
          isStateReceivedRef.current = true;
          setLastReceivedState(currentState => {
            if (currentState && data.payload.version <= currentState.version && !data.payload.isFullSync) {
              return currentState;
            }
            return data.payload;
          });
          break;
        case 'action':
          setLastReceivedAction({ ...data.payload, senderId: data.senderId, uniqueId: `${data.payload.sequence}-${data.payload.timestamp}` });
          break;
        case 'sync_request':
          if (data.senderId !== mySessionId) {
            setLastReceivedSyncRequest(data.payload);
          }
          break;
        case 'presence':
           const me = lastReceivedStateRef.current?.players?.find(p => p.sessionId === mySessionId);
           if (me && me.isClaimed) {
             setLastReceivedAction({ type: 'presenceUpdate', payload: { senderId: data.senderId }, uniqueId: `presence-${Date.now()}` });
           }
          break;
        case 'lobby_ping':
           setLastLobbyPing({ senderId: data.senderId, timestamp: Date.now() });
           break;
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
      ws.close();
    };
    
    ws.onclose = () => {
      if (document.visibilityState === 'visible') {
        setConnectionStatus('reconnecting');
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    };
  }, [roomCode, mySessionId, sendMessage]);

  React.useEffect(() => {
    connect();
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
            connect();
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
          wsRef.current.onclose = null;
          wsRef.current.close();
      }
    };
  }, [connect]);
  
  React.useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const me = lastReceivedStateRef.current?.players?.find(p => p.sessionId === mySessionId);
          if (me && me.isClaimed && !me.isSpectator) {
              sendMessage('presence', { playerId: me.id });
          }
      }
    }, 5000);
    return () => clearInterval(heartbeatInterval);
  }, [sendMessage, mySessionId]);

  const publishState = (stateToPublish) => sendMessage('state', stateToPublish);
  const publishAction = (actionType, payload, sequence) => sendMessage('action', { type: actionType, payload, sequence, timestamp: Date.now() });
  const requestStateSync = () => sendMessage('sync_request', { type: 'requestState' });

  return { 
    connectionStatus, 
    lastReceivedState, 
    lastReceivedAction, 
    lastReceivedSyncRequest,
    lastLobbyPing,
    publishState, 
    publishAction, 
    requestStateSync,
    sendMessage 
  };
};

export default useMqtt;