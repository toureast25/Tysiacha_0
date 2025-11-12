// hooks/useMqtt.js
import React from 'react';
import { MQTT_BROKER_URL, MQTT_TOPIC_PREFIX } from '../../constants.js';

const useMqtt = (roomCode, playerName, mySessionId) => {
  const [connectionStatus, setConnectionStatus] = React.useState('connecting');
  const [lastReceivedState, setLastReceivedState] = React.useState(null);
  const mqttClientRef = React.useRef(null);
  const isStateReceivedRef = React.useRef(false);
  
  // Ref to hold the latest state without causing re-renders or dependency issues
  const lastReceivedStateRef = React.useRef(lastReceivedState);
  React.useEffect(() => {
    lastReceivedStateRef.current = lastReceivedState;
  }, [lastReceivedState]);

  const topic = `${MQTT_TOPIC_PREFIX}/${roomCode}`;
  const presenceTopic = `${topic}/presence`;

  const publishState = React.useCallback((newState, isOptimisticUpdate = false) => {
    if (mqttClientRef.current && mqttClientRef.current.connected) {
      // Use the ref to get the most current version number
      const currentVersion = lastReceivedStateRef.current?.version || 0;
      const { senderId, ...stateWithoutSender } = newState;
      
      const finalState = {
        ...stateWithoutSender,
        version: currentVersion + 1,
        senderId: mySessionId,
      };

      if (isOptimisticUpdate) {
        setLastReceivedState(finalState);
      }
      
      mqttClientRef.current.publish(topic, JSON.stringify(finalState), { retain: true });
    }
  }, [topic, mySessionId]); // Removed lastReceivedState from dependencies


  React.useEffect(() => {
    const connectOptions = {
      clientId: `tysiacha-pwa-${mySessionId}`, // СТАБИЛЬНЫЙ ID на всю сессию вкладки
      clean: true,
      connectTimeout: 8000, // Увеличено до 8 секунд для медленных сетей
      reconnectPeriod: 5000, // Увеличена задержка для стабильности
      keepalive: 30, // Пинги для поддержания соединения
    };
    const client = mqtt.connect(MQTT_BROKER_URL, connectOptions);
    mqttClientRef.current = client;
    isStateReceivedRef.current = false;

    client.on('connect', () => {
      setConnectionStatus('connected');
      client.subscribe(topic);
      client.subscribe(presenceTopic);

      // Timeout to check if we need to create the initial state
      setTimeout(() => {
        if (!isStateReceivedRef.current) {
          // This will be handled by the game engine hook now
          setLastReceivedState({ isInitial: true });
        }
      }, 1500);
    });

    client.on('message', (receivedTopic, message) => {
      const messageString = message.toString();
      if (receivedTopic === topic) {
        isStateReceivedRef.current = true;
        try {
          const receivedState = JSON.parse(messageString);
          setLastReceivedState(currentState => {
            if (currentState && receivedState.version <= currentState.version) {
              return currentState; // Old or same version, ignore.
            }
            return receivedState;
          });
        } catch (e) {
          console.error('Error parsing game state:', e);
        }
      } else if (receivedTopic === presenceTopic) {
        setLastReceivedState(currentState => {
            if (!currentState) return null;
            try {
                const { playerId } = JSON.parse(messageString);
                const now = Date.now();
                
                // Update timestamp without causing a full re-render if state is unchanged
                const player = currentState.players.find(p => p.id === playerId);
                if (player) {
                  player.lastSeen = now;
                }
                
                // Immediate status update on heartbeat
                if (player && player.isClaimed && player.status !== 'online') {
                    const newPlayers = currentState.players.map(p => 
                        p.id === playerId ? { ...p, status: 'online', lastSeen: now } : p
                    );
                    const newState = { ...currentState, players: newPlayers };
                    // We can publish this small update directly.
                    // IMPORTANT: We call the stable publishState function here
                    publishState(newState); 
                    return newState; // Optimistically update local state
                }
                return { ...currentState }; // Return a new object to trigger updates if needed
            } catch (e) {
                 return currentState;
            }
        });
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
        client.end(true); // Force close connection
      }
    };
  // publishState теперь стабильна и не вызывает пересоздание подключения
  }, [roomCode, mySessionId, topic, presenceTopic, publishState]);

  return { connectionStatus, lastReceivedState, publishState };
};

export default useMqtt;