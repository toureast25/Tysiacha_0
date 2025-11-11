// 
// Service Worker для кэширования ресурсов PWA

// ВАЖНО: Увеличиваем версию кэша, чтобы Service Worker обновился у всех пользователей.
const CACHE_NAME = 'tysiacha-cache-v3';

// Сокращаем список до абсолютно необходимого "каркаса" приложения.
// Остальные ресурсы (компоненты, утилиты) будут закэшированы динамически при первом запросе.
// Это делает установку Service Worker более надежной.
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/index.js',
  '/constants.js',
  '/utils/gameLogic.js',
  '/components/App.js',
  '/components/Lobby.js',
  '/components/Game.js',
  '/components/GameUI.js',
  '/components/Dice.js',
  '/components/RulesModal.js',
  '/components/SpectatorsModal.js',
  '/components/KickConfirmModal.js',
  '/components/PlayerContextMenu.js'
];

// Установка Service Worker и кэширование статических ассетов
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Используем .addAll(), но с обработкой ошибки, чтобы понимать, что пошло не так.
        return cache.addAll(urlsToCache).catch(error => {
            console.error('Failed to cache essential assets during install:', error);
        });
      })
  );
});

// Обработка запросов с использованием разных стратегий
self.addEventListener('fetch', event => {
  // Мы не обрабатываем запросы, которые не являются GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Стратегия "сначала сеть, потом кэш" для навигационных запросов (HTML страниц).
  // Это гарантирует, что пользователь всегда получит самую свежую версию приложения.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Если сеть недоступна, отдаем главную страницу из кэша.
        return caches.match('/');
      })
    );
    return;
  }

  // Стратегия "сначала кэш, потом сеть" для всех остальных ресурсов (JS, CSS, и т.д.).
  // Это быстро и эффективно для статичных ассетов.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // Если ресурс есть в кэше, отдаем его.
      if (cachedResponse) {
        return cachedResponse;
      }

      // Иначе, делаем запрос к сети и кэшируем ответ для будущих запросов.
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          // Важно: нужно клонировать ответ, так как его можно прочитать только один раз.
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
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
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});