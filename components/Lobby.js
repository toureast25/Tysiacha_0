// 
import React from 'react';
import { WEBSOCKET_URL } from '../constants.js';

const Lobby = ({ onStartGame, initialRoomCode }) => {
  const [roomCode, setRoomCode] = React.useState('');
  const [playerName, setPlayerName] = React.useState('');
  const [roomStatus, setRoomStatus] = React.useState(null);
  const [isClientConnected, setIsClientConnected] = React.useState(false);
  
  const wsRef = React.useRef(null);
  const statusCheckTimeoutRef = React.useRef(null);
  const reconnectTimeoutRef = React.useRef(null);
  const lobbySessionId = React.useRef(`lobby_${Math.random().toString(36).substr(2, 9)}`).current;
  const roomCodeRef = React.useRef(roomCode);
  roomCodeRef.current = roomCode;

  React.useEffect(() => {
    const savedName = localStorage.getItem('tysiacha-playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
    if (initialRoomCode) {
      setRoomCode(initialRoomCode);
    } else {
      const lastRoom = localStorage.getItem('tysiacha-lastRoom');
      if (lastRoom) {
        setRoomCode(lastRoom);
      } else {
        generateRoomCode();
      }
    }
  }, [initialRoomCode]);

  React.useEffect(() => {
    const connect = () => {
        clearTimeout(reconnectTimeoutRef.current);
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

        const ws = new WebSocket(WEBSOCKET_URL);
        wsRef.current = ws;

        ws.onopen = () => setIsClientConnected(true);
        ws.onclose = () => {
            setIsClientConnected(false);
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };
        ws.onerror = () => setIsClientConnected(false);
        ws.onmessage = (event) => {
          let data;
          try { data = JSON.parse(event.data); } catch (e) { return; }
          
          if (data.roomCode === roomCodeRef.current.trim().toUpperCase() && data.type === 'lobby_pong') {
              clearTimeout(statusCheckTimeoutRef.current);
              setRoomStatus({
                status: 'found',
                data: data.payload,
              });
          }
        };
    };
    connect();
    return () => {
        clearTimeout(reconnectTimeoutRef.current);
        wsRef.current?.close();
    };
  }, []);

  React.useEffect(() => {
    clearTimeout(statusCheckTimeoutRef.current);
    const code = roomCode.trim().toUpperCase();

    if (!isClientConnected || code.length < 4) {
      setRoomStatus(null);
      return;
    }
    
    setRoomStatus({ status: 'loading' });

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            roomCode: code,
            type: 'lobby_ping',
            senderId: lobbySessionId
        }));

        statusCheckTimeoutRef.current = setTimeout(() => {
            setRoomStatus({ status: 'not_found' });
        }, 2000);
    } else if (!isClientConnected) {
        setRoomStatus({ status: 'not_found', message: 'Ошибка сети' });
    }

  }, [roomCode, isClientConnected, lobbySessionId]);

  const generateRoomCode = () => {
    const chars = 'АБВГДЕЖЗИКЛМНПРСТУФХЦЧШЫЭЮЯ123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomCode(result);
  };

  const handleStart = () => {
    const finalRoomCode = roomCode.trim().toUpperCase();
    const finalPlayerName = playerName.trim();
    if (finalRoomCode.length >= 4 && finalPlayerName.length > 2) {
      localStorage.setItem('tysiacha-playerName', finalPlayerName);
      onStartGame(finalRoomCode, finalPlayerName);
    }
  };
  
  const RoomStatusInfo = () => {
    if (!roomCode || roomCode.trim().length < 4) return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px]" }, 'Код должен быть не менее 4 символов');
    if (!isClientConnected) return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px] flex items-center justify-center" }, React.createElement('div', {className: "w-4 h-4 border-2 border-t-transparent border-title-yellow rounded-full animate-spin mr-2"}), 'Подключение к сети...');
    if (!roomStatus) return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px]" }, 'Придумайте код или введите существующий');
    
    let content;
    let icon;
    
    switch(roomStatus.status) {
        case 'loading':
            icon = React.createElement('div', {className: "w-4 h-4 border-2 border-t-transparent border-title-yellow rounded-full animate-spin mr-2"});
            content = 'Проверка комнаты...';
            break;
        case 'not_found':
            icon = React.createElement('svg', { xmlns:"http://www.w3.org/2000/svg", className:"h-5 w-5 mr-2 text-blue-400", viewBox:"0 0 20 20", fill:"currentColor" }, React.createElement('path', { fillRule:"evenodd", d:"M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z", clipRule:"evenodd" }));
            content = roomStatus.message || 'Комната не найдена. Можно создать новую.';
            break;
        case 'found':
            icon = React.createElement('svg', { xmlns:"http://www.w3.org/2000/svg", className:"h-5 w-5 mr-2 text-green-400", viewBox:"0 0 20 20", fill:"currentColor" }, React.createElement('path', { fillRule:"evenodd", d:"M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z", clipRule:"evenodd" }));
            const { hostName, playerCount } = roomStatus.data || {};
            if (hostName && typeof playerCount === 'number') {
                content = `Хост: ${hostName}, Игроков: ${playerCount}/5`;
            } else {
                content = 'Комната найдена. Можно войти.';
            }
            break;
        default:
            return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px]" }, 'Придумайте код или введите существующий');
    }
    
    return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px] flex items-center justify-center" }, icon, content);
  }

  const buttonText = roomStatus?.status === 'found' ? 'Войти в игру' : 'Создать и войти';
  const isButtonDisabled = roomCode.trim().length < 4 || playerName.trim().length < 3 || roomStatus?.status === 'loading' || !isClientConnected;


  return React.createElement(
    'div',
    { className: "w-full max-w-md p-6 sm:p-8 bg-slate-800/80 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700 text-center" },
    React.createElement('h2', { className: "font-ruslan text-2xl sm:text-4xl lg:text-5xl text-title-yellow mb-4 sm:mb-6" }, 'Вход в игру'),
    React.createElement(
      'div',
      { className: "space-y-4 sm:space-y-6" },
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: "playerName", className: "block text-lg font-semibold text-gray-300 mb-2" },
          'Ваше имя'
        ),
        React.createElement('input', {
          id: "playerName",
          type: "text",
          value: playerName,
          onChange: (e) => setPlayerName(e.target.value),
          placeholder: "Введите имя",
          className: "w-full p-3 text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-xl font-semibold text-white focus:outline-none focus:border-highlight transition-colors"
        })
      ),
      React.createElement(
        'div',
        null,
        React.createElement(
          'label',
          { htmlFor: "roomCode", className: "block text-lg font-semibold text-gray-300 mb-2" },
          'Код комнаты'
        ),
        React.createElement(
            'div',
            { className: 'relative flex items-center' },
            React.createElement('input', {
              id: "roomCode",
              type: "text",
              value: roomCode,
              onChange: (e) => setRoomCode(e.target.value.toUpperCase()),
              placeholder: "Введите код",
              className: "w-full p-3 pr-12 text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-highlight transition-colors"
            }),
            React.createElement(
                'button',
                {
                    onClick: generateRoomCode,
                    className: "absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-title-yellow transition-colors focus:outline-none",
                    'aria-label': "Сгенерировать новый код",
                    title: "Сгенерировать новый код"
                },
                React.createElement(
                    'svg',
                    { xmlns: "http://www.w3.org/2000/svg", className: "h-6 w-6", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2 },
                    React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.562L16.25 21.75l-.648-1.188a2.25 2.25 0 01-1.44-1.442L12.97 18.75l1.188-.648a2.25 2.25 0 011.44 1.442l.648 1.188z" })
                )
            )
        ),
        React.createElement(RoomStatusInfo, null)
      ),
      React.createElement(
        'button',
        {
          onClick: handleStart,
          className: "w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed",
          disabled: isButtonDisabled
        },
        buttonText
      )
    )
  );
};

export default Lobby;