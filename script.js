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

// State
let currentStream = null;
let isAnalyzing = false;
let responses = [];
let availableCameras = [];

// Event Listeners
startButton.addEventListener('click', startCamera);
stopButton.addEventListener('click', stopCamera);
analyzeNowButton.addEventListener('click', analyzeNow);
exportButton.addEventListener('click', exportToCSV);
clearButton.addEventListener('click', clearHistory);
switchCameraButton.addEventListener('click', switchCamera);

// Initialize camera list on page load
window.addEventListener('load', initializeCameras);

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

        const selectedCameraId = cameraSelect.value || (availableCameras.length > 0 ? availableCameras[0].deviceId : undefined);

        const constraints = { 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            } 
        };

        if (selectedCameraId) {
            constraints.video.deviceId = { exact: selectedCameraId };
            delete constraints.video.facingMode;
        }

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        webcamFeed.srcObject = currentStream;
        
        webcamFeed.onloadedmetadata = () => {
            webcamFeed.play();
            statusOverlay.classList.add('hidden');
            
            // Update UI
            startButton.disabled = true;
            stopButton.disabled = false;
            analyzeNowButton.disabled = false;
            switchCameraButton.disabled = false;
            
            cameraStatus.textContent = 'Camera: Connected';
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

async function switchCamera() {
    if (!currentStream) {
        alert('Please start the camera first');
        return;
    }

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
        console.error('Camera switch error:', error);
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
    primaryPrompt.value = "Examine this image for any broken, damaged, or malfunctioning items. Identify what needs repair, maintenance, or replacement. Focus on visible wear, cracks, loose parts, or anything that appears to be in poor condition.";
    secondaryPrompt.value = "Based on the identified repair needs, suggest specific repair methods, tools required, estimated difficulty level, and safety precautions. Also estimate if this is a DIY task or requires professional help.";
}

function setNicknamePrompts() {
    primaryPrompt.value = "Look at the people, objects, or pets in this image and describe their most distinctive or memorable features. Focus on unique characteristics, expressions, poses, or anything that stands out about their appearance or behavior.";
    secondaryPrompt.value = "Based on the distinctive features you identified, suggest creative and fun nicknames that capture the essence of what you see. Explain why each nickname fits and what makes it memorable or amusing.";
}

function setIdentifyPrompts() {
    primaryPrompt.value = "Carefully identify and catalog everything visible in this image. List all objects, people, animals, text, brands, locations, activities, and any other identifiable elements. Be as specific and detailed as possible.";
    secondaryPrompt.value = "Provide additional context about the identified items, including their likely purpose, origin, value, or significance. Mention any relationships between objects or suggest what story this scene might tell.";
}

function setNicePrompts() {
    primaryPrompt.value = "Focus on all the positive, beautiful, heartwarming, or pleasant aspects of this image. Highlight anything that brings joy, shows kindness, demonstrates skill, or creates a positive atmosphere. Emphasize the good things you can observe.";
    secondaryPrompt.value = "Elaborate on why these positive elements are meaningful or special. Suggest how this scene might inspire others, what emotions it evokes, or what life lessons or beautiful moments it represents.";
}

function setPoeticPrompts() {
    primaryPrompt.value = "Describe this image in a poetic and artistic manner. Use vivid imagery, metaphors, and creative language to paint a literary picture of what you see. Focus on mood, atmosphere, colors, textures, and the emotional essence of the scene.";
    secondaryPrompt.value = "Continue the poetic analysis by exploring deeper themes, symbolism, or philosophical meanings that could be drawn from this image. Consider what stories, dreams, or universal human experiences this scene might represent.";
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