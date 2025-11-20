
import React from 'react';
import Lobby from './Lobby.js';
import Game from './Game.js';

const BlockedTab = () => {
  return React.createElement(
    'div',
    { className: "w-full max-w-md p-8 bg-slate-800/80 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700 text-center" },
    React.createElement('h2', { className: "font-ruslan text-4xl text-yellow-300 mb-4" }, 'Игра уже запущена'),
    React.createElement('p', { className: "text-lg text-gray-300" }, 'Пожалуйста, закройте эту вкладку и вернитесь в ту, где игра уже открыта.'),
    React.createElement('p', { className: "text-sm text-gray-500 mt-4" }, 'Это ограничение необходимо для предотвращения конфликтов и ошибок синхронизации.')
  );
};

const App = () => {
  const [screen, setScreen] = React.useState('LOBBY');
  const [gameProps, setGameProps] = React.useState({});
  const [tabStatus, setTabStatus] = React.useState('CHECKING'); // CHECKING, PRIMARY, BLOCKED
  const [initialRoomCode, setInitialRoomCode] = React.useState(null);
  const channelRef = React.useRef(null);

  React.useEffect(() => {
    channelRef.current = new BroadcastChannel('tysiacha-tab-sync');
    const channel = channelRef.current;
    let isChecking = true;
    const electionTimeout = setTimeout(() => {
      if (isChecking) {
        isChecking = false;
        setTabStatus('PRIMARY');
      }
    }, 250);

    channel.onmessage = (event) => {
      if (event.data === 'PONG' && isChecking) {
        isChecking = false;
        clearTimeout(electionTimeout);
        setTabStatus('BLOCKED');
      }
      if (event.data === 'PING' && tabStatus === 'PRIMARY') {
        channel.postMessage('PONG');
      }
    };
    channel.postMessage('PING');
    return () => {
      clearTimeout(electionTimeout);
      if (channel) channel.close();
    };
  }, [tabStatus]);


  const handleStartGame = React.useCallback((roomCode, playerName, mode, localConfig) => {
    setGameProps({ roomCode, playerName, initialMode: mode, localConfig });
    setScreen('GAME');
  }, []);
  
  React.useEffect(() => {
    if (tabStatus !== 'PRIMARY') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const roomCodeFromUrl = urlParams.get('room');

    // Try to retrieve previous session info
    const savedSessionStr = localStorage.getItem('tysiacha-session');
    let savedSession = {};
    try { savedSession = JSON.parse(savedSessionStr); } catch(e){}

    if (roomCodeFromUrl) {
      window.history.replaceState({}, document.title, window.location.pathname);
      const savedPlayerName = localStorage.getItem('tysiacha-playerName');
      localStorage.removeItem('tysiacha-session');

      if (savedPlayerName) {
        // If we are reloading and we were the host (create mode) for this room,
        // we must restart in 'create' mode to reclaim the ID.
        if (savedSession && savedSession.roomCode === roomCodeFromUrl.toUpperCase() && savedSession.mode === 'create') {
             handleStartGame(roomCodeFromUrl.toUpperCase(), savedPlayerName, 'create');
        } else {
             // Otherwise assume we are joining
             handleStartGame(roomCodeFromUrl.toUpperCase(), savedPlayerName, 'join');
        }
      } else {
        setGameProps({});
        setScreen('LOBBY');
        setInitialRoomCode(roomCodeFromUrl.toUpperCase());
      }
      return; 
    }
    
    if (savedSession && savedSession.roomCode) {
        const { roomCode, playerName, mode } = savedSession;
        // Default to 'join' if mode missing, but prefer saved mode
        const restoredMode = mode || 'join'; 
        handleStartGame(roomCode, playerName, restoredMode);
    }
  }, [tabStatus, handleStartGame]);

  const handleExitGame = React.useCallback(() => {
    localStorage.removeItem('tysiacha-session');
    setGameProps({});
    setScreen('LOBBY');
    setInitialRoomCode(null); 
  }, []);

  const renderScreen = () => {
    switch (tabStatus) {
      case 'CHECKING':
        return React.createElement('div', { className: "text-center text-lg text-gray-300" }, 'Проверка вкладок...');
      case 'BLOCKED':
        return React.createElement(BlockedTab);
      case 'PRIMARY':
        switch (screen) {
          case 'GAME':
            return React.createElement(Game, { key: gameProps.roomCode || 'LOCAL', ...gameProps, onExit: handleExitGame });
          case 'LOBBY':
          default:
            return React.createElement(Lobby, { onStartGame: handleStartGame, initialRoomCode: initialRoomCode });
        }
      default:
        return null;
    }
  };

  return React.createElement(
    'main',
    {
      className: "w-full h-full text-white",
    },
    React.createElement(
      'div',
      { className: "w-full h-full flex items-center justify-center" },
      renderScreen()
    )
  );
};

export default App;
