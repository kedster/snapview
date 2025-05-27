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

// State
let currentStream = null;
let isAnalyzing = false;
let responses = [];
let availableCameras = [];
let currentFacingMode = 'environment'; // Default to back camera
let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Event Listeners
startButton.addEventListener('click', startCamera);
stopButton.addEventListener('click', stopCamera);
analyzeNowButton.addEventListener('click', analyzeNow);
exportButton.addEventListener('click', exportToCSV);
clearButton.addEventListener('click', clearHistory);
switchCameraButton.addEventListener('click', switchCamera);
cameraSelect.addEventListener('change', switchCamera);

// Initialize camera list on page load
window.addEventListener('load', () => {
    if (isMobileDevice) {
        cameraSelect.style.display = 'none';
        switchCameraButton.style.display = 'inline-block';
        const nextCamera = currentFacingMode === 'user' ? 'Back' : 'Front';
        switchCameraButton.textContent = `🔄 Switch to ${nextCamera} Camera`;
    } else {
        switchCameraButton.style.display = 'none';
        initializeCameras();
    }
});

// Robust camera access strategy
async function requestInitialAccess() {
    try {
        // Request broad access first to get permissions and device labels
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: isMobileDevice ? 'environment' : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        // Stop the stream immediately - we just needed permissions
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (err) {
        console.error("Initial camera access denied:", err);
        throw new Error("Camera permission required");
    }
}

// Get labeled cameras after permission granted
async function getLabeledCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
}

// Find the best camera based on device type
function findBestCamera(cameras) {
    if (!cameras || cameras.length === 0) return null;
    
    if (isMobileDevice) {
        // Priority 1: Look for cameras with "back", "rear", or "environment" in label
        let backCamera = cameras.find(cam => 
            /back|rear|environment/i.test(cam.label) && 
            !/front|user/i.test(cam.label)
        );
        
        if (backCamera) return backCamera;
        
        // Priority 2: If multiple cameras, assume last one is back (common pattern)
        if (cameras.length > 1) {
            return cameras[cameras.length - 1];
        }
        
        // Priority 3: Look for camera without "front" or "user" in label
        let nonFrontCamera = cameras.find(cam => !/front|user/i.test(cam.label));
        if (nonFrontCamera) return nonFrontCamera;
    }
    
    // Fallback: return first available camera
    return cameras[0];
}

// Camera enumeration for desktop
async function initializeCameras() {
    try {
        await requestInitialAccess();
        availableCameras = await getLabeledCameras();
        
        // Populate camera select dropdown
        cameraSelect.innerHTML = '<option value="">Select camera...</option>';
        availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

        if (availableCameras.length > 0) {
            const bestCamera = findBestCamera(availableCameras);
            cameraSelect.value = bestCamera.deviceId;
        }
    } catch (error) {
        console.error('Error initializing cameras:', error);
        cameraStatus.textContent = `Camera: Initialization Error - ${error.message}`;
    }
}

// Enhanced flash and analysis effects
function triggerFlashEffect() {
    // Immediate flash effect
    flashOverlay.style.opacity = '0.8';
    flashOverlay.style.display = 'block';
    
    // Quick flash animation
    setTimeout(() => {
        flashOverlay.style.opacity = '0';
    }, 100);
    
    setTimeout(() => {
        flashOverlay.style.display = 'none';
        flashOverlay.style.opacity = '0.8'; // Reset for next time
    }, 200);

    // Video pause/freeze effect
    webcamFeed.style.filter = 'grayscale(50%) brightness(1.2)';
    webcamFeed.style.transform = 'scale(1.02)';
    webcamFeed.style.transition = 'all 0.2s ease';
    
    // Show analysis indicators with staggered animation
    analysisIndicator.style.opacity = '1';
    analysisIndicator.style.transform = 'scale(1)';
    
    setTimeout(() => {
        frameIndicator.style.opacity = '1';
        frameIndicator.style.transform = 'scale(1)';
    }, 150);
    
    // Button visual feedback
    analyzeNowButton.style.transform = 'scale(0.95)';
    analyzeNowButton.style.backgroundColor = '#28a745';
    analyzeNowButton.style.boxShadow = '0 0 20px rgba(40, 167, 69, 0.5)';
}

function removeFlashEffect() {
    // Remove video effects
    webcamFeed.style.filter = 'none';
    webcamFeed.style.transform = 'scale(1)';
    
    // Hide analysis indicators with fade out
    analysisIndicator.style.opacity = '0';
    analysisIndicator.style.transform = 'scale(0.8)';
    
    // Reset button
    analyzeNowButton.style.transform = 'scale(1)';
    analyzeNowButton.style.backgroundColor = '';
    analyzeNowButton.style.boxShadow = '';
    
    // Hide frame indicator after delay
    setTimeout(() => {
        frameIndicator.style.opacity = '0';
        frameIndicator.style.transform = 'scale(0.8)';
    }, 1000);
}

// Enhanced camera start function
async function startCamera() {
    try {
        statusText.textContent = 'Requesting camera permission...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';

        // Step 1: Request initial access for permissions
        await requestInitialAccess();
        
        // Step 2: Get labeled cameras
        availableCameras = await getLabeledCameras();

        if (availableCameras.length === 0) {
            throw new Error("No cameras found");
        }

        let selectedCamera = null;
        let constraints = {};

        if (isMobileDevice) {
            // Mobile: Try facingMode first, then fallback to specific device
            try {
                constraints = {
                    video: {
                        facingMode: { ideal: currentFacingMode },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };
                
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                // Get actual camera info
                const videoTrack = currentStream.getVideoTracks()[0];
                const settings = videoTrack.getSettings();
                if (settings.facingMode) {
                    currentFacingMode = settings.facingMode;
                }
                
            } catch (facingModeError) {
                console.warn('FacingMode failed, trying device selection:', facingModeError);
                
                // Fallback: use device selection
                selectedCamera = findBestCamera(availableCameras);
                constraints = {
                    video: {
                        deviceId: { exact: selectedCamera.deviceId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };
                
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            }
            
            // Update switch button
            const nextCameraType = currentFacingMode === 'user' ? 'Back' : 'Front';
            switchCameraButton.textContent = `🔄 Switch to ${nextCameraType} Camera`;
            
        } else {
            // Desktop: Use selected camera or best available
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

        // Set up video element
        webcamFeed.srcObject = currentStream;
        
        webcamFeed.onloadedmetadata = () => {
            webcamFeed.play();
            statusOverlay.classList.add('hidden');

            // Update UI state
            startButton.disabled = true;
            stopButton.disabled = false;
            analyzeNowButton.disabled = false;
            switchCameraButton.disabled = false;

            // Update status
            const videoTrack = currentStream.getVideoTracks()[0];
            const cameraLabel = videoTrack.label || selectedCamera?.label || "Unknown Camera";
            const cameraType = isMobileDevice ? (currentFacingMode === 'user' ? 'Front' : 'Back') : '';
            cameraStatus.textContent = `Camera: Connected ${cameraType ? `(${cameraType})` : `(${cameraLabel})`}`;

            analysisStatus.textContent = 'Analysis: Ready';
            loadingSpinner.style.display = 'none';
        };

    } catch (error) {
        console.error('Camera startup error:', error);
        statusText.textContent = `Camera error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Error - ${error.message}`;
        statusOverlay.classList.remove('hidden');
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        webcamFeed.srcObject = null;
        currentStream = null;
    }
    
    // Reset any visual effects
    removeFlashEffect();
    
    // Update UI
    statusOverlay.classList.remove('hidden');
    statusText.textContent = 'Click "Start Camera" to begin';
    startButton.disabled = false;
    stopButton.disabled = true;
    analyzeNowButton.disabled = true;
    switchCameraButton.disabled = true;
    
    cameraStatus.textContent = 'Camera: Disconnected';
    analysisStatus.textContent = 'Analysis: Stopped';
}

// Unified switch camera function
async function switchCamera() {
    if (isMobileDevice) {
        await switchMobileCamera();
    } else {
        await switchDesktopCamera();
    }
}

async function switchMobileCamera() {
    if (!currentStream) return;

    try {
        statusText.textContent = 'Switching camera...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';

        // Stop current stream
        currentStream.getTracks().forEach(track => track.stop());

        // Toggle facing mode
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

        const constraints = {
            video: {
                facingMode: { ideal: currentFacingMode },
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
            
            // Update button text
            const nextCameraType = currentFacingMode === 'user' ? 'Back' : 'Front';
            switchCameraButton.textContent = `🔄 Switch to ${nextCameraType} Camera`;
            
            const currentCameraType = currentFacingMode === 'user' ? 'Front' : 'Back';
            cameraStatus.textContent = `Camera: Connected (${currentCameraType})`;
        };

    } catch (error) {
        console.error('Mobile camera switch error:', error);
        statusText.textContent = `Switch error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Switch Error - ${error.message}`;
        
        // Revert facing mode on error
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        
        // Try to restart with original camera
        setTimeout(() => {
            startCamera();
        }, 1000);
    }
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

        // Stop current stream
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

// Analysis Functions
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
    
    // Trigger enhanced flash effect
    triggerFlashEffect();
    
    // Update UI
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
        
        // Add to responses
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
        
        // Remove flash effects after delay
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
Treat it like you're logging a scene for an investigator or cataloger.`;

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