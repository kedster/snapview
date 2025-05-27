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
let currentFacingMode = 'user'; // 'user' for front camera, 'environment' for back camera
let isMobileDevice = false;

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
    // Detect mobile device
    isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobileDevice) {
        // On mobile, hide camera select dropdown and show simple switch button
        cameraSelect.style.display = 'none';
        switchCameraButton.textContent = '🔄 Switch to Back Camera';
    } else {
        // On desktop, show camera selection dropdown
        initializeCameras();
    }
});


    // Flash and pause effects
    function triggerFlashEffect() {
        // Flash effect
        flashOverlay.classList.add('flash');
        setTimeout(() => {
            flashOverlay.classList.remove('flash');
        }, 150);

        // Pause video effect
        webcamFeed.classList.add('analyzing');
        
        // Show analysis indicators
        analysisIndicator.classList.add('active');
        frameIndicator.classList.add('active');
        
        // Button effect
        analyzeNowButton.classList.add('analyzing');
    }

    function removeFlashEffect() {
        // Remove video pause effect
        webcamFeed.classList.remove('analyzing');
        
        // Hide analysis indicators
        analysisIndicator.classList.remove('active');
        
        // Remove button effect
        analyzeNowButton.classList.remove('analyzing');
        
        // Hide frame indicator after delay
        setTimeout(() => {
            frameIndicator.classList.remove('active');
        }, 1000);
    }

    // Camera enumeration and initialization
async function initializeCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');
        
        // Populate camera select dropdown
        cameraSelect.innerHTML = '<option value="">Select camera...</option>';
        availableCameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            cameraSelect.appendChild(option);
        });

        if (availableCameras.length > 0) {
            cameraSelect.value = availableCameras[0].deviceId;
        }
    } catch (error) {
        console.error('Error enumerating cameras:', error);
    }
}
// Camera Functions
async function startCamera() {
    try {
        statusText.textContent = 'Requesting camera permission...';
        loadingSpinner.style.display = 'block';

        let constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
            }
        };

        if (isMobileDevice) {
            constraints.video.facingMode = { ideal: currentFacingMode };
        } else {
            // Use dropdown on desktop
            const selectedCameraId = cameraSelect.value || (availableCameras.length > 0 ? availableCameras[0].deviceId : undefined);
            if (selectedCameraId) {
                constraints.video.deviceId = { exact: selectedCameraId };
            }
        }

        // Get stream to trigger permissions on iOS
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Now enumerate real device labels AFTER permission
        const devices = await navigator.mediaDevices.enumerateDevices();
        availableCameras = devices.filter(device => device.kind === 'videoinput');

        // If mobile and facingMode failed, try fallback to first non-front camera
        if (isMobileDevice && currentFacingMode === 'environment') {
            const backCam = availableCameras.find(cam => /back|environment/i.test(cam.label));
            if (backCam) {
                stopCamera(); // Stop the previous stream
                currentStream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: backCam.deviceId } }
                });
            }
        }

        webcamFeed.srcObject = currentStream;
        webcamFeed.onloadedmetadata = () => {
            webcamFeed.play();
            statusOverlay.classList.add('hidden');
            
            startButton.disabled = true;
            stopButton.disabled = false;
            analyzeNowButton.disabled = false;
            switchCameraButton.disabled = false;

            const label = currentStream.getVideoTracks()[0].label || "Unknown";
            cameraStatus.textContent = `Camera: Connected (${label})`;

            analysisStatus.textContent = 'Analysis: Ready';
            loadingSpinner.style.display = 'none';
        };

    } catch (error) {
        console.error('Camera error:', error);
        statusText.textContent = `Camera error: ${error.message}`;
        loadingSpinner.style.display = 'none';
        cameraStatus.textContent = `Camera: Error - ${error.message}`;
    }
}


function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        webcamFeed.srcObject = null;
        currentStream = null;
    }
    
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

async function switchMobileCamera() {
    try {
        // Toggle between 'user' and 'environment'
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

        // Stop existing stream
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: {
                facingMode: { exact: currentFacingMode },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        webcamFeed.srcObject = currentStream;

        webcamFeed.onloadedmetadata = () => {
            webcamFeed.play();

            const cameraType = currentFacingMode === 'user' ? 'Front' : 'Back';
            cameraStatus.textContent = `Camera: Connected (${cameraType})`;
            const nextCameraType = currentFacingMode === 'user' ? 'Back' : 'Front';
            switchCameraButton.textContent = `🔄 Switch to ${nextCameraType} Camera`;
        };
    } catch (error) {
        console.error('Error switching mobile camera:', error);
        cameraStatus.textContent = `Camera: Error switching - ${error.message}`;
    }
}


    async function switchMobileCamera() {
        // Stop current stream
        currentStream.getTracks().forEach(track => track.stop());

        try {
            statusText.textContent = 'Switching camera...';
            statusOverlay.classList.remove('hidden');
            loadingSpinner.style.display = 'block';

            // Toggle facing mode
            currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

            const constraints = {
                video: {
                    facingMode: currentFacingMode,
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
                const cameraType = currentFacingMode === 'user' ? 'Back' : 'Front';
                switchCameraButton.textContent = `🔄 Switch to ${cameraType} Camera`;
                
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
        }
    }
async function switchDesktopCamera() {
    const selectedCameraId = cameraSelect.value;
    if (!selectedCameraId) {
        alert('Please select a camera to switch to');
        return;
    }

    // Stop current stream
    currentStream.getTracks().forEach(track => track.stop());

    try {
        statusText.textContent = 'Switching camera...';
        statusOverlay.classList.remove('hidden');
        loadingSpinner.style.display = 'block';

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
            cameraStatus.textContent = 'Camera: Connected (Switched)';
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
    }
}

// Preset prompt functions
function setRepairPrompts() {
primaryPrompt.value = `
Analyze this image for any broken, damaged, or malfunctioning items. 
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

Return your findings as an array of such JSON objects, one per damaged item. 
Do not include any additional text or explanation — just the JSON array.
`;

    secondaryPrompt.value = `For each identified issue, suggest a specific repair method, required tools, estimated skill level, and safety precautions. 
Clearly indicate whether the task is suitable for DIY or should be handled by a professional. 
Keep the tone informative and practical, and avoid unnecessary assumptions. if nothing appears broken it might be an electrical issue.`;
}

function setNicknamePrompts() {
   primaryPrompt.value = `
Observe the people, pets, or objects in this image and describe their most unique and defining characteristics. 
Focus on expressions, poses, clothing, accessories, body language, or behavior that makes them stand out. 
Write as if you're introducing them to someone else, using vivid and playful descriptions.`;

secondaryPrompt.value = `
Create fun, creative nicknames based on the traits you identified. 
Explain why each nickname fits the subject’s look or personality. 
Aim for memorable and amusing names that reflect who or what they appear to be, like you're naming a character in a story.`;

}

function setIdentifyPrompts() {
   primaryPrompt.value = `
Examine the image closely and list every identifiable element you can see. 
Include people, animals, objects, environments, text, logos, symbols, and activities. 
Be specific — describe each item’s appearance, approximate location in the frame, and any notable details. 
Treat it like you're logging a scene for an investigator or cataloger.`;

secondaryPrompt.value = `
For each identified element, explain its likely role, significance, origin, or function. 
Describe how these items relate to each other or suggest the overall context or story the scene may represent. 
Aim to build a narrative or scene analysis from the cataloged components.`;

}

function setNicePrompts() {
   primaryPrompt.value = `
Describe all the positive, joyful, or uplifting aspects of this image. 
Focus on signs of kindness, beauty, peace, creativity, or emotional warmth. 
Highlight anything that might make someone smile, feel inspired, or appreciate life more.`;

secondaryPrompt.value = `
Expand on why these positive elements matter. 
Describe the emotions they evoke, what makes them special, and how they might resonate with viewers. 
Suggest how this image could teach a lesson, spark gratitude, or symbolize something meaningful in life.`;
}

function setPoeticPrompts() {
   primaryPrompt.value = `
Describe this image through a poetic lens. 
Use artistic and metaphorical language to capture the atmosphere, emotion, textures, colors, and the subtle energy of the scene. 
Let your words paint the image as if it were a living poem or a moment frozen in time.`;

secondaryPrompt.value = `
Explore the deeper symbolic or emotional meaning behind the image. 
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