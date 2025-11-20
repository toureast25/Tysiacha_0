
// --- P2P NETWORK UTILITIES ---
// Note: Filename is kept as mqttUtils.js to avoid breaking imports,
// but the implementation is now purely PeerJS (WebRTC).

import { PEER_PREFIX } from '../constants.js';

// Генерирует полный ID пира на основе кода комнаты
export const getRoomPeerId = (roomCode) => {
    return `${PEER_PREFIX}${roomCode.toUpperCase()}`;
};

// Инициализация Хоста (Сервера)
export const initHostPeer = (roomCode) => {
    const peerId = getRoomPeerId(roomCode);
    console.log('[P2P] Initializing Host with ID:', peerId);
    
    const peer = new Peer(peerId, {
        debug: 1,
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });
    
    return peer;
};

// Инициализация Клиента (Случайный ID)
export const initClientPeer = () => {
    console.log('[P2P] Initializing Client');
    const peer = new Peer(null, { // Random ID
        debug: 1,
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });
    return peer;
};

// Подключение к Хосту
export const connectToHost = (peer, roomCode, metadata = {}) => {
    const hostId = getRoomPeerId(roomCode);
    console.log('[P2P] Connecting to Host:', hostId);
    
    const conn = peer.connect(hostId, {
        reliable: true, // Use TCP-like reliability
        metadata: metadata
    });
    
    return conn;
};
