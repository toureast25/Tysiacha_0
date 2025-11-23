
import React from 'react';
import GameUI from './GameUI.js';
import { createMqttClient, getRoomTopic } from '../utils/mqttUtils.js';
import {
  createInitialState,
  createLocalGameState,
  analyzeDice,
  validateSelection,
  calculateTotalScore,
  getPlayerBarrelStatus,
  findNextHost,
} from '../utils/gameLogic.js';

// --- GAME REDUCER (Shared logic) ---
function gameReducer(state, action) {
  if (action.type === 'SET_STATE') {
      if (!action.payload) return state;
      return action.payload;
  }
  
  const newState = { ...state, version: (state.version || 1) + 1 };
  
  switch (action.type) {
    case 'PLAYER_JOIN': {
        const { playerName, sessionId, asSpectator } = action.payload;
        if (newState.players.some(p => p.sessionId === sessionId) || newState.spectators.some(s => s.id === sessionId)) {
             return state;
        }
        if (asSpectator) {
            return { ...newState, spectators: [...newState.spectators, { name: playerName, id: sessionId }] };
        }
        const joinIndex = newState.players.findIndex(p => !p.isClaimed);
        if (joinIndex === -1) return newState;

        const restoredScore = newState.leavers?.[playerName] || 0;
        const newLeavers = { ...newState.leavers };
        if (restoredScore > 0) delete newLeavers[playerName];

        const newPlayers = newState.players.map((p, i) => 
            i === joinIndex 
            ? { ...p, name: playerName, isClaimed: true, scores: restoredScore > 0 ? [restoredScore] : [], status: 'online', sessionId, hasEnteredGame: restoredScore > 0, lastSeen: Date.now() } 
            : p
        );
        return { ...newState, players: newPlayers, leavers: newLeavers, gameMessage: `${playerName} присоединился.` };
    }
    
    case 'PLAYER_LEAVE': {
      const { sessionId } = action.payload;
      if (newState.spectators.some(s => s.id === sessionId)) {
           return {...newState, spectators: newState.spectators.filter(s => s.id !== sessionId)};
      }
      const playerIndex = newState.players.findIndex(p => p.sessionId === sessionId);
      if (playerIndex === -1) return newState;
      
      const playerToRemove = newState.players[playerIndex];
      if (!playerToRemove.isClaimed) return newState;

      const totalScore = calculateTotalScore(playerToRemove);
      const newLeavers = totalScore > 0 ? { ...newState.leavers, [playerToRemove.name]: totalScore } : newState.leavers;
      
      let newPlayers = newState.players.map(p => p.sessionId === sessionId ? { ...createInitialState().players[0], id: p.id, name: `Игрок ${p.id + 1}` } : p);
      const gameWasInProgress = !newState.isGameOver && newState.isGameStarted;
      let newCurrentPlayerIndex = newState.currentPlayerIndex;

      if (gameWasInProgress && newState.currentPlayerIndex === playerIndex) {
          newCurrentPlayerIndex = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
      }
      
      const remainingPlayers = newPlayers.filter(p => p.isClaimed && !p.isSpectator);
      if (gameWasInProgress && remainingPlayers.length < 2) {
        return { ...newState, players: newPlayers, leavers: newLeavers, isGameOver: true, gameMessage: 'Игра окончена (недостаточно игроков).' };
      }
      
      let message = `${playerToRemove.name} вышел.`;
      if (gameWasInProgress && newState.currentPlayerIndex === playerIndex) {
          message += ` Ход ${newPlayers[newCurrentPlayerIndex].name}.`;
      }
      return { ...newState, players: newPlayers, leavers: newLeavers, gameMessage: message, currentPlayerIndex: newCurrentPlayerIndex };
    }
    
    case 'TOGGLE_DIE_SELECTION': {
        if (newState.isGameOver || newState.diceOnBoard.length === 0) return state;
        const { index } = action.payload;
        const newSelectedIndices = newState.selectedDiceIndices.includes(index)
            ? newState.selectedDiceIndices.filter(i => i !== index)
            : [...newState.selectedDiceIndices, index];

        const selectedValues = newSelectedIndices.map(i => newState.diceOnBoard[i]);
        let validation = validateSelection(selectedValues);
        if (!validation.isValid && selectedValues.length > 0) {
            const combinedValidation = validateSelection([...newState.diceKeptFromThisRoll, ...selectedValues]);
            if (combinedValidation.isValid) {
                validation = { isValid: true, score: combinedValidation.score - validateSelection(newState.diceKeptFromThisRoll).score };
            }
        }
        return {
            ...newState,
            selectedDiceIndices: newSelectedIndices,
            canKeep: validation.isValid,
            potentialScore: validation.score > 0 ? validation.score : 0,
            gameMessage: validation.isValid ? `Выбрано +${validation.score}. Можно отложить.` : `Выберите корректную комбинацию.`
        };
    }
    
    case 'KEEP_DICE': {
        const { indices } = action.payload;
        const combinedDice = [...newState.diceKeptFromThisRoll, ...indices.map(i => newState.diceOnBoard[i])];
        const validation = validateSelection(combinedDice);
        if (!validation.isValid) return newState;
        const newTurnScore = newState.scoreFromPreviousRolls + validation.score;
        const scoreAdded = newTurnScore - newState.currentTurnScore;
        const newKeptDiceThisTurn = [...newState.keptDiceThisTurn, ...indices.map(i => newState.diceOnBoard[i])];
        const newDiceOnBoard = newState.diceOnBoard.filter((_, i) => !indices.includes(i));
        const isHotDice = newDiceOnBoard.length === 0;

        return {
            ...newState,
            currentTurnScore: newTurnScore,
            keptDiceThisTurn: newKeptDiceThisTurn,
            diceKeptFromThisRoll: isHotDice ? [] : combinedDice,
            diceOnBoard: newDiceOnBoard,
            gameMessage: `+${scoreAdded}! Очки за ход: ${newTurnScore}. ${isHotDice ? 'Все кости сыграли! Горячие кости!' : 'Бросайте снова или запишите.'}`,
            canRoll: true,
            canBank: true,
            selectedDiceIndices: [],
            canKeep: false,
            potentialScore: 0
        };
    }
    
    case 'ROLL_DICE': {
        if (!newState.canRoll || newState.isGameOver || !newState.isGameStarted) return state;
        const isHotDiceRoll = newState.keptDiceThisTurn.length >= 5;
        const diceToRollCount = isHotDiceRoll ? 5 : 5 - newState.keptDiceThisTurn.length;
        const newDice = Array.from({ length: diceToRollCount }, () => Math.floor(Math.random() * 6) + 1);
        const { scoringGroups } = analyzeDice(newDice);

        if (scoringGroups.reduce((s, g) => s + g.score, 0) === 0) { // BOLT
            const currentPlayer = newState.players[newState.currentPlayerIndex];
            let updatedPlayer = { ...currentPlayer, scores: [...currentPlayer.scores, '/'] };
            const barrelStatus = getPlayerBarrelStatus(currentPlayer);
            if (barrelStatus) {
                updatedPlayer.barrelBolts = (updatedPlayer.barrelBolts || 0) + 1;
                if (updatedPlayer.barrelBolts >= 3) {
                    const totalScore = calculateTotalScore(currentPlayer);
                    updatedPlayer.scores.push((barrelStatus === '200-300' ? 150 : 650) - totalScore);
                    updatedPlayer.barrelBolts = 0;
                    updatedPlayer.justResetFromBarrel = true;
                }
            }
            const newPlayers = newState.players.map((p, i) => i === newState.currentPlayerIndex ? updatedPlayer : p);
            const nextPlayerIndex = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
            const nextPlayer = newPlayers[nextPlayerIndex];
            let gameMessage = `${currentPlayer.name} получает болт! Ход ${nextPlayer.name}.`;
            return { ...createInitialState(), players: newPlayers.map(p => ({ ...p, justResetFromBarrel: false })), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, currentPlayerIndex: nextPlayerIndex, diceOnBoard: newDice, gameMessage, turnStartTime: Date.now(), canRoll: true };
        } else {
            return {
                ...newState,
                diceOnBoard: newDice,
                keptDiceThisTurn: isHotDiceRoll ? [] : newState.keptDiceThisTurn,
                diceKeptFromThisRoll: [],
                scoreFromPreviousRolls: newState.currentTurnScore,
                gameMessage: `Ваш бросок. Выберите очковые кости.`,
                canRoll: false,
                canBank: true,
                selectedDiceIndices: [],
                canKeep: false,
                potentialScore: 0
            };
        }
    }
    
    case 'BANK_SCORE': {
        if (!newState.canBank || newState.isGameOver) return state;
        const finalTurnScore = newState.currentTurnScore + newState.potentialScore;
        const currentPlayer = newState.players[newState.currentPlayerIndex];
        
        const getBoltState = (playerForBolt, barrelStatus) => {
          let updatedPlayer = { ...playerForBolt, scores: [...playerForBolt.scores, '/'] };
          if (barrelStatus) {
            updatedPlayer.barrelBolts = (updatedPlayer.barrelBolts || 0) + 1;
            if (updatedPlayer.barrelBolts >= 3) {
              const totalScore = calculateTotalScore(playerForBolt);
              updatedPlayer.scores.push((barrelStatus === '200-300' ? 150 : 650) - totalScore);
              updatedPlayer.barrelBolts = 0;
              updatedPlayer.justResetFromBarrel = true;
            }
          }
          const newPlayers = newState.players.map((p, i) => i === newState.currentPlayerIndex ? updatedPlayer : p);
          const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
          const nextPlayer = newPlayers[nextIdx];
          let msg = `${playerForBolt.name} получает болт. Ход ${nextPlayer.name}.`;
          return { ...createInitialState(), players: newPlayers.map(p => ({...p, justResetFromBarrel: false})), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() };
        };

        if (finalTurnScore === 0 && newState.keptDiceThisTurn.length > 0) {
            return getBoltState(currentPlayer);
        }
        if (!currentPlayer.hasEnteredGame && finalTurnScore < 50) {
            const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, newState.players);
            return { ...createInitialState(), players: newState.players, spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: `${currentPlayer.name} не набрал 50 для входа.`, turnStartTime: Date.now() };
        }
        const barrelStatus = getPlayerBarrelStatus(currentPlayer);
        const totalBefore = calculateTotalScore(currentPlayer);
        const failedBarrel = (barrelStatus === '200-300' && totalBefore + finalTurnScore < 300) || (barrelStatus === '700-800' && totalBefore + finalTurnScore < 800);
        if (failedBarrel) {
            return getBoltState(currentPlayer, barrelStatus);
        }
        
        let playersAfterTurn = newState.players.map((p, i) => i === newState.currentPlayerIndex ? { ...p, scores: [...p.scores, finalTurnScore], hasEnteredGame: true, barrelBolts: 0 } : p);
        const newTotal = calculateTotalScore(playersAfterTurn[newState.currentPlayerIndex]);
        const newBarrel = (newTotal >= 200 && newTotal < 300) ? '200-300' : (newTotal >= 700 && newTotal < 800) ? '700-800' : null;
        let penaltyMsgs = [];

        let playersWithPenalties = playersAfterTurn.map((p, i) => {
            if (i === newState.currentPlayerIndex || !p.isClaimed) return p;
            const oldTotal = calculateTotalScore(newState.players[i]);
            const otherBarrel = getPlayerBarrelStatus(newState.players[i]);
            if (newBarrel && otherBarrel === newBarrel) {
                penaltyMsgs.push(`${p.name} сбит с бочки.`);
                return { ...p, scores: [...p.scores, (newBarrel === '200-300' ? 150 : 650) - oldTotal] };
            }
            if (totalBefore < oldTotal && newTotal >= oldTotal && oldTotal >= 100) {
                const scoreAfterPenalty = oldTotal - 50;
                const wouldLandOnBarrel = (scoreAfterPenalty >= 200 && scoreAfterPenalty < 300) || (scoreAfterPenalty >= 700 && scoreAfterPenalty < 800);
                if (!wouldLandOnBarrel && !p.justResetFromBarrel) {
                    penaltyMsgs.push(`${p.name} штраф -50.`);
                    return { ...p, scores: [...p.scores, -50] };
                }
            }
            return p;
        });
        if (newTotal >= 1000) {
            return { ...createInitialState(), players: playersWithPenalties, isGameOver: true, gameMessage: `${currentPlayer.name} победил, набрав ${newTotal}!` };
        }
        const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, playersWithPenalties);
        let msg = `${currentPlayer.name} записал ${finalTurnScore}. ${penaltyMsgs.join(' ')} Ход ${playersWithPenalties[nextIdx].name}.`;
        return { ...createInitialState(), players: playersWithPenalties.map(p => ({...p, justResetFromBarrel: false})), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() };
    }
    
    case 'START_OFFICIAL_GAME': {
        const firstPlayer = newState.players[newState.currentPlayerIndex];
        return { ...newState, isGameStarted: true, canRoll: true, gameMessage: `Игра началась! Ход ${firstPlayer.name}.`, turnStartTime: Date.now() };
    }
    
    case 'NEW_GAME': {
      const newPlayers = Array.from({ length: 5 }, (_, index) => {
        const oldPlayer = newState.players[index];
        if (oldPlayer && oldPlayer.isClaimed) {
          return { ...oldPlayer, scores: [], hasEnteredGame: false, barrelBolts: 0, justResetFromBarrel: false };
        }
        return { ...createInitialState().players[0], id: index, name: `Игрок ${index + 1}` };
      });
      return { ...createInitialState(), players: newPlayers, spectators: newState.spectators, hostId: newState.hostId, currentPlayerIndex: newState.hostId, gameMessage: 'Новая игра. Ожидание старта.' };
    }

    case 'SKIP_TURN': {
      const currentPlayer = newState.players[newState.currentPlayerIndex];
      const newPlayers = newState.players.map((p, i) => i === newState.currentPlayerIndex ? { ...p, scores: [...p.scores, '/'] } : p);
      const nextIdx = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
      const msg = `${currentPlayer.name} пропустил ход. Ход ${newPlayers[nextIdx].name}.`;
      return { ...createInitialState(), players: newPlayers.map(p => ({...p, justResetFromBarrel: false})), spectators: newState.spectators, leavers: newState.leavers, hostId: newState.hostId, isGameStarted: true, canRoll: true, currentPlayerIndex: nextIdx, gameMessage: msg, turnStartTime: Date.now() };
    }

    case 'KICK_PLAYER': {
        const { playerId } = action.payload;
        const playerToKick = newState.players.find(p => p.id === playerId);
        if (!playerToKick) return state;
        let newPlayers = newState.players.map(p => p.id === playerId ? { ...createInitialState().players[0], id: p.id, name: `Игрок ${p.id + 1}` } : p);
        let newCurrentPlayerIndex = newState.currentPlayerIndex;
        if(newState.currentPlayerIndex === playerId) {
             newCurrentPlayerIndex = findNextActivePlayer(newState.currentPlayerIndex, newPlayers);
        }
        return { ...newState, players: newPlayers, currentPlayerIndex: newCurrentPlayerIndex, gameMessage: `${playerToKick.name} был исключен.` };
    }

    default:
      return state;
  }
}

const findNextActivePlayer = (startIndex, players) => {
    let nextIndex = (startIndex + 1) % players.length;
    while (nextIndex !== startIndex) {
        if (players[nextIndex].isClaimed && !players[nextIndex].isSpectator) {
            return nextIndex;
        }
        nextIndex = (nextIndex + 1) % players.length;
    }
    return startIndex;
};

// --- GAME COMPONENT ---

const Game = ({ roomCode, playerName, initialMode, localConfig, onExit }) => {
  const isLocalMode = initialMode === 'local';
  
  const initialLocalState = React.useMemo(() => {
      if (isLocalMode) {
           return createLocalGameState(localConfig?.playerCount || 2);
      }
      return null;
  }, [isLocalMode, localConfig]);
  
  const [gameState, dispatch] = React.useReducer(gameReducer, initialLocalState);
  const [myPlayerId, setMyPlayerId] = React.useState(null);
  const [isSpectator, setIsSpectator] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState(isLocalMode ? 'connected' : 'connecting'); 
  const [isHost, setIsHost] = React.useState(initialMode === 'create' || isLocalMode);
  
  const mySessionIdRef = React.useRef(sessionStorage.getItem('tysiacha-sessionId') || `sid_${Math.random().toString(36).substr(2, 9)}`);
  const clientRef = React.useRef(null);
  const roomTopicRef = React.useRef(getRoomTopic(roomCode || 'LOCAL'));
  const isCleanedUp = React.useRef(false);
  const wakeLockRef = React.useRef(null);

  // --- WAKE LOCK ---
  React.useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          const lock = await navigator.wakeLock.request('screen');
          wakeLockRef.current = lock;
          lock.addEventListener('release', () => {});
        } catch (err) { console.warn('Wake Lock error:', err); }
      }
    };
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && (!wakeLockRef.current || wakeLockRef.current.released)) requestWakeLock();
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, []);

  // --- MQTT SETUP ---
  React.useEffect(() => {
      if (isLocalMode) return; // SKIP MQTT FOR LOCAL GAME

      isCleanedUp.current = false;
      setConnectionStatus('connecting');

      let client;
      try {
          client = createMqttClient(mySessionIdRef.current);
          clientRef.current = client;
      } catch (e) {
          setConnectionStatus('error');
          return;
      }
      
      // Timeout safety for connection hanging
      // Increased to 30s because we might cycle through multiple brokers
      const connectionTimeout = setTimeout(() => {
          if (client && !client.connected && !isCleanedUp.current) {
              console.warn('MQTT Connection Timed Out');
              setConnectionStatus('error');
              client.end(true); // Force end
          }
      }, 30000); 

      client.on('connect', () => {
          // STRICT MODE SAFETY:
          // If the component has been unmounted (isCleanedUp is true), immediately close the client.
          // This prevents "client disconnecting" errors in subscribe calls that might trigger after cleanup.
          if (isCleanedUp.current) {
              client.end(true); 
              return;
          }

          clearTimeout(connectionTimeout);
          console.log('MQTT Connected');
          setConnectionStatus('connected');
          
          client.subscribe(roomTopicRef.current, (err) => {
              if (isCleanedUp.current) return;
              if (err) {
                  // Suppress the "client disconnecting" error which happens if the socket closes 
                  // while subscription is pending (common in unstable networks or React StrictMode re-renders).
                  if (err.message === 'client disconnecting') return;
                  console.error('Sub error:', err);
              } else {
                  // После подписки, если мы хост - инициализируем стейт
                  if (initialMode === 'create') {
                      setIsHost(true);
                      const savedState = localStorage.getItem(`tysiacha-state-${roomCode}`);
                      let initialState;
                      if (savedState) {
                          try { initialState = JSON.parse(savedState); } catch (e) { initialState = createInitialState(); }
                      } else {
                          initialState = createInitialState();
                          initialState.hostId = 0;
                          initialState.players[0] = { 
                              ...initialState.players[0], 
                              name: playerName, 
                              isClaimed: true, 
                              sessionId: mySessionIdRef.current, 
                              status: 'online' 
                          };
                          initialState.gameMessage = `${playerName} создал(а) игру.`;
                      }
                      dispatch({ type: 'SET_STATE', payload: initialState });
                      // Broadcast immediate state
                      client.publish(roomTopicRef.current, JSON.stringify({ type: 'SET_STATE', payload: initialState, senderId: mySessionIdRef.current }));
                  } else {
                      // Если мы клиент - просим пустить нас
                      // Сначала посылаем PING чтобы спровоцировать отправку стейта от хоста, если он там уже есть
                      client.publish(roomTopicRef.current, JSON.stringify({ type: 'PLAYER_JOIN', payload: { playerName, sessionId: mySessionIdRef.current }, senderId: mySessionIdRef.current }));
                  }
              }
          });
      });

      client.on('message', (topic, message) => {
          if (isCleanedUp.current) return;
          if (topic !== roomTopicRef.current) return;

          try {
              const data = JSON.parse(message.toString());
              
              // Игнорируем свои собственные сообщения (эхо)
              if (data.senderId === mySessionIdRef.current) return;

              if (data.type === 'PING_HOST') {
                  if (isHost) {
                      // Кто-то проверяет комнату. Отвечаем.
                      client.publish(roomTopicRef.current, JSON.stringify({ type: 'PONG_HOST', senderId: mySessionIdRef.current }));
                  }
                  return;
              }

              // Обработка для Хоста: действия игроков
              if (isHost) {
                  if (data.type !== 'SET_STATE') {
                      dispatch({ ...data, _senderId: data.senderId });
                  }
              }

              // Обработка для Всех: получение стейта
              if (data.type === 'SET_STATE') {
                  // Если мы клиент - просто обновляем стейт
                  if (!isHost) {
                      dispatch({ type: 'SET_STATE', payload: data.payload });
                  } else {
                      // Конфликт хостов? (редкий кейс, игнорируем пока или делаем merge)
                  }
              }

          } catch (e) { console.error('Msg Parse Error', e); }
      });

      client.on('error', (err) => {
          console.error('MQTT Error', err);
          // Don't set error immediately, allow for failover
      });

      client.on('offline', () => {
          console.log('MQTT Offline');
          if (!isCleanedUp.current && connectionStatus === 'connected') setConnectionStatus('reconnecting');
      });

      return () => {
          isCleanedUp.current = true;
          clearTimeout(connectionTimeout);
          if (client) client.end(true); // Force end
      };
  }, [roomCode, initialMode, playerName, isHost, isLocalMode]);

  // --- HOST BROADCAST ---
  // Как только стейт меняется у хоста, отправляем его всем
  React.useEffect(() => {
      if (isLocalMode) return; // Skip broadcast for local

      if (isHost && gameState && clientRef.current && clientRef.current.connected) {
          localStorage.setItem(`tysiacha-state-${roomCode}`, JSON.stringify(gameState));
          clientRef.current.publish(roomTopicRef.current, JSON.stringify({ type: 'SET_STATE', payload: gameState, senderId: mySessionIdRef.current }));
      }
  }, [gameState, isHost, roomCode, isLocalMode]);

  // --- SELF IDENTITY ---
  React.useEffect(() => {
      if (isLocalMode) return;

      sessionStorage.setItem('tysiacha-sessionId', mySessionIdRef.current);
      if (gameState) {
          const me = gameState.players.find(p => p.sessionId === mySessionIdRef.current);
          setMyPlayerId(me ? me.id : null);
          setIsSpectator(gameState.spectators.some(s => s.id === mySessionIdRef.current));
      }
  }, [gameState, isLocalMode]);

  const sendAction = (action) => {
      if (isLocalMode) {
          // Local mode: just dispatch
          dispatch(action);
      } else if (isHost) {
          // Если я хост, я применяю действие локально, useEffect выше отправит новый стейт всем
          dispatch(action);
      } else if (clientRef.current && clientRef.current.connected) {
          // Если я клиент, я отправляю действие в сеть
          clientRef.current.publish(roomTopicRef.current, JSON.stringify({ ...action, senderId: mySessionIdRef.current }));
      }
  };

  const manualRetry = () => {
      window.location.reload(); // Простейший способ ретрая для MQTT
  };

  const [isScoreboardExpanded, setIsScoreboardExpanded] = React.useState(false);
  const [isSpectatorsModalOpen, setIsSpectatorsModalOpen] = React.useState(false);
  const [showRules, setShowRules] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [kickConfirmState, setKickConfirmState] = React.useState({ isOpen: false, player: null });

  // --- RENDER LOADING/ERROR STATES ---
  // Исправлено: теперь показываем экран загрузки если gameState нет, даже если подключение есть.
  if (!gameState) {
      return React.createElement('div', { className: "text-center w-full p-8" }, 
        React.createElement('h2', { className: `font-ruslan text-4xl mb-4 ${connectionStatus === 'error' ? 'text-red-500' : 'text-title-yellow'}` }, 
            connectionStatus === 'error' ? 'Ошибка сети' : (connectionStatus === 'connected' ? 'Синхронизация...' : 'Подключение...')
        ),
        connectionStatus === 'error' && React.createElement('p', { className: "text-lg mb-6 max-w-md mx-auto" }, 'Не удалось подключиться к серверу игры. Попробуйте офлайн режим.'),
        connectionStatus === 'connected' && React.createElement('p', { className: "text-lg mb-6 max-w-md mx-auto" }, 'Ждем данные от хоста...'),
        (connectionStatus === 'connecting' || connectionStatus === 'reconnecting' || connectionStatus === 'connected') && React.createElement('div', { className: "w-8 h-8 border-4 border-t-transparent border-title-yellow rounded-full animate-spin mx-auto" }),
        React.createElement('div', { className: 'flex justify-center gap-4 mt-8' },
            React.createElement('button', { onClick: onExit, className: "px-4 py-2 bg-slate-700 hover:bg-slate-700 rounded" }, "В меню"),
            connectionStatus === 'error' && React.createElement('button', { onClick: manualRetry, className: "px-4 py-2 bg-green-600 hover:bg-green-700 rounded" }, "Повторить")
        )
      );
  }

  // In local mode, it's always "my turn" if the game isn't over, because the user controls all players.
  const isMyTurn = isLocalMode ? true : (myPlayerId === gameState.currentPlayerIndex && !isSpectator);
  
  const uiProps = {
    roomCode: isLocalMode ? 'LOCAL' : roomCode,
    gameState,
    myPlayerId: isLocalMode ? gameState.currentPlayerIndex : myPlayerId,
    isSpectator,
    isMyTurn,
    isHost: isHost, 
    canJoin: !isLocalMode && myPlayerId === null && !isSpectator,
    isAwaitingApproval: false,
    showRules,
    isSpectatorsModalOpen,
    isScoreboardExpanded,
    isDragOver,
    displayMessage: gameState.gameMessage,
    rollButtonText: (gameState.keptDiceThisTurn.length >= 5 ? 5 : 5 - gameState.keptDiceThisTurn.length) === 5 ? 'Бросить все' : `Бросить ${5 - gameState.keptDiceThisTurn.length}`,
    showSkipButton: false,
    claimedPlayerCount: gameState.players.filter(p => p.isClaimed && !p.isSpectator).length,
    availableSlotsForJoin: isLocalMode ? 0 : gameState.players.filter(p => !p.isClaimed && !p.isSpectator).length,
    currentPlayer: gameState.players[gameState.currentPlayerIndex],
    kickConfirmState,
    onLeaveGame: () => { 
        if (!isLocalMode) sendAction({ type: 'PLAYER_LEAVE', payload: { sessionId: mySessionIdRef.current } }); 
        onExit(); 
    },
    onSetShowRules: setShowRules,
    onSetIsSpectatorsModalOpen: setIsSpectatorsModalOpen,
    onSetIsScoreboardExpanded: setIsScoreboardExpanded,
    onSetIsDragOver: setIsDragOver,
    onRollDice: () => sendAction({ type: 'ROLL_DICE' }),
    onBankScore: () => sendAction({ type: 'BANK_SCORE' }),
    onSkipTurn: () => sendAction({ type: 'SKIP_TURN' }),
    onNewGame: () => {
        if (isLocalMode) {
            // Reset local game
             const newState = createLocalGameState(localConfig?.playerCount || 2);
             dispatch({ type: 'SET_STATE', payload: newState });
        } else {
            sendAction({ type: 'NEW_GAME' });
        }
    },
    onStartOfficialGame: () => sendAction({ type: 'START_OFFICIAL_GAME' }),
    onJoinGame: () => sendAction({ type: 'PLAYER_JOIN', payload: { playerName, sessionId: mySessionIdRef.current } }),
    onJoinRequest: () => {}, 
    onToggleDieSelection: (index) => dispatch({ type: 'TOGGLE_DIE_SELECTION', payload: { index } }),
    onDragStart: (e, index) => { e.dataTransfer.setData('application/json', JSON.stringify([index])); },
    onDrop: (e) => { 
        e.preventDefault(); 
        setIsDragOver(false);
        try { 
            const indices = JSON.parse(e.dataTransfer.getData('application/json'));
            sendAction({ type: 'KEEP_DICE', payload: { indices } });
        } catch(e){} 
    },
    onDieDoubleClick: (index) => sendAction({ type: 'KEEP_DICE', payload: { indices: [index] } }),
    onInitiateKick: (player) => setKickConfirmState({ isOpen: true, player }),
    onConfirmKick: () => {
      if (kickConfirmState.player) sendAction({ type: 'KICK_PLAYER', payload: { playerId: kickConfirmState.player.id } });
      setKickConfirmState({ isOpen: false, player: null });
    },
    onCancelKick: () => setKickConfirmState({ isOpen: false, player: null }),
  };

  return React.createElement(GameUI, uiProps);
};

export default Game;
