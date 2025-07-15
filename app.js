console.log('🚀 KaizenWalk starting...');

// Variables globales
let isRunning = false;
let startTime = null;
let elapsedTime = 0;
let timerInterval = null;
let lastInterval = -1;
let permissionsGranted = false;

// Configuration
const TOTAL_DURATION = 30 * 60; // 30 minutes
const INTERVAL_DURATION = 3 * 60; // 3 minutes

// Elements DOM
const statusText = document.getElementById('statusText');
const setInfo = document.getElementById('setInfo');
const timeText = document.getElementById('timeText');
const progressCircle = document.getElementById('progressCircle');
const startButton = document.getElementById('startButton');
const permissionModal = document.getElementById('permissionModal');

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier les permissions
    if (Notification.permission === 'granted') {
        permissionsGranted = true;
    } else if (Notification.permission === 'default') {
        showPermissionModal();
    }
    
    // Gestionnaire de bouton
    startButton.addEventListener('click', toggleTimer);
});

// Gestion des permissions
function showPermissionModal() {
    permissionModal.classList.remove('hidden');
}

function hidePermissionModal() {
    permissionModal.classList.add('hidden');
}

async function requestPermissions() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            permissionsGranted = true;
            hidePermissionModal();
        } else {
            hidePermissionModal();
        }
    } catch (error) {
        console.error('Permission request failed:', error);
        hidePermissionModal();
    }
}

function denyPermissions() {
    hidePermissionModal();
}

// Fonction pour formater le temps
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Fonction principale du timer
function updateTimer() {
    const now = Date.now();
    elapsedTime = Math.floor((now - startTime) / 1000);
    
    // Calculer temps restant
    const remaining = TOTAL_DURATION - elapsedTime;
    timeText.textContent = formatTime(remaining);
    
    // Calculer intervalle actuel
    const currentInterval = Math.floor(elapsedTime / INTERVAL_DURATION);
    const isFast = currentInterval % 2 === 0;
    
    // Mettre à jour le statut
    statusText.textContent = isFast ? 'Fast Walk' : 'Slow Walk';
    statusText.style.color = '#ffffff';
    
    // Couleur du timer
    timeText.style.color = isFast ? '#00FFFF' : '#FF00FF';
    
    // Effet pulse pour Fast Walk
    if (isFast) {
        timeText.classList.add('pulse');
    } else {
        timeText.classList.remove('pulse');
    }
    
    // Informations sets
    if (currentInterval >= 0 && currentInterval < 10) {
        const setNumber = Math.floor(currentInterval / 2) + 1;
        const setsRemaining = 5 - setNumber;
        setInfo.textContent = `Set ${setNumber}/5 • ${setsRemaining} sets remaining`;
    }
    
    // Cercle de progression (se vide dans le sens des aiguilles d'une montre)
    const intervalProgress = (elapsedTime % INTERVAL_DURATION) / INTERVAL_DURATION;
    const circumference = 2 * Math.PI * 136;
    const offset = circumference * (1 - intervalProgress); // Se vide progressivement
    progressCircle.style.strokeDashoffset = offset;
    progressCircle.style.stroke = isFast ? '#00FFFF' : '#FF00FF';
    
    // Vérifier changement d'intervalle
    if (currentInterval !== lastInterval && currentInterval < 10) {
        if (lastInterval !== -1) {
            // Jouer son musical
            playBeep(isFast);
            
            // Vibration
            if (navigator.vibrate) {
                navigator.vibrate(isFast ? [100, 50, 100] : [200]);
            }
            
            // Notification
            if (permissionsGranted) {
                showNotification(isFast, currentInterval);
            }
        }
        lastInterval = currentInterval;
    }
    
    // Vérifier si terminé
    if (elapsedTime >= TOTAL_DURATION) {
        completeTimer();
    }
}

// Sons musicaux avec accords et mélodies
function playBeep(isFast) {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (isFast) {
            // Fast Walk : mélodie ascendante joyeuse (Do-Mi-Sol)
            const melody = [523.25, 659.25, 783.99]; // C5, E5, G5
            melody.forEach((freq, i) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                
                osc.connect(gain);
                gain.connect(audioContext.destination);
                
                osc.frequency.value = freq;
                osc.type = 'sine';
                
                const startTime = audioContext.currentTime + (i * 0.3);
                gain.gain.setValueAtTime(0.6, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);
                
                osc.start(startTime);
                osc.stop(startTime + 0.5);
            });
        } else {
            // Slow Walk : accord grave et profond (accord mineur)
            const chord = [261.63, 311.13, 392.00]; // C4, Eb4, G4 (accord de Do mineur)
            chord.forEach((freq, i) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                
                osc.connect(gain);
                gain.connect(audioContext.destination);
                
                osc.frequency.value = freq;
                osc.type = 'triangle'; // Son plus chaud pour l'accord
                
                const startTime = audioContext.currentTime;
                gain.gain.setValueAtTime(0.4, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 1.2);
                
                osc.start(startTime);
                osc.stop(startTime + 1.2);
            });
        }
    } catch (e) {
        console.log('Audio not available');
    }
}

// Notification
function showNotification(isFast, intervalIndex) {
    if (!permissionsGranted) return;
    
    const setNumber = Math.floor(intervalIndex / 2) + 1;
    const title = isFast ? "Fast Walk 🏃" : "Slow Walk 🚶";
    const body = `Set ${setNumber} of 5`;
    
    try {
        new Notification(title, {
            body,
            icon: '/icon-512x512.png',
            tag: 'interval-change',
            requireInteraction: false
        });
    } catch (error) {
        console.error('Notification failed:', error);
    }
}

// Démarrer le timer
function startTimer() {
    console.log('▶️ Starting timer');
    isRunning = true;
    startTime = Date.now();
    elapsedTime = 0;
    lastInterval = -1;
    
    startButton.textContent = 'STOP';
    startButton.className = 'button stop';
    
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer(); // Première mise à jour immédiate
    
    // Demander permissions si pas encore accordées
    if (!permissionsGranted && Notification.permission === 'default') {
        showPermissionModal();
    }
}

// Arrêter le timer
function stopTimer() {
    console.log('⏹️ Stopping timer');
    isRunning = false;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    startButton.textContent = 'START';
    startButton.className = 'button';
    
    // Reset affichage
    statusText.textContent = 'Ready to start';
    statusText.style.color = '#666';
    setInfo.textContent = '';
    timeText.textContent = '30:00';
    timeText.style.color = '#00FFFF';
    timeText.classList.remove('pulse');
    
    // Reset cercle (plein au début)
    const circumference = 2 * Math.PI * 136;
    progressCircle.style.strokeDashoffset = circumference;
    progressCircle.style.stroke = '#00FFFF';
}

// Compléter le timer
function completeTimer() {
    console.log('🎉 Timer completed');
    isRunning = false;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    statusText.textContent = 'Complete!';
    statusText.style.color = '#00FFFF';
    
    startButton.textContent = 'START';
    startButton.className = 'button';
    
    // Son de fin : fanfare triomphale
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Mélodie de victoire
        const victoryMelody = [
            523.25, 523.25, 523.25, 783.99, // Do-Do-Do-Sol
            880.00, 880.00, 880.00, 783.99, // La-La-La-Sol
            698.46, 698.46, 698.46, 659.25, // Fa-Fa-Fa-Mi
            659.25, 523.25 // Mi-Do
        ];
        
        victoryMelody.forEach((freq, i) => {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            
            osc.connect(gain);
            gain.connect(audioContext.destination);
            
            osc.frequency.value = freq;
            osc.type = 'sine';
            
            const startTime = audioContext.currentTime + (i * 0.15);
            gain.gain.setValueAtTime(0.5, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
            
            osc.start(startTime);
            osc.stop(startTime + 0.3);
        });
    } catch (e) {
        console.log('Audio not available');
    }
    
    // Vibration de fin
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }
    
    // Notification de fin
    if (permissionsGranted) {
        new Notification('KaizenWalk Complete! 🎉', {
            body: 'Congratulations! You completed your 30-minute workout.',
            icon: '/icon-512x512.png',
            tag: 'completion',
            requireInteraction: true
        });
    }
}

// Gestionnaire principal
function toggleTimer() {
    console.log('🔄 Button clicked, isRunning:', isRunning);
    if (isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

// Fonctions globales pour les permissions
window.requestPermissions = requestPermissions;
window.denyPermissions = denyPermissions;

console.log('✅ KaizenWalk ready');