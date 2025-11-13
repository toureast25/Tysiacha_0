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

  // This function is now only used for major state changes (join, leave, kick, status)
  const publishState = React.useCallback((newState) => {
    if (mqttClientRef.current && mqttClientRef.current.connected) {
      const currentVersion = lastReceivedStateRef.current?.version || 0;
      newState.version = currentVersion + 1;
      
      const finalPayload = {
        ...newState,
        senderId: mySessionId, // Add senderId to avoid processing our own full state updates
      };

      // We still update our own state immediately for responsiveness in these cases
      setLastReceivedState(finalPayload);
      
      mqttClientRef.current.publish(topic, JSON.stringify(finalPayload), { retain: true });
    }
  }, [topic, mySessionId]);

  // NEW: Function to publish lightweight actions
  const publishAction = React.useCallback((actionType, payload) => {
      if (mqttClientRef.current && mqttClientRef.current.connected) {
          const action = {
              type: actionType,
              payload: payload,
              senderId: mySessionId,
              timestamp: Date.now()
          };
          mqttClientRef.current.publish(actionsTopic, JSON.stringify(action));
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
      // Subscribe to all topics
      client.subscribe(topic); // For full state syncs
      client.subscribe(actionsTopic); // For delta updates/actions
      client.subscribe(presenceTopic); // For player presence

      // If we don't receive a full state in 1.5s, we are likely the first player.
      setTimeout(() => {
        if (!isStateReceivedRef.current) {
          setLastReceivedState({ isInitial: true }); // Signal engine to create initial state
        }
      }, 1500);
    });

    client.on('message', (receivedTopic, message) => {
      const messageString = message.toString();
      try {
        const payload = JSON.parse(messageString);
        
        // Always ignore our own messages to prevent feedback loops
        if (payload.senderId === mySessionId) {
            return;
        }

        if (receivedTopic === topic) {
          // Full state message
          isStateReceivedRef.current = true;
          setLastReceivedState(currentState => {
            // Basic version check to prevent processing old states
            if (currentState && payload.version <= currentState.version) {
              return currentState;
            }
            return payload;
          });
        } else if (receivedTopic === actionsTopic) {
          // Action message (delta update)
          setLastReceivedAction(payload);
        
        } else if (receivedTopic === presenceTopic) {
          // Presence message (can be treated like an action)
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

    // Heartbeat to signal presence
    const heartbeatInterval = setInterval(() => {
      if (client.connected && lastReceivedStateRef.current) {
        const me = lastReceivedStateRef.current.players?.find(p => p.sessionId === mySessionId);
        // Only send heartbeat if claimed as a player (not spectator, not in lobby)
        if (me && me.isClaimed && !me.isSpectator) {
          // Payload is minimal, just the player ID
          client.publish(presenceTopic, JSON.stringify({ playerId: me.id, senderId: mySessionId }));
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

  // Return both state and action publishers
  return { connectionStatus, lastReceivedState, lastReceivedAction, publishState, publishAction };
};

export default useMqtt;
