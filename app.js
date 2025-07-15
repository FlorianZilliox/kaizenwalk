// Timer configuration constants
const TIMER_CONFIG = {
  TOTAL_DURATION: 1800, // 30 minutes in seconds
  INTERVAL_DURATION: 180, // 3 minutes in seconds
  TOTAL_INTERVALS: 10,
  TOTAL_SETS: 5
};

// Colors
const COLORS = {
  fastColor: '#00FFFF',   // Cyan for fast walk
  slowColor: '#FF00FF',   // Magenta for slow walk
  primary: '#00FFFF',     // Cyan for buttons
  text: '#FFFFFF',        // White text
  textSecondary: '#9CA3AF', // Light gray for secondary text
  background: '#000000',  // Black background
  surface: '#1F2937',     // Dark surface
  overlay: 'rgba(0, 0, 0, 0.5)' // Semi-transparent overlay
};

// Helper functions
const formatTime = (seconds) => {
  if (seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getCurrentInterval = (elapsedTime) => {
  return Math.floor(elapsedTime / TIMER_CONFIG.INTERVAL_DURATION);
};

const isFastInterval = (intervalIndex) => {
  return intervalIndex % 2 === 0;
};

const getSetInfo = (currentInterval) => {
  const setNumber = Math.floor(currentInterval / 2) + 1;
  const remaining = TIMER_CONFIG.TOTAL_SETS - setNumber;
  return {
    setNumber,
    remaining,
    displayText: `Set ${setNumber}/${TIMER_CONFIG.TOTAL_SETS} • ${remaining} ${remaining === 1 ? 'set' : 'sets'} remaining`
  };
};

const getTimeInCurrentInterval = (elapsedTime) => {
  return elapsedTime % TIMER_CONFIG.INTERVAL_DURATION;
};

const getTotalTimeRemaining = (elapsedTime) => {
  return TIMER_CONFIG.TOTAL_DURATION - elapsedTime;
};

const getIntervalProgress = (elapsedTime) => {
  return getTimeInCurrentInterval(elapsedTime) / TIMER_CONFIG.INTERVAL_DURATION;
};

// App state
let appState = {
  isRunning: false,
  elapsedTime: 0,
  startTime: null,
  currentInterval: -1,
  lastInterval: -1,
  isCompleted: false,
  wakeLock: null,
  audioContext: null,
  permissionsGranted: false,
  sounds: {}
};

// DOM elements
const statusText = document.getElementById('statusText');
const setInfo = document.getElementById('setInfo');
const timeText = document.getElementById('timeText');
const progressCircle = document.getElementById('progressCircle');
const controlButton = document.getElementById('controlButton');
const permissionModal = document.getElementById('permissionModal');

let timerInterval = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  console.log('🚀 App initializing...');
  
  // Debug DOM elements
  console.log('🔍 DOM Elements check:');
  console.log('- controlButton:', controlButton);
  console.log('- statusText:', statusText);
  console.log('- timeText:', timeText);
  
  // Force permission request on every page load
  console.log('🔄 Forcing permission request on page load');
  showPermissionModal();
  
  // Initialize audio context on first user interaction
  document.addEventListener('click', initializeAudio, { once: true });
  
  // Listen for service worker messages
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
  }
  
  // Handle page visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Button event is handled via onclick in HTML
  
  updateDisplay();
}

function showPermissionModal() {
  console.log('🔓 Showing permission modal...');
  permissionModal.classList.remove('hidden');
  permissionModal.style.display = 'flex'; // Force show
}

function hidePermissionModal() {
  console.log('🔒 Hiding permission modal...');
  if (permissionModal) {
    permissionModal.classList.add('hidden');
    permissionModal.style.display = 'none'; // Force hide
    console.log('✅ Permission modal hidden');
  } else {
    console.log('❌ Permission modal not found');
  }
}

async function requestPermissions() {
  try {
    // Request notification permission
    const notificationPermission = await Notification.requestPermission();
    
    if (notificationPermission === 'granted') {
      appState.permissionsGranted = true;
      hidePermissionModal();
      
      // Initialize audio context
      await initializeAudio();
      
      console.log('✅ Permissions granted');
    } else {
      console.log('❌ Notification permission denied');
    }
  } catch (error) {
    console.error('Permission request failed:', error);
  }
}

function denyPermissions() {
  hidePermissionModal();
  console.log('⚠️ Permissions denied - limited functionality');
}

async function initializeAudio() {
  if (appState.audioContext) return;
  
  try {
    appState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Resume audio context if suspended (required for iOS)
    if (appState.audioContext.state === 'suspended') {
      await appState.audioContext.resume();
    }
    
    console.log('🔊 Audio context initialized');
  } catch (error) {
    console.error('Audio initialization failed:', error);
  }
}

// Audio generation with oscillators
function playSound(type) {
  if (!appState.audioContext) {
    console.log('🔇 No audio context available');
    return;
  }
  
  console.log(`🔊 Playing ${type} sound`);
  
  const ctx = appState.audioContext;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  // Configure sound based on type
  switch (type) {
    case 'bell': // Fast walk - bright bell
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      oscillator.type = 'sine';
      break;
      
    case 'gong': // Slow walk - deep gong
      oscillator.frequency.setValueAtTime(150, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
      oscillator.type = 'triangle';
      break;
      
    case 'fanfare': // Completion
      playFanfare(ctx);
      return;
  }
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + (type === 'gong' ? 1.0 : 0.4));
}

function playFanfare(ctx) {
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  const duration = 0.3;
  
  notes.forEach((freq, index) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    oscillator.type = 'sine';
    
    const startTime = ctx.currentTime + (index * duration * 0.7);
    gainNode.gain.setValueAtTime(0.3, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  });
}

// Timer functions
async function toggleTimer() {
  console.log('🔄 Toggle timer clicked, isRunning:', appState.isRunning);
  if (appState.isRunning) {
    await stopTimer();
  } else {
    await startTimer();
  }
}

async function startTimer() {
  console.log('▶️ Starting timer...');
  
  const now = Date.now();
  appState.isRunning = true;
  appState.startTime = now;
  appState.elapsedTime = 0;
  appState.lastInterval = -1;
  appState.currentInterval = -1;
  appState.isCompleted = false;
  
  // Request wake lock if available
  await requestWakeLock();
  
  // Start timer interval
  startTimerInterval();
  
  // Schedule notifications as backup
  await scheduleNotifications();
  
  // Notify service worker if available
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'START_TIMER',
      startTime: now
    });
  }
  
  // Permissions are now handled at page load
  
  updateDisplay();
  console.log('▶️ Timer started');
}

async function stopTimer() {
  console.log('⏹️ Stopping timer...');
  
  appState.isRunning = false;
  appState.elapsedTime = 0;
  appState.startTime = null;
  appState.lastInterval = -1;
  appState.currentInterval = -1;
  appState.isCompleted = false;
  
  // Clear interval
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  // Release wake lock
  await releaseWakeLock();
  
  // Cancel notifications
  await cancelNotifications();
  
  // Notify service worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'STOP_TIMER'
    });
  }
  
  updateDisplay();
  console.log('⏹️ Timer stopped');
}

function startTimerInterval() {
  if (timerInterval) return;
  
  console.log('⏱️ Starting timer interval');
  timerInterval = setInterval(() => {
    if (!appState.isRunning) return;
    
    const now = Date.now();
    appState.elapsedTime = Math.floor((now - appState.startTime) / 1000);
    console.log('⏱️ Timer tick: elapsed=', appState.elapsedTime);
    
    if (appState.elapsedTime >= TIMER_CONFIG.TOTAL_DURATION) {
      completeTimer();
      return;
    }
    
    checkIntervalChange();
    updateDisplay();
    
  }, 1000);
}

function checkIntervalChange() {
  const currentInterval = getCurrentInterval(appState.elapsedTime);
  
  if (currentInterval !== appState.lastInterval && currentInterval < TIMER_CONFIG.TOTAL_INTERVALS) {
    const isFast = isFastInterval(currentInterval);
    
    // Play sound and vibrate for interval changes (except first)
    if (appState.lastInterval !== -1) {
      const soundType = isFast ? 'bell' : 'gong';
      playSound(soundType);
      
      // Vibrate if supported
      if ('vibrate' in navigator) {
        const pattern = isFast ? [100, 50, 100] : [200];
        navigator.vibrate(pattern);
      }
      
      // Show notification if permissions granted
      if (appState.permissionsGranted) {
        showIntervalNotification(isFast, currentInterval);
      }
      
      console.log(`🚶 Interval ${currentInterval}: ${isFast ? 'Fast Walk' : 'Slow Walk'}`);
    }
    
    appState.lastInterval = currentInterval;
    appState.currentInterval = currentInterval;
  }
}

function showIntervalNotification(isFast, intervalIndex) {
  if (!appState.permissionsGranted) return;
  
  const setNumber = Math.floor(intervalIndex / 2) + 1;
  const title = isFast ? "Fast Walk 🏃" : "Slow Walk 🚶";
  const body = `Set ${setNumber} of ${TIMER_CONFIG.TOTAL_SETS}`;
  
  try {
    new Notification(title, {
      body,
      icon: '/icon-512x512.png',
      tag: 'interval-change',
      requireInteraction: false
    });
  } catch (error) {
    console.log('Notification failed:', error);
  }
}

async function scheduleNotifications() {
  // For PWA, we'll use immediate notifications instead of scheduling
  // This is a simplified version - full scheduling would require service worker
  console.log('📱 Notifications will be shown during intervals');
}

async function cancelNotifications() {
  // Cancel any pending notifications
  console.log('📱 Notifications cancelled');
}

async function completeTimer() {
  console.log('🎉 Timer completing...');
  
  appState.isRunning = false;
  appState.isCompleted = true;
  
  // Clear interval
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  
  // Play completion sound
  playSound('fanfare');
  
  // Vibrate
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }
  
  // Show completion notification
  if (appState.permissionsGranted) {
    new Notification('KaizenWalk Complete! 🎉', {
      body: 'Congratulations! You completed your 30-minute workout.',
      icon: '/icon-512x512.png',
      tag: 'completion',
      requireInteraction: true
    });
  }
  
  // Release wake lock
  await releaseWakeLock();
  
  updateDisplay();
  console.log('🎉 Timer completed!');
}

// Wake Lock API
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      appState.wakeLock = await navigator.wakeLock.request('screen');
      console.log('🔒 Wake lock acquired');
      
      appState.wakeLock.addEventListener('release', () => {
        console.log('🔓 Wake lock released');
      });
    } catch (error) {
      console.error('Wake lock request failed:', error);
    }
  }
}

async function releaseWakeLock() {
  if (appState.wakeLock) {
    try {
      await appState.wakeLock.release();
      appState.wakeLock = null;
    } catch (error) {
      console.error('Wake lock release failed:', error);
    }
  }
}

// Service worker message handling
function handleServiceWorkerMessage(event) {
  const { type, data } = event.data;
  
  switch (type) {
    case 'TIMER_UPDATE':
      if (!appState.isRunning) {
        // Sync state from background
        appState = { ...appState, ...data };
        updateDisplay();
      }
      break;
    case 'TIMER_COMPLETE':
      completeTimer();
      break;
  }
}

// Handle page visibility changes
function handleVisibilityChange() {
  if (document.hidden && appState.isRunning) {
    // Page is hidden, background timer in service worker takes over
    console.log('📱 Page hidden - background timer active');
  } else if (!document.hidden && appState.isRunning) {
    // Page is visible, sync with service worker
    console.log('📱 Page visible - syncing timer state');
    
    // Recalculate elapsed time
    if (appState.startTime) {
      const now = Date.now();
      const newElapsedTime = Math.floor((now - appState.startTime) / 1000);
      
      if (newElapsedTime >= TIMER_CONFIG.TOTAL_DURATION) {
        completeTimer();
      } else {
        appState.elapsedTime = newElapsedTime;
        checkIntervalChange();
        updateDisplay();
      }
    }
  }
}

// Display updates
function updateDisplay() {
  updateStatusText();
  updateSetInfo();
  updateTimeDisplay();
  updateProgressCircle();
  updateControlButton();
}

function updateStatusText() {
  if (appState.isCompleted) {
    statusText.textContent = 'Complete!';
    statusText.style.color = COLORS.primary;
    return;
  }
  
  if (!appState.isRunning) {
    statusText.textContent = 'Ready to start';
    statusText.style.color = COLORS.textSecondary;
    return;
  }
  
  const currentInterval = getCurrentInterval(appState.elapsedTime);
  const isFast = isFastInterval(currentInterval);
  
  statusText.textContent = isFast ? 'Fast Walk' : 'Slow Walk';
  statusText.style.color = COLORS.text;
}

function updateSetInfo() {
  if (!appState.isRunning || appState.isCompleted) {
    setInfo.textContent = '';
    return;
  }
  
  const currentInterval = getCurrentInterval(appState.elapsedTime);
  const setInfoData = getSetInfo(currentInterval);
  
  setInfo.textContent = setInfoData.displayText;
}

function updateTimeDisplay() {
  const totalTimeRemaining = getTotalTimeRemaining(appState.elapsedTime);
  console.log('⏰ Time update: elapsed=', appState.elapsedTime, 'remaining=', totalTimeRemaining);
  timeText.textContent = formatTime(totalTimeRemaining);
  
  // Color and pulse effect
  if (appState.isRunning) {
    const currentInterval = getCurrentInterval(appState.elapsedTime);
    const isFast = isFastInterval(currentInterval);
    
    timeText.style.color = isFast ? COLORS.fastColor : COLORS.slowColor;
    
    if (isFast) {
      timeText.classList.add('pulse');
    } else {
      timeText.classList.remove('pulse');
    }
  } else {
    timeText.style.color = appState.isCompleted ? COLORS.primary : COLORS.fastColor;
    timeText.classList.remove('pulse');
  }
}

function updateProgressCircle() {
  const circumference = 2 * Math.PI * 136;
  
  if (!appState.isRunning) {
    progressCircle.style.strokeDashoffset = circumference;
    progressCircle.style.stroke = COLORS.fastColor;
    return;
  }
  
  // Calculate progress within current interval
  const intervalProgress = getIntervalProgress(appState.elapsedTime);
  const offset = circumference * (1 - intervalProgress);
  
  const currentInterval = getCurrentInterval(appState.elapsedTime);
  const isFast = isFastInterval(currentInterval);
  
  progressCircle.style.strokeDashoffset = offset;
  progressCircle.style.stroke = isFast ? COLORS.fastColor : COLORS.slowColor;
}

function updateControlButton() {
  if (appState.isRunning) {
    controlButton.textContent = 'STOP';
    controlButton.className = 'button stop';
  } else {
    controlButton.textContent = 'START';
    controlButton.className = 'button';
  }
}

// Global functions for HTML onclick
window.requestPermissions = requestPermissions;
window.denyPermissions = denyPermissions;
window.handleButtonClick = async function() {
  console.log('🔄 Button clicked via onclick!');
  await toggleTimer();
};

// Test function accessible from console
window.testTimer = function() {
  console.log('🧪 Test function called');
  handleButtonClick();
};