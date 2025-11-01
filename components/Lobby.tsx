
import React, { useState, useEffect } from 'react';

interface LobbyProps {
  onStartGame: (roomCode: string, playerCount: number) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onStartGame }) => {
  const [roomCode, setRoomCode] = useState('');
  const [playerCount, setPlayerCount] = useState(2);
  const [isJoining, setIsJoining] = useState(false);
  
  useEffect(() => {
    if (!isJoining) {
      generateRoomCode();
    }
  }, [isJoining]);

  const generateRoomCode = () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
  };

  const handleStart = () => {
    if (roomCode.trim().length >= 4) {
      onStartGame(roomCode, playerCount);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-slate-800/80 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700 text-center">
      <h2 className="font-ruslan text-5xl text-yellow-300 mb-6">
        {isJoining ? 'Присоединиться' : 'Создать Игру'}
      </h2>
      
      <div className="space-y-6">
        <div>
          <label htmlFor="roomCode" className="block text-lg font-semibold text-gray-300 mb-2">
            {isJoining ? 'Введите код комнаты' : 'Код вашей комнаты'}
          </label>
          <input
            id="roomCode"
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            readOnly={!isJoining}
            className="w-full p-3 text-center bg-slate-900 border-2 border-slate-600 rounded-lg text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-yellow-400 transition-colors"
          />
           {!isJoining && (
             <p className="text-sm text-gray-400 mt-2">Поделитесь этим кодом с друзьями</p>
           )}
        </div>

        <div>
           <label htmlFor="playerCount" className="block text-lg font-semibold text-gray-300 mb-2">
            Количество игроков
          </label>
          <div className="flex items-center justify-center space-x-4">
              {[2, 3, 4, 5].map(num => (
                  <button 
                    key={num}
                    onClick={() => setPlayerCount(num)}
                    className={`w-12 h-12 text-xl font-bold rounded-full transition-all ${playerCount === num ? 'bg-yellow-400 text-slate-900 scale-110' : 'bg-slate-700 text-white hover:bg-slate-600'}`}
                  >
                      {num}
                  </button>
              ))}
          </div>
        </div>

        <button
          onClick={handleStart}
          className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:cursor-not-allowed"
          disabled={roomCode.trim().length < 4}
        >
          {isJoining ? 'Войти' : 'Начать игру'}
        </button>

        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-600"></div>
            <span className="flex-shrink mx-4 text-gray-400">ИЛИ</span>
            <div className="flex-grow border-t border-gray-600"></div>
        </div>

         <button
          onClick={() => setIsJoining(!isJoining)}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl font-bold uppercase tracking-wider transition-all duration-300 transform hover:scale-105 shadow-lg"
        >
          {isJoining ? 'Создать свою игру' : 'Присоединиться к игре'}
        </button>
      </div>
    </div>
  );
};

export default Lobby;
   