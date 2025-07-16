const CACHE_NAME = 'kaizenwalk-mp3-v1';
const AUDIO_CACHE_NAME = 'kaizenwalk-audio-v1';

const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icon-512x512.png'
];

// Timer state
let timerState = {
  isRunning: false,
  startTime: null,
  elapsedTime: 0,
  currentInterval: -1,
  lastInterval: -1
};

// Timer configuration
const TIMER_CONFIG = {
  TOTAL_DURATION: 1800, // 30 minutes
  INTERVAL_DURATION: 180, // 3 minutes
  TOTAL_INTERVALS: 10,
  TOTAL_SETS: 5
};

// Install event
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching app files...');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('App files cached successfully');
      })
      .catch(error => {
        console.error('Failed to cache app files:', error);
      })
  );
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== AUDIO_CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event with special handling for MP3 file
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Special handling for MP3 file with range requests support
  if (url.pathname.includes('kaizenwalk_30min.mp3')) {
    event.respondWith(handleAudioRequest(event.request));
    return;
  }
  
  // Standard cache-first strategy for other files
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(error => {
        console.error('Fetch failed:', error);
        // Return offline page or error response
        return new Response('Offline - Resource not available', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
  );
});

// Handle audio file requests with range support
async function handleAudioRequest(request) {
  const cache = await caches.open(AUDIO_CACHE_NAME);
  
  // Check if we have a cached response
  const cachedResponse = await cache.match(request, { ignoreSearch: true });
  
  // If no cache or it's a range request, fetch from network
  if (!cachedResponse || request.headers.get('range')) {
    try {
      console.log('Fetching audio from network...');
      const networkResponse = await fetch(request);
      
      // Cache the response if it's the full file (not a range request)
      if (!request.headers.get('range') && networkResponse.status === 200) {
        console.log('Caching full audio file...');
        cache.put(request, networkResponse.clone());
      }
      
      return networkResponse;
    } catch (error) {
      console.error('Network fetch failed:', error);
      
      // If we have a cached version and network fails, return it
      if (cachedResponse) {
        console.log('Returning cached audio file');
        return cachedResponse;
      }
      
      // Otherwise return error
      return new Response('Audio file not available offline', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  }
  
  console.log('Returning cached audio file');
  return cachedResponse;
}

// Message handling from main thread
self.addEventListener('message', event => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'START_TIMER':
      startBackgroundTimer(data);
      break;
    case 'STOP_TIMER':
      stopBackgroundTimer();
      break;
    case 'SYNC_STATE':
      timerState = { ...timerState, ...data };
      break;
    case 'PRELOAD_AUDIO':
      preloadAudioFile();
      break;
  }
});

// Preload audio file into cache
async function preloadAudioFile() {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const audioUrl = '/kaizenwalk_30min.mp3';
    
    // Check if already cached
    const existing = await cache.match(audioUrl);
    if (existing) {
      console.log('Audio file already cached');
      return;
    }
    
    console.log('Preloading audio file...');
    const response = await fetch(audioUrl);
    
    if (response.ok) {
      await cache.put(audioUrl, response);
      console.log('Audio file cached successfully');
      
      // Notify all clients
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'AUDIO_CACHED',
          cached: true
        });
      });
    }
  } catch (error) {
    console.error('Failed to preload audio:', error);
  }
}

// Background timer functionality
let backgroundInterval = null;

function startBackgroundTimer(data) {
  if (backgroundInterval) return;
  
  timerState.isRunning = true;
  timerState.startTime = data.startTime || Date.now();
  timerState.elapsedTime = 0;
  timerState.lastInterval = -1;
  
  console.log('Background timer started');
  
  backgroundInterval = setInterval(() => {
    if (!timerState.isRunning) return;
    
    const now = Date.now();
    timerState.elapsedTime = Math.floor((now - timerState.startTime) / 1000);
    
    if (timerState.elapsedTime >= TIMER_CONFIG.TOTAL_DURATION) {
      completeTimer();
      return;
    }
    
    checkIntervalChange();
    
    // Sync state with main thread
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'TIMER_UPDATE',
          data: timerState
        });
      });
    });
    
  }, 1000);
}

function stopBackgroundTimer() {
  timerState.isRunning = false;
  timerState.elapsedTime = 0;
  timerState.startTime = null;
  timerState.lastInterval = -1;
  
  if (backgroundInterval) {
    clearInterval(backgroundInterval);
    backgroundInterval = null;
  }
  
  console.log('Background timer stopped');
}

function completeTimer() {
  timerState.isRunning = false;
  
  if (backgroundInterval) {
    clearInterval(backgroundInterval);
    backgroundInterval = null;
  }
  
  // Show completion notification
  self.registration.showNotification('KaizenWalk Complete! 🎉', {
    body: 'Congratulations! You completed your 30-minute walk.',
    icon: '/icon-512x512.png',
    badge: '/icon-512x512.png',
    tag: 'kaizenwalk-complete',
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: false
  });
  
  // Sync with main thread
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'TIMER_COMPLETE',
        data: timerState
      });
    });
  });
}

function checkIntervalChange() {
  const currentInterval = getCurrentInterval(timerState.elapsedTime);
  
  if (currentInterval !== timerState.lastInterval && currentInterval < TIMER_CONFIG.TOTAL_INTERVALS) {
    timerState.lastInterval = currentInterval;
    timerState.currentInterval = currentInterval;
  }
}

// Helper functions
function getCurrentInterval(elapsedTime) {
  return Math.floor(elapsedTime / TIMER_CONFIG.INTERVAL_DURATION);
}

// Notification click handling
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  // Focus the app window
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      // Check if there's already a window open
      for (const client of clients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});