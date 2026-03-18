chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "CAPTURE_SCREEN") { //זיהוי הפעולה
        chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 80 }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                console.error("Capture Error:", chrome.runtime.lastError.message);
                sendResponse({ error: "Failed to capture" });
            } else {
                sendResponse({ imageData: dataUrl });
            }
        });
        return true;
    }
});