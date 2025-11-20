
// --- MQTT UTILITIES ---
// Используем массив публичных брокеров для надежности (Failover).
// Если один недоступен, библиотека попытается подключиться к следующему.

// Список брокеров. Важно использовать WSS (Secure WebSocket) для работы с HTTPS.
const ALL_BROKERS = [
    'wss://test.mosquitto.org:8081/mqtt',  // Mosquitto (Обычно самый надежный)
    'wss://broker.emqx.io:8084/mqtt',      // EMQX (Secure)
    'wss://public.mqtthq.com:8084/mqtt',   // HQ (Secure)
    'wss://broker.hivemq.com:8000/mqtt',   // HiveMQ (Secure)
];

// Перемешиваем брокеров при каждом запуске, чтобы распределить нагрузку
const getShuffledBrokers = () => {
    const brokers = [...ALL_BROKERS];
    for (let i = brokers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [brokers[i], brokers[j]] = [brokers[j], brokers[i]];
    }
    return brokers;
};

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

    // Получаем перемешанный список
    const brokers = getShuffledBrokers();
    // Выбираем первый из списка. 
    // Библиотека mqtt.js в браузере (v4.3.7) требует строку URL первым аргументом, а не массив.
    // Случайный выбор происходит благодаря getShuffledBrokers.
    const selectedBroker = brokers[0];
    
    console.log('[MQTT] Connecting to:', selectedBroker);
    
    const client = window.mqtt.connect(selectedBroker, {
        clientId: clientId || `guest_${Math.random().toString(16).substr(2, 8)}`,
        keepalive: 30,
        clean: true,
        reconnectPeriod: 2000, // Пробуем переподключаться каждые 2 секунды
        connectTimeout: 10000, // Таймаут на попытку коннекта (10 сек)
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
             resolve({ exists: false });
             return;
        }

        const topic = getRoomTopic(roomCode);
        let found = false;
        let timeout;

        client.on('connect', () => {
            console.log('[Check] Connected, subscribing...');
            client.subscribe(topic, (err) => {
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
                    client.end();
                    resolve({ exists: true });
                }
            } catch (e) {}
        });

        // Ждем 5 секунд.
        timeout = setTimeout(() => {
            if (!found) {
                if (client) client.end();
                resolve({ exists: false });
            }
        }, 5000);

        client.on('error', (err) => {
            console.warn("Check room temporary error:", err);
            // В случае ошибки подключения считаем, что комнаты нет или нельзя проверить
        });
    });
};
