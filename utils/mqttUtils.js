
// --- MQTT UTILITIES ---

// Переключились на EMQX, так как он более стабилен для WSS (WebSocket Secure) подключений.
// HiveMQ часто имеет проблемы с таймаутами на публичных брокерах.
const PRIMARY_BROKER = 'wss://broker.emqx.io:8084/mqtt';

const APP_PREFIX = 'tysiacha-v3-app';

// Генерирует топик для конкретной комнаты
export const getRoomTopic = (roomCode) => {
    return `${APP_PREFIX}/room/${roomCode.toUpperCase()}`;
};

// Создает MQTT клиент
export const createMqttClient = (clientId) => {
    if (!window.mqtt) {
        throw new Error("MQTT library not loaded");
    }

    console.log('[MQTT] Connecting to shared broker:', PRIMARY_BROKER);
    
    const client = window.mqtt.connect(PRIMARY_BROKER, {
        clientId: clientId || `guest_${Math.random().toString(16).substr(2, 8)}`,
        keepalive: 30, // Оптимизировано: 30 секунд достаточно для поддержания
        clean: true,
        reconnectPeriod: 2000, // Быстрый реконнект
        connectTimeout: 10000, // 10 секунд на попытку
        resubscribe: true,
    });

    return client;
};

// Функция для проверки существования комнаты (отправляет PING, ждет PONG)
export const checkRoomAvailability = (roomCode) => {
    return new Promise((resolve, reject) => {
        const tempId = `checker_${Math.random().toString(16).substr(2, 8)}`;
        let client;
        try {
             client = createMqttClient(tempId);
        } catch (e) {
             console.error("Failed to create MQTT client for check:", e);
             resolve({ exists: false }); // Fallback: разрешаем создать, если не удалось проверить
             return;
        }

        const topic = getRoomTopic(roomCode);
        let found = false;
        let timeout;

        client.on('connect', () => {
            console.log('[Check] Connected, subscribing...');
            client.subscribe(topic, { qos: 1 }, (err) => { // QoS 1 для надежности
                if (!err) {
                    // Отправляем запрос "Ты жив?"
                    client.publish(topic, JSON.stringify({ type: 'PING_HOST', senderId: tempId }));
                }
            });
        });

        client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                // Если хост ответил, значит комната занята
                if (data.type === 'PONG_HOST') {
                    found = true;
                    clearTimeout(timeout);
                    client.end(true);
                    resolve({ exists: true });
                }
            } catch (e) {}
        });

        // Ждем ответа. 
        // 5 секунд должно хватить для EMQX. Если больше - скорее всего никого нет или сеть лежит.
        timeout = setTimeout(() => {
            if (!found) {
                if (client) client.end(true);
                resolve({ exists: false });
            }
        }, 5000);

        client.on('error', (err) => {
            console.warn("Check room temporary error:", err);
            // Если ошибка соединения - не блокируем пользователя, разрешаем создать.
            // Split-brain логика в Game.js исправит дублирование, если оно возникнет.
        });
    });
};