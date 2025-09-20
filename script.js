// Configuration - REPLACE WITH YOUR CLOUDFLARE WORKER URL
const WORKER_URL = 'backend-worker.sethkeddy.workers.dev';

// Stripe Configuration - REPLACE WITH YOUR ACTUAL STRIPE KEYS
// Get these from your Stripe Dashboard at https://dashboard.stripe.com/apikeys
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51234567890'; // Replace with your actual publishable key
const STRIPE_PRICE_ID = 'price_1234567890'; // Replace with your actual price ID from Stripe Products

// User management and payment state
let currentUser = null;
let userUsageCount = 0;
const FREE_USAGE_LIMIT = 10; // Free users get 10 analyses per day

// Google OAuth Configuration - Replace with your actual client ID
const GOOGLE_CLIENT_ID = 'your-google-client-id.apps.googleusercontent.com';

// Demo mode for testing (set to false in production)
const DEMO_MODE = true;

// Authentication state
let authInitialized = false;

// New Theme: Section Expansion Functionality
function initSectionExpansion() {
    const sections = document.querySelectorAll('.bl-main > section');
    const main = document.querySelector('.bl-main');
    let currentSection = null;
    let isExpanded = false;
    
    sections.forEach(section => {
        const box = section.querySelector('.bl-box');
        const closeBtn = section.querySelector('.bl-icon-close');
        
        if (box) {
            box.addEventListener('click', () => {
                if (isExpanded) return;
                
                // Add classes for expansion
                main.classList.add('bl-expand-item');
                section.classList.add('bl-expand', 'bl-expand-top');
                
                currentSection = section;
                isExpanded = true;
            });
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (!isExpanded) return;
                
                // Remove expansion classes
                main.classList.remove('bl-expand-item');
                
                if (currentSection) {
                    currentSection.classList.remove('bl-expand', 'bl-expand-top');
                }
                
                currentSection = null;
                isExpanded = false;
            });
        }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isExpanded) {
            // Remove expansion classes
            main.classList.remove('bl-expand-item');
            
            if (currentSection) {
                currentSection.classList.remove('bl-expand', 'bl-expand-top');
            }
            
            currentSection = null;
            isExpanded = false;
        }
    });
}

// Initialize the section manager
document.addEventListener('DOMContentLoaded', () => {
    initSectionExpansion();
});


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

// ===============================
// User Section Elements
// ===============================
const userSection = document.getElementById('userSection');
const userInfo = document.getElementById('userInfo');
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('emailInput');
const loginButton = document.getElementById('loginButton');
const userEmail = document.getElementById('userEmail');
const userStatus = document.getElementById('userStatus');
const upgradeButton = document.getElementById('upgradeButton');
const logoutButton = document.getElementById('logoutButton');
const usageInfo = document.getElementById('usageInfo');
const usageProgress = document.getElementById('usageProgress');
const usageText = document.getElementById('usageText');

// ===============================
// Google Auth & Profile Elements
// ===============================
const signInButton = document.getElementById('signInButton');
const userProfile = document.getElementById('userProfile');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const signOutButton = document.getElementById('signOutButton');

// ===============================
// Analysis & Results Elements
// ===============================
const analysisProgressCard = document.getElementById('analysisProgressCard');
const latestResultCard = document.getElementById('latestResultCard');
const latestPrimaryResult = document.getElementById('latestPrimaryResult');
const latestSecondaryResult = document.getElementById('latestSecondaryResult');
const resultTimestamp = document.getElementById('resultTimestamp');


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

// User authentication event listeners
loginButton.addEventListener('click', handleLogin);
logoutButton.addEventListener('click', handleLogout);
upgradeButton.addEventListener('click', handleUpgrade);
emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleLogin();
    }
});

// User Management Functions
function handleLogin() {
    const email = emailInput.value.trim();
    if (!email || !isValidEmail(email)) {
        alert('Please enter a valid email address');
        return;
    }

    // Save email for next time
    localStorage.setItem('snapview_last_email', email);

    currentUser = {
        email: email,
        isPremium: false,
        usageCount: 0
    };

    // Check localStorage for existing user data
    const savedUser = localStorage.getItem(`snapview_user_${email}`);
    if (savedUser) {
        const userData = JSON.parse(savedUser);
        currentUser = { ...currentUser, ...userData };
    }

    // Reset daily usage if it's a new day
    const today = new Date().toDateString();
    const lastUsageDate = localStorage.getItem(`snapview_last_usage_${email}`);
    if (lastUsageDate !== today) {
        currentUser.usageCount = 0;
        localStorage.setItem(`snapview_last_usage_${email}`, today);
    }

    saveUserData();
    updateUserDisplay();
}

function handleLogout() {
    currentUser = null;
    updateUserDisplay();
}

async function handleUpgrade() {
    if (!currentUser) {
        alert('Please log in first');
        return;
    }

    try {
        // Create Stripe checkout session
        const response = await fetch(`https://${WORKER_URL}/create-checkout-session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: currentUser.email,
                priceId: STRIPE_PRICE_ID,
                successUrl: `${window.location.origin}?success=true`,
                cancelUrl: `${window.location.origin}?canceled=true`
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to create checkout session');
        }

        const session = await response.json();
        
        // Redirect to Stripe Checkout
        if (session.url) {
            window.location.href = session.url;
        } else {
            throw new Error('No checkout URL received');
        }
    } catch (error) {
        console.error('Upgrade error:', error);
        alert('Failed to start upgrade process. Please try again.');
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function saveUserData() {
    if (currentUser) {
        localStorage.setItem(`snapview_user_${currentUser.email}`, JSON.stringify(currentUser));
    }
}

function updateUserDisplay() {
    if (currentUser) {
        // Show user info, hide login form
        loginForm.style.display = 'none';
        userInfo.style.display = 'flex';
        usageInfo.style.display = 'block';
        
        userEmail.textContent = currentUser.email;
        
        if (currentUser.isPremium) {
            userStatus.textContent = 'Premium';
            userStatus.className = 'user-status premium';
            upgradeButton.style.display = 'none';
            analysisStatus.textContent = 'Analysis: Ready (Unlimited)';
            
            // Hide usage bar for premium users
            usageInfo.style.display = 'none';
        } else {
            const remaining = FREE_USAGE_LIMIT - currentUser.usageCount;
            userStatus.textContent = `Free (${remaining} remaining today)`;
            userStatus.className = 'user-status free';
            upgradeButton.style.display = 'inline-block';
            
            // Update usage bar
            const usagePercent = (currentUser.usageCount / FREE_USAGE_LIMIT) * 100;
            usageProgress.style.width = `${usagePercent}%`;
            usageText.textContent = `${currentUser.usageCount}/${FREE_USAGE_LIMIT} analyses used today`;
            
            if (currentUser.usageCount >= FREE_USAGE_LIMIT) {
                analysisStatus.textContent = 'Analysis: Daily limit reached - Upgrade for unlimited access';
                analyzeNowButton.disabled = true;
                analyzeNowButton.textContent = 'Daily Limit Reached';
                usageText.textContent = 'Daily limit reached - Upgrade for unlimited access';
            } else {
                analysisStatus.textContent = `Analysis: Ready (${remaining} remaining today)`;
                analyzeNowButton.disabled = false;
                analyzeNowButton.textContent = 'Analyze Now';
            }
        }
    } else {
        // Show login form, hide user info
        loginForm.style.display = 'flex';
        userInfo.style.display = 'none';
        usageInfo.style.display = 'none';
        emailInput.value = '';
        analysisStatus.textContent = 'Analysis: Please log in to continue';
        analyzeNowButton.disabled = true;
        analyzeNowButton.textContent = 'Login Required';
    }
}

function checkUsageLimit() {
    if (!currentUser) {
        alert('Please log in to use analysis features');
        return false;
    }

    if (!currentUser.isPremium && currentUser.usageCount >= FREE_USAGE_LIMIT) {
        alert(`You've reached your daily limit of ${FREE_USAGE_LIMIT} analyses. Upgrade to premium for unlimited access!`);
        return false;
    }

    return true;
}

function incrementUsage() {
    if (currentUser && !currentUser.isPremium) {
        currentUser.usageCount++;
        saveUserData();
        updateUserDisplay();
    }
}

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
    
document.addEventListener('DOMContentLoaded', () => {
    // Initialize both auth systems
    initializeGoogleAuth();
    initializeUserSystem();

    // Load saved auth state
    loadAuthState();

    // Check for payment success/cancellation in URL params
    checkPaymentStatus();
});

// ===============================
// Email/User System (copilot/fix-3)
// ===============================
function initializeUserSystem() {
    const lastEmail = localStorage.getItem('snapview_last_email');
    if (lastEmail) {
        emailInput.value = lastEmail;
    }
    updateUserDisplay();
}

function checkPaymentStatus() {
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('success') === 'true') {
        if (currentUser) {
            currentUser.isPremium = true;
            saveUserData();
            updateUserDisplay();
        }
        alert('🎉 Payment successful! You now have unlimited access to SnapView analyses.');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlParams.get('canceled') === 'true') {
        alert('Payment was canceled. You can upgrade anytime by clicking the Upgrade button.');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ===============================
// Google Authentication (main)
// ===============================
function initializeGoogleAuth() {
    if (DEMO_MODE) {
        signInButton.innerHTML = `
            <button id="demoSignInBtn" class="demo-signin-btn">
                <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" width="20" height="20">
                Sign in with Google (Demo)
            </button>
        `;
        signInButton.style.display = 'block';

        document.getElementById('demoSignInBtn').addEventListener('click', () => {
            simulateGoogleSignIn();
        });

        authInitialized = true;
        return;
    }

    if (typeof google !== 'undefined' && google.accounts) {
        authInitialized = true;
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
        });

        google.accounts.id.renderButton(signInButton, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            width: 200
        });

        signInButton.style.display = 'block';
    } else {
        setTimeout(initializeGoogleAuth, 100);
    }
}

function simulateGoogleSignIn() {
    currentUser = {
        id: 'demo_user_123',
        name: 'Demo User',
        email: 'demo@example.com',
        picture: 'https://via.placeholder.com/32x32/667eea/white?text=DU'
    };
    saveAuthState();
    updateAuthUI();
    console.log('Demo user signed in:', currentUser.name);
}

function handleCredentialResponse(response) {
    try {
        const userInfo = parseJwtPayload(response.credential);
        currentUser = {
            id: userInfo.sub,
            name: userInfo.name,
            email: userInfo.email,
            picture: userInfo.picture,
            credential: response.credential
        };
        saveAuthState();
        updateAuthUI();
        console.log('User signed in:', currentUser.name);
    } catch (error) {
        console.error('Error handling credential response:', error);
    }
}

function parseJwtPayload(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
        atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')
    );
    return JSON.parse(jsonPayload);
}

function updateAuthUI() {
    if (currentUser) {
        userAvatar.src = currentUser.picture || '';
        userName.textContent = currentUser.name || '';
        userEmail.textContent = currentUser.email || '';
        userProfile.style.display = 'flex';
        signInButton.style.display = 'none';
    } else {
        userProfile.style.display = 'none';
        if (authInitialized) signInButton.style.display = 'block';
    }
    updateUserDisplay();
}

function signOut() {
    if (confirm('Are you sure you want to sign out?')) {
        currentUser = null;
        localStorage.removeItem('snapview_auth');
        sessionStorage.removeItem('snapview_auth');
        updateAuthUI();
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
            timestamp: Date.now(),
            isPremium: currentUser.isPremium || false
        };
        localStorage.setItem('snapview_auth', JSON.stringify(authData));
        sessionStorage.setItem('snapview_auth', JSON.stringify(authData));
    }
}

function loadAuthState() {
    try {
        let authData = sessionStorage.getItem('snapview_auth') || localStorage.getItem('snapview_auth');
        if (authData) {
            authData = JSON.parse(authData);
            const maxAge = 24 * 60 * 60 * 1000;
            if (Date.now() - authData.timestamp < maxAge) {
                currentUser = authData;
                updateAuthUI();
                console.log('Restored auth state for:', currentUser.name);
            } else {
                localStorage.removeItem('snapview_auth');
                sessionStorage.removeItem('snapview_auth');
            }
        }
    } catch (error) {
        console.error('Error loading auth state:', error);
        localStorage.removeItem('snapview_auth');
        sessionStorage.removeItem('snapview_auth');
    }
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
    if (!currentUser) {
        alert('Please log in to use analysis features');
        return;
    }
    
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
    // Check usage limits before proceeding
    if (!checkUsageLimit()) {
        return;
    }

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
                secondaryPrompt: secondaryPrompt.value.trim() || 'Provide additional insights about this scene.',
                userEmail: currentUser?.email || null,
                isPremium: currentUser?.isPremium || false
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // Increment usage count for successful analysis
        incrementUsage();
        
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
        
        // Update button state based on current usage
        if (currentUser && !currentUser.isPremium && currentUser.usageCount >= FREE_USAGE_LIMIT) {
            analyzeNowButton.disabled = true;
            analyzeNowButton.textContent = 'Daily Limit Reached';
            analysisStatus.textContent = 'Analysis: Daily limit reached - Upgrade for unlimited access';
        } else {
            analyzeNowButton.disabled = false;
            analyzeNowButton.textContent = 'Analyze Now';
            updateUserDisplay(); // This will update the status text
        }
        
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