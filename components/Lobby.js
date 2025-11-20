
import React from 'react';
import { checkRoomAvailability } from '../utils/mqttUtils.js';

const Lobby = ({ onStartGame, initialRoomCode }) => {
  const [roomCode, setRoomCode] = React.useState('');
  const [playerName, setPlayerName] = React.useState('');
  const [roomStatus, setRoomStatus] = React.useState(null); // { status: 'loading' | 'found' | 'not_found' | 'uncertain', message?: string }
  const [isLoading, setIsLoading] = React.useState(false);
  const [showLocalSetup, setShowLocalSetup] = React.useState(false);
  const [localPlayerCount, setLocalPlayerCount] = React.useState(2);

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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setRoomCode(result);
    setRoomStatus(null); 
  };

  const checkRoom = React.useCallback(async () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 5) return;

    setIsLoading(true);
    setRoomStatus({ status: 'loading' });

    try {
        const result = await checkRoomAvailability(code);
        
        if (result.exists) {
             setRoomStatus({ status: 'found', message: 'Комната найдена!' });
        } else {
             setRoomStatus({ status: 'not_found', message: 'Комната свободна' });
        }
        setIsLoading(false);

    } catch (e) {
        console.error(e);
        setRoomStatus({ status: 'uncertain', message: 'Ошибка подключения' });
        setIsLoading(false);
    }
  }, [roomCode]);

  // Reset status on typing
  React.useEffect(() => {
      if (roomCode.length === 5) {
          const timer = setTimeout(() => {
             setRoomStatus(null); 
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [roomCode]);


  const handleStart = () => {
    const finalRoomCode = roomCode.trim().toUpperCase();
    const finalPlayerName = playerName.trim();
    
    if (finalRoomCode.length === 5 && finalPlayerName.length > 2) {
      localStorage.setItem('tysiacha-playerName', finalPlayerName);
      
      let mode = 'join'; // Default safe assumption
      
      if (roomStatus?.status === 'not_found') {
          mode = 'create';
      } else if (roomStatus?.status === 'found') {
          mode = 'join';
      } else if (roomStatus === null) {
          mode = 'join'; 
      }
      
      onStartGame(finalRoomCode, finalPlayerName, mode);
    }
  };

  const handleStartLocal = () => {
      onStartGame('OFFLINE', 'Игрок 1', 'local', { playerCount: localPlayerCount });
  };
  
  const RoomStatusInfo = () => {
    if (!roomCode || roomCode.trim().length < 5) return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px]" }, 'Код должен быть из 5 символов');
    
    if (isLoading || roomStatus?.status === 'loading') {
         return React.createElement('div', { className: "text-sm text-gray-400 mt-2 min-h-[20px] flex items-center justify-center" }, 
            React.createElement('div', { className: "flex items-center" },
                React.createElement('div', {className: "w-4 h-4 border-2 border-t-transparent border-title-yellow rounded-full animate-spin mr-2"}), 
                'Проверка комнаты...'
            )
        );
    }

    if (roomStatus?.status === 'found') {
        return React.createElement('div', { className: "text-sm text-green-400 mt-2 min-h-[20px] flex items-center justify-center font-bold" }, 
             'Комната активна! Можно войти.'
        );
    }
    
    if (roomStatus?.status === 'not_found') {
        return React.createElement('div', { className: "text-sm text-blue-300 mt-2 min-h-[20px] flex items-center justify-center" }, 
             'Комната свободна. Будет создана новая.'
        );
    }

    if (roomStatus?.status === 'uncertain') {
        return React.createElement('div', { className: "text-sm text-yellow-400 mt-2 min-h-[20px] flex items-center justify-center" }, 
             roomStatus.message || 'Статус неизвестен'
        );
    }
    
    return React.createElement('div', { className: "text-sm text-gray-500 mt-2 min-h-[20px]" }, 'Нажмите "Проверить" или "Играть"');
  }

  let buttonText = 'Войти';
  if (roomStatus?.status === 'not_found') buttonText = 'Создать игру';
  if (roomStatus?.status === 'uncertain') buttonText = 'Попробовать';

  const isButtonDisabled = roomCode.trim().length !== 5 || playerName.trim().length < 3 || isLoading;

  return React.createElement(
    'div',
    { className: "w-full max-w-md p-6 sm:p-8 bg-slate-800/80 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700 text-center relative" },
    !showLocalSetup ? React.createElement(React.Fragment, null,
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
                onChange: (e) => setRoomCode(e.target.value.toUpperCase().slice(0, 5)),
                onBlur: checkRoom, 
                placeholder: "5 символов",
                maxLength: 5,
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
            'div',
            { className: "flex flex-col gap-4" },
            React.createElement(
              'div',
              { className: "flex gap-3" },
              React.createElement(
                  'button',
                  {
                  onClick: checkRoom,
                  disabled: isButtonDisabled,
                  className: "flex-1 py-3 bg-slate-600 hover:bg-slate-700 rounded-lg font-bold transition-all disabled:bg-gray-500 disabled:cursor-not-allowed"
                  },
                  "Проверить"
              ),
              React.createElement(
                  'button',
                  {
                  onClick: handleStart,
                  className: "flex-[2] py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed",
                  disabled: isButtonDisabled
                  },
                  buttonText
              )
            ),
            React.createElement('div', { className: "relative flex py-2 items-center" },
                React.createElement('div', { className: "flex-grow border-t border-slate-600" }),
                React.createElement('span', { className: "flex-shrink-0 mx-4 text-gray-400 text-sm" }, "ИЛИ"),
                React.createElement('div', { className: "flex-grow border-t border-slate-600" })
            ),
            React.createElement('button', {
                onClick: () => setShowLocalSetup(true),
                className: "w-full py-3 bg-blue-600/80 hover:bg-blue-700 rounded-lg font-bold text-white shadow-md hover:shadow-lg transition-all"
            }, "Играть Офлайн (Hotseat)")
        )
        )
    ) : React.createElement(React.Fragment, null,
        React.createElement('h2', { className: "font-ruslan text-3xl text-title-yellow mb-6" }, 'Локальная игра'),
        React.createElement('p', { className: "text-gray-300 mb-6" }, 'Играйте вдвоем или компанией на одном устройстве. Интернет не требуется.'),
        React.createElement('div', { className: "mb-6" },
             React.createElement('label', { className: "block text-lg font-semibold text-gray-300 mb-2" }, 'Количество игроков'),
             React.createElement('div', { className: "flex justify-center gap-4" },
                [2, 3, 4, 5].map(num => 
                    React.createElement('button', {
                        key: num,
                        onClick: () => setLocalPlayerCount(num),
                        className: `w-12 h-12 rounded-full text-xl font-bold border-2 transition-all ${localPlayerCount === num ? 'bg-highlight text-slate-900 border-highlight' : 'bg-slate-800 border-slate-600 hover:border-gray-400'}`
                    }, num)
                )
             )
        ),
        React.createElement('div', { className: "flex flex-col gap-3" },
             React.createElement('button', {
                 onClick: handleStartLocal,
                 className: "w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl font-bold uppercase shadow-lg"
             }, "Начать игру"),
             React.createElement('button', {
                 onClick: () => setShowLocalSetup(false),
                 className: "w-full py-2 bg-slate-600 hover:bg-slate-700 rounded-lg text-sm font-bold"
             }, "Назад")
        )
    )
  );
};

export default Lobby;
