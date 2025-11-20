
// --- P2P Configuration ---
// Мы используем PeerJS для прямого соединения между браузерами (WebRTC).
// Это исключает ненадежные MQTT брокеры.
// Хост игры действует как сервер.

export const PEER_PREFIX = 'tysiacha-v2-game-'; // Префикс для ID комнат в сети PeerJS
