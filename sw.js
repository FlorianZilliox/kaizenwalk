const CACHE_NAME = 'kaizenwalk-v3';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Add files one by one to avoid failures
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(error => {
              console.log('Failed to cache:', url, error);
            });
          })
        );
      })
  );
  self.skipWaiting();
});

// Fetch event
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).catch(error => {
          console.log('Fetch failed for:', event.request.url, error);
          // Return a fallback response or let it fail gracefully
          return new Response('Resource not found', {
            status: 404,
            statusText: 'Not Found'
          });
        });
      })
  );
});

// Activate event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Message handling from main thread
self.addEventListener('message', event => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'START_TIMER':
      startBackgroundTimer();
      break;
    case 'STOP_TIMER':
      stopBackgroundTimer();
      break;
    case 'SYNC_STATE':
      timerState = { ...timerState, ...data };
      break;
  }
});

// Background timer functionality
let backgroundInterval = null;

function startBackgroundTimer() {
  if (backgroundInterval) return;
  
  timerState.isRunning = true;
  timerState.startTime = Date.now();
  timerState.elapsedTime = 0;
  timerState.lastInterval = -1;
  
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
    icon: './icon-192x192.png',
    badge: './icon-192x192.png',
    tag: 'kaizenwalk-complete',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200]
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
    const isFast = isFastInterval(currentInterval);
    const setNumber = Math.floor(currentInterval / 2) + 1;
    
    // Show notification for interval change
    if (timerState.lastInterval !== -1) {
      const title = isFast ? '🏃 Fast Walk' : '🚶 Slow Walk';
      const body = `Set ${setNumber} of 5 - ${isFast ? 'Speed up!' : 'Slow down'}`;
      
      self.registration.showNotification(title, {
        body: body,
        icon: './icon-192x192.png',
        badge: './icon-192x192.png',
        tag: 'kaizenwalk-interval',
        renotify: true,
        requireInteraction: false,
        vibrate: isFast ? [100, 50, 100] : [200],
        data: { 
          interval: currentInterval,
          isFast: isFast 
        }
      });
    }
    
    timerState.lastInterval = currentInterval;
    timerState.currentInterval = currentInterval;
  }
}

// Helper functions
function getCurrentInterval(elapsedTime) {
  return Math.floor(elapsedTime / TIMER_CONFIG.INTERVAL_DURATION);
}

function isFastInterval(interval) {
  return interval % 2 === 0; // 0,2,4,6,8 are fast
}

// Background sync
self.addEventListener('sync', event => {
  if (event.tag === 'timer-sync') {
    event.waitUntil(syncTimerState());
  }
});

function syncTimerState() {
  // Maintain timer state persistence
  return Promise.resolve();
}

// Notification click handling
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  // Focus the app window
  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {
      // Check if there is already a window/tab open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window/tab is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});
