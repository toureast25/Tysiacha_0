
// Конфигурация подключения к MQTT брокеру (HiveMQ Cloud)
// ВАЖНО: Заполните поля username и password данными из вашей панели управления HiveMQ Cluster -> Access Management.

export const mqttConfig = {
    host: 'b862a42614b74f94be92c8fb39d4736f.s1.eu.hivemq.cloud',
    port: 8884,
    path: '/mqtt',
    protocol: 'wss',
    username: '111222', // Вставьте сюда имя пользователя (Cluster credentials)
    password: 'Q222111q'  // Вставьте сюда пароль
};
