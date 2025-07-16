const CACHE_NAME = 'kaizenwalk-mp3-v3';
const AUDIO_CACHE_NAME = 'kaizenwalk-audio-v3';

const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icon-512x512.png'
];

// Audio URL constant
const AUDIO_URL = 'https://res.cloudinary.com/dammwxtoy/video/upload/v1752655931/kaizenwalk_30min_zhojtp.mp3';

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
          // Delete old caches
          if ((cacheName.startsWith('kaizenwalk-') && cacheName !== CACHE_NAME && cacheName !== AUDIO_CACHE_NAME) ||
              (cacheName.includes('audio') && cacheName !== AUDIO_CACHE_NAME)) {
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
  
  // Special handling for MP3 file
  if (url.href === AUDIO_URL || url.href.includes('kaizenwalk_30min')) {
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

// Handle audio file requests with improved caching
async function handleAudioRequest(request) {
  const cache = await caches.open(AUDIO_CACHE_NAME);
  
  // Check if it's a range request
  const isRangeRequest = request.headers.get('range') !== null;
  
  // For range requests, always go to network (required for audio seeking)
  if (isRangeRequest) {
    try {
      console.log('Handling range request for audio');
      const networkResponse = await fetch(request.clone());
      return networkResponse;
    } catch (error) {
      console.error('Range request failed:', error);
      return new Response('Range request failed', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  }
  
  // For normal requests, try cache first
  try {
    const cachedResponse = await cache.match(AUDIO_URL, { ignoreSearch: true });
    
    if (cachedResponse) {
      console.log('Returning cached audio file');
      
      // Verify cached response is valid
      const blob = await cachedResponse.clone().blob();
      if (blob.size > 0) {
        return cachedResponse;
      } else {
        console.warn('Cached audio file is empty, fetching from network');
        await cache.delete(AUDIO_URL);
      }
    }
    
    // Fetch from network
    console.log('Fetching audio from network...');
    const networkResponse = await fetch(AUDIO_URL, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache' // Force fresh fetch
    });
    
    if (networkResponse.ok) {
      // Cache the response
      console.log('Caching audio file...');
      await cache.put(AUDIO_URL, networkResponse.clone());
      
      // Notify clients that audio is cached
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'AUDIO_CACHED',
          cached: true
        });
      });
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('Audio fetch error:', error);
    
    // Last resort: try to get from cache even if it might be partial
    const anyCachedResponse = await cache.match(AUDIO_URL, { ignoreSearch: true });
    if (anyCachedResponse) {
      console.log('Returning possibly partial cached audio');
      return anyCachedResponse;
    }
    
    return new Response('Audio not available', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
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
    case 'CLEAR_AUDIO_CACHE':
      clearAudioCache();
      break;
    case 'PRELOAD_AUDIO':
      preloadAudioFile();
      break;
  }
});

// Clear audio cache (useful for debugging)
async function clearAudioCache() {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    await cache.delete(AUDIO_URL);
    console.log('Audio cache cleared');
    
    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'AUDIO_CACHE_CLEARED'
      });
    });
  } catch (error) {
    console.error('Failed to clear audio cache:', error);
  }
}

// Preload audio file into cache
async function preloadAudioFile() {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    
    // Check if already cached
    const existing = await cache.match(AUDIO_URL);
    if (existing) {
      const blob = await existing.clone().blob();
      if (blob.size > 0) {
        console.log('Audio file already cached and valid');
        return;
      }
    }
    
    console.log('Preloading audio file...');
    const response = await fetch(AUDIO_URL, {
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-cache'
    });
    
    if (response.ok) {
      await cache.put(AUDIO_URL, response);
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