// Configuration - REPLACE WITH YOUR CLOUDFLARE WORKER URL
const WORKER_URL = 'backend-worker.sethkeddy.workers.dev';

// DOM Elements
const webcamFeed = document.getElementById('webcamFeed');
const captureCanvas = document.getElementById('captureCanvas');
const statusOverlay = document.getElementById('statusOverlay');
const statusText = document.getElementById('statusText');
const loadingSpinner = document.getElementById('loadingSpinner');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const analyzeNowButton = document.getElementById('analyzeNowButton');
const cameraStatus = document.getElementById('cameraStatus');
const analysisStatus = document.getElementById('analysisStatus');
const primaryPrompt = document.getElementById('primaryPrompt');
const secondaryPrompt = document.getElementById('secondaryPrompt');
const responsesList = document.getElementById('responsesList');
const exportButton = document.getElementById('exportButton');
const clearButton = document.getElementById('clearButton');
const cameraSelect = document.getElementById('cameraSelect');
const switchCameraButton = document.getElementById('switchCameraButton');
const flashOverlay = document.getElementById('flashOverlay');

// State variables
let currentStream = null;
let isAnalyzing = false;
let responses = [];
let availableCameras = [];
let currentFacingMode = 'environment'; // Start with back camera
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Safari-specific detection
let isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
let isIOSSafari = isSafari && isMobileDevice;

// Event Listeners
startButton.addEventListener('click', startCamera);
stopButton.addEventListener('click', stopCamera);
analyzeNowButton.addEventListener('click', analyzeNow);
exportButton.addEventListener('click', exportToCSV);
clearButton.addEventListener('click', clearHistory);
switchCameraButton.addEventListener('click', switchCamera);
cameraSelect.addEventListener('change', switchCamera);

// Initialize on page load
window.addEventListener('load', () => {
    console.log('Page loaded, device type:', isMobileDevice ? 'Mobile' : 'Desktop');
    console.log('Safari:', isSafari, 'iOS Safari:', isIOSSafari);
    
    if (isMobileDevice) {
        // Hide camera select dropdown on mobile
        if (cameraSelect && cameraSelect.parentElement) {
            cameraSelect.parentElement.style.display = 'none';
        }
        switchCameraButton.style.display = 'inline-block';
        switchCameraButton.textContent = '🔄 Switch to Front Camera';
    } else {
        switchCameraButton.style.display = 'none';
        initializeCameras();
    }
});

// Simplified permission check
async function hasCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some(device => device.kind === 'videoinput');
    } catch (error) {
        console.error('Error checking for cameras:', error);
        return false;
    }
}

// Get cameras with proper error handling
async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
        console.error('Error getting cameras:', error);
        return [];
    }
}

// Initialize cameras for desktop
async function initializeCameras() {
    try {
        // First check if we have any cameras
        if (!await hasCamera()) {
            throw new Error('No cameras found on this device');
        }

        // Try to get initial access to populate device labels
        try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 } }, 
                audio: false 
            });
            tempStream.getTracks().forEach(track => track.stop());
        } catch (permError) {
            console.warn('Initial permission request failed:', permError.message);
        }

        availableCameras = await getCameras();
        
        if (availableCameras.length === 0) {
            throw new Error('No cameras available');
        }

        // Populate camera dropdown
        cameraSelect.innerHTML = '<option value="">Select camera...</option>';
        availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

        // Select the first camera by default
        if (availableCameras.length > 0) {
            cameraSelect.value = availableCameras[0].deviceId;
        }

        console.log('Cameras initialized:', availableCameras.length);
        
    } catch (error) {
        console.error('Error initializing cameras:', error);
        cameraStatus.textContent = `Camera: ${error.message}`;
        statusText.textContent = error.message;
    }
}

// Enhanced flash effects
function triggerFlashEffect() {
    if (flashOverlay) {
        flashOverlay.style.opacity = '0.8';
        flashOverlay.style.display = 'block';
        
        setTimeout(() => {
            flashOverlay.style.opacity = '0';
        }, 100);
        
        setTimeout(() => {
            flashOverlay.style.display = 'none';
            flashOverlay.style.opacity = '0.8';
        }, 200);
    }

    webcamFeed.style.filter = 'grayscale(50%) brightness(1.2)';
    webcamFeed.style.transform = 'scale(1.02)';
    webcamFeed.style.transition = 'all 0.2s ease';
    
    analyzeNowButton.style.transform = 'scale(0.95)';
    analyzeNowButton.style.backgroundColor = '#28a745';
    analyzeNowButton.style.boxShadow = '0 0 20px rgba(40, 167, 69, 0.5)';
}

function removeFlashEffect() {
    webcamFeed.style.filter = 'none';
    webcamFeed.style.transform = 'scale(1)';
    
    analyzeNowButton.style.transform = 'scale(1)';
    analyzeNowButton.style.backgroundColor = '';
    analyzeNowButton.style.boxShadow = '';
}

// Simplified camera constraints
function getConstraints(deviceId = null, facingMode = null) {
    const constraints = {
        video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
        },
        audio: false
    };

    if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
    } else if (facingMode) {
        constraints.video.facingMode = { ideal: facingMode };
    }

    return constraints;
}

// Main camera start function - simplified and more reliable
async function startCamera() {
    try {
        console.log('Starting camera...');
        
        // Update UI
        statusText.textContent = 'Starting camera...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';
        startButton.disabled = true;

        // Check for camera availability
        if (!await hasCamera()) {
            throw new Error('No cameras found on this device');
        }

        let constraints;
        let stream = null;

        if (isMobileDevice) {
            console.log('Mobile device detected, using facingMode:', currentFacingMode);
            
            // Try facingMode approach for mobile
            constraints = getConstraints(null, currentFacingMode);
            
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (facingError) {
                console.warn('FacingMode failed, trying fallback:', facingError.message);
                
                // Fallback: try without facingMode
                constraints = {
                    video: { 
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 } 
                    },
                    audio: false
                };
                
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            }
            
        } else {
            console.log('Desktop device detected');
            
            // For desktop, try selected camera or first available
            const selectedCameraId = cameraSelect.value;
            
            if (selectedCameraId) {
                constraints = getConstraints(selectedCameraId);
            } else {
                // Get cameras and use first one
                availableCameras = await getCameras();
                if (availableCameras.length > 0) {
                    constraints = getConstraints(availableCameras[0].deviceId);
                } else {
                    // Last resort - no device specification
                    constraints = {
                        video: { 
                            width: { ideal: 1280 }, 
                            height: { ideal: 720 } 
                        },
                        audio: false
                    };
                }
            }
            
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        }

        if (!stream) {
            throw new Error('Failed to get camera stream');
        }

        console.log('Camera stream obtained successfully');
        
        // Store stream and setup video
        currentStream = stream;
        webcamFeed.srcObject = stream;

        // Setup video element properly
        webcamFeed.playsInline = true;
        webcamFeed.muted = true;
        webcamFeed.autoplay = true;

        // Wait for video to be ready
        await new Promise((resolve, reject) => {
            let resolved = false;
            
            const onReady = () => {
                if (!resolved) {
                    resolved = true;
                    console.log('Video ready');
                    resolve();
                }
            };

            const onError = (error) => {
                if (!resolved) {
                    resolved = true;
                    console.error('Video error:', error);
                    reject(new Error('Video failed to load'));
                }
            };

            // Multiple event listeners to catch when video is ready
            webcamFeed.addEventListener('loadedmetadata', onReady, { once: true });
            webcamFeed.addEventListener('loadeddata', onReady, { once: true });
            webcamFeed.addEventListener('canplay', onReady, { once: true });
            webcamFeed.addEventListener('error', onError, { once: true });

            // Timeout fallback
            setTimeout(() => {
                if (!resolved && webcamFeed.readyState >= 2) {
                    onReady();
                } else if (!resolved) {
                    onError(new Error('Video load timeout'));
                }
            }, 5000);
        });

        // Ensure video is playing
        try {
            await webcamFeed.play();
        } catch (playError) {
            console.warn('Video play failed:', playError);
            // Try to continue anyway as some browsers handle this differently
        }

        // Update UI for success
        statusOverlay.classList.add('hidden');
        loadingSpinner.style.display = 'none';
        
        startButton.disabled = true;
        stopButton.disabled = false;
        analyzeNowButton.disabled = false;
        switchCameraButton.disabled = false;

        // Update status text
        const videoTrack = currentStream.getVideoTracks()[0];
        if (videoTrack) {
            const settings = videoTrack.getSettings();
            console.log('Video track settings:', settings);
            
            if (isMobileDevice) {
                const actualFacingMode = settings.facingMode || currentFacingMode;
                currentFacingMode = actualFacingMode;
                const cameraType = actualFacingMode === 'user' ? 'Front' : 'Back';
                cameraStatus.textContent = `Camera: Connected (${cameraType})`;
                
                const nextCameraType = actualFacingMode === 'user' ? 'Back' : 'Front';
                switchCameraButton.textContent = `🔄 Switch to ${nextCameraType} Camera`;
            } else {
                const cameraLabel = videoTrack.label || 'Camera Active';
                cameraStatus.textContent = `Camera: Connected (${cameraLabel})`;
            }
        } else {
            cameraStatus.textContent = 'Camera: Connected';
        }

        analysisStatus.textContent = 'Analysis: Ready';
        
        console.log('Camera started successfully');

    } catch (error) {
        console.error('Camera startup error:', error);
        
        // Clean up on error
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
        
        // Update UI for error
        statusText.textContent = `Camera Error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Error - ${error.message}`;
        statusOverlay.classList.remove('hidden');
        
        // Re-enable start button
        startButton.disabled = false;
        stopButton.disabled = true;
        analyzeNowButton.disabled = true;
        switchCameraButton.disabled = true;

        // Provide helpful error messages
        if (error.name === 'NotAllowedError' || error.message.includes('permission')) {
            statusText.textContent = 'Camera access denied. Please allow camera permission and try again.';
        } else if (error.name === 'NotFoundError') {
            statusText.textContent = 'No camera found. Please check your camera connection.';
        } else if (error.name === 'NotReadableError') {
            statusText.textContent = 'Camera is being used by another application. Please close other camera apps.';
        }
    }
}

// Stop camera function
function stopCamera() {
    console.log('Stopping camera...');
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped track:', track.kind);
        });
        webcamFeed.srcObject = null;
        currentStream = null;
    }
    
    removeFlashEffect();
    
    statusOverlay.classList.remove('hidden');
    statusText.textContent = 'Click "Start Camera" to begin';
    loadingSpinner.style.display = 'none';
    
    startButton.disabled = false;
    stopButton.disabled = true;
    analyzeNowButton.disabled = true;
    switchCameraButton.disabled = true;
    
    cameraStatus.textContent = 'Camera: Disconnected';
    analysisStatus.textContent = 'Analysis: Stopped';
}

// Switch camera function
async function switchCamera() {
    if (!currentStream) {
        console.warn('No active stream to switch');
        return;
    }

    try {
        console.log('Switching camera...');
        
        statusText.textContent = 'Switching camera...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';

        // Stop current stream
        currentStream.getTracks().forEach(track => track.stop());

        if (isMobileDevice) {
            // Switch facing mode
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            console.log('Switching to facingMode:', currentFacingMode);
            
            const constraints = getConstraints(null, currentFacingMode);
            
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (facingError) {
                console.warn('FacingMode switch failed, trying fallback');
                
                // Fallback approach
                const constraints = {
                    video: { 
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 } 
                    },
                    audio: false
                };
                
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            }
        } else {
            // Desktop camera switching
            const selectedCameraId = cameraSelect.value;
            if (!selectedCameraId) {
                throw new Error('Please select a camera to switch to');
            }

            const constraints = getConstraints(selectedCameraId);
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        }

        // Setup new stream
        webcamFeed.srcObject = currentStream;
        await webcamFeed.play();

        // Update UI
        statusOverlay.classList.add('hidden');
        loadingSpinner.style.display = 'none';

        if (isMobileDevice) {
            const videoTrack = currentStream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            const actualFacingMode = settings.facingMode || currentFacingMode;
            currentFacingMode = actualFacingMode;
            
            const currentCameraType = actualFacingMode === 'user' ? 'Front' : 'Back';
            const nextCameraType = actualFacingMode === 'user' ? 'Back' : 'Front';
            
            cameraStatus.textContent = `Camera: Connected (${currentCameraType})`;
            switchCameraButton.textContent = `🔄 Switch to ${nextCameraType} Camera`;
        } else {
            const videoTrack = currentStream.getVideoTracks()[0];
            const cameraLabel = videoTrack.label || 'Camera Active';
            cameraStatus.textContent = `Camera: Connected (${cameraLabel})`;
        }

        console.log('Camera switched successfully');

    } catch (error) {
        console.error('Camera switch error:', error);
        
        statusText.textContent = `Switch error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Switch Error`;
        
        // Try to restart the original camera
        setTimeout(() => {
            if (isMobileDevice) {
                currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
            }
            startCamera();
        }, 1000);
    }
}

// Analysis functions
function analyzeNow() {
    if (!isAnalyzing) {
        analyzeFrame();
    }
}

function captureFrame() {
    if (!webcamFeed.videoWidth || !webcamFeed.videoHeight) {
        console.warn('Video dimensions not available');
        return null;
    }

    try {
        captureCanvas.width = webcamFeed.videoWidth;
        captureCanvas.height = webcamFeed.videoHeight;
        
        const context = captureCanvas.getContext('2d');
        context.drawImage(webcamFeed, 0, 0, captureCanvas.width, captureCanvas.height);
        
        return captureCanvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
        console.error('Frame capture error:', error);
        return null;
    }
}

async function analyzeFrame() {
    if (isAnalyzing) {
        alert('Analysis already in progress. Please wait...');
        return;
    }

    isAnalyzing = true;
    
    triggerFlashEffect();
    
    analyzeNowButton.disabled = true;
    analysisStatus.textContent = 'Analysis: Processing...';

    try {
        const imageData = captureFrame();
        if (!imageData) {
            throw new Error('Could not capture frame from camera');
        }

        const response = await fetch(`https://${WORKER_URL}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: imageData,
                primaryPrompt: primaryPrompt.value.trim() || 'Describe what you see in this image.',
                secondaryPrompt: secondaryPrompt.value.trim() || 'Provide additional insights about this scene.'
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        
        const responseEntry = {
            timestamp: new Date().toLocaleString(),
            primaryPrompt: primaryPrompt.value.trim(),
            secondaryPrompt: secondaryPrompt.value.trim(),
            primaryResponse: data.primaryResponse,
            secondaryResponse: data.secondaryResponse
        };

        responses.unshift(responseEntry);
        updateResponsesDisplay();
        enableExport();

    } catch (error) {
        console.error('Analysis error:', error);
        
        const errorEntry = {
            timestamp: new Date().toLocaleString(),
            primaryPrompt: primaryPrompt.value.trim(),
            secondaryPrompt: secondaryPrompt.value.trim(),
            primaryResponse: `Error: ${error.message}`,
            secondaryResponse: 'Analysis failed',
            isError: true
        };

        responses.unshift(errorEntry);
        updateResponsesDisplay();
    } finally {
        isAnalyzing = false;
        analyzeNowButton.disabled = false;
        analysisStatus.textContent = 'Analysis: Ready';
        
        setTimeout(() => {
            removeFlashEffect();
        }, 1500);
    }
}

// Preset prompt functions (keeping all original preset functions)
function setRepairPrompts() {
    primaryPrompt.value = `Analyze this image for any broken, damaged, or malfunctioning items. 
Focus on objects showing signs of wear, cracks, rust, missing parts, loose connections, discoloration, or other visible issues.

For each damaged item you identify, return a JSON object with the following fields:

{
  "serialNumber": "if visible or label-based, else null",
  "manufacturer": "if identifiable, else null",
  "itemType": "short description of the item",
  "color": "dominant color(s) of the item",
  "size": "rough size or dimension if inferable",
  "damageDescription": "what appears to be broken or worn",
  "mostLikelyCause": "best guess at what caused the issue",
  "secondLikelyCause": "what else could have caused the issue",
  "canBeRepaired": true,
  "estimatedRepairCostUSD": "in dollars",
  "skillRequired": "beginner | intermediate | expert",
  "estimatedRepairTimeHours": "estimate in hours and min"
}
Do not include any additional text or explanation — just the JSON array.`;

    secondaryPrompt.value = `For each identified issue, suggest a specific repair method, required tools, estimated skill level, and safety precautions. 
Clearly indicate whether the task is suitable for DIY or should be handled by a professional. 
Keep the tone informative and practical, and avoid unnecessary assumptions. if nothing appears broken it might be an electrical issue.`;
}

function setNicknamePrompts() {
    primaryPrompt.value = `Observe the people, pets, or objects in this image and describe their most unique and defining characteristics. 
Focus on expressions, poses, clothing, accessories, body language, or behavior that makes them stand out. 
Write as if you're introducing them to someone else, using vivid and playful descriptions.`;

    secondaryPrompt.value = `Create fun, creative nicknames based on the traits you identified. 
Explain why each nickname fits the subject's look or personality. 
Aim for memorable and amusing names that reflect who or what they appear to be, like you're naming a character in a story.`;
}

function setIdentifyPrompts() {
    primaryPrompt.value = `Examine the image closely and list every identifiable element you can see. 
Include people, animals, objects, environments, text, logos, symbols, and activities. 
Be specific — describe each item's appearance, approximate location in the frame, and any notable details. 
Treat it like you're logging a scene for an investigator or cataloger. Return a csv list`;

    secondaryPrompt.value = `For each identified element, explain its likely role, significance, origin, or function. 
Describe how these items relate to each other or suggest the overall context or story the scene may represent. 
Aim to build a narrative or scene analysis from the cataloged components.`;
}

function setNicePrompts() {
    primaryPrompt.value = `Describe all the positive, joyful, or uplifting aspects of this image. 
Focus on signs of kindness, beauty, peace, creativity, or emotional warmth. 
Highlight anything that might make someone smile, feel inspired, or appreciate life more.`;

    secondaryPrompt.value = `Expand on why these positive elements matter. 
Describe the emotions they evoke, what makes them special, and how they might resonate with viewers. 
Suggest how this image could teach a lesson, spark gratitude, or symbolize something meaningful in life.`;
}

function setPoeticPrompts() {
    primaryPrompt.value = `Describe this image through a poetic lens. 
Use artistic and metaphorical language to capture the atmosphere, emotion, textures, colors, and the subtle energy of the scene. 
Let your words paint the image as if it were a living poem or a moment frozen in time.`;

    secondaryPrompt.value = `Explore the deeper symbolic or emotional meaning behind the image. 
What universal truths, dreams, or inner human experiences could this scene represent? 
Draw out abstract ideas like hope, memory, loss, wonder, or transformation — and connect them to what is visible.`;
}

function setForSale() {
    primaryPrompt.value = `Examine the object in this image and try to identify what it is. Provide a detailed product description,
including brand, condition, typical use, and any standout features.
Then estimate its current value in three conditions: new, used (good condition), and broken/as-is. in us dollars $0.00`;

    secondaryPrompt.value = `Now write a compelling, friendly listing description that could be used to 
sell this item on a marketplace like Facebook Marketplace.
Focus on benefits, condition, and why someone might want to buy it. Keep it clear and persuasive.`;
}

function setMarketable() {
    primaryPrompt.value = `Now write a concise, friendly, and persuasive description that could be used to sell this item
on a platform like Facebook Marketplace. Focus on benefits, general use, and what makes this item worth buying. Keep the tone approachable.`;

    secondaryPrompt.value = `Add a short attention-grabbing sentence or headline that could help the listing stand out. 
Include urgency if appropriate (e.g., "Great deal  priced to sell!" or "Hard to find, dont miss out!"), and reinforce the condition and value.`;
}

// Display and utility functions
function updateResponsesDisplay() {
    if (responses.length === 0) {
        responsesList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                No analyses yet. Start the camera and begin analysis to see results here.
            </div>
        `;
        return;
    }

    responsesList.innerHTML = responses.map(response => `
        <div class="response-entry ${response.isError ? 'error' : ''}">
            <div class="response-header">
                ${response.timestamp}${response.isError ? ' • ERROR' : ''}
            </div>
            <div class="primary-response">
                <div class="response-label">Primary Analysis</div>
                <div class="response-text">${response.primaryResponse}</div>
            </div>
            <div class="secondary-response">
                <div class="response-label">Follow-up Analysis</div>
                <div class="response-text">${response.secondaryResponse}</div>
            </div>
        </div>
    `).join('');
}

function enableExport() {
    exportButton.disabled = responses.length === 0;
}

function exportToCSV() {
    if (responses.length === 0) {
        alert('No data to export');
        return;
    }

    const headers = ['Timestamp', 'Primary Prompt', 'Primary Response', 'Secondary Prompt', 'Secondary Response'];
    const csvData = [headers];

    responses.forEach(response => {
        csvData.push([
            response.timestamp,
            response.primaryPrompt,
            response.primaryResponse,
            response.secondaryPrompt,
            response.secondaryResponse
        ]);
    });

    const csvContent = csvData.map(row => 
        row.map(field => `"${String(field).replace(/"/g, '""')}"`)
           .join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-vision-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

function clearHistory() {
    if (confirm('Clear all analysis history? This cannot be undone.')) {
        responses = [];
        updateResponsesDisplay();
        enableExport();
    }
}

// Initialize
enableExport();