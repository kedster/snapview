// Configuration - REPLACE WITH YOUR CLOUDFLARE WORKER URL
const WORKER_URL = 'backend-worker.sethkeddy.workers.dev';

// Google OAuth Configuration - Replace with your actual client ID
const GOOGLE_CLIENT_ID = 'your-google-client-id.apps.googleusercontent.com';

// Demo mode for testing (set to false in production)
const DEMO_MODE = true;

// Authentication state
let currentUser = null;
let authInitialized = false;

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


// New UI elements for improved flow
const analysisProgressCard = document.getElementById('analysisProgressCard');
const latestResultCard = document.getElementById('latestResultCard');
const latestPrimaryResult = document.getElementById('latestPrimaryResult');
const latestSecondaryResult = document.getElementById('latestSecondaryResult');
const resultTimestamp = document.getElementById('resultTimestamp');
const signInButton = document.getElementById('signInButton');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const signOutButton = document.getElementById('signOutButton');


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
signOutButton.addEventListener('click', signOut);

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
    
    // Initialize Google Auth
    initializeGoogleAuth();
    
    // Load saved auth state
    loadAuthState();
});

// Google Authentication Functions
function initializeGoogleAuth() {
    if (DEMO_MODE) {
        // Demo mode - create a simple sign-in button
        signInButton.innerHTML = `
            <button id="demoSignInBtn" class="demo-signin-btn">
                <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" width="20" height="20">
                Sign in with Google (Demo)
            </button>
        `;
        signInButton.style.display = 'block';
        
        document.getElementById('demoSignInBtn').addEventListener('click', () => {
            // Simulate successful Google authentication
            simulateGoogleSignIn();
        });
        
        authInitialized = true;
        return;
    }
    
    // Production mode - use actual Google Identity Services
    if (typeof google !== 'undefined' && google.accounts) {
        authInitialized = true;
        
        // Initialize Google Sign-In
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
        });

        // Render the sign-in button
        google.accounts.id.renderButton(signInButton, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            width: 200
        });
        
        signInButton.style.display = 'block';
    } else {
        // Retry after a short delay if Google services aren't loaded yet
        setTimeout(initializeGoogleAuth, 100);
    }
}

function simulateGoogleSignIn() {
    // Simulate a successful Google sign-in for demo purposes
    currentUser = {
        id: 'demo_user_123',
        name: 'Demo User',
        email: 'demo@example.com',
        picture: 'https://via.placeholder.com/32x32/667eea/white?text=DU'
    };
    
    // Save auth state
    saveAuthState();
    
    // Update UI
    updateAuthUI();
    
    console.log('Demo user signed in:', currentUser.name);
}

function handleCredentialResponse(response) {
    try {
        // Decode the JWT token to get user info
        const userInfo = parseJwtPayload(response.credential);
        
        currentUser = {
            id: userInfo.sub,
            name: userInfo.name,
            email: userInfo.email,
            picture: userInfo.picture,
            credential: response.credential
        };
        
        // Save auth state
        saveAuthState();
        
        // Update UI
        updateAuthUI();
        
        console.log('User signed in:', currentUser.name);
    } catch (error) {
        console.error('Error handling credential response:', error);
    }
}

function parseJwtPayload(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
}

function updateAuthUI() {
    if (currentUser) {
        // Show user profile, hide sign-in button
        userAvatar.src = currentUser.picture;
        userName.textContent = currentUser.name;
        userProfile.style.display = 'flex';
        signInButton.style.display = 'none';
    } else {
        // Show sign-in button, hide user profile
        userProfile.style.display = 'none';
        if (authInitialized) {
            signInButton.style.display = 'block';
        }
    }
}

function signOut() {
    if (confirm('Are you sure you want to sign out?')) {
        currentUser = null;
        
        // Clear saved auth state
        localStorage.removeItem('snapview_auth');
        sessionStorage.removeItem('snapview_auth');
        
        // Update UI
        updateAuthUI();
        
        // Sign out from Google
        if (typeof google !== 'undefined' && google.accounts) {
            google.accounts.id.disableAutoSelect();
        }
        
        console.log('User signed out');
    }
}

function saveAuthState() {
    if (currentUser) {
        const authData = {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            picture: currentUser.picture,
            timestamp: Date.now()
        };
        
        // Save to both localStorage and sessionStorage for flexibility
        localStorage.setItem('snapview_auth', JSON.stringify(authData));
        sessionStorage.setItem('snapview_auth', JSON.stringify(authData));
    }
}

function loadAuthState() {
    try {
        // Try sessionStorage first, then localStorage
        let authData = sessionStorage.getItem('snapview_auth') || localStorage.getItem('snapview_auth');
        
        if (authData) {
            authData = JSON.parse(authData);
            
            // Check if auth data is not too old (24 hours)
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            if (Date.now() - authData.timestamp < maxAge) {
                currentUser = authData;
                updateAuthUI();
                console.log('Restored auth state for:', currentUser.name);
            } else {
                // Clear expired auth data
                localStorage.removeItem('snapview_auth');
                sessionStorage.removeItem('snapview_auth');
            }
        }
    } catch (error) {
        console.error('Error loading auth state:', error);
        // Clear corrupted auth data
        localStorage.removeItem('snapview_auth');
        sessionStorage.removeItem('snapview_auth');
    }
    
    // Always update UI to show correct state
    updateAuthUI();
}

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
    
    // Show progress card with animation
    showProgressCard();

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
        
        // Hide progress card and show result with smooth transition
        hideProgressCard();
        setTimeout(() => {
            showLatestResult(responseEntry);
        }, 200);
        
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
        
        // Hide progress card and show error result
        hideProgressCard();
        setTimeout(() => {
            showLatestResult(errorEntry);
        }, 200);
        
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
function showProgressCard() {
    if (analysisProgressCard) {
        analysisProgressCard.style.display = 'block';
        // Force reflow for animation
        analysisProgressCard.offsetHeight;
        analysisProgressCard.classList.add('show');
    }
}

function hideProgressCard() {
    if (analysisProgressCard) {
        analysisProgressCard.classList.remove('show');
        setTimeout(() => {
            analysisProgressCard.style.display = 'none';
        }, 400);
    }
}

function showLatestResult(responseEntry) {
    if (!latestResultCard || !latestPrimaryResult || !latestSecondaryResult || !resultTimestamp) {
        return;
    }
    
    // Update content
    latestPrimaryResult.textContent = responseEntry.primaryResponse;
    latestSecondaryResult.textContent = responseEntry.secondaryResponse;
    resultTimestamp.textContent = responseEntry.timestamp;
    
    // Update styling for errors
    if (responseEntry.isError) {
        latestResultCard.style.borderColor = '#ff6b6b';
        latestResultCard.querySelector('.result-header').style.background = 
            'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)';
    } else {
        latestResultCard.style.borderColor = '#e9ecef';
        latestResultCard.querySelector('.result-header').style.background = 
            'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
    }
    
    // Show with animation
    latestResultCard.style.display = 'block';
    // Force reflow for animation
    latestResultCard.offsetHeight;
    latestResultCard.classList.add('show');
    
    // Smooth scroll to result
    setTimeout(() => {
        latestResultCard.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
        });
    }, 300);
    
    // Add gentle pulse effect to draw attention
    setTimeout(() => {
        latestResultCard.style.animation = 'gentlePulse 0.6s ease-out';
        setTimeout(() => {
            latestResultCard.style.animation = '';
        }, 600);
    }, 400);
}

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