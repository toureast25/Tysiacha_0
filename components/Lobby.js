
import React from 'react';
import { initClientPeer, connectToHost } from '../utils/mqttUtils.js'; // Actually imports PeerJS utils

const Lobby = ({ onStartGame, initialRoomCode }) => {
  const [roomCode, setRoomCode] = React.useState('');
  const [playerName, setPlayerName] = React.useState('');
  const [roomStatus, setRoomStatus] = React.useState(null); // { status: 'loading' | 'found' | 'not_found', message?: string }
  const [isLoading, setIsLoading] = React.useState(false);

  // Effect to load saved data and generate initial room code if needed
  React.useEffect(() => {
    const savedName = localStorage.getItem('tysiacha-playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
    if (initialRoomCode) {
      setRoomCode(initialRoomCode);
    } else {
      generateRoomCode();
    }
  }, [initialRoomCode]);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like I, 1, O, 0
    let result = '';
    for (let i = 0; i < 5; i++) { // 5 chars is enough for P2P collision avoidance usually
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomCode(result);
    setRoomStatus(null);
  };

  // Проверка существования комнаты через попытку подключения
  const checkRoom = React.useCallback(async () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length < 4) return;

    setIsLoading(true);
    setRoomStatus({ status: 'loading' });

    try {
        const peer = initClientPeer();
        
        peer.on('open', () => {
            const conn = connectToHost(peer, code);
            let connected = false;

            // Таймаут на поиск комнаты
            const timeout = setTimeout(() => {
                if (!connected) {
                    setRoomStatus({ status: 'not_found', message: 'Комната не найдена или хост оффлайн' });
                    conn.close();
                    peer.destroy();
                    setIsLoading(false);
                }
            }, 3000); // 3 секунды на поиск

            conn.on('open', () => {
                connected = true;
                clearTimeout(timeout);
                // Мы подключились - значит комната есть
                // Спрашиваем инфо? Пока просто считаем что нашли.
                // Для P2P лучше не держать лишних соединений в лобби.
                setRoomStatus({ status: 'found', message: 'Комната найдена!' });
                
                // Закрываем тестовое соединение
                setTimeout(() => {
                    conn.close();
                    peer.destroy();
                    setIsLoading(false);
                }, 500);
            });

            peer.on('error', (err) => {
                console.log('Peer Check Error', err);
                // Обычно peer-unavailable падает сюда
                clearTimeout(timeout);
                setRoomStatus({ status: 'not_found', message: 'Комната не существует' });
                peer.destroy();
                setIsLoading(false);
            });
        });

        peer.on('error', (err) => {
             console.warn('Peer Init Error', err);
             setIsLoading(false);
             setRoomStatus({ status: 'not_found', message: 'Ошибка сети P2P' });
        });

    } catch (e) {
        console.error(e);
        setRoomStatus({ status: 'not_found', message: 'Ошибка' });
        setIsLoading(false);
    }
  }, [roomCode]);

  // Debounced check handled manually by user clicking "Check" or Effect? 
  // Let's make it explicit for P2P to save resources, or simple timeout
  React.useEffect(() => {
      if (roomCode.length >= 4) {
          const timer = setTimeout(() => {
             // В P2P проверка дорогая (создает сокеты), поэтому не делаем её на каждый чих
             // Но для UX можно сбросить статус
             setRoomStatus(null); 
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [roomCode]);


  const handleStart = () => {
    const finalRoomCode = roomCode.trim().toUpperCase();
    const finalPlayerName = playerName.trim();
    
    if (finalRoomCode.length >= 4 && finalPlayerName.length > 2) {
      localStorage.setItem('tysiacha-playerName', finalPlayerName);
      // Если мы не проверяли комнату или не нашли её, мы считаем что создаем новую (Хост)
      // Если нашли - мы Джойнер
      // НО: В P2P Хост должен захватить ID. Если ID занят, он не сможет стать Хостом.
      // Поэтому мы передаем управление в Game, и Game сама разрулит (станет хостом или подключится)
      // Исходя из UX: Кнопка "Создать" и "Войти" может быть одна.
      // Game.js попытается стать Хостом. Если ID занят -> подключится как клиент.
      
      onStartGame(finalRoomCode, finalPlayerName);
    }
  };
  
  const RoomStatusInfo = () => {
    if (!roomCode || roomCode.trim().length < 4) return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px]" }, 'Код должен быть не менее 4 символов');
    
    if (isLoading || roomStatus?.status === 'loading') {
         return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px] flex items-center justify-center" }, 
            React.createElement('div', { className: "flex items-center" },
                React.createElement('div', {className: "w-4 h-4 border-2 border-t-transparent border-title-yellow rounded-full animate-spin mr-2"}), 
                'Поиск комнаты в P2P сети...'
            )
        );
    }

    if (roomStatus?.status === 'found') {
        return React.createElement('div', { className: "text-sm text-green-400 mt-2 min-h-[20px] flex items-center justify-center font-bold" }, 
             'Комната найдена! Нажмите Войти.'
        );
    }
    
    if (roomStatus?.status === 'not_found') {
        return React.createElement('div', { className: "text-sm text-blue-300 mt-2 min-h-[20px] flex items-center justify-center" }, 
             'Комната свободна. Вы станете Хостом.'
        );
    }
    
    return React.createElement('div', { className: "text-sm text-gray-500 mt-2 min-h-[20px]" }, 'Введите код для входа или создания');
  }

  const buttonText = 'Играть';
  const isButtonDisabled = roomCode.trim().length < 4 || playerName.trim().length < 3 || isLoading;

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
              onBlur: checkRoom, // Проверяем комнату когда закончили ввод
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
                    React.createElement('path', { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" })
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
