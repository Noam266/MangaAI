let audioPlayer = new Audio();
let currentMood = "";
let pendingMood = ""; 
let moodTimer = null; 
let currentTrackNumber = 1; 
let lastPageSeen = "1";
let isManualMode = false;
let isAIActive = false; 
let isPaused = false; 
let sandboxFrame = null;
let analysisTimer = null;

const audioCache = {}; 
let pageMoodHistory = {};

// מספר הטראקים לכל מוד
const TRACK_COUNTS = {
    calm: 3,
    tension: 3,
    sad: 3,
    epic: 3,
    action: 3,
    drums: 2
};

console.log("%c [System] Manga Music Content Script Loaded!", "color: #2ecc71; font-weight: bold; font-size: 14px;");

function resetChapterMemory() {
    console.log("%c [System] URL changed, memory cleared.", "color: #e74c3c;");
    pageMoodHistory = {};
}

function randomTrack(mood) { //שיר רנדומלי
    const count = TRACK_COUNTS[mood] || 2;
    return Math.floor(Math.random() * count) + 1;
}

function nextTrack(mood) { //שיר הבא בסדר מספרי
    const count = TRACK_COUNTS[mood] || 2;
    return (currentTrackNumber % count) + 1;
}

let lastPath = location.pathname; //החלק שבא אחרי הדומיין
setInterval(() => {
    if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        resetChapterMemory();
    }
}, 2000);

function initSandbox() {
    if (document.getElementById('ai-sandbox')) return; //מונע שכפול חלונות AI
    sandboxFrame = document.createElement('iframe');
    sandboxFrame.id = 'ai-sandbox';
    sandboxFrame.src = chrome.runtime.getURL('sandbox.html');
    sandboxFrame.style.display = 'none'; //מסתיר את האי איי שעובד ברקע
    document.body.appendChild(sandboxFrame); //מדביק את החלון לאתר המנגה

    window.addEventListener('message', (event) => { //בודק אם נשלחה הודעה מסאנדבוקס (הקונטנט נמצא בתוך האתר בזמן שסאנדסוקס נמצא בתוך התוסף)
        if (event.data.action === 'PREDICT_RESULT') { //בדיקה האם האי איי סיים לנתח את התמונה (הודעה עם הכותרת פרדיקט ריסולטס)
            processAIResult(event.data.result);
        }
    });
}

function processAIResult(result) { //מקבל תשובה מהסאנדבוקס על מצב המוזיקה ועל רמת הביטחון של האיי אי אחרי הבדיקה
    if (!result || isManualMode || !isAIActive) return; //מתי להתעלם מהאי איי
    
    const mood = result.className.toLowerCase(); //מצב
    const confidence = result.probability; //אחוזי ביטחון

    // הודעה בקונסול לעמוד הנוכחי
    console.log(`%c [AI Insight] Page ${lastPageSeen}: ${mood} (${(confidence*100).toFixed(1)}%)`, "color: #9b59b6; font-weight: bold;");

    if (confidence > 0.6) {
        pageMoodHistory[lastPageSeen] = mood; //שמירה בהיסטוריה של הפאנל
        if (isPaused) return;

        if (mood !== currentMood) {
            if (mood !== pendingMood) {
                pendingMood = mood; //שם את המוד בהמתנה לבחינה נוספת
                if (moodTimer) clearTimeout(moodTimer); //מאפס את הזמן
                moodTimer = setTimeout(() => { //מחכה זמן מסויים לפני שינוי המוזיקה
                    if (isPaused || !isAIActive) return;
                    console.log(`%c [AI] Mood Confirmed: ${mood}`, "color: #2ecc71; font-weight: bold;");
                    currentMood = mood;
                    currentTrackNumber = randomTrack(mood); // שיר ראנדומ
                    playMusic(mood);
                    pendingMood = ""; //מאתחל את הפנדינג מוד
                }, 4000);
            }
        }
    }
}

async function analyzeCurrentPage() { //פעולה אי סנכרונית
    if (!isAIActive || isManualMode) return;
    console.log(`%c [AI] Analyzing Page ${lastPageSeen}...`, "color: #3498db;");
    chrome.runtime.sendMessage({ action: "CAPTURE_SCREEN" }, (response) => { //בקשה לבאקגרואנד לצלם את המסך
        if (chrome.runtime.lastError) return;
        if (response && response.imageData && sandboxFrame?.contentWindow) { //בודק תגובה עם או בלי צילום המסך, או אם הסאנדבוקס עדין עובד בכלל
            sandboxFrame.contentWindow.postMessage({ action: 'PREDICT', imageData: response.imageData }, '*'); //שליחת התמונה לסאנדבוקס עם הנושא "פרדיקט" (הכוכבית אומרת לשלוח לכל מקור)
        }
    });
}

async function playMusic(mood, forcePlay = false) {
    if (isPaused || !mood) return;

    const fileName = `${mood}${currentTrackNumber}.mp3`; //מחבר למוזיקה
    const url = chrome.runtime.getURL(`sounds/${fileName}`);
    
    if (!forcePlay && audioPlayer.dataset.currentMood === mood && audioPlayer.dataset.track === String(currentTrackNumber)) {
        if (audioPlayer.paused) audioPlayer.play().catch(e => {});
        return;
    }

    console.log(`%c [Audio] Playing: ${fileName} ${forcePlay ? "(FORCED)" : ""}`, "color: #e67e22;");

    let blobUrl = audioCache[fileName] || null; //מנגנון זיכרון CACHE, בודק אם שמר את השיר הנוכחי באיזשהו שלב.
    if (!blobUrl) { //השיר לא במחסן
        try {
            const response = await fetch(url); //הורדת השיר
            const blob = await response.blob(); //שומר את השיר בבלוב
            const newBlobUrl = URL.createObjectURL(blob); //יצירת כתובת וירטואלית זמנית בדפדפן לשיר עצמו
            if (audioCache[fileName]) URL.revokeObjectURL(audioCache[fileName]); //בדיקה אם היה בזיכרון משהו ישן, ומוחקים אותו כדי לא לבזבז ראם
            audioCache[fileName] = newBlobUrl; //מגדירים את השיר החדש בזיכרון
            blobUrl = newBlobUrl;
        } catch (e) { return; }
    }

    if (audioPlayer.src && !audioPlayer.paused) {
        let vol = audioPlayer.volume; //עוצמת הקול הנוכחית של הנגן שלי
        const fadeOut = setInterval(() => { //לולאת זמן כל פרק זמן קצר מסויים שהגדרתי
            vol = Math.max(0, vol - 0.1); //הורדת הווליום ב10 כל פעם כדי ליצור פייד
            audioPlayer.volume = vol; //עדכון עוצמת הקול של הנגן
            if (vol <= 0) {
                clearInterval(fadeOut); //עצירת הלולאה
                audioPlayer.pause();
                startNewTrack(blobUrl, mood); //ניגון שיר חדש
            }
        }, 30);
    } else {
        startNewTrack(blobUrl, mood);
    }
}

function startNewTrack(url, mood) {
    if (isPaused) return; 
    audioPlayer.src = url; //הכנסת כתוב בלוב לנגן
    audioPlayer.dataset.currentMood = mood; 
    audioPlayer.dataset.track = currentTrackNumber;
    audioPlayer.loop = false;
    audioPlayer.onended = () => { //כאשר השיר נגמר
        if (isPaused) return;
        currentTrackNumber = nextTrack(mood);
        playMusic(audioPlayer.dataset.currentMood); //החלפת שיר
    };
    audioPlayer.volume = 0; 
    audioPlayer.play().then(() => { //אני פוקד על השיר להתחיל
        let vol = 0;
        const fadeIn = setInterval(() => {
            if (isPaused) { clearInterval(fadeIn); audioPlayer.pause(); return; }
            vol = Math.min(1.0, vol + 0.1); //הגברת השיר בשביל הפייד
            audioPlayer.volume = vol;
            if (vol >= 1.0) clearInterval(fadeIn);
        }, 30);
    }).catch(err => {});
}

//המזהה שגללתי לעמוד חדש במנגה
const observer = new IntersectionObserver((entries) => { //אובזרבר חדש מקבל רשימה של תמונות
    entries.forEach(entry => {
        if (entry.isIntersecting) { //עובר על כל תמונה ובודק אם התמונה נמצאת מול העיינים של המשתמש בעמןד במנגה
            const pageIdx = entry.target.getAttribute('data-page-index'); //בדיקת עמוד התמונה
            if (pageIdx && pageIdx !== lastPageSeen) {
                lastPageSeen = pageIdx; //בדיקת העמוד הנוכחי
                console.log(`%c [System] Switched to Page ${pageIdx}`, "color: #f39c12; font-weight: bold;");
                
                if (analysisTimer) clearTimeout(analysisTimer); //ניקוי מה שקרה בעמוד הקודם
                if (moodTimer) clearTimeout(moodTimer); //ניקוי
                pendingMood = "";
                //בדיקה האם העמוד צריך ניתוח או ישר לנגן אותו
                if (isAIActive) {
                    if (pageMoodHistory[pageIdx]) { //כאשר העמוד קיים
                        if (!isPaused && pageMoodHistory[pageIdx] !== currentMood) {
                            currentMood = pageMoodHistory[pageIdx];
                            currentTrackNumber = randomTrack(currentMood); //החלפת שיר מאותו המוד
                            playMusic(currentMood); //ישר לנגן את השיר מהזיכרון ולא לבדוק עם אי איי
                        }
                    } else if (!isPaused) {
                        analysisTimer = setTimeout(analyzeCurrentPage, 1000); //קריאה לאי איי אם אחרת
                    }
                }
            }
        }
    });
}, { threshold: 0.5 });

function scanPages() {
    const images = Array.from(document.querySelectorAll('img')).filter(img => img.height > 400 || img.width > 400); //מציאת כל התמונות שיש באתר, הפילטר מפלטר  פרסומות שיכולות להופיע ואייקונים קטנים, לוקח תמונות גדולות מ400
    images.forEach((img, i) => {
        if (!img.dataset.pageIndex) { //בדיקה האם התמונה כבר מסומנת
            img.dataset.pageIndex = i + 1; //האיי די של כל דף
            observer.observe(img);
        }
    });
}

initSandbox(); //יוצר את האייפריים של הAI
scanPages(); //סריקה ראשונה עם התחלת התוסף, לזהות את הדפים שמופיעים על המסך

const domObserver = new MutationObserver(() => scanPages()); //שינויים בתוך האתר עצמו
domObserver.observe(document.body, { childList: true, subtree: true }); //שינויים התוך הHTML

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => { //מקשיב להודעות שמגיעות מהפופאפ
    if (msg.action === "TOGGLE_AI") { //לחיצה על מצב AI
        isAIActive = msg.state;
        isManualMode = false;
        if (isAIActive && !isPaused) analyzeCurrentPage();
        sendResponse({ isAIActive: isAIActive });
    } 
    else if (msg.action === "START_MANUAL") { //לחיצה על מניואל
        const selectedMood = msg.mood.toLowerCase();
        let shouldForce = false;

        if (selectedMood === currentMood) { //החלפת שיר עם לחיצה פעמיים על כפתור
            currentTrackNumber = nextTrack(selectedMood);
            shouldForce = true;
        } else {
            currentMood = selectedMood; //עדכון מוד חדש
            currentTrackNumber = randomTrack(selectedMood);
        }

        isPaused = false;
        isAIActive = false; 
        isManualMode = true; //עדכון מניואל
        
        playMusic(currentMood, shouldForce);
        sendResponse({ status: "manual_started", track: currentTrackNumber }); //אישור מצב מניואל
    } 
    else if (msg.action === "TOGGLE_PAUSE") { //לחיצה על כפתור העצור
        isPaused = msg.isPaused; 
        if (isPaused) {
            audioPlayer.pause(); //ניקוי כל הטיימרים
            if (moodTimer) clearTimeout(moodTimer);
            if (analysisTimer) clearTimeout(analysisTimer);
        } else {
            if (isAIActive) { //חזרה לנגינה אם מוד אי איי מופעל
                if (pageMoodHistory[lastPageSeen]) {
                    currentMood = pageMoodHistory[lastPageSeen];
                    playMusic(currentMood);
                } else {
                    analyzeCurrentPage(); //סורק עמוד אם הועבר לעמוד שונה בזמן העצירה
                }
            } else if (audioPlayer.src) {
                audioPlayer.play().catch(e => {});
            }
        }
        sendResponse({ paused: isPaused });
    } 
    else if (msg.action === "GET_STATUS") { //בפתיחת התוסף, נשלח כל המידע לפופאפ
        sendResponse({ page: lastPageSeen, isAIActive: isAIActive, currentMood: currentMood, isPaused: isPaused });
    }
    return true;
});