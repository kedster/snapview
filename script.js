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
const analysisInterval = document.getElementById('analysisInterval');
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
const analysisIndicator = document.getElementById('analysisIndicator');
const frameIndicator = document.getElementById('frameIndicator');

// State variables
let currentStream = null;
let isAnalyzing = false;
let responses = [];
let availableCameras = [];
let currentFacingMode = 'environment';
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
    if (isMobileDevice) {
        cameraSelect.style.display = 'none';
        switchCameraButton.style.display = 'inline-block';
        switchCameraButton.textContent = '🔄 Switch to Front Camera';
    } else {
        switchCameraButton.style.display = 'none';
        initializeCameras();
    }
});

// Enhanced permission check for Safari
async function checkCameraPermission() {
    if (!navigator.permissions) {
        // Fallback for browsers without permissions API
        return 'prompt';
    }
    
    try {
        const permission = await navigator.permissions.query({ name: 'camera' });
        return permission.state;
    } catch (error) {
        console.warn('Permission query failed:', error);
        return 'prompt';
    }
}

// Request initial camera access with Safari-specific handling
async function requestInitialAccess() {
    try {
        // For Safari iOS, be more explicit with constraints
        const constraints = {
            video: {
                facingMode: isMobileDevice ? 'environment' : undefined,
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 }
            }
        };

        // Add audio: false explicitly for Safari
        if (isIOSSafari) {
            constraints.audio = false;
        }
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (err) {
        console.error("Initial camera access denied:", err);
        
        // Safari-specific error handling
        if (isIOSSafari && err.name === 'NotAllowedError') {
            throw new Error("Camera permission denied. Please allow camera access in Safari settings.");
        } else if (isIOSSafari && err.name === 'NotFoundError') {
            throw new Error("No camera found. Please check your device camera.");
        } else if (isIOSSafari && err.name === 'NotReadableError') {
            throw new Error("Camera is being used by another app. Please close other camera apps.");
        }
        
        throw new Error("Camera permission required");
    }
}

// Get cameras with labels after permission
async function getLabeledCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
}

// Find best camera for device type
function findBestCamera(cameras) {
    if (!cameras || cameras.length === 0) return null;
    
    if (isMobileDevice) {
        // Look for back camera keywords
        let backCamera = cameras.find(cam => 
            /back|rear|environment/i.test(cam.label) && 
            !/front|user/i.test(cam.label)
        );
        
        if (backCamera) return backCamera;
        
        // If multiple cameras, try the last one (usually back)
        if (cameras.length > 1) {
            return cameras[cameras.length - 1];
        }
        
        // Look for non-front camera
        let nonFrontCamera = cameras.find(cam => !/front|user/i.test(cam.label));
        if (nonFrontCamera) return nonFrontCamera;
    }
    
    return cameras[0];
}

// Initialize cameras for desktop
async function initializeCameras() {
    try {
        await requestInitialAccess();
        availableCameras = await getLabeledCameras();
        
        cameraSelect.innerHTML = '<option value="">Select camera...</option>';
        availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

        if (availableCameras.length > 0) {
            const bestCamera = findBestCamera(availableCameras);
            if (bestCamera) {
                cameraSelect.value = bestCamera.deviceId;
            }
        }
    } catch (error) {
        console.error('Error initializing cameras:', error);
        cameraStatus.textContent = `Camera: Initialization Error - ${error.message}`;
    }
}

// Enhanced flash effects
function triggerFlashEffect() {
    // Flash overlay effect
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

    // Video effects
    webcamFeed.style.filter = 'grayscale(50%) brightness(1.2)';
    webcamFeed.style.transform = 'scale(1.02)';
    webcamFeed.style.transition = 'all 0.2s ease';
    
    // Analysis indicators
    if (analysisIndicator) {
        analysisIndicator.style.opacity = '1';
        analysisIndicator.style.transform = 'scale(1)';
    }
    
    setTimeout(() => {
        if (frameIndicator) {
            frameIndicator.style.opacity = '1';
            frameIndicator.style.transform = 'scale(1)';
        }
    }, 150);
    
    // Button feedback
    analyzeNowButton.style.transform = 'scale(0.95)';
    analyzeNowButton.style.backgroundColor = '#28a745';
    analyzeNowButton.style.boxShadow = '0 0 20px rgba(40, 167, 69, 0.5)';
}

function removeFlashEffect() {
    // Reset video effects
    webcamFeed.style.filter = 'none';
    webcamFeed.style.transform = 'scale(1)';
    
    // Hide indicators
    if (analysisIndicator) {
        analysisIndicator.style.opacity = '0';
        analysisIndicator.style.transform = 'scale(0.8)';
    }
    
    // Reset button
    analyzeNowButton.style.transform = 'scale(1)';
    analyzeNowButton.style.backgroundColor = '';
    analyzeNowButton.style.boxShadow = '';
    
    // Hide frame indicator after delay
    setTimeout(() => {
        if (frameIndicator) {
            frameIndicator.style.opacity = '0';
            frameIndicator.style.transform = 'scale(0.8)';
        }
    }, 1000);
}

// Enhanced camera start function with Safari iOS fixes
async function startCamera() {
    try {
        statusText.textContent = 'Requesting camera permission...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';

        // Check permission state first for Safari
        if (isIOSSafari) {
            const permissionState = await checkCameraPermission();
            if (permissionState === 'denied') {
                throw new Error("Camera access denied. Please enable camera in Safari Settings > Privacy & Security > Camera");
            }
        }

        // Get camera permission and devices
        await requestInitialAccess();
        availableCameras = await getLabeledCameras();

        if (availableCameras.length === 0) {
            throw new Error("No cameras found");
        }

        let selectedCamera = null;
        let constraints = {};

        if (isMobileDevice) {
            // Enhanced mobile constraints for Safari
            if (isIOSSafari) {
                // Safari iOS specific approach - try exact facingMode first
                try {
                    constraints = {
                        video: {
                            facingMode: { exact: currentFacingMode },
                            width: { ideal: 1280, max: 1920 },
                            height: { ideal: 720, max: 1080 }
                        },
                        audio: false // Explicitly disable audio for Safari
                    };
                    
                    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                    
                } catch (exactError) {
                    console.warn('Exact facingMode failed, trying ideal:', exactError);
                    
                    // Fallback to ideal facingMode
                    constraints = {
                        video: {
                            facingMode: { ideal: currentFacingMode },
                            width: { ideal: 1280, max: 1920 },
                            height: { ideal: 720, max: 1080 }
                        },
                        audio: false
                    };
                    
                    try {
                        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                    } catch (idealError) {
                        console.warn('Ideal facingMode failed, using device selection:', idealError);
                        
                        // Final fallback to device selection
                        selectedCamera = findBestCamera(availableCameras);
                        if (selectedCamera) {
                            constraints = {
                                video: {
                                    deviceId: { exact: selectedCamera.deviceId },
                                    width: { ideal: 1280, max: 1920 },
                                    height: { ideal: 720, max: 1080 }
                                },
                                audio: false
                            };
                            
                            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                        }
                    }
                }
            } else {
                // Original mobile logic for non-Safari
                try {
                    constraints = {
                        video: {
                            facingMode: { ideal: currentFacingMode },
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    };
                    
                    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                    
                    // Update facing mode from actual settings
                    const videoTrack = currentStream.getVideoTracks()[0];
                    const settings = videoTrack.getSettings();
                    if (settings.facingMode) {
                        currentFacingMode = settings.facingMode;
                    }
                    
                } catch (facingModeError) {
                    console.warn('FacingMode failed, using device selection:', facingModeError);
                    
                    // Fallback to device selection
                    selectedCamera = findBestCamera(availableCameras);
                    if (selectedCamera) {
                        constraints = {
                            video: {
                                deviceId: { exact: selectedCamera.deviceId },
                                width: { ideal: 1280 },
                                height: { ideal: 720 }
                            }
                        };
                        
                        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                    }
                }
            }
            
        } else {
            // Desktop: use selected or best camera
            const selectedCameraId = cameraSelect.value;
            selectedCamera = availableCameras.find(cam => cam.deviceId === selectedCameraId) || findBestCamera(availableCameras);

            if (!selectedCamera) {
                throw new Error("No suitable camera found");
            }

            constraints = {
                video: {
                    deviceId: { exact: selectedCamera.deviceId },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            currentStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Update dropdown
            cameraSelect.innerHTML = '<option value="">Select camera...</option>';
            availableCameras.forEach((camera, index) => {
                const option = document.createElement('option');
                option.value = camera.deviceId;
                option.textContent = camera.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(option);
            });
            cameraSelect.value = selectedCamera.deviceId;
        }

        if (!currentStream) {
            throw new Error("Failed to get camera stream");
        }

        // Enhanced video setup for Safari
        webcamFeed.srcObject = currentStream;
        
        // Safari requires explicit play() call and different event handling
        if (isIOSSafari) {
            webcamFeed.playsInline = true;
            webcamFeed.muted = true;
            
            // Use loadeddata instead of loadedmetadata for Safari
            webcamFeed.addEventListener('loadeddata', handleVideoReady, { once: true });
            webcamFeed.addEventListener('canplay', handleVideoReady, { once: true });
            
            // Force play for Safari
            try {
                await webcamFeed.play();
            } catch (playError) {
                console.warn('Auto-play failed, will try on user interaction:', playError);
            }
        } else {
            webcamFeed.onloadedmetadata = handleVideoReady;
        }

        // Timeout fallback for Safari
        setTimeout(() => {
            if (webcamFeed.readyState >= 2) {
                handleVideoReady();
            }
        }, 2000);

    } catch (error) {
        console.error('Camera startup error:', error);
        statusText.textContent = `Camera error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Error - ${error.message}`;
        statusOverlay.classList.remove('hidden');
        
        // Provide Safari-specific guidance
        if (isIOSSafari && (error.name === 'NotAllowedError' || error.message.includes('permission'))) {
            statusText.textContent = 'Camera blocked. Go to Safari Settings > Privacy & Security > Camera and enable for this site.';
        }
    }
}

// Separate video ready handler
function handleVideoReady() {
    try {
        if (!webcamFeed.videoWidth || !webcamFeed.videoHeight) {
            console.warn('Video dimensions not ready, retrying...');
            setTimeout(handleVideoReady, 500);
            return;
        }

        webcamFeed.play().catch(e => console.warn('Play failed:', e));
        statusOverlay.classList.add('hidden');

        // Enable buttons
        startButton.disabled = true;
        stopButton.disabled = false;
        analyzeNowButton.disabled = false;
        switchCameraButton.disabled = false;

        // Update status
        const videoTrack = currentStream.getVideoTracks()[0];
        const cameraLabel = videoTrack.label || "Unknown Camera";
        
        if (isMobileDevice) {
            // Get actual facing mode from track settings
            const settings = videoTrack.getSettings();
            const actualFacingMode = settings.facingMode || currentFacingMode;
            currentFacingMode = actualFacingMode;
            
            const cameraType = actualFacingMode === 'user' ? 'Front' : 'Back';
            cameraStatus.textContent = `Camera: Connected (${cameraType})`;
            const nextCameraType = actualFacingMode === 'user' ? 'Back' : 'Front';
            switchCameraButton.textContent = `🔄 Switch to ${nextCameraType} Camera`;
        } else {
            cameraStatus.textContent = `Camera: Connected (${cameraLabel})`;
        }

        analysisStatus.textContent = 'Analysis: Ready';
        loadingSpinner.style.display = 'none';
        
    } catch (error) {
        console.error('Video ready handler error:', error);
        setTimeout(handleVideoReady, 1000);
    }
}

// Stop camera function
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        webcamFeed.srcObject = null;
        currentStream = null;
    }
    
    removeFlashEffect();
    
    statusOverlay.classList.remove('hidden');
    statusText.textContent = 'Click "Start Camera" to begin';
    startButton.disabled = false;
    stopButton.disabled = true;
    analyzeNowButton.disabled = true;
    switchCameraButton.disabled = true;
    
    cameraStatus.textContent = 'Camera: Disconnected';
    analysisStatus.textContent = 'Analysis: Stopped';
}

// Switch camera function
async function switchCamera() {
    if (isMobileDevice) {
        await switchMobileCamera();
    } else {
        await switchDesktopCamera();
    }
}

// Enhanced mobile camera switching for Safari
async function switchMobileCamera() {
    if (!currentStream) return;

    try {
        statusText.textContent = 'Switching camera...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';

        currentStream.getTracks().forEach(track => track.stop());

        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

        let constraints;
        if (isIOSSafari) {
            // Safari iOS specific constraints
            constraints = {
                video: {
                    facingMode: { exact: currentFacingMode },
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 }
                },
                audio: false
            };
        } else {
            constraints = {
                video: {
                    facingMode: { ideal: currentFacingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
        }

        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (exactError) {
            if (isIOSSafari) {
                // Fallback to ideal for Safari
                constraints.video.facingMode = { ideal: currentFacingMode };
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            } else {
                throw exactError;
            }
        }

        webcamFeed.srcObject = currentStream;

        if (isIOSSafari) {
            webcamFeed.addEventListener('loadeddata', handleSwitchReady, { once: true });
            webcamFeed.addEventListener('canplay', handleSwitchReady, { once: true });
            await webcamFeed.play();
        } else {
            webcamFeed.onloadedmetadata = handleSwitchReady;
        }

    } catch (error) {
        console.error('Mobile camera switch error:', error);
        statusText.textContent = `Switch error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Switch Error - ${error.message}`;
        
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        
        setTimeout(() => {
            startCamera();
        }, 1000);
    }
}

function handleSwitchReady() {
    webcamFeed.play().catch(e => console.warn('Switch play failed:', e));
    statusOverlay.classList.add('hidden');
    loadingSpinner.style.display = 'none';
    
    const videoTrack = currentStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const actualFacingMode = settings.facingMode || currentFacingMode;
    currentFacingMode = actualFacingMode;
    
    const nextCameraType = actualFacingMode === 'user' ? 'Back' : 'Front';
    switchCameraButton.textContent = `🔄 Switch to ${nextCameraType} Camera`;
    
    const currentCameraType = actualFacingMode === 'user' ? 'Front' : 'Back';
    cameraStatus.textContent = `Camera: Connected (${currentCameraType})`;
}

async function switchDesktopCamera() {
    const selectedCameraId = cameraSelect.value;
    if (!selectedCameraId) {
        alert('Please select a camera to switch to');
        return;
    }

    if (!currentStream) return;

    try {
        statusText.textContent = 'Switching camera...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';

        currentStream.getTracks().forEach(track => track.stop());

        const constraints = {
            video: {
                deviceId: { exact: selectedCameraId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        webcamFeed.srcObject = currentStream;

        webcamFeed.onloadedmetadata = () => {
            webcamFeed.play();
            statusOverlay.classList.add('hidden');
            loadingSpinner.style.display = 'none';
            
            const selectedCamera = availableCameras.find(cam => cam.deviceId === selectedCameraId);
            const cameraLabel = selectedCamera?.label || 'Unknown Camera';
            cameraStatus.textContent = `Camera: Connected (${cameraLabel})`;
        };

    } catch (error) {
        console.error('Desktop camera switch error:', error);
        statusText.textContent = `Switch error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Switch Error - ${error.message}`;
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
        return null;
    }

    captureCanvas.width = webcamFeed.videoWidth;
    captureCanvas.height = webcamFeed.videoHeight;
    
    const context = captureCanvas.getContext('2d');
    context.drawImage(webcamFeed, 0, 0, captureCanvas.width, captureCanvas.height);
    
    return captureCanvas.toDataURL('image/jpeg', 0.8);
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
            throw new Error('Could not capture frame');
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

// Preset prompt functions
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
Include urgency if appropriate (e.g., “Great deal  priced to sell!” or “Hard to find, dont miss out!”), and reinforce the condition and value.`;
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

// Demo Walkthrough System
class DemoWalkthrough {
    constructor() {
        this.currentStep = 0;
        this.isActive = false;
        this.steps = [
            {
                title: "Welcome to SnapView!",
                text: "This app provides real-time dual analysis of your camera feed using ChatGPT. No signup required, but you're limited to 5 analyses per 24 hours. Let's explore the features!",
                target: null,
                position: "center"
            },
            {
                title: "Preset Prompt Buttons",
                text: "These buttons quickly set up different analysis types. Try 'Repair' for damage assessment, 'For Sale' for marketplace listings, or 'Identify' for detailed cataloging.",
                target: ".preset-buttons",
                position: "bottom"
            },
            {
                title: "Customize Your Prompts",
                text: "You can edit these text areas to customize how ChatGPT analyzes your images. The primary prompt describes what to look for, and the follow-up provides additional insights.",
                target: "#primaryPrompt",
                position: "left"
            },
            {
                title: "Camera Controls",
                text: "Start your camera here and use 'Analyze Now' to capture and analyze the current frame. On mobile, you can switch between front and back cameras.",
                target: ".controls",
                position: "right"
            },
            {
                title: "Export Your Data",
                text: "Your analysis history can be exported as CSV for your records. No data is stored on our servers - everything stays private on your device.",
                target: "#exportButton",
                position: "top"
            },
            {
                title: "You're All Set!",
                text: "SnapView is optimized for mobile use. Remember: 5 analyses per IP per 24 hours, no data stored, completely private. Start by clicking 'Start Camera' and pointing at something interesting!",
                target: null,
                position: "center"
            }
        ];
        
        this.overlay = document.getElementById('walkthroughOverlay');
        this.tooltip = document.querySelector('.walkthrough-tooltip');
        this.highlight = document.querySelector('.walkthrough-highlight');
        this.title = document.getElementById('walkthroughTitle');
        this.text = document.getElementById('walkthroughText');
        this.progress = document.getElementById('walkthroughProgress');
        this.prevBtn = document.getElementById('walkthroughPrev');
        this.nextBtn = document.getElementById('walkthroughNext');
        this.skipBtn = document.getElementById('walkthroughSkip');
        
        this.bindEvents();
    }
    
    bindEvents() {
        document.getElementById('helpButton').addEventListener('click', () => this.start());
        this.prevBtn.addEventListener('click', () => this.previousStep());
        this.nextBtn.addEventListener('click', () => this.nextStep());
        this.skipBtn.addEventListener('click', () => this.end());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay || e.target.classList.contains('walkthrough-backdrop')) {
                this.end();
            }
        });
        
        // ESC key to exit
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isActive) {
                this.end();
            }
        });
    }
    
    start() {
        this.currentStep = 0;
        this.isActive = true;
        this.overlay.classList.remove('hidden');
        this.showStep();
    }
    
    end() {
        this.isActive = false;
        this.overlay.classList.add('hidden');
        this.highlight.style.display = 'none';
        localStorage.setItem('demo_walkthrough_complete', 'true');
    }
    
    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep();
        } else {
            this.end();
        }
    }
    
    previousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep();
        }
    }
    
    showStep() {
        const step = this.steps[this.currentStep];
        
        // Update content
        this.title.textContent = step.title;
        this.text.textContent = step.text;
        this.progress.textContent = `${this.currentStep + 1} of ${this.steps.length}`;
        
        // Update navigation buttons
        this.prevBtn.disabled = this.currentStep === 0;
        this.nextBtn.textContent = this.currentStep === this.steps.length - 1 ? 'Finish' : 'Next';
        
        // Position tooltip and highlight
        this.positionElements(step);
    }
    
    positionElements(step) {
        if (step.target) {
            const targetElement = document.querySelector(step.target);
            if (targetElement) {
                const rect = targetElement.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                
                // Show and position highlight
                this.highlight.style.display = 'block';
                this.highlight.style.top = (rect.top + scrollTop - 10) + 'px';
                this.highlight.style.left = (rect.left + scrollLeft - 10) + 'px';
                this.highlight.style.width = (rect.width + 20) + 'px';
                this.highlight.style.height = (rect.height + 20) + 'px';
                
                // Position tooltip
                this.positionTooltip(rect, step.position, scrollTop, scrollLeft);
                
                // Scroll element into view
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Center the tooltip for welcome/finish steps
            this.highlight.style.display = 'none';
            this.tooltip.style.top = '50%';
            this.tooltip.style.left = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%)';
        }
    }
    
    positionTooltip(rect, position, scrollTop, scrollLeft) {
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const margin = 20;
        let top, left, transform = '';
        
        switch (position) {
            case 'top':
                top = rect.top + scrollTop - tooltipRect.height - margin;
                left = rect.left + scrollLeft + (rect.width / 2);
                transform = 'translateX(-50%)';
                break;
            case 'bottom':
                top = rect.bottom + scrollTop + margin;
                left = rect.left + scrollLeft + (rect.width / 2);
                transform = 'translateX(-50%)';
                break;
            case 'left':
                top = rect.top + scrollTop + (rect.height / 2);
                left = rect.left + scrollLeft - tooltipRect.width - margin;
                transform = 'translateY(-50%)';
                break;
            case 'right':
                top = rect.top + scrollTop + (rect.height / 2);
                left = rect.right + scrollLeft + margin;
                transform = 'translateY(-50%)';
                break;
            default:
                top = rect.bottom + scrollTop + margin;
                left = rect.left + scrollLeft + (rect.width / 2);
                transform = 'translateX(-50%)';
        }
        
        // Ensure tooltip stays within viewport
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (left + tooltipRect.width > viewportWidth) {
            left = viewportWidth - tooltipRect.width - 20;
            transform = '';
        }
        if (left < 20) {
            left = 20;
            transform = '';
        }
        if (top < 20) {
            top = rect.bottom + scrollTop + margin;
        }
        
        this.tooltip.style.top = top + 'px';
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.transform = transform;
    }
}

// Initialize walkthrough system
const walkthrough = new DemoWalkthrough();

// Auto-start walkthrough on first visit
window.addEventListener('load', () => {
    if (!localStorage.getItem('demo_walkthrough_complete')) {
        // Delay to ensure page is fully loaded
        setTimeout(() => {
            walkthrough.start();
        }, 1000);
    }
});