// Timer configuration constants
const TIMER_CONFIG = {
  TOTAL_DURATION: 1800, // 30 minutes in seconds
  INTERVAL_DURATION: 180, // 3 minutes in seconds
  TOTAL_INTERVALS: 10,
  TOTAL_SETS: 5,
  AUDIO_FILE: 'kaizenwalk_30min.mp3' // Audio file path
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
  audioElement: null,
  audioLoaded: false,
  audioError: false
};

// DOM elements
const statusText = document.getElementById('statusText');
const setInfo = document.getElementById('setInfo');
const timeText = document.getElementById('timeText');
const progressCircle = document.getElementById('progressCircle');
const controlButton = document.getElementById('controlButton');

let timerInterval = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

function initializeApp() {
  console.log('🚀 App initializing...');
  
  // Initialize audio element
  initializeAudio();
  
  // Listen for service worker messages
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
  }
  
  // Handle page visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  updateDisplay();
}

function initializeAudio() {
  console.log('🎵 Initializing audio...');
  
  // Create audio element
  appState.audioElement = new Audio();
  appState.audioElement.preload = 'metadata'; // Start with metadata only
  appState.audioElement.src = TIMER_CONFIG.AUDIO_FILE;
  
  // Audio event listeners
  appState.audioElement.addEventListener('loadedmetadata', () => {
    console.log('✅ Audio metadata loaded');
    console.log(`Duration: ${appState.audioElement.duration} seconds`);
    appState.audioLoaded = true;
    updateControlButtonState();
  });
  
  appState.audioElement.addEventListener('canplay', () => {
    console.log('✅ Audio can start playing');
  });
  
  appState.audioElement.addEventListener('canplaythrough', () => {
    console.log('✅ Audio can play through without buffering');
  });
  
  appState.audioElement.addEventListener('error', (e) => {
    console.error('❌ Audio error:', e);
    appState.audioError = true;
    appState.audioLoaded = false;
    updateControlButtonState();
    showAudioError();
  });
  
  appState.audioElement.addEventListener('progress', () => {
    const buffered = appState.audioElement.buffered;
    if (buffered.length > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1);
      const duration = appState.audioElement.duration;
      if (duration > 0) {
        const percent = (bufferedEnd / duration) * 100;
        console.log(`🎵 Buffered: ${percent.toFixed(1)}%`);
      }
    }
  });
  
  appState.audioElement.addEventListener('timeupdate', handleAudioTimeUpdate);
  
  appState.audioElement.addEventListener('ended', () => {
    console.log('🎵 Audio playback ended');
    completeTimer();
  });
  
  // Start loading the audio file
  appState.audioElement.load();
}

function handleAudioTimeUpdate() {
  if (!appState.isRunning) return;
  
  // Sync elapsed time with audio position
  const audioTime = appState.audioElement.currentTime;
  appState.elapsedTime = Math.floor(audioTime);
  
  // Check for interval changes
  checkIntervalChange();
  
  // Update display
  updateDisplay();
  
  // Check if completed
  if (appState.elapsedTime >= TIMER_CONFIG.TOTAL_DURATION) {
    completeTimer();
  }
}

function showAudioError() {
  statusText.textContent = 'Audio file not found';
  statusText.style.color = '#FF0000';
  controlButton.textContent = 'ERROR';
  controlButton.disabled = true;
}

function updateControlButtonState() {
  if (appState.audioError) {
    controlButton.disabled = true;
    controlButton.textContent = 'ERROR';
  } else if (!appState.audioLoaded) {
    controlButton.disabled = true;
    controlButton.textContent = 'LOADING...';
  } else {
    controlButton.disabled = false;
    controlButton.textContent = appState.isRunning ? 'STOP' : 'START';
  }
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
  
  if (!appState.audioLoaded || appState.audioError) {
    console.error('Cannot start: Audio not ready');
    return;
  }
  
  appState.isRunning = true;
  appState.startTime = Date.now();
  appState.elapsedTime = 0;
  appState.lastInterval = -1;
  appState.currentInterval = -1;
  appState.isCompleted = false;
  
  // Request wake lock if available
  await requestWakeLock();
  
  // Start audio playback
  try {
    appState.audioElement.currentTime = 0;
    await appState.audioElement.play();
    console.log('🎵 Audio playback started');
  } catch (error) {
    console.error('Failed to start audio:', error);
    await stopTimer();
    return;
  }
  
  // Notify service worker if available
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'START_TIMER',
      startTime: appState.startTime
    });
  }
  
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
  
  // Stop audio playback
  if (appState.audioElement) {
    appState.audioElement.pause();
    appState.audioElement.currentTime = 0;
    console.log('🎵 Audio stopped');
  }
  
  // Release wake lock
  await releaseWakeLock();
  
  // Notify service worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'STOP_TIMER'
    });
  }
  
  updateDisplay();
  console.log('⏹️ Timer stopped');
}

function checkIntervalChange() {
  const currentInterval = getCurrentInterval(appState.elapsedTime);
  
  if (currentInterval !== appState.lastInterval && currentInterval < TIMER_CONFIG.TOTAL_INTERVALS) {
    const isFast = isFastInterval(currentInterval);
    
    // Vibrate for interval changes (except first)
    if (appState.lastInterval !== -1) {
      // Vibrate if supported
      if ('vibrate' in navigator) {
        const pattern = isFast ? [100, 50, 100] : [200];
        navigator.vibrate(pattern);
      }
      
      console.log(`🚶 Interval ${currentInterval}: ${isFast ? 'Fast Walk' : 'Slow Walk'}`);
    }
    
    appState.lastInterval = currentInterval;
    appState.currentInterval = currentInterval;
  }
}

async function completeTimer() {
  console.log('🎉 Timer completing...');
  
  appState.isRunning = false;
  appState.isCompleted = true;
  
  // Stop audio
  if (appState.audioElement) {
    appState.audioElement.pause();
  }
  
  // Vibrate
  if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200, 100, 200]);
  }
  
  // Show completion notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('KaizenWalk Complete! 🎉', {
      body: 'Congratulations! You completed your 30-minute workout.',
      icon: '/icon-512x512.png',
      tag: 'completion',
      requireInteraction: false
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
    // Page is hidden, audio continues playing
    console.log('📱 Page hidden - audio continues in background');
  } else if (!document.hidden && appState.isRunning) {
    // Page is visible, ensure display is synced with audio
    console.log('📱 Page visible - syncing display with audio');
    
    if (appState.audioElement && !appState.audioElement.paused) {
      appState.elapsedTime = Math.floor(appState.audioElement.currentTime);
      checkIntervalChange();
      updateDisplay();
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
  if (appState.audioError) {
    return; // Keep error message
  }
  
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
  updateControlButtonState();
}

// Global functions for HTML onclick
window.handleButtonClick = async function() {
  console.log('🔄 Button clicked via onclick!');
  await toggleTimer();
};

// Test function accessible from console
window.testTimer = function() {
  console.log('🧪 Test function called');
  handleButtonClick();
};