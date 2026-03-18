const autoBtn = document.getElementById('autoBtn');
const manualBtn = document.getElementById('toggleManualBtn');
const moodBtns = document.querySelectorAll('.mood-btn');
const pauseBtn = document.getElementById('pauseBtn');
const btnIcon = document.getElementById('btnIcon');
const pageDisplay = document.getElementById('pageDisplay');
const manualSection = document.getElementById('manualSection');
const mainBody = document.getElementById('mainBody');
const helpBtn = document.getElementById('helpBtn');
const helpTooltip = document.getElementById('helpTooltip');

// FIX: שני layers למעבר חלק בין רקעים
const bgLayerA = document.getElementById('bg-layer-a');
const bgLayerB = document.getElementById('bg-layer-b');
let activeBgLayer = 'a'; // איזה layer פעיל כרגע
let currentBgMood = '';

let currentAIState = false;
let currentPauseState = false;
let isWaitingForContent = false; 
let isChangingSong = false; 

function updateLocks() {
    pauseBtn.disabled = isChangingSong;
    if (currentPauseState) {
        autoBtn.disabled = true;
        manualBtn.disabled = true;
        moodBtns.forEach(btn => btn.disabled = true);
    } else if (currentAIState) {
        autoBtn.disabled = false;
        manualBtn.disabled = true;
        moodBtns.forEach(btn => btn.disabled = true);
    } else {
        autoBtn.disabled = false;
        manualBtn.disabled = false;
        moodBtns.forEach(btn => btn.disabled = false);
    }
}

function updatePauseUI(isPaused) {
    currentPauseState = isPaused;
    if (isPaused) {
        pauseBtn.classList.add('paused');
        btnIcon.innerHTML = '<div class="icon-play"></div>';
    } else {
        pauseBtn.classList.remove('paused');
        btnIcon.innerHTML = '<div class="icon-pause"><div></div><div></div></div>';
    }
    updateLocks();
}

function updateAIUI(isActive) {
    currentAIState = isActive;
    autoBtn.innerText = isActive ? "AI Mode: ON" : "Activate AI Mode";
    if (isActive) {
        autoBtn.classList.add('active');
    } else {
        autoBtn.classList.remove('active');
    }
    updateLocks();
}

// FIX: מעבר חלק בין רקעים באמצעות שני layers
// Layer A ו-B מחליפים תפקידים בכל שינוי מוד:
// הlayer הנכנס מקבל את הרקע החדש, ואז עולה ב-opacity בעוד הישן יורד
function updateBackground(mood) {
    if (!mood || mood === currentBgMood) return;
    currentBgMood = mood;

    const moodClass = `bg-${mood.toLowerCase()}`;

    if (activeBgLayer === 'a') {
        // B יהיה הרקע החדש — מכינים אותו מאחורה ואז מעלים
        bgLayerB.className = moodClass;
        bgLayerB.style.opacity = '1';
        bgLayerA.style.opacity = '0';
        activeBgLayer = 'b';
    } else {
        // A יהיה הרקע החדש
        bgLayerA.className = moodClass;
        bgLayerA.style.opacity = '1';
        bgLayerB.style.opacity = '0';
        activeBgLayer = 'a';
    }
}

function lockPauseTemporarily() {
    isChangingSong = true;
    updateLocks();
    setTimeout(() => {
        isChangingSong = false;
        updateLocks();
    }, 2000);
}

async function sendToContent(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        return new Promise(resolve => {
            chrome.tabs.sendMessage(tab.id, message, (response) => {
                if (chrome.runtime.lastError) resolve(null);
                else resolve(response);
            });
        });
    }
}

// EVENTS
pauseBtn.addEventListener('click', async () => {
    if (isChangingSong) return;
    isWaitingForContent = true;
    const targetPauseState = !currentPauseState;
    updatePauseUI(targetPauseState); 
    await sendToContent({ action: "TOGGLE_PAUSE", isPaused: targetPauseState });
    setTimeout(() => { isWaitingForContent = false; }, 2000);
});

autoBtn.addEventListener('click', async () => {
    if (currentPauseState) return;
    isWaitingForContent = true;
    const targetAI = !currentAIState;
    if (targetAI) lockPauseTemporarily();
    updateAIUI(targetAI);
    await sendToContent({ action: "TOGGLE_AI", state: targetAI });
    setTimeout(() => { isWaitingForContent = false; }, 2000);
});

manualBtn.addEventListener('click', () => {
    if (currentPauseState || currentAIState) return;
    manualSection.classList.toggle('open');
});

// מצב אילו כפתורים כבר פעילים (נלחץ פעם אחת)
const activeMoodBtns = new Set();

function flashNextSong(btn) {
    btn.classList.remove('label-return');
    btn.classList.add('next-flash');
    setTimeout(() => {
        btn.classList.remove('next-flash');
        btn.classList.add('label-return');
        // מאפס label-return אחרי שהאנימציה נגמרת
        setTimeout(() => btn.classList.remove('label-return'), 400);
    }, 1800);
}

moodBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (currentPauseState || currentAIState) return;
        const mood = btn.getAttribute('data-mood');

        // אם הכפתור כבר פעיל — זו לחיצה שנייה, מציגים NEXT
        if (activeMoodBtns.has(mood)) {
            flashNextSong(btn);
        } else {
            activeMoodBtns.clear(); // מנקה כפתורים פעילים קודמים
            activeMoodBtns.add(mood);
        }

        lockPauseTemporarily();
        updateBackground(mood);
        updatePauseUI(false); 
        await sendToContent({ action: "START_MANUAL", mood: mood });
    });
});

const sync = async () => {
    if (isWaitingForContent) return;
    const response = await sendToContent({ action: "GET_STATUS" });
    if (response) {
        if (response.isAIActive !== undefined && response.isAIActive !== currentAIState) {
            updateAIUI(response.isAIActive);
        }
        if (response.isPaused !== undefined && response.isPaused !== currentPauseState) {
            updatePauseUI(response.isPaused);
        }
        if (response.page) {
            pageDisplay.innerText = `CURRENT PAGE: ${response.page}`;
        }
        if (response.currentMood) {
            updateBackground(response.currentMood);
        }
    }
};

sync();
const syncInterval = setInterval(sync, 1000);
window.addEventListener('unload', () => clearInterval(syncInterval));