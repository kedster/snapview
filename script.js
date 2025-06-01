        // Configuration - REPLACE WITH YOUR CLOUDFLARE WORKER URL
        const WORKER_URL = 'backend-worker.sethkeddy.workers.dev';

        // DOM Elements
        const webcamFeed = document.getElementById('webcamFeed');
        const captureCanvas = document.getElementById('captureCanvas');
        const statusOverlay = document.getElementById('statusOverlay');
        const statusText = document.getElementById('statusText');
        const loadingSpinner = document.getElementById('loadingSpinner');
        const flashOverlay = document.getElementById('flashOverlay');
        const analysisIndicator = document.getElementById('analysisIndicator');
        
        // Control elements
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const switchCameraBtn = document.getElementById('switchCameraBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const resultsBtn = document.getElementById('resultsBtn');
        const exportBtn = document.getElementById('exportBtn');
        const backBtn = document.getElementById('backBtn');
        
        // Status elements
        const cameraStatus = document.getElementById('cameraStatus');
        const analysisStatus = document.getElementById('analysisStatus');
        
        // Views
        const cameraView = document.getElementById('cameraView');
        const resultsView = document.getElementById('resultsView');
        const resultsContent = document.getElementById('resultsContent');
        
        // Prompt overlay
        const promptOverlay = document.getElementById('promptOverlay');
        const primaryPrompt = document.getElementById('primaryPrompt');
        const secondaryPrompt = document.getElementById('secondaryPrompt');
        const savePromptBtn = document.getElementById('savePromptBtn');
        const cancelPromptBtn = document.getElementById('cancelPromptBtn');

        // State variables
        let currentStream = null;
        let isAnalyzing = false;
        let responses = [];
        let availableCameras = [];
        let currentFacingMode = 'environment';
        let isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        let isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        let isIOSSafari = isSafari && isMobileDevice;

        // Touch/swipe handling
        let startX = 0;
        let currentX = 0;
        let isDragging = false;

        // Event Listeners
        startBtn.addEventListener('click', startCamera);
        stopBtn.addEventListener('click', stopCamera);
        analyzeBtn.addEventListener('click', analyzeNow);
        switchCameraBtn.addEventListener('click', switchCamera);
        settingsBtn.addEventListener('click', showPromptOverlay);
        resultsBtn.addEventListener('click', showResults);
        exportBtn.addEventListener('click', exportToCSV);
        backBtn.addEventListener('click', showCamera);
        
        savePromptBtn.addEventListener('click', savePrompts);
        cancelPromptBtn.addEventListener('click', hidePromptOverlay);

        // Preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                setPreset(btn.dataset.preset);
            });
        });

        // Touch/swipe events
        cameraView.addEventListener('touchstart', handleTouchStart, { passive: true });
        cameraView.addEventListener('touchmove', handleTouchMove, { passive: true });
        cameraView.addEventListener('touchend', handleTouchEnd, { passive: true });

        // Mouse events for desktop
        cameraView.addEventListener('mousedown', handleMouseStart);
        cameraView.addEventListener('mousemove', handleMouseMove);
        cameraView.addEventListener('mouseup', handleMouseEnd);

        function handleTouchStart(e) {
            startX = e.touches[0].clientX;
            isDragging = true;
        }

        function handleTouchMove(e) {
            if (!isDragging) return;
            currentX = e.touches[0].clientX;
            const diffX = startX - currentX;
            
            if (diffX > 0) {
                const progress = Math.min(diffX / window.innerWidth, 1);
                cameraView.style.transform = `translateX(-${progress * 100}%)`;
                resultsView.style.transform = `translateX(-${100 - (progress * 100)}%)`;
            }
        }

        function handleTouchEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            
            const diffX = startX - currentX;
            const threshold = window.innerWidth * 0.3;
            
            if (diffX > threshold) {
                showResults();
            } else {
                showCamera();
            }
        }

        function handleMouseStart(e) {
            startX = e.clientX;
            isDragging = true;
        }

        function handleMouseMove(e) {
            if (!isDragging) return;
            currentX = e.clientX;
            const diffX = startX - currentX;
            
            if (diffX > 0) {
                const progress = Math.min(diffX / window.innerWidth, 1);
                cameraView.style.transform = `translateX(-${progress * 100}%)`;
                resultsView.style.transform = `translateX(-${100 - (progress * 100)}%)`;
            }
        }

        function handleMouseEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            
            const diffX = startX - currentX;
            const threshold = window.innerWidth * 0.3;
            
            if (diffX > threshold) {
                showResults();
            } else {
                showCamera();
            }
        }

        function showResults() {
            cameraView.style.transform = 'translateX(-100%)';
            resultsView.style.transform = 'translateX(-100%)';
            resultsView.classList.add('active');
        }

        function showCamera() {
            cameraView.style.transform = 'translateX(0)';
            resultsView.style.transform = 'translateX(0)';
            resultsView.classList.remove('active');
        }

        function showPromptOverlay() {
            promptOverlay.classList.add('active');
        }

        function hidePromptOverlay() {
            promptOverlay.classList.remove('active');
        }

        function savePrompts() {
            hidePromptOverlay();
            // Prompts are automatically saved as they're directly bound to the textareas
        }

        // Camera functions (simplified versions of your original functions)
        async function startCamera() {
            try {
                statusText.textContent = 'Starting camera...';
                statusOverlay.classList.remove('hidden');
                loadingSpinner.style.display = 'block';

                const constraints = {
                    video: {
                        facingMode: isMobileDevice ? currentFacingMode : undefined,
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                };

                if (isIOSSafari) {
                    constraints.audio = false;
                }

                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                webcamFeed.srcObject = currentStream;

                webcamFeed.onloadedmetadata = () => {
                    webcamFeed.play();
                    statusOverlay.classList.add('hidden');
                    
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    analyzeBtn.disabled = false;
                    switchCameraBtn.disabled = false;
                    
                    cameraStatus.textContent = 'Camera: Connected';
                    analysisStatus.textContent = 'Analysis: Ready';
                    loadingSpinner.style.display = 'none';
                };

            } catch (error) {
                console.error('Camera error:', error);
                statusText.textContent = `Camera error: ${error.message}`;
                loadingSpinner.style.display = 'none';
                cameraStatus.textContent = `Camera: Error`;
            }
        }

        function stopCamera() {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
                webcamFeed.srcObject = null;
                currentStream = null;
            }
            
            statusOverlay.classList.remove('hidden');
            statusText.textContent = 'Tap "Start Camera" to begin';
            startBtn.disabled = false;
            stopBtn.disabled = true;
            analyzeBtn.disabled = true;
            switchCameraBtn.disabled = true;
            
            cameraStatus.textContent = 'Camera: Disconnected';
            analysisStatus.textContent = 'Analysis: Stopped';
        }

        async function switchCamera() {
            if (!currentStream || !isMobileDevice) return;

            try {
                currentStream.getTracks().forEach(track => track.stop());
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
                
            } catch (error) {
                console.error('Camera switch error:', error);
                // Fallback to previous camera if switch fails
                startCamera();
            }
        }

        async function analyzeNow() {
            if (isAnalyzing || !currentStream) return;
            
            isAnalyzing = true;
            analyzeBtn.disabled = true;
            analysisIndicator.classList.add('active');
            analysisStatus.textContent = 'Analysis: Processing...';
            
            // Flash effect
            flashOverlay.style.opacity = '1';
            setTimeout(() => {
                flashOverlay.style.opacity = '0';
            }, 100);

            try {
                // Capture frame from video
                const canvas = captureCanvas;
                const ctx = canvas.getContext('2d');
                canvas.width = webcamFeed.videoWidth;
                canvas.height = webcamFeed.videoHeight;
                ctx.drawImage(webcamFeed, 0, 0);
                
                // Convert to base64
                const imageData = canvas.toDataURL('image/jpeg', 0.8);
                const imageBase64 = imageData.split(',')[1];

                // Prepare analysis request
                const analysisData = {
                    image: imageBase64,
                    primaryPrompt: primaryPrompt.value.trim(),
                    secondaryPrompt: secondaryPrompt.value.trim()
                };

                // Send to backend
                const response = await fetch(`https://${WORKER_URL}/analyze`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(analysisData)
                });

                if (!response.ok) {
                    throw new Error(`Analysis failed: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                
                // Store response
                const analysisResult = {
                    timestamp: new Date().toISOString(),
                    image: imageData,
                    primaryPrompt: analysisData.primaryPrompt,
                    secondaryPrompt: analysisData.secondaryPrompt,
                    primaryResponse: result.primaryResponse || 'No primary response received',
                    secondaryResponse: result.secondaryResponse || 'No secondary response received'
                };

                responses.unshift(analysisResult);
                updateResultsView();
                
                resultsBtn.disabled = false;
                exportBtn.disabled = false;
                
                analysisStatus.textContent = 'Analysis: Complete';
                
            } catch (error) {
                console.error('Analysis error:', error);
                analysisStatus.textContent = `Analysis: Error - ${error.message}`;
                
                // Store error response
                const errorResult = {
                    timestamp: new Date().toISOString(),
                    image: canvas.toDataURL('image/jpeg', 0.8),
                    primaryPrompt: primaryPrompt.value.trim(),
                    secondaryPrompt: secondaryPrompt.value.trim(),
                    primaryResponse: `Error: ${error.message}`,
                    secondaryResponse: 'Analysis could not be completed due to the error above.'
                };
                
                responses.unshift(errorResult);
                updateResultsView();
                resultsBtn.disabled = false;
                
            } finally {
                isAnalyzing = false;
                analyzeBtn.disabled = false;
                analysisIndicator.classList.remove('active');
                
                setTimeout(() => {
                    if (analysisStatus.textContent.includes('Complete') || analysisStatus.textContent.includes('Error')) {
                        analysisStatus.textContent = 'Analysis: Ready';
                    }
                }, 3000);
            }
        }

        function updateResultsView() {
            if (responses.length === 0) {
                resultsContent.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.8);">
                        No analyses yet. Start the camera and analyze to see results here.
                    </div>
                `;
                return;
            }

            resultsContent.innerHTML = responses.map((response, index) => `
                <div class="response-entry">
                    <div class="response-header">
                        <div>Analysis #${responses.length - index}</div>
                        <div style="font-size: 0.8rem; font-weight: normal; opacity: 0.7;">
                            ${new Date(response.timestamp).toLocaleString()}
                        </div>
                    </div>
                    
                    <div class="primary-response">
                        <div class="response-label">Primary Analysis</div>
                        <div class="response-text">${response.primaryResponse}</div>
                    </div>
                    
                    <div class="secondary-response">
                        <div class="response-label">Follow-up Analysis</div>
                        <div class="response-text">${response.secondaryResponse}</div>
                    </div>
                    
                    <div style="padding: 10px 20px; background: rgba(0,0,0,0.05); font-size: 0.8rem; color: #666;">
                        <div><strong>Primary Prompt:</strong> ${response.primaryPrompt}</div>
                        <div style="margin-top: 5px;"><strong>Secondary Prompt:</strong> ${response.secondaryPrompt}</div>
                    </div>
                </div>
            `).join('');
        }

        function exportToCSV() {
            if (responses.length === 0) {
                alert('No data to export');
                return;
            }

            const csvHeaders = [
                'Timestamp',
                'Primary Prompt',
                'Secondary Prompt', 
                'Primary Response',
                'Secondary Response'
            ];

            const csvRows = responses.map(response => [
                response.timestamp,
                `"${response.primaryPrompt.replace(/"/g, '""')}"`,
                `"${response.secondaryPrompt.replace(/"/g, '""')}"`,
                `"${response.primaryResponse.replace(/"/g, '""')}"`,
                `"${response.secondaryResponse.replace(/"/g, '""')}"`
            ]);

            const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `snapview-analysis-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function setPreset(preset) {
            const presets = {
                repair: {
                    primary: "Analyze this image for any broken, damaged, or malfunctioning items. Describe what needs repair or maintenance.",
                    secondary: "Provide specific repair suggestions, estimated difficulty level, and safety considerations for fixing the identified issues."
                },
                nickname: {
                    primary: "Look at this image and create a fun, memorable nickname for the main subject or scene based on what you observe.",
                    secondary: "Explain why this nickname fits and suggest 2-3 alternative nicknames with brief explanations."
                },
                identify: {
                    primary: "Identify and name all the objects, people, animals, or items visible in this image. Be as specific as possible.",
                    secondary: "Provide additional context about the identified items - their purpose, typical uses, or interesting facts about them."
                },
                nice: {
                    primary: "Focus on the positive, beautiful, or pleasant aspects of what you see in this image. What makes this scene nice or appealing?",
                    secondary: "Share some uplifting observations or compliments about the scene, and suggest what might make it even better."
                },
                poetic: {
                    primary: "Describe this image in a poetic, artistic way. Use vivid imagery and emotional language to paint a picture with words.",
                    secondary: "Write a short poem or haiku inspired by this scene, capturing its essence and mood."
                },
                forsale: {
                    primary: "Analyze this image as if you're writing a sales listing. Describe the item(s) condition, features, and selling points.",
                    secondary: "Suggest a fair market price range, highlight key selling features, and identify the target buyer for this item."
                }
            };

            if (presets[preset]) {
                primaryPrompt.value = presets[preset].primary;
                secondaryPrompt.value = presets[preset].secondary;
            }
        }

        // Initialize app
        document.addEventListener('DOMContentLoaded', () => {
            // Check if camera is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                statusText.textContent = 'Camera not supported on this device';
                startBtn.disabled = true;
                return;
            }

            // Set initial status
            cameraStatus.textContent = 'Camera: Ready';
            analysisStatus.textContent = 'Analysis: Stopped';
            
            // Load saved prompts if any
            const savedPrimary = localStorage.getItem('snapview-primary-prompt');
            const savedSecondary = localStorage.getItem('snapview-secondary-prompt');
            
            if (savedPrimary) primaryPrompt.value = savedPrimary;
            if (savedSecondary) secondaryPrompt.value = savedSecondary;
            
            // Save prompts when changed
            primaryPrompt.addEventListener('input', () => {
                localStorage.setItem('snapview-primary-prompt', primaryPrompt.value);
            });
            
            secondaryPrompt.addEventListener('input', () => {
                localStorage.setItem('snapview-secondary-prompt', secondaryPrompt.value);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName.toLowerCase() === 'textarea') return;
            
            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    if (!analyzeBtn.disabled) analyzeNow();
                    break;
                case 'r':
                    if (!resultsBtn.disabled) showResults();
                    break;
                case 'c':
                    showCamera();
                    break;
                case 's':
                    if (!startBtn.disabled) startCamera();
                    else if (!stopBtn.disabled) stopCamera();
                    break;
                case 'p':
                    showPromptOverlay();
                    break;
            }
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && currentStream) {
                // Pause video when tab is hidden to save resources
                webcamFeed.pause();
            } else if (!document.hidden && currentStream) {
                // Resume video when tab is visible
                webcamFeed.play();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (currentStream && webcamFeed.videoWidth) {
                // Adjust canvas size if needed
                captureCanvas.width = webcamFeed.videoWidth;
                captureCanvas.height = webcamFeed.videoHeight;
            }
        });

        // Error handling for video element
        webcamFeed.addEventListener('error', (e) => {
            console.error('Video error:', e);
            statusText.textContent = 'Video playback error';
            cameraStatus.textContent = 'Camera: Error';
        });
          analyzeBtn.disabled = false;
                analysisIndicator.classList.remove('active');
                
                setTimeout(() => {
                    if (analysisStatus.textContent.includes('Complete') || analysisStatus.textContent.includes('Error')) {
                        analysisStatus.textContent = 'Analysis: Ready';
                    }
                }, 3000);
            }
        }

        function updateResultsView() {
            if (responses.length === 0) {
                resultsContent.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: rgba(255,255,255,0.8);">
                        No analyses yet. Start the camera and analyze to see results here.
                    </div>
                `;
                return;
            }

            resultsContent.innerHTML = responses.map((response, index) => `
                <div class="response-entry">
                    <div class="response-header">
                        <div>Analysis #${responses.length - index}</div>
                        <div style="font-size: 0.8rem; font-weight: normal; opacity: 0.7;">
                            ${new Date(response.timestamp).toLocaleString()}
                        </div>
                    </div>
                    
                    <div class="primary-response">
                        <div class="response-label">Primary Analysis</div>
                        <div class="response-text">${response.primaryResponse}</div>
                    </div>
                    
                    <div class="secondary-response">
                        <div class="response-label">Follow-up Analysis</div>
                        <div class="response-text">${response.secondaryResponse}</div>
                    </div>
                    
                    <div style="padding: 10px 20px; background: rgba(0,0,0,0.05); font-size: 0.8rem; color: #666;">
                        <div><strong>Primary Prompt:</strong> ${response.primaryPrompt}</div>
                        <div style="margin-top: 5px;"><strong>Secondary Prompt:</strong> ${response.secondaryPrompt}</div>
                    </div>
                </div>
            `).join('');
        }

        function exportToCSV() {
            if (responses.length === 0) {
                alert('No data to export');
                return;
            }

            const csvHeaders = [
                'Timestamp',
                'Primary Prompt',
                'Secondary Prompt', 
                'Primary Response',
                'Secondary Response'
            ];

            const csvRows = responses.map(response => [
                response.timestamp,
                `"${response.primaryPrompt.replace(/"/g, '""')}"`,
                `"${response.secondaryPrompt.replace(/"/g, '""')}"`,
                `"${response.primaryResponse.replace(/"/g, '""')}"`,
                `"${response.secondaryResponse.replace(/"/g, '""')}"`
            ]);

            const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `snapview-analysis-${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        function setPreset(preset) {
            const presets = {
                repair: {
                    primary: "Analyze this image for any broken, damaged, or malfunctioning items. Describe what needs repair or maintenance.",
                    secondary: "Provide specific repair suggestions, estimated difficulty level, and safety considerations for fixing the identified issues."
                },
                nickname: {
                    primary: "Look at this image and create a fun, memorable nickname for the main subject or scene based on what you observe.",
                    secondary: "Explain why this nickname fits and suggest 2-3 alternative nicknames with brief explanations."
                },
                identify: {
                    primary: "Identify and name all the objects, people, animals, or items visible in this image. Be as specific as possible.",
                    secondary: "Provide additional context about the identified items - their purpose, typical uses, or interesting facts about them."
                },
                nice: {
                    primary: "Focus on the positive, beautiful, or pleasant aspects of what you see in this image. What makes this scene nice or appealing?",
                    secondary: "Share some uplifting observations or compliments about the scene, and suggest what might make it even better."
                },
                poetic: {
                    primary: "Describe this image in a poetic, artistic way. Use vivid imagery and emotional language to paint a picture with words.",
                    secondary: "Write a short poem or haiku inspired by this scene, capturing its essence and mood."
                },
                forsale: {
                    primary: "Analyze this image as if you're writing a sales listing. Describe the item(s) condition, features, and selling points.",
                    secondary: "Suggest a fair market price range, highlight key selling features, and identify the target buyer for this item."
                }
            };

            if (presets[preset]) {
                primaryPrompt.value = presets[preset].primary;
                secondaryPrompt.value = presets[preset].secondary;
            }
        }

        // Initialize app
        document.addEventListener('DOMContentLoaded', () => {
            // Check if camera is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                statusText.textContent = 'Camera not supported on this device';
                startBtn.disabled = true;
                return;
            }

            // Set initial status
            cameraStatus.textContent = 'Camera: Ready';
            analysisStatus.textContent = 'Analysis: Stopped';
            
            // Load saved prompts if any
            const savedPrimary = localStorage.getItem('snapview-primary-prompt');
            const savedSecondary = localStorage.getItem('snapview-secondary-prompt');
            
            if (savedPrimary) primaryPrompt.value = savedPrimary;
            if (savedSecondary) secondaryPrompt.value = savedSecondary;
            
            // Save prompts when changed
            primaryPrompt.addEventListener('input', () => {
                localStorage.setItem('snapview-primary-prompt', primaryPrompt.value);
            });
            
            secondaryPrompt.addEventListener('input', () => {
                localStorage.setItem('snapview-secondary-prompt', secondaryPrompt.value);
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName.toLowerCase() === 'textarea') return;
            
            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    if (!analyzeBtn.disabled) analyzeNow();
                    break;
                case 'r':
                    if (!resultsBtn.disabled) showResults();
                    break;
                case 'c':
                    showCamera();
                    break;
                case 's':
                    if (!startBtn.disabled) startCamera();
                    else if (!stopBtn.disabled) stopCamera();
                    break;
                case 'p':
                    showPromptOverlay();
                    break;
            }
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && currentStream) {
                // Pause video when tab is hidden to save resources
                webcamFeed.pause();
            } else if (!document.hidden && currentStream) {
                // Resume video when tab is visible
                webcamFeed.play();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (currentStream && webcamFeed.videoWidth) {
                // Adjust canvas size if needed
                captureCanvas.width = webcamFeed.videoWidth;
                captureCanvas.height = webcamFeed.videoHeight;
            }
        });

        // Error handling for video element
        webcamFeed.addEventListener('error', (e) => {
            console.error('Video error:', e);
            statusText.textContent = 'Video playback error';
            cameraStatus.textContent = 'Camera: Error';
        });
