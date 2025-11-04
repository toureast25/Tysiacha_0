// 
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App.js';

// --- Регистрация Service Worker для PWA ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Добавление явного 'scope: /' для Service Worker.
    // Это может помочь в некоторых средах, хотя для корневого Service Worker
    // '/' обычно является значением по умолчанию. Ошибка "origin does not match"
    // часто указывает на проблему с конфигурацией сервера/среды хостинга,
    // где Service Worker URL может быть переписан или проксирован.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(registration => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, err => {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}


// --- Точка входа в приложение ---
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Не удалось найти корневой элемент для монтирования");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(App)
  )
);