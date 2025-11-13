// hooks/useMqtt.js
import React from 'react';
import { MQTT_BROKER_URL, MQTT_TOPIC_PREFIX } from '../../constants.js';

const useMqtt = (roomCode, playerName, mySessionId) => {
  const [connectionStatus, setConnectionStatus] = React.useState('connecting');
  const [lastReceivedState, setLastReceivedState] = React.useState(null);
  const [lastReceivedAction, setLastReceivedAction] = React.useState(null);
  const mqttClientRef = React.useRef(null);
  const isStateReceivedRef = React.useRef(false);
  
  const lastReceivedStateRef = React.useRef(lastReceivedState);
  React.useEffect(() => {
    lastReceivedStateRef.current = lastReceivedState;
  }, [lastReceivedState]);

  const topic = `${MQTT_TOPIC_PREFIX}/${roomCode}`;
  const presenceTopic = `${topic}/presence`;
  const actionsTopic = `${topic}/actions`;

  const publishState = React.useCallback((newState) => {
    if (mqttClientRef.current && mqttClientRef.current.connected) {
      const currentVersion = lastReceivedStateRef.current?.version || 0;
      newState.version = currentVersion + 1;
      
      const finalPayload = {
        ...newState,
        senderId: mySessionId,
      };

      setLastReceivedState(finalPayload);
      
      mqttClientRef.current.publish(topic, JSON.stringify(finalPayload), { retain: true });
    }
  }, [topic, mySessionId]);

  const publishAction = React.useCallback((action) => {
      if (mqttClientRef.current && mqttClientRef.current.connected) {
          const payload = {
              ...action,
              senderId: mySessionId,
              timestamp: Date.now()
          };
          mqttClientRef.current.publish(actionsTopic, JSON.stringify(payload));
      }
  }, [actionsTopic, mySessionId]);


  React.useEffect(() => {
    const connectOptions = {
      clientId: `tysiacha-pwa-${mySessionId}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 5000,
      keepalive: 30,
    };
    const client = mqtt.connect(MQTT_BROKER_URL, connectOptions);
    mqttClientRef.current = client;
    isStateReceivedRef.current = false;

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(topic);
      client.subscribe(presenceTopic);
      client.subscribe(actionsTopic);

      setTimeout(() => {
        if (!isStateReceivedRef.current) {
          setLastReceivedState({ isInitial: true });
        }
      }, 1500);
    });

    client.on('message', (receivedTopic, message) => {
      const messageString = message.toString();
      try {
        const payload = JSON.parse(messageString);
        
        if (payload.senderId === mySessionId) {
            return; // Игнорируем собственные действия и состояния
        }

        if (receivedTopic === topic) {
          isStateReceivedRef.current = true;
          setLastReceivedState(currentState => {
            if (currentState && payload.version <= currentState.version) {
              return currentState;
            }
            return payload;
          });
        } else if (receivedTopic === actionsTopic) {
          setLastReceivedAction(payload);
        
        } else if (receivedTopic === presenceTopic) {
          setLastReceivedAction({ type: 'presenceUpdate', payload });
        }
      } catch (e) {
        console.error(`Error parsing message on topic ${receivedTopic}:`, e);
      }
    });

    client.on('error', (err) => {
        console.error('MQTT Connection Error:', err);
        setConnectionStatus('error');
    });
    client.on('offline', () => setConnectionStatus('reconnecting'));
    client.on('reconnect', () => setConnectionStatus('reconnecting'));

    const heartbeatInterval = setInterval(() => {
      if (client.connected && lastReceivedStateRef.current) {
        const me = lastReceivedStateRef.current.players?.find(p => p.sessionId === mySessionId);
        if (me && me.isClaimed && !me.isSpectator) {
          client.publish(presenceTopic, JSON.stringify({ playerId: me.id }));
        }
      }
    }, 5000);

    return () => {
      clearInterval(heartbeatInterval);
      if (client) {
        client.end(true);
      }
    };
  }, [roomCode, mySessionId, topic, presenceTopic, actionsTopic]);

  return { connectionStatus, lastReceivedState, lastReceivedAction, publishState, publishAction };
};

export default useMqtt;