// Timer configuration constants
const TIMER_CONFIG = {
  TOTAL_DURATION: 1800, // 30 minutes in seconds
  INTERVAL_DURATION: 180, // 3 minutes in seconds
  TOTAL_INTERVALS: 10,
  TOTAL_SETS: 5,
  AUDIO_FILE: 'https://res.cloudinary.com/dammwxtoy/video/upload/v1752655931/kaizenwalk_30min_zhojtp.mp3' // Audio file on Cloudinary
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
  audioContext: null,
  audioSource: null, // Track if MediaElementSource is connected
  audioLoaded: false,
  audioError: false,
  loadingProgress: 0
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
  
  // Create a silent audio context to enable audio in silent mode on iOS
  // This technique allows PWAs to play audio even when the device is in silent mode,
  // just like native apps and sites like France Inter
  if (window.AudioContext || window.webkitAudioContext) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    
    // Create a silent buffer to "unlock" audio
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    
    // This helps with iOS audio policies
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
  }
  
  updateDisplay();
}

function initializeAudio() {
  console.log('🎵 Initializing audio...');
  
  // Show loading state
  statusText.textContent = 'Loading audio...';
  timeText.textContent = 'Loading';
  timeText.classList.add('loading-pulse');
  
  // Clean up previous audio element if exists
  if (appState.audioElement) {
    appState.audioElement.pause();
    appState.audioElement.src = '';
    appState.audioElement = null;
    appState.audioSource = false; // Reset source tracking
  }
  
  // Clean up previous audio context if exists
  if (appState.audioContext) {
    try {
      appState.audioContext.close();
      appState.audioContext = null;
      appState.audioSource = false;
    } catch (error) {
      console.error('Error closing previous audio context:', error);
    }
  }
  
  // Create audio element
  appState.audioElement = new Audio();
  appState.audioElement.preload = 'metadata'; // Start with metadata only
  
  // IMPORTANT: Set playsinline for iOS
  appState.audioElement.setAttribute('playsinline', 'true');
  
  // Set crossOrigin for Cloudinary
  appState.audioElement.crossOrigin = 'anonymous';
  
  // CRITICAL for iOS: Enable audio in silent mode
  // This is what allows sites like France Inter to play in silent mode
  appState.audioElement.setAttribute('webkit-playsinline', 'true');
  appState.audioElement.setAttribute('x-webkit-airplay', 'allow');
  
  appState.audioElement.src = TIMER_CONFIG.AUDIO_FILE;
  
  // Audio event listeners
  appState.audioElement.addEventListener('loadedmetadata', () => {
    console.log('✅ Audio metadata loaded');
    console.log(`Duration: ${appState.audioElement.duration} seconds`);
  });
  
  appState.audioElement.addEventListener('canplay', () => {
    console.log('✅ Audio can start playing');
  });
  
  appState.audioElement.addEventListener('canplaythrough', () => {
    console.log('✅ Audio can play through without buffering');
    // Audio is fully loaded
    appState.audioLoaded = true;
    appState.loadingProgress = 100;
    updateLoadingProgress();
    
    // Complete loading after a short delay for smooth transition
    setTimeout(() => {
      completeLoading();
    }, 500);
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
        
        // Update loading progress
        appState.loadingProgress = percent;
        updateLoadingProgress();
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

function updateLoadingProgress() {
  if (!appState.audioLoaded) {
    // Use the progress circle for loading
    const circumference = 2 * Math.PI * 136;
    const offset = circumference * (1 - appState.loadingProgress / 100);
    
    progressCircle.style.strokeDashoffset = offset;
    progressCircle.style.stroke = COLORS.primary;
    
    // Update button text with percentage
    if (appState.loadingProgress > 0 && appState.loadingProgress < 100) {
      controlButton.textContent = `LOADING ${Math.floor(appState.loadingProgress)}%`;
    }
  }
}

function completeLoading() {
  console.log('✅ Loading complete');
  
  // Remove loading pulse
  timeText.classList.remove('loading-pulse');
  
  // Reset to initial state
  appState.audioLoaded = true;
  statusText.textContent = 'Ready to start';
  timeText.textContent = formatTime(TIMER_CONFIG.TOTAL_DURATION);
  
  // Reset progress circle
  const circumference = 2 * Math.PI * 136;
  progressCircle.style.strokeDashoffset = circumference;
  
  updateControlButtonState();
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
  timeText.classList.remove('loading-pulse');
  timeText.textContent = 'Error';
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
  
  // Start audio playback with better error handling
  try {
    // Reset audio to start
    appState.audioElement.currentTime = 0;
    
    // For iOS: Create or reuse Web Audio API connection to enable silent mode playback
    if (window.AudioContext || window.webkitAudioContext) {
      // Create context if needed
      if (!appState.audioContext || appState.audioContext.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        appState.audioContext = new AudioContext();
        appState.audioSource = false; // Reset source tracking
      }
      
      // Connect audio element to context if not already connected
      if (!appState.audioSource && appState.audioContext) {
        try {
          const source = appState.audioContext.createMediaElementSource(appState.audioElement);
          source.connect(appState.audioContext.destination);
          appState.audioSource = true; // Mark as connected
          console.log('🔊 Audio connected to Web Audio API');
        } catch (error) {
          console.warn('Audio already connected to context:', error);
        }
      }
      
      // Resume context if suspended
      if (appState.audioContext.state === 'suspended') {
        await appState.audioContext.resume();
      }
    }
    
    // Attempt to play with promise handling
    const playPromise = appState.audioElement.play();
    
    if (playPromise !== undefined) {
      await playPromise;
      console.log('🎵 Audio playback started successfully');
    }
  } catch (error) {
    console.error('Failed to start audio:', error);
    
    // Try to reinitialize audio if play fails
    if (error.name === 'NotAllowedError') {
      alert('Please tap the button again to start audio playback');
    } else if (error.name === 'NotSupportedError') {
      alert('Audio playback error. Please refresh the page.');
    }
    
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
  
  // Suspend audio context instead of closing (keep for reuse)
  if (appState.audioContext && appState.audioContext.state === 'running') {
    try {
      await appState.audioContext.suspend();
      console.log('🔇 Audio context suspended');
    } catch (error) {
      console.error('Error suspending audio context:', error);
    }
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
  
  // Suspend audio context instead of closing
  if (appState.audioContext && appState.audioContext.state === 'running') {
    try {
      await appState.audioContext.suspend();
      console.log('🔇 Audio context suspended');
    } catch (error) {
      console.error('Error suspending audio context:', error);
    }
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
  if (!appState.audioLoaded && !appState.audioError) {
    // Don't update normal display during loading
    return;
  }
  
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
  
  if (!appState.audioLoaded) {
    return; // Keep loading message
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
  if (!appState.audioLoaded && !appState.audioError) {
    return; // Keep loading text
  }
  
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
  
  if (!appState.isRunning && appState.audioLoaded) {
    progressCircle.style.strokeDashoffset = circumference;
    progressCircle.style.stroke = COLORS.fastColor;
    return;
  }
  
  if (!appState.audioLoaded) {
    // Already handled in updateLoadingProgress
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
  
  // If audio error or not loaded, try to reinitialize
  if (appState.audioError || (!appState.audioLoaded && !appState.isRunning)) {
    console.log('🔄 Reinitializing audio...');
    initializeAudio();
    return;
  }
  
  await toggleTimer();
};

// Force reload audio (useful for debugging)
window.reloadAudio = function() {
  console.log('🔄 Force reloading audio...');
  appState.audioLoaded = false;
  appState.audioError = false;
  appState.loadingProgress = 0;
  initializeAudio();
};

// Clear audio cache and reload
window.clearAudioCache = async function() {
  console.log('🗑️ Clearing audio cache...');
  
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CLEAR_AUDIO_CACHE'
    });
  }
  
  // Wait a bit then reload audio
  setTimeout(() => {
    window.reloadAudio();
  }, 500);
};

// Force hard reload of the entire app
window.hardReload = function() {
  console.log('🔄 Performing hard reload...');
  
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name);
      });
    });
  }
  
  // Reload page without cache
  location.reload(true);
};

// Test function accessible from console
window.testTimer = function() {
  console.log('🧪 Test function called');
  handleButtonClick();
};