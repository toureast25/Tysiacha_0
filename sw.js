// 
// Service Worker для кэширования ресурсов PWA

const CACHE_NAME = 'tysiacha-cache-v1';
// ВАЖНО: Кэшируем только локальные ресурсы "оболочки" приложения.
// Внешние ресурсы (CDN, шрифты) будут кэшироваться браузером стандартным образом
// или могут быть добавлены в кэш динамически с помощью другой стратегии.
// Это предотвращает сбой установки Service Worker, если внешний ресурс недоступен.
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/index.js',
  '/constants.js',
  '/manifest.json',
  '/utils/gameLogic.js',
  '/components/App.js',
  '/components/Dice.js',
  '/components/Game.js',
  '/components/GameUI.js',
  '/components/Lobby.js',
  '/components/RulesModal.js',
  '/components/SpectatorsModal.js',
  '/components/KickConfirmModal.js',
  '/components/PlayerContextMenu.js',
  // Внешние URL удалены для стабильности
];

// Установка Service Worker и кэширование статических ассетов
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Failed to cache resources during install:', error);
      })
  );
});

// Обработка запросов: стратегия "сначала кэш, потом сеть"
self.addEventListener('fetch', event => {
  // Мы не обрабатываем запросы, которые не являются GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Если ресурс есть в кэше, отдаем его
        if (response) {
          return response;
        }

        // Иначе, делаем запрос к сети
        return fetch(event.request).then(
          networkResponse => {
            // Если мы получили валидный ответ, можно опционально его закэшировать на будущее
            // Это называется "динамическое кэширование"
            if (networkResponse && networkResponse.status === 200) {
              // Важно: нужно клонировать ответ, так как его можно прочитать только один раз
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          }
        ).catch(error => {
          console.error('Fetching failed:', error);
          // Можно вернуть кастомную оффлайн-страницу, если нужно
          throw error;
        });
      }
    )
  );
});

// Активация Service Worker и удаление старых кэшей
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
