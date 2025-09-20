// Global variables
let measurements = [];
let progressPictures = [];
let progressPictureFiles = [];
let volumeChart = null;
let strengthChart = null;
let measurementChart = null;
let programs = [];
let workoutHistory = [];
let currentProgramIndex = -1;
let currentWorkout = null;
let sessionVideos = [];
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let githubConfig = {
    token: '',
    username: '',
    repo: '',
    folder: ''
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    loadGithubConfig();
    
    // Try to load from GitHub first, fallback to localStorage
    await loadAllDataFromGitHub();
    
    loadPrograms();
    loadHistory();
    loadMeasurements();
    loadProgressPictures();
    updateStats();
    updateMeasurementChart();
});

// Tab management
function showTab(tabName) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all nav buttons
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');

    // If switching to workout tab, show timer if a workout is active
    if (tabName === 'workout' && currentWorkout) {
        document.getElementById('timerContainer').style.display = 'flex';
    } else {
        document.getElementById('timerContainer').style.display = 'none';
    }

    if (tabName === 'measurements') {
    loadMeasurements();
    loadProgressPictures();
    updateMeasurementChart();
    
    // Set default dates to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('measurementDate').value = today;
    document.getElementById('pictureDate').value = today;
}    
}

// GitHub data management functions
async function saveDataToGitHub(dataType, data, fileName = null) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        throw new Error('GitHub configuration required');
    }

    const branchExists = await ensureTrainingDataBranch();
    if (!branchExists) {
        throw new Error('Could not access training-data branch');
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const actualFileName = fileName || `${dataType}-${timestamp}.json`;
    const filePath = `data/${actualFileName}`;
    const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

    const content = btoa(JSON.stringify({
        type: dataType,
        data: data,
        lastUpdated: new Date().toISOString(),
        version: "1.0"
    }, null, 2));

    // Check if file exists to get SHA
    let sha = null;
    try {
        const existingResponse = await fetch(`${apiUrl}?ref=training-data`, {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (existingResponse.ok) {
            const existingData = await existingResponse.json();
            sha = existingData.sha;
        }
    } catch (error) {
        // File doesn't exist, which is fine
    }

    const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${githubConfig.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: sha ? `Update ${dataType} data` : `Add ${dataType} data`,
            content: content,
            branch: 'training-data',
            ...(sha && { sha })
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save to GitHub');
    }

    return true;
}

async function loadAllDataFromGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        console.log('GitHub not configured, using localStorage as fallback');
        loadFromStorage();
        return;
    }

    try {
        // Get all files in the data directory
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/data`;
        const response = await fetch(`${apiUrl}?ref=training-data`, {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const files = await response.json();
            
            // Load measurements
            const measurementFiles = files.filter(f => f.name.startsWith('measurements-'));
            if (measurementFiles.length > 0) {
                const latestMeasurements = measurementFiles.sort((a, b) => b.name.localeCompare(a.name))[0];
                const measurementData = await loadDataFromGitHub('measurements', latestMeasurements.name);
                if (measurementData) measurements = measurementData;
            }

            // Load workout history
            const workoutFiles = files.filter(f => f.name.startsWith('workouts-'));
            if (workoutFiles.length > 0) {
                const latestWorkouts = workoutFiles.sort((a, b) => b.name.localeCompare(a.name))[0];
                const workoutData = await loadDataFromGitHub('workouts', latestWorkouts.name);
                if (workoutData) workoutHistory = workoutData;
            }

            // Load progress pictures metadata
            const progressFiles = files.filter(f => f.name.startsWith('progress-pictures-'));
            if (progressFiles.length > 0) {
                const latestProgress = progressFiles.sort((a, b) => b.name.localeCompare(a.name))[0];
                const progressData = await loadDataFromGitHub('progress-pictures', latestProgress.name);
                if (progressData) progressPictures = progressData;
            }
        }
    } catch (error) {
        console.error('Error loading data from GitHub, falling back to localStorage:', error);
        loadFromStorage();
    }
}

async function loadDataFromGitHub(dataType, fileName) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return null;
    }

    try {
        const filePath = `data/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        const response = await fetch(`${apiUrl}?ref=training-data`, {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const fileData = await response.json();
            const content = JSON.parse(atob(fileData.content));
            return content.data;
        }
    } catch (error) {
        console.error(`Error loading ${dataType} from GitHub:`, error);
    }

    return null;
}

// Timer functions
function startTimer() {
    if (!timerRunning) {
        timerInterval = setInterval(updateTimer, 1000);
        timerRunning = true;
        document.getElementById('startTimerBtn').style.display = 'none';
        document.getElementById('pauseTimerBtn').style.display = 'inline-block';
    }
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('startTimerBtn').style.display = 'inline-block';
    document.getElementById('pauseTimerBtn').style.display = 'none';
}

function resetTimer() {
    pauseTimer();
    timerSeconds = 0;
    updateTimerDisplay();
}

function updateTimer() {
    timerSeconds++;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;
    
    document.getElementById('timerDisplay').textContent = 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// GitHub integration functions
function loadGithubConfig() {
    const savedConfig = localStorage.getItem('githubConfig');
    if (savedConfig) {
        githubConfig = JSON.parse(savedConfig);
        document.getElementById('githubToken').value = githubConfig.token || '';
        document.getElementById('githubUsername').value = githubConfig.username || '';
        document.getElementById('githubRepo').value = githubConfig.repo || '';
        document.getElementById('githubFolder').value = githubConfig.folder || '';
    }
}

function saveGithubConfig() {
    githubConfig = {
        token: document.getElementById('githubToken').value.trim(),
        username: document.getElementById('githubUsername').value.trim(),
        repo: document.getElementById('githubRepo').value.trim(),
        folder: document.getElementById('githubFolder').value.trim() || 'videos'
    };
    
    localStorage.setItem('githubConfig', JSON.stringify(githubConfig));
    alert('GitHub configuration saved successfully!');
}

function testGithubConnection() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please complete all GitHub configuration fields first.');
        return;
    }
    
    // Test the connection by trying to list repositories
    fetch(`https://api.github.com/user/repos`, {
        method: 'GET',
        headers: {
            'Authorization': `token ${githubConfig.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    })
    .then(response => {
        if (response.ok) {
            // Check if the video-uploads branch exists
            return fetch(`https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/branches/video-uploads`, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
        } else {
            alert('GitHub connection failed. Please check your credentials.');
            throw new Error('GitHub connection failed');
        }
    })
    .then(branchResponse => {
        if (branchResponse.ok) {
            alert('GitHub connection successful! Video-uploads branch exists.');
        } else {
            alert('GitHub connection successful, but video-uploads branch does not exist. It will be created automatically when you upload your first video.');
        }
    })
    .catch(error => {
        alert('Error testing GitHub connection: ' + error.message);
    });
}

async function ensureVideoUploadsBranch() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }
    
    try {
        // Check if the video-uploads branch exists
        const branchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/branches/video-uploads`, 
            {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (branchResponse.ok) {
            return true; // Branch exists
        }
        
        // If branch doesn't exist, create it from the main branch
        // First get the SHA of the main branch
        const mainBranchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/git/refs/heads/main`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (!mainBranchResponse.ok) {
            console.error('Could not get main branch info');
            return false;
        }
        
        const mainBranchData = await mainBranchResponse.json();
        const mainSha = mainBranchData.object.sha;
        
        // Create the video-uploads branch
        const createBranchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/git/refs`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ref: 'refs/heads/video-uploads',
                    sha: mainSha
                })
            }
        );
        
        return createBranchResponse.ok;
    } catch (error) {
        console.error('Error ensuring video-uploads branch exists:', error);
        return false;
    }
}

async function uploadVideosToGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration in the Settings tab first.');
        showTab('settings');
        return;
    }
    
    // Check if we're in the workout tab (current session) or history tab
    const isHistoryView = document.getElementById('history').classList.contains('active');
    let videosToUpload = [];
    
    if (isHistoryView) {
        // We're in history view, need to get the selected workout
        const selectedWorkoutIndex = getSelectedWorkoutIndex();
        if (selectedWorkoutIndex === -1) {
            alert('Please select a workout from history first.');
            return;
        }
        
        const workout = workoutHistory[selectedWorkoutIndex];
        videosToUpload = workout.videos.filter(video => !video.githubUrl);
        
        if (videosToUpload.length === 0) {
            alert('All videos in this workout are already uploaded to GitHub.');
            return;
        }
    } else {
        // We're in workout tab, use session videos
        if (sessionVideos.length === 0) {
            alert('No videos to upload. Please select videos first.');
            return;
        }
        videosToUpload = sessionVideos;
    }
    
    // Ensure the video-uploads branch exists
    const branchExists = await ensureVideoUploadsBranch();
    if (!branchExists) {
        alert('Could not create or access the video-uploads branch. Please check your GitHub permissions and try again.');
        return;
    }
    
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadProgress = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    
    uploadStatus.innerHTML = '';
    uploadProgress.style.display = 'block';
    progressBar.style.width = '0%';
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < videosToUpload.length; i++) {
        const video = videosToUpload[i];
        
        try {
            // Update progress
            progressBar.style.width = `${((i / videosToUpload.length) * 100).toFixed(0)}%`;
            
            // For videos from history, we can't read them as base64 since we don't have the file
            // So we'll skip them and only upload new videos from the current session
            if (isHistoryView) {
                uploadStatus.innerHTML += `
                    <div class="upload-error">
                        ✗ Cannot upload: ${video.name} - Videos can only be uploaded from the current session, not from history.
                    </div>
                `;
                errorCount++;
                continue;
            }
            
            // Read the file as base64 (only for current session videos)
            const base64Data = await readFileAsBase64(video.file);
            
            // Create the file path
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileExtension = video.name.split('.').pop();
            const fileName = `workout-video-${timestamp}.${fileExtension}`;
            const filePath = githubConfig.folder ? `${githubConfig.folder}/${fileName}` : fileName;
            
            // Prepare the API request - specify the video-uploads branch
            const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;
            
            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Upload workout video: ${fileName}`,
                    content: base64Data.split(',')[1], // Remove the data:video/mp4;base64, part
                    branch: 'video-uploads' // Specify the target branch
                })
            });
            
            if (response.ok) {
                successCount++;
                // Store the GitHub URL with the video - point to the video-uploads branch
                video.githubUrl = `https://github.com/${githubConfig.username}/${githubConfig.repo}/blob/video-uploads/${filePath}`;
                
                uploadStatus.innerHTML += `
                    <div class="upload-success">
                        ✓ Successfully uploaded: ${video.name} 
                        <a href="${video.githubUrl}" target="_blank" style="color: #00d4ff;">View on GitHub</a>
                    </div>
                `;
            } else {
                errorCount++;
                const errorData = await response.json();
                uploadStatus.innerHTML += `
                    <div class="upload-error">
                        ✗ Failed to upload: ${video.name} - ${errorData.message || 'Unknown error'}
                    </div>
                `;
            }
        } catch (error) {
            errorCount++;
            uploadStatus.innerHTML += `
                <div class="upload-error">
                    ✗ Error uploading: ${video.name} - ${error.message}
                </div>
            `;
        }
    }
    
    // Final progress update
    progressBar.style.width = '100%';
    
    // Show summary
    uploadStatus.innerHTML += `
        <div class="upload-${errorCount === 0 ? 'success' : 'error'}">
            Upload complete: ${successCount} successful, ${errorCount} failed
        </div>
    `;
    
    // Update session videos with GitHub URLs
    if (successCount > 0 && !isHistoryView) {
        localStorage.setItem('sessionVideos', JSON.stringify(sessionVideos));
    }
}

// Add helper function to get selected workout index
function getSelectedWorkoutIndex() {
    // This is a simple implementation - you might need to adjust based on your UI
    const activeWorkout = document.querySelector('.history-item:hover');
    if (!activeWorkout) return -1;
    
    const allWorkouts = document.querySelectorAll('.history-item');
    for (let i = 0; i < allWorkouts.length; i++) {
        if (allWorkouts[i] === activeWorkout) {
            return workoutHistory.length - 1 - i;
        }
    }
    return -1;
}

// Update the deleteVideoFromWorkout function to properly delete from GitHub
async function deleteVideoFromWorkout(workoutIndex, videoIndex) {
    const workout = workoutHistory[workoutIndex];
    const video = workout.videos[videoIndex];
    
    if (!confirm(`Are you sure you want to delete the video "${video.name}"? This will remove it from GitHub and your workout history.`)) {
        return;
    }
    
    // If the video was uploaded to GitHub, delete it from there too
    if (video.githubUrl) {
        try {
            // Extract the file path from the GitHub URL
            const url = new URL(video.githubUrl);
            const pathParts = url.pathname.split('/');
            
            // Find the index after "blob" and "video-uploads"
            const blobIndex = pathParts.indexOf('blob');
            if (blobIndex === -1 || blobIndex + 2 >= pathParts.length) {
                throw new Error('Invalid GitHub URL format');
            }
            
            // Reconstruct the file path (skip username, repo, blob, and branch)
            const filePath = pathParts.slice(blobIndex + 2).join('/');
            
            // Get the SHA of the file to delete
            const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}?ref=video-uploads`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const fileData = await response.json();
                const sha = fileData.sha;
                
                // Delete the file from GitHub
                const deleteResponse = await fetch(apiUrl, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Delete workout video: ${video.name}`,
                        sha: sha,
                        branch: 'video-uploads'
                    })
                });
                
                if (deleteResponse.ok) {
                    console.log('Video successfully deleted from GitHub');
                } else {
                    const errorData = await deleteResponse.json();
                    console.error('Failed to delete video from GitHub:', errorData);
                    alert('Video was removed from history but could not be deleted from GitHub. Error: ' + 
                          (errorData.message || 'Unknown error'));
                }
            } else {
                console.error('Failed to get file info from GitHub:', await response.json());
                alert('Video was removed from history but could not be deleted from GitHub (file not found).');
            }
        } catch (error) {
            console.error('Error deleting video from GitHub:', error);
            alert('Video was removed from history but there was an error deleting it from GitHub: ' + error.message);
        }
    }
    
    // Remove the video from the workout
    workout.videos.splice(videoIndex, 1);
    
    // Update the workout history
    workoutHistory[workoutIndex] = workout;
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
    
    // Refresh the workout details view
    closeWorkoutDetails();
    viewWorkoutDetails(workoutIndex);
    
    alert('Video deleted successfully!');
}

// Update the viewWorkoutDetails function to show the correct video count
function viewWorkoutDetails(workoutIndex) {
    const workout = workoutHistory[workoutIndex];
    let detailsHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeWorkoutDetails()">&times;</span>
            <h2>${workout.programName} - ${new Date(workout.date).toLocaleDateString()}</h2>
            <p><strong>Total Volume:</strong> ${calculateWorkoutVolume(workout)}kg</p>
            <p><strong>Duration:</strong> ${workout.duration ? formatDuration(workout.duration) : 'Unknown'}</p>
            <p><strong>Videos:</strong> ${workout.videos ? workout.videos.length : 0} recorded</p>
    `;
    
    // Rest of the function remains the same...
    workout.exercises.forEach(exercise => {
        const completedSets = exercise.sets.filter(set => set.completed);
        detailsHTML += `
            <div class="exercise-card">
                <h3>${exercise.name}</h3>
                <p><strong>Target:</strong> ${exercise.sets.length} sets × ${exercise.reps} reps @ RPE ${exercise.rpe}</p>
                <p><strong>Completed:</strong> ${completedSets.length} / ${exercise.sets.length} sets</p>
                <div class="sets-container">
                    <div class="set-row" style="font-weight: bold; background: rgba(0, 212, 255, 0.1);">
                        <div>Set</div>
                        <div>Weight</div>
                        <div>Reps</div>
                        <div>RPE</div>
                        <div>Volume</div>
                        <div>Notes</div>
                    </div>
        `;
        
        exercise.sets.forEach((set, index) => {
            if (set.completed) {
                const volume = set.weight && set.reps ? (parseFloat(set.weight) * parseInt(set.reps)).toFixed(1) : '0';
                detailsHTML += `
                    <div class="set-row">
                        <div>${index + 1}</div>
                        <div>${set.weight}kg</div>
                        <div>${set.reps}</div>
                        <div>${set.rpe}</div>
                        <div>${volume}kg</div>
                        <div>${set.notes || '-'}</div>
                    </div>
                `;
            }
        });
        
        detailsHTML += `</div>`;
        if (exercise.exerciseNotes) {
            detailsHTML += `<p><strong>Exercise Notes:</strong> ${exercise.exerciseNotes}</p>`;
        }
        detailsHTML += `</div>`;
    });
    
    if (workout.sessionNotes) {
        detailsHTML += `<div class="form-group"><strong>Session Notes:</strong> ${workout.sessionNotes}</div>`;
    }
    
    if (workout.videos && workout.videos.length > 0) {
        detailsHTML += `<div class="form-group">
            <h3>Session Videos (${workout.videos.length})</h3>
        `;
        
        workout.videos.forEach((video, index) => {
            if (video.githubUrl) {
                // Make sure the URL points to the video-uploads branch
                const videoUrl = video.githubUrl.replace('/blob/main/', '/blob/video-uploads/');
                const rawVideoUrl = videoUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/video-uploads/', '/video-uploads/');
                
                detailsHTML += `
                    <div style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <strong>${video.name}</strong>
                            <button class="btn btn-danger" onclick="deleteVideoFromWorkout(${workoutIndex}, ${index})">Delete Video</button>
                        </div>
                        <p>Size: ${(video.size / 1024 / 1024).toFixed(1)}MB</p>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="btn" onclick="viewVideo('${rawVideoUrl}', '${video.name}')">View Video</button>
                            <a href="${videoUrl}" target="_blank" class="btn">View on GitHub</a>
                        </div>
                    </div>
                `;
            } else {
                detailsHTML += `
                    <div style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <p style="color: #aaa; font-size: 0.9em;">
                            ${video.name} (${(video.size / 1024 / 1024).toFixed(1)}MB) - Not uploaded to GitHub
                        </p>
                    </div>
                `;
            }
        });
        detailsHTML += `</div>`;
    }
    
    detailsHTML += `</div>`;
    
    // Create and show modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'workoutDetailsModal';
    modal.style.display = 'block';
    modal.innerHTML = detailsHTML;
    document.body.appendChild(modal);
}

// Update the loadHistory function to show video count
function loadHistory() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (workoutHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No workout history found. Complete your first workout to see data here.</p>';
        return;
    }

    workoutHistory.slice().reverse().forEach((workout, index) => {
        const actualIndex = workoutHistory.length - 1 - index;
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div style="flex: 1;">
                    <h4>${workout.programName}</h4>
                    <p><strong>Date:</strong> ${new Date(workout.date).toLocaleDateString()} ${new Date(workout.date).toLocaleTimeString()}</p>
                </div>
                <button class="btn btn-danger" onclick="deleteWorkout(${actualIndex})" style="margin-left: 15px;">Delete</button>
            </div>
            <p><strong>Exercises:</strong> ${workout.exercises.length}</p>
            <p><strong>Completed Sets:</strong> ${workout.exercises.reduce((total, ex) => total + ex.sets.filter(set => set.completed).length, 0)} / ${workout.exercises.reduce((total, ex) => total + ex.sets.length, 0)}</p>
            <p><strong>Total Volume:</strong> ${calculateWorkoutVolume(workout)}kg</p>
            ${workout.duration ? `<p><strong>Duration:</strong> ${formatDuration(workout.duration)}</p>` : ''}
            ${workout.videos && workout.videos.length > 0 ? `<p><strong>Videos:</strong> ${workout.videos.length} recorded</p>` : ''}
            ${workout.sessionNotes ? `<p><strong>Notes:</strong> ${workout.sessionNotes.substring(0, 100)}${workout.sessionNotes.length > 100 ? '...' : ''}</p>` : ''}
            <div style="margin-top: 15px;">
                <button class="btn" onclick="viewWorkoutDetails(${actualIndex})">View Details</button>
                <button class="btn btn-warning" onclick="editWorkout(${actualIndex})" style="margin-left: 10px;">Edit Workout</button>
            </div>
        `;
        historyList.appendChild(historyItem);
    });
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Program management
function createProgram() {
    document.getElementById('modalTitle').textContent = 'Create New Program';
    document.getElementById('programName').value = '';
    document.getElementById('programDescription').value = '';
    document.getElementById('exerciseList').innerHTML = '';
    currentProgramIndex = -1;
    document.getElementById('programModal').style.display = 'block';
}

function addExercise() {
    const exerciseList = document.getElementById('exerciseList');
    
    const exerciseDiv = document.createElement('div');
    exerciseDiv.className = 'exercise-card';
    exerciseDiv.innerHTML = `
        <div class="exercise-header">
            <input type="text" placeholder="Exercise name" class="exercise-name-input" style="flex: 1; margin-right: 10px;">
            <button class="btn btn-danger" onclick="removeExercise(this)">Remove</button>
        </div>
        <div class="form-group">
            <label>Sets</label>
            <input type="number" class="sets-input" value="3" min="1" max="10">
        </div>
        <div class="form-group">
            <label>Rep Range</label>
            <input type="text" class="reps-input" placeholder="e.g., 6-8" value="6-8">
        </div>
        <div class="form-group">
            <label>Target RPE</label>
            <input type="number" class="rpe-input" value="9" min="1" max="10" step="0.5">
        </div>
        <div class="form-group">
            <label>Rest Time (seconds)</label>
            <input type="number" class="rest-input" value="180" min="30" step="30">
        </div>
        <div class="form-group">
            <label>Exercise Notes</label>
            <textarea class="exercise-notes" rows="2" placeholder="Setup notes, cues, form reminders..."></textarea>
        </div>
    `;
    
    exerciseList.appendChild(exerciseDiv);
}

function removeExercise(button) {
    button.closest('.exercise-card').remove();
}

function saveProgram() {
    const name = document.getElementById('programName').value.trim();
    const description = document.getElementById('programDescription').value.trim();
    
    if (!name) {
        alert('Please enter a program name');
        return;
    }

    const exercises = [];
    const exerciseCards = document.querySelectorAll('#exerciseList .exercise-card');
    
    exerciseCards.forEach(card => {
        const exercise = {
            name: card.querySelector('.exercise-name-input').value.trim(),
            sets: parseInt(card.querySelector('.sets-input').value),
            reps: card.querySelector('.reps-input').value.trim(),
            rpe: parseFloat(card.querySelector('.rpe-input').value),
            rest: parseInt(card.querySelector('.rest-input').value),
            notes: card.querySelector('.exercise-notes').value.trim()
        };
        
        if (exercise.name) {
            exercises.push(exercise);
        }
    });

    const program = {
        id: currentProgramIndex >= 0 ? programs[currentProgramIndex].id : Date.now(),
        name,
        description,
        exercises,
        created: currentProgramIndex >= 0 ? programs[currentProgramIndex].created : new Date().toISOString(),
        lastUsed: null
    };

    if (currentProgramIndex >= 0) {
        programs[currentProgramIndex] = program;
    } else {
        programs.push(program);
    }

    localStorage.setItem('trainingPrograms', JSON.stringify(programs));
    closeModal();
    loadPrograms();
}

function loadPrograms() {
    const programList = document.getElementById('programList');
    programList.innerHTML = '';

    if (programs.length === 0) {
        programList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No programs found. Create your first program to get started.</p>';
        return;
    }

    programs.forEach((program, index) => {
        const programCard = document.createElement('div');
        programCard.className = 'program-card';
        programCard.innerHTML = `
            <h3>${program.name}</h3>
            <p>${program.description}</p>
            <p><strong>Exercises:</strong> ${program.exercises.length}</p>
            <p><strong>Last Used:</strong> ${program.lastUsed ? new Date(program.lastUsed).toLocaleDateString() : 'Never'}</p>
            <div style="margin-top: 15px;">
                <button class="btn btn-success" onclick="startWorkout(${index})">Start Workout</button>
                <button class="btn" onclick="editProgram(${index})">Edit</button>
                <button class="btn btn-danger" onclick="deleteProgram(${index})">Delete</button>
            </div>
        `;
        programList.appendChild(programCard);
    });
}

function startWorkout(programIndex) {
    currentProgramIndex = programIndex;
    currentWorkout = {
        programId: programs[programIndex].id,
        programName: programs[programIndex].name,
        date: new Date().toISOString(),
        exercises: programs[programIndex].exercises.map(ex => ({
            ...ex,
            sets: Array(ex.sets).fill().map(() => ({
                weight: '',
                reps: '',
                rpe: '',
                completed: false,
                notes: ''
            }))
        })),
        sessionNotes: '',
        videos: []
    };

    // Show timer
    document.getElementById('timerContainer').style.display = 'flex';
    resetTimer();
    
    showTab('workout');
    loadCurrentWorkout();
}

function loadCurrentWorkout() {
    if (!currentWorkout) {
        document.getElementById('currentProgram').innerHTML = '<p>Select a program to start your workout</p>';
        return;
    }

    const container = document.getElementById('currentProgram');
    container.innerHTML = `<h3>${currentWorkout.programName}</h3>`;

    currentWorkout.exercises.forEach((exercise, exerciseIndex) => {
        const exerciseDiv = document.createElement('div');
        exerciseDiv.className = 'exercise-card';
        exerciseDiv.innerHTML = `
            <div class="exercise-header">
                <div class="exercise-name">${exercise.name}</div>
            </div>
            <div style="margin-bottom: 15px;">
                <strong>Target:</strong> ${exercise.sets} sets × ${exercise.reps} reps @ RPE ${exercise.rpe}
                <br><strong>Rest:</strong> ${Math.floor(exercise.rest / 60)}:${(exercise.rest % 60).toString().padStart(2, '0')}
                ${exercise.notes ? `<br><strong>Notes:</strong> ${exercise.notes}` : ''}
            </div>
            <div class="sets-container">
                <div class="set-row" style="font-weight: bold; background: rgba(0, 212, 255, 0.1);">
                    <div>Set</div>
                    <div>Weight</div>
                    <div>Reps</div>
                    <div>RPE</div>
                    <div>Notes</div>
                    <div>✓</div>
                </div>
                ${exercise.sets.map((set, setIndex) => `
                    <div class="set-row">
                        <div>${setIndex + 1}</div>
                        <input type="number" class="set-input" placeholder="kg" step="0.5" 
                               onchange="updateSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
                        <input type="number" class="set-input" placeholder="reps" 
                               onchange="updateSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
                        <input type="number" class="set-input" placeholder="RPE" step="0.5" min="1" max="10"
                               onchange="updateSet(${exerciseIndex}, ${setIndex}, 'rpe', this.value)">
                        <input type="text" class="set-input" placeholder="Optional notes"
                               onchange="updateSet(${exerciseIndex}, ${setIndex}, 'notes', this.value)">
                        <input type="checkbox" onchange="updateSet(${exerciseIndex}, ${setIndex}, 'completed', this.checked)">
                    </div>
                `).join('')}
            </div>
            <div class="form-group" style="margin-top: 15px;">
                <label>Exercise Notes</label>
                <textarea onchange="updateExerciseNotes(${exerciseIndex}, this.value)" 
                          placeholder="How did this exercise feel? Any adjustments needed..."></textarea>
            </div>
        `;
        container.appendChild(exerciseDiv);
    });
}

function updateSet(exerciseIndex, setIndex, field, value) {
    if (currentWorkout) {
        currentWorkout.exercises[exerciseIndex].sets[setIndex][field] = value;
    }
}

function updateExerciseNotes(exerciseIndex, notes) {
    if (currentWorkout) {
        currentWorkout.exercises[exerciseIndex].exerciseNotes = notes;
    }
}

function handleVideoUpload(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('videoPreview');
    
    files.forEach(file => {
        if (file.type.startsWith('video/')) {
            // Store the file object for later upload
            const videoId = Date.now() + Math.random().toString(36).substr(2, 5);
            
            const videoInfo = {
                id: videoId,
                name: file.name,
                size: file.size,
                type: file.type,
                file: file, // Store the file object for upload
                lastModified: file.lastModified
            };
            
            sessionVideos.push(videoInfo);
            
            // Create a preview
            const videoURL = URL.createObjectURL(file);
            const videoElement = document.createElement('video');
            videoElement.controls = true;
            videoElement.className = 'video-preview';
            videoElement.style.width = '300px';
            videoElement.style.margin = '10px';
            videoElement.src = videoURL;
            videoElement.dataset.id = videoId;
            
            // Add remove button
            const videoContainer = document.createElement('div');
            videoContainer.style.position = 'relative';
            videoContainer.style.display = 'inline-block';
            
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.className = 'btn btn-danger';
            removeBtn.style.position = 'absolute';
            removeBtn.style.top = '5px';
            removeBtn.style.right = '5px';
            removeBtn.style.padding = '2px 8px';
            removeBtn.onclick = function() {
                // Remove from sessionVideos
                sessionVideos = sessionVideos.filter(v => v.id !== videoId);
                videoContainer.remove();
            };
            
            videoContainer.appendChild(videoElement);
            videoContainer.appendChild(removeBtn);
            previewContainer.appendChild(videoContainer);
        }
    });
}

async function saveWorkout() {
    if (!currentWorkout) {
        alert('No active workout to save');
        return;
    }

    const hasCompletedSets = currentWorkout.exercises.some(exercise => 
        exercise.sets.some(set => set.completed)
    );
    
    if (!hasCompletedSets) {
        if (!confirm('No sets marked as completed. Are you sure you want to save this workout?')) {
            return;
        }
    }

    currentWorkout.sessionNotes = document.getElementById('sessionNotes').value;
    currentWorkout.videos = sessionVideos.map(v => ({
        id: v.id,
        name: v.name,
        size: v.size,
        type: v.type,
        githubUrl: v.githubUrl || null
    }));
    currentWorkout.completed = new Date().toISOString();
    currentWorkout.duration = timerSeconds;

    workoutHistory.push(currentWorkout);
    
    try {
        // Save to GitHub
        await saveDataToGitHub('workouts', workoutHistory);
        
        // Also save individual workout
        const workoutFileName = `workout-${currentWorkout.date.split('T')[0]}-${currentWorkout.programName.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
        await saveDataToGitHub('individual-workout', currentWorkout, workoutFileName);
        
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));

        const program = programs.find(p => p.id === currentWorkout.programId);
        if (program) {
            program.lastUsed = currentWorkout.completed;
            localStorage.setItem('trainingPrograms', JSON.stringify(programs));
        }

        alert('Workout saved successfully to GitHub!');
        
        currentWorkout = null;
        sessionVideos = [];
        document.getElementById('currentProgram').innerHTML = '<p>Select a program to start your workout</p>';
        document.getElementById('sessionNotes').value = '';
        document.getElementById('videoPreview').innerHTML = '';
        document.getElementById('uploadStatus').innerHTML = '';
        document.getElementById('uploadProgress').style.display = 'none';
        
        document.getElementById('timerContainer').style.display = 'none';
        resetTimer();
        
        loadPrograms();
        loadHistory();
        updateStats();
        
    } catch (error) {
        alert('Error saving workout to GitHub: ' + error.message);
        console.error('Workout save error:', error);
    }
}

function loadHistory() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (workoutHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No workout history found. Complete your first workout to see data here.</p>';
        return;
    }

    workoutHistory.slice().reverse().forEach((workout, index) => {
        const actualIndex = workoutHistory.length - 1 - index;
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div style="flex: 1;">
                    <h4>${workout.programName}</h4>
                    <p><strong>Date:</strong> ${new Date(workout.date).toLocaleDateString()} ${new Date(workout.date).toLocaleTimeString()}</p>
                </div>
                <button class="btn btn-danger" onclick="deleteWorkout(${actualIndex})" style="margin-left: 15px;">Delete</button>
            </div>
            <p><strong>Exercises:</strong> ${workout.exercises.length}</p>
            <p><strong>Completed Sets:</strong> ${workout.exercises.reduce((total, ex) => total + ex.sets.filter(set => set.completed).length, 0)} / ${workout.exercises.reduce((total, ex) => total + ex.sets.length, 0)}</p>
            <p><strong>Total Volume:</strong> ${calculateWorkoutVolume(workout)}kg</p>
            ${workout.duration ? `<p><strong>Duration:</strong> ${formatDuration(workout.duration)}</p>` : ''}
            ${workout.videos && workout.videos.length > 0 ? `<p><strong>Videos:</strong> ${workout.videos.length} recorded</p>` : ''}
            ${workout.sessionNotes ? `<p><strong>Notes:</strong> ${workout.sessionNotes.substring(0, 100)}${workout.sessionNotes.length > 100 ? '...' : ''}</p>` : ''}
            <button class="btn" onclick="viewWorkoutDetails(${actualIndex})">View Details</button>
        `;
        historyList.appendChild(historyItem);
    });
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

async function deleteWorkout(workoutIndex) {
    const workout = workoutHistory[workoutIndex];
    
    // Check if workout has videos that need to be deleted from GitHub
    const videosToDelete = workout.videos ? workout.videos.filter(video => video.githubUrl) : [];
    
    let confirmMessage = `Are you sure you want to delete the workout from ${new Date(workout.date).toLocaleDateString()}? This cannot be undone.`;
    
    if (videosToDelete.length > 0) {
        confirmMessage += `\n\nThis will also delete ${videosToDelete.length} video(s) and the workout data from GitHub.`;
    }
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    // Delete workout data from GitHub first
    if (githubConfig.token) {
        const dataDeleted = await uploadWorkoutDataToGitHub(workout, true);
        if (!dataDeleted) {
            console.warn('Failed to delete workout data from GitHub');
        }
    }
    
    // Rest of the existing delete logic for videos...
    if (videosToDelete.length > 0) {
        const deleteStatus = document.createElement('div');
        deleteStatus.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
            min-width: 300px;
            text-align: center;
        `;
        deleteStatus.innerHTML = `
            <h3>Deleting Videos from GitHub...</h3>
            <div id="deleteProgress">Preparing to delete ${videosToDelete.length} video(s)...</div>
        `;
        document.body.appendChild(deleteStatus);
        
        let successCount = 0;
        let errorCount = 0;
        
        // Delete each video from GitHub
        for (let i = 0; i < videosToDelete.length; i++) {
            const video = videosToDelete[i];
            
            try {
                deleteStatus.querySelector('#deleteProgress').innerHTML = 
                    `Deleting video ${i + 1} of ${videosToDelete.length}: ${video.name}...`;
                
                // Extract the file path from the GitHub URL
                const url = new URL(video.githubUrl);
                const pathParts = url.pathname.split('/');
                
                // Find the index after "blob" and "video-uploads"
                const blobIndex = pathParts.indexOf('blob');
                if (blobIndex === -1 || blobIndex + 2 >= pathParts.length) {
                    throw new Error('Invalid GitHub URL format');
                }
                
                // Reconstruct the file path (skip username, repo, blob, and branch)
                const filePath = pathParts.slice(blobIndex + 2).join('/');
                
                // Get the SHA of the file to delete
                const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}?ref=video-uploads`;
                
                const response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (response.ok) {
                    const fileData = await response.json();
                    const sha = fileData.sha;
                    
                    // Delete the file from GitHub
                    const deleteResponse = await fetch(apiUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `token ${githubConfig.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: `Delete workout video: ${video.name} (workout deletion)`,
                            sha: sha,
                            branch: 'video-uploads'
                        })
                    });
                    
                    if (deleteResponse.ok) {
                        successCount++;
                        console.log(`Successfully deleted video: ${video.name}`);
                    } else {
                        errorCount++;
                        const errorData = await deleteResponse.json();
                        console.error(`Failed to delete video ${video.name}:`, errorData);
                    }
                } else {
                    errorCount++;
                    console.error(`Failed to get file info for ${video.name}:`, await response.json());
                }
            } catch (error) {
                errorCount++;
                console.error(`Error deleting video ${video.name}:`, error);
            }
        }
        
        // Show final status
        deleteStatus.querySelector('#deleteProgress').innerHTML = 
            `Video deletion complete: ${successCount} successful, ${errorCount} failed`;
        
        // Remove status after 2 seconds
        setTimeout(() => {
            document.body.removeChild(deleteStatus);
        }, 2000);
        
        // Show summary if there were any errors
        if (errorCount > 0) {
            alert(`Warning: ${errorCount} video(s) could not be deleted from GitHub. The workout will still be removed from your history.`);
        }
    }
    
    // Remove the workout from history
    workoutHistory.splice(workoutIndex, 1);
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
    
    // Refresh UI
    loadHistory();
    updateStats();
    
    alert(`Workout deleted successfully! ${videosToDelete.length > 0 ? `${videosToDelete.length} video(s) and workout data were also removed from GitHub.` : 'Workout data was also removed from GitHub.'}`);
}

function clearAllHistory() {
    if (confirm('Are you sure you want to delete ALL workout history? This cannot be undone.\n\nConsider exporting your data first for backup.')) {
        if (confirm('This will permanently delete all your workout data. Are you absolutely sure?')) {
            workoutHistory = [];
            localStorage.removeItem('workoutHistory');
            loadHistory();
            updateStats();
            alert('All workout history has been cleared.');
        }
    }
}

function clearAllData() {
    if (confirm('Are you sure you want to delete ALL data including programs, workout history, and settings? This cannot be undone.')) {
        if (confirm('This will permanently delete ALL your data. Are you absolutely sure?')) {
            programs = [];
            workoutHistory = [];
            sessionVideos = [];
            githubConfig = {
                token: '',
                username: '',
                repo: '',
                folder: ''
            };
            localStorage.clear();
            loadPrograms();
            loadHistory();
            updateStats();
            loadGithubConfig();
            alert('All data has been cleared.');
        }
    }
}

function calculateWorkoutVolume(workout) {
    let totalVolume = 0;
    workout.exercises.forEach(exercise => {
        exercise.sets.forEach(set => {
            if (set.completed && set.weight && set.reps) {
                totalVolume += parseFloat(set.weight) * parseInt(set.reps);
            }
        });
    });
    return totalVolume.toFixed(1);
}

function updateStats() {
    // Personal Records
    const prContainer = document.getElementById('personalRecords');
    const exerciseMaxes = {};
    updateVolumeChart();
    updateStrengthChart();
    
    workoutHistory.forEach(workout => {
        workout.exercises.forEach(exercise => {
            if (!exerciseMaxes[exercise.name]) {
                exerciseMaxes[exercise.name] = { maxWeight: 0, maxVolume: 0, maxReps: 0 };
            }
            
            exercise.sets.forEach(set => {
                if (set.weight && set.reps && set.completed) {
                    const weight = parseFloat(set.weight);
                    const reps = parseInt(set.reps);
                    const volume = weight * reps;
                    
                    if (weight > exerciseMaxes[exercise.name].maxWeight) {
                        exerciseMaxes[exercise.name].maxWeight = weight;
                    }
                    if (volume > exerciseMaxes[exercise.name].maxVolume) {
                        exerciseMaxes[exercise.name].maxVolume = volume;
                    }
                    if (reps > exerciseMaxes[exercise.name].maxReps) {
                        exerciseMaxes[exercise.name].maxReps = reps;
                    }
                }
            });
        });
    });

    if (Object.keys(exerciseMaxes).length === 0) {
        prContainer.innerHTML = '<p style="text-align: center; color: #666;">No personal records yet. Complete some workouts to see your progress here.</p>';
    } else {
        prContainer.innerHTML = Object.entries(exerciseMaxes)
            .map(([exercise, maxes]) => `
                <div style="margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 5px;">
                    <strong>${exercise}</strong><br>
                    Max Weight: ${maxes.maxWeight}kg<br>
                    Max Volume: ${maxes.maxVolume}kg<br>
                    Max Reps: ${maxes.maxReps}
                </div>
            `).join('');
    }

    // Frequency Analysis
    const frequencyContainer = document.getElementById('frequencyAnalysis');
    const exerciseFrequency = {};
    
    workoutHistory.forEach(workout => {
        workout.exercises.forEach(exercise => {
            exerciseFrequency[exercise.name] = (exerciseFrequency[exercise.name] || 0) + 1;
        });
    });

    if (Object.keys(exerciseFrequency).length === 0) {
        frequencyContainer.innerHTML = '<p style="text-align: center; color: #666;">No frequency data yet. Complete some workouts to see analysis here.</p>';
    } else {
        frequencyContainer.innerHTML = Object.entries(exerciseFrequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([exercise, count]) => `
                <div style="margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 5px;">
                    <strong>${exercise}:</strong> ${count} sessions
                </div>
            `).join('');
    }
}

function updateVolumeChart() {
    const volumeContainer = document.querySelector('.stat-card .chart-container');
    if (volumeContainer) {
        volumeContainer.innerHTML = '<canvas id="volumeChart" width="400" height="200"></canvas>';
        
        const ctx = document.getElementById('volumeChart');
        if (!ctx) return;

        if (volumeChart) {
            volumeChart.destroy();
        }

        const last12Workouts = workoutHistory.slice(-12);
        const labels = last12Workouts.map(w => new Date(w.date).toLocaleDateString());
        const volumes = last12Workouts.map(w => parseFloat(calculateWorkoutVolume(w)));

        volumeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total Volume (kg)',
                    data: volumes,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Volume (kg)' }
                    }
                }
            }
        });
    }
}

function updateStrengthChart() {
    const strengthContainer = document.querySelectorAll('.stat-card .chart-container')[1];
    if (strengthContainer) {
        strengthContainer.innerHTML = '<canvas id="strengthChart" width="400" height="200"></canvas>';
        
        const ctx = document.getElementById('strengthChart');
        if (!ctx) return;

        if (strengthChart) {
            strengthChart.destroy();
        }

        // Get strength progression for top 3 exercises
        const exerciseProgress = {};
        
        workoutHistory.forEach(workout => {
            workout.exercises.forEach(exercise => {
                if (!exerciseProgress[exercise.name]) {
                    exerciseProgress[exercise.name] = [];
                }
                
                const maxWeight = Math.max(...exercise.sets
                    .filter(set => set.completed && set.weight)
                    .map(set => parseFloat(set.weight) || 0));
                
                if (maxWeight > 0) {
                    exerciseProgress[exercise.name].push({
                        date: workout.date,
                        weight: maxWeight
                    });
                }
            });
        });

        // Get top 3 exercises by frequency
        const topExercises = Object.entries(exerciseProgress)
            .sort(([,a], [,b]) => b.length - a.length)
            .slice(0, 3);

        const datasets = topExercises.map(([exercise, progress], index) => {
            const colors = ['#1a1a1a', '#dc3545', '#17a2b8'];
            return {
                label: exercise,
                data: progress.map(p => ({ x: new Date(p.date), y: p.weight })),
                borderColor: colors[index],
                backgroundColor: colors[index] + '20',
                tension: 0.4
            };
        });

        strengthChart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { type: 'time', time: { unit: 'day' } },
                    y: { 
                        beginAtZero: true,
                        title: { display: true, text: 'Weight (kg)' }
                    }
                }
            }
        });
    }
}

function searchPrograms(query) {
    const programCards = document.querySelectorAll('.program-card');
    programCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(query.toLowerCase()) ? 'block' : 'none';
    });
}

function searchHistory(query) {
    const historyItems = document.querySelectorAll('.history-item');
    historyItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query.toLowerCase()) ? 'block' : 'none';
    });
}

function searchStats(query) {
    // This would filter stats based on exercise names
    console.log('Searching stats for:', query);
}

function editProgram(programIndex) {
    const program = programs[programIndex];
    currentProgramIndex = programIndex;
    
    document.getElementById('modalTitle').textContent = 'Edit Program';
    document.getElementById('programName').value = program.name;
    document.getElementById('programDescription').value = program.description;
    
    const exerciseList = document.getElementById('exerciseList');
    exerciseList.innerHTML = '';
    
    program.exercises.forEach(exercise => {
        const exerciseDiv = document.createElement('div');
        exerciseDiv.className = 'exercise-card';
        exerciseDiv.innerHTML = `
            <div class="exercise-header">
                <input type="text" placeholder="Exercise name" class="exercise-name-input" value="${exercise.name}" style="flex: 1; margin-right: 10px;">
                <button class="btn btn-danger" onclick="removeExercise(this)">Remove</button>
            </div>
            <div class="form-group">
                <label>Sets</label>
                <input type="number" class="sets-input" value="${exercise.sets}" min="1" max="10">
            </div>
            <div class="form-group">
                <label>Rep Range</label>
                <input type="text" class="reps-input" placeholder="e.g., 6-8" value="${exercise.reps}">
            </div>
            <div class="form-group">
                <label>Target RPE</label>
                <input type="number" class="rpe-input" value="${exercise.rpe}" min="1" max="10" step="0.5">
            </div>
            <div class="form-group">
                <label>Rest Time (seconds)</label>
                <input type="number" class="rest-input" value="${exercise.rest}" min="30" step="30">
            </div>
            <div class="form-group">
                <label>Exercise Notes</label>
                <textarea class="exercise-notes" rows="2" placeholder="Setup notes, cues, form reminders...">${exercise.notes || ''}</textarea>
            </div>
        `;
        exerciseList.appendChild(exerciseDiv);
    });
    
    document.getElementById('programModal').style.display = 'block';
}

function deleteProgram(programIndex) {
    if (confirm('Are you sure you want to delete this program? This cannot be undone.')) {
        programs.splice(programIndex, 1);
        localStorage.setItem('trainingPrograms', JSON.stringify(programs));
        loadPrograms();
    }
}

function viewWorkoutDetails(workoutIndex) {
    const workout = workoutHistory[workoutIndex];
    let detailsHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeWorkoutDetails()">&times;</span>
            <h2>${workout.programName} - ${new Date(workout.date).toLocaleDateString()}</h2>
            <div style="margin-bottom: 20px;">
                <button class="btn btn-warning" onclick="closeWorkoutDetails(); editWorkout(${workoutIndex});">Edit This Workout</button>
            </div>
            <p><strong>Total Volume:</strong> ${calculateWorkoutVolume(workout)}kg</p>
            <p><strong>Duration:</strong> ${workout.duration ? formatDuration(workout.duration) : 'Unknown'}</p>
            <p><strong>Videos:</strong> ${workout.videos ? workout.videos.length : 0} recorded</p>
    `;
    
    workout.exercises.forEach(exercise => {
        const completedSets = exercise.sets.filter(set => set.completed);
        detailsHTML += `
            <div class="exercise-card">
                <h3>${exercise.name}</h3>
                <p><strong>Target:</strong> ${exercise.sets.length} sets × ${exercise.reps} reps @ RPE ${exercise.rpe}</p>
                <p><strong>Completed:</strong> ${completedSets.length} / ${exercise.sets.length} sets</p>
                <div class="sets-container">
                    <div class="set-row" style="font-weight: bold; background: rgba(0, 212, 255, 0.1);">
                        <div>Set</div>
                        <div>Weight</div>
                        <div>Reps</div>
                        <div>RPE</div>
                        <div>Volume</div>
                        <div>Notes</div>
                    </div>
        `;
        
        exercise.sets.forEach((set, index) => {
            if (set.completed) {
                const volume = set.weight && set.reps ? (parseFloat(set.weight) * parseInt(set.reps)).toFixed(1) : '0';
                detailsHTML += `
                    <div class="set-row">
                        <div>${index + 1}</div>
                        <div>${set.weight}kg</div>
                        <div>${set.reps}</div>
                        <div>${set.rpe}</div>
                        <div>${volume}kg</div>
                        <div>${set.notes || '-'}</div>
                    </div>
                `;
            }
        });
        
        detailsHTML += `</div>`;
        if (exercise.exerciseNotes) {
            detailsHTML += `<p><strong>Exercise Notes:</strong> ${exercise.exerciseNotes}</p>`;
        }
        detailsHTML += `</div>`;
    });
    
    if (workout.sessionNotes) {
        detailsHTML += `<div class="form-group"><strong>Session Notes:</strong> ${workout.sessionNotes}</div>`;
    }
    
    if (workout.videos && workout.videos.length > 0) {
        detailsHTML += `<div class="form-group">
            <h3>Session Videos (${workout.videos.length})</h3>
        `;
        
        workout.videos.forEach((video, index) => {
            if (video.githubUrl) {
                // Make sure the URL points to the video-uploads branch
                const videoUrl = video.githubUrl.replace('/blob/main/', '/blob/video-uploads/');
                const rawVideoUrl = videoUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/video-uploads/', '/video-uploads/');
                
                detailsHTML += `
                    <div style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <strong>${video.name}</strong>
                            <button class="btn btn-danger" onclick="deleteVideoFromWorkout(${workoutIndex}, ${index})">Delete Video</button>
                        </div>
                        <p>Size: ${(video.size / 1024 / 1024).toFixed(1)}MB</p>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="btn" onclick="viewVideo('${rawVideoUrl}', '${video.name}')">View Video</button>
                            <a href="${videoUrl}" target="_blank" class="btn">View on GitHub</a>
                        </div>
                    </div>
                `;
            } else {
                detailsHTML += `
                    <div style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <p style="color: #aaa; font-size: 0.9em;">
                            ${video.name} (${(video.size / 1024 / 1024).toFixed(1)}MB) - Not uploaded to GitHub
                        </p>
                    </div>
                `;
            }
        });
        detailsHTML += `</div>`;
    }
    
    detailsHTML += `</div>`;
    
    // Create and show modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'workoutDetailsModal';
    modal.style.display = 'block';
    modal.innerHTML = detailsHTML;
    document.body.appendChild(modal);
}

async function deleteVideoFromWorkout(workoutIndex, videoIndex) {
    const workout = workoutHistory[workoutIndex];
    const video = workout.videos[videoIndex];
    
    if (!confirm(`Are you sure you want to delete the video "${video.name}"? This will remove it from GitHub and your workout history.`)) {
        return;
    }
    
    // If the video was uploaded to GitHub, delete it from there too
    if (video.githubUrl) {
        try {
            // Extract the file path from the GitHub URL
            // URL format: https://github.com/username/repo/blob/video-uploads/folder/filename.mp4
            const url = new URL(video.githubUrl);
            const pathParts = url.pathname.split('/');
            
            // Find the index after "blob" and "video-uploads"
            const blobIndex = pathParts.indexOf('blob');
            if (blobIndex === -1 || blobIndex + 2 >= pathParts.length) {
                throw new Error('Invalid GitHub URL format');
            }
            
            // Reconstruct the file path (skip username, repo, blob, and branch)
            const filePath = pathParts.slice(blobIndex + 2).join('/');
            
            // Get the SHA of the file to delete
            const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}?ref=video-uploads`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const fileData = await response.json();
                const sha = fileData.sha;
                
                // Delete the file from GitHub
                const deleteResponse = await fetch(apiUrl, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Delete workout video: ${video.name}`,
                        sha: sha,
                        branch: 'video-uploads'
                    })
                });
                
                if (deleteResponse.ok) {
                    console.log('Video successfully deleted from GitHub');
                } else {
                    const errorData = await deleteResponse.json();
                    console.error('Failed to delete video from GitHub:', errorData);
                    alert('Video was removed from history but could not be deleted from GitHub. Error: ' + 
                          (errorData.message || 'Unknown error'));
                }
            } else {
                console.error('Failed to get file info from GitHub:', await response.json());
                alert('Video was removed from history but could not be deleted from GitHub (file not found).');
            }
        } catch (error) {
            console.error('Error deleting video from GitHub:', error);
            alert('Video was removed from history but there was an error deleting it from GitHub: ' + error.message);
        }
    }
    
    // Remove the video from the workout
    workout.videos.splice(videoIndex, 1);
    
    // Update the workout history
    workoutHistory[workoutIndex] = workout;
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
    
    // Refresh the workout details view
    closeWorkoutDetails();
    viewWorkoutDetails(workoutIndex);
    
    alert('Video deleted successfully!');
}

function viewVideo(videoUrl, videoName) {
    // Create video modal
    const videoModal = document.createElement('div');
    videoModal.className = 'modal';
    videoModal.id = 'videoModal';
    videoModal.style.display = 'block';
    videoModal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-height: 90%;">
            <span class="close" onclick="closeVideoModal()">&times;</span>
            <h3>${videoName}</h3>
            <video controls autoplay style="width: 100%; max-height: 70vh;">
                <source src="${videoUrl}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
            <div style="margin-top: 15px; text-align: center;">
                <a href="${videoUrl}" download="${videoName}" class="btn">Download Video</a>
                <p style="margin-top: 10px; font-size: 0.9em; color: #aaa;">
                    If the video doesn't play, try downloading it instead.
                </p>
            </div>
        </div>
    `;
    
    document.body.appendChild(videoModal);
    
    // Handle video loading errors
    const videoElement = videoModal.querySelector('video');
    videoElement.addEventListener('error', function() {
        videoModal.querySelector('p').textContent = 
            'Video cannot be played directly due to CORS restrictions. Please download the video to view it.';
        videoModal.querySelector('p').style.color = '#ff416c';
    });
}

function closeVideoModal() {
    const modal = document.getElementById('videoModal');
    if (modal) {
        // Pause any playing video before closing
        const video = modal.querySelector('video');
        if (video) {
            video.pause();
        }
        modal.remove();
    }
}

function closeWorkoutDetails() {
    const modal = document.getElementById('workoutDetailsModal');
    if (modal) {
        modal.remove();
    }
}

function closeModal() {
    document.getElementById('programModal').style.display = 'none';
}

function exportData() {
    const data = {
        programs: programs,
        workoutHistory: workoutHistory,
        exportDate: new Date().toISOString(),
        version: "1.0"
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (confirm('This will replace your current data. Are you sure?')) {
                programs = data.programs || [];
                workoutHistory = data.workoutHistory || [];
                
                localStorage.setItem('trainingPrograms', JSON.stringify(programs));
                localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
                
                loadPrograms();
                loadHistory();
                updateStats();
                alert('Data imported successfully!');
            }
        } catch (error) {
            alert('Error importing data. Please check the file format.');
        }
    };
    reader.readAsText(file);
}

function loadFromStorage() {
    const savedPrograms = localStorage.getItem('trainingPrograms');
    const savedHistory = localStorage.getItem('workoutHistory');
    const savedVideos = localStorage.getItem('sessionVideos');
    const savedMeasurements = localStorage.getItem('measurements');
    const savedProgressPictures = localStorage.getItem('progressPictures');
    
    if (savedPrograms) programs = JSON.parse(savedPrograms);
    if (savedHistory) workoutHistory = JSON.parse(savedHistory);
    if (savedVideos) sessionVideos = JSON.parse(savedVideos);
    if (savedMeasurements) measurements = JSON.parse(savedMeasurements);
    if (savedProgressPictures) progressPictures = JSON.parse(savedProgressPictures);
}

function saveToStorage() {
    localStorage.setItem('trainingPrograms', JSON.stringify(programs));
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
    localStorage.setItem('sessionVideos', JSON.stringify(sessionVideos));
    return true;
}

// Click outside modal to close
window.onclick = function(event) {
    const modal = document.getElementById('programModal');
    if (event.target === modal) {
        closeModal();
    }
    
    const workoutModal = document.getElementById('workoutDetailsModal');
    if (event.target === workoutModal) {
        closeWorkoutDetails();
    }
    
    const editModal = document.getElementById('editWorkoutModal');
    if (event.target === editModal) {
        closeEditWorkout();
    }
    
    const videoModal = document.getElementById('videoModal');
    if (event.target === videoModal) {
        closeVideoModal();
    }
}

// Add these functions to your script.js file

// Global variable to track if we're editing a workout
let editingWorkoutIndex = -1;

// Function to start editing a workout
function editWorkout(workoutIndex) {
    editingWorkoutIndex = workoutIndex;
    const workout = workoutHistory[workoutIndex];
    
    // Create edit modal
    const editModal = document.createElement('div');
    editModal.className = 'modal';
    editModal.id = 'editWorkoutModal';
    editModal.style.display = 'block';
    
    let modalHTML = `
        <div class="modal-content" style="max-width: 95%; max-height: 95%; overflow-y: auto;">
            <span class="close" onclick="closeEditWorkout()">&times;</span>
            <h2>Edit Workout: ${workout.programName} - ${new Date(workout.date).toLocaleDateString()}</h2>
            
            <div class="form-group">
                <label>Session Notes</label>
                <textarea id="editSessionNotes" rows="4" placeholder="How did the session feel? Any observations...">${workout.sessionNotes || ''}</textarea>
            </div>
            
            <div class="video-upload">
                <h3>Session Videos</h3>
                <input type="file" id="editVideoUpload" accept="video/*" multiple onchange="handleEditVideoUpload(event)">
                <div id="editVideoPreview">
    `;
    
    // Show existing videos
    if (workout.videos && workout.videos.length > 0) {
        workout.videos.forEach((video, index) => {
            if (video.githubUrl) {
                const videoUrl = video.githubUrl.replace('/blob/main/', '/blob/video-uploads/');
                const rawVideoUrl = videoUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/video-uploads/', '/video-uploads/');
                
                modalHTML += `
                    <div class="video-container" style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <strong>${video.name}</strong>
                            <button class="btn btn-danger" onclick="removeVideoFromEdit(${index})">Remove Video</button>
                        </div>
                        <p>Size: ${(video.size / 1024 / 1024).toFixed(1)}MB</p>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="btn" onclick="viewVideo('${rawVideoUrl}', '${video.name}')">View Video</button>
                            <a href="${videoUrl}" target="_blank" class="btn">View on GitHub</a>
                        </div>
                    </div>
                `;
            } else {
                modalHTML += `
                    <div class="video-container" style="margin: 15px 0; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <p style="color: #aaa; font-size: 0.9em;">
                            ${video.name} (${(video.size / 1024 / 1024).toFixed(1)}MB) - Not uploaded to GitHub
                            <button class="btn btn-danger" onclick="removeVideoFromEdit(${index})" style="margin-left: 10px;">Remove</button>
                        </p>
                    </div>
                `;
            }
        });
    }
    
    modalHTML += `
                </div>
                <div id="editUploadProgress" class="upload-progress" style="display: none;">
                    <div class="progress-bar" id="editProgressBar"></div>
                </div>
                <div id="editUploadStatus"></div>
                <button class="btn btn-info" onclick="uploadNewVideosToGitHub()" style="margin-top: 15px;">Upload New Videos to GitHub</button>
            </div>
            
            <h3>Exercises</h3>
            <div id="editExercisesList">
    `;
    
    // Add exercises
    workout.exercises.forEach((exercise, exerciseIndex) => {
        modalHTML += `
            <div class="exercise-card" id="editExercise_${exerciseIndex}">
                <div class="exercise-header">
                    <input type="text" class="exercise-name-input" value="${exercise.name}" 
                           onchange="updateEditExerciseName(${exerciseIndex}, this.value)" 
                           style="flex: 1; margin-right: 10px;">
                    <button class="btn btn-danger" onclick="removeExerciseFromEdit(${exerciseIndex})">Remove Exercise</button>
                </div>
                
                <div class="sets-container">
                    <div class="set-row" style="font-weight: bold; background: rgba(0, 212, 255, 0.1);">
                        <div>Set</div>
                        <div>Weight</div>
                        <div>Reps</div>
                        <div>RPE</div>
                        <div>Notes</div>
                        <div>Completed</div>
                        <div>Action</div>
                    </div>
        `;
        
        exercise.sets.forEach((set, setIndex) => {
            modalHTML += `
                <div class="set-row" id="editSet_${exerciseIndex}_${setIndex}">
                    <div>${setIndex + 1}</div>
                    <input type="number" class="set-input" value="${set.weight || ''}" step="0.5" 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
                    <input type="number" class="set-input" value="${set.reps || ''}" 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
                    <input type="number" class="set-input" value="${set.rpe || ''}" step="0.5" min="1" max="10"
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'rpe', this.value)">
                    <input type="text" class="set-input" value="${set.notes || ''}" 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'notes', this.value)">
                    <input type="checkbox" ${set.completed ? 'checked' : ''} 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'completed', this.checked)">
                    <button class="btn btn-danger btn-sm" onclick="removeSetFromEdit(${exerciseIndex}, ${setIndex})">Remove</button>
                </div>
            `;
        });
        
        modalHTML += `
                </div>
                <div style="margin-top: 10px;">
                    <button class="btn btn-sm" onclick="addSetToExercise(${exerciseIndex})">Add Set</button>
                </div>
                
                <div class="form-group" style="margin-top: 15px;">
                    <label>Exercise Notes</label>
                    <textarea onchange="updateEditExerciseNotes(${exerciseIndex}, this.value)" 
                              placeholder="How did this exercise feel? Any adjustments needed...">${exercise.exerciseNotes || ''}</textarea>
                </div>
            </div>
        `;
    });
    
    modalHTML += `
            </div>
            <div style="margin-top: 20px;">
                <button class="btn" onclick="addExerciseToEdit()">Add New Exercise</button>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                <button class="btn btn-success" onclick="saveEditedWorkout()">Save Changes</button>
                <button class="btn btn-secondary" onclick="closeEditWorkout()">Cancel</button>
            </div>
        </div>
    `;
    
    editModal.innerHTML = modalHTML;
    document.body.appendChild(editModal);
}

// Function to close edit workout modal
function closeEditWorkout() {
    const modal = document.getElementById('editWorkoutModal');
    if (modal) {
        modal.remove();
    }
    editingWorkoutIndex = -1;
}

// Function to update exercise name in edit mode
function updateEditExerciseName(exerciseIndex, newName) {
    if (editingWorkoutIndex >= 0) {
        workoutHistory[editingWorkoutIndex].exercises[exerciseIndex].name = newName;
    }
}

// Function to update set data in edit mode
function updateEditSet(exerciseIndex, setIndex, field, value) {
    if (editingWorkoutIndex >= 0) {
        workoutHistory[editingWorkoutIndex].exercises[exerciseIndex].sets[setIndex][field] = value;
    }
}

// Function to update exercise notes in edit mode
function updateEditExerciseNotes(exerciseIndex, notes) {
    if (editingWorkoutIndex >= 0) {
        workoutHistory[editingWorkoutIndex].exercises[exerciseIndex].exerciseNotes = notes;
    }
}

// Function to remove a set from an exercise in edit mode
function removeSetFromEdit(exerciseIndex, setIndex) {
    if (editingWorkoutIndex >= 0 && confirm('Are you sure you want to remove this set?')) {
        const workout = workoutHistory[editingWorkoutIndex];
        workout.exercises[exerciseIndex].sets.splice(setIndex, 1);
        
        // Refresh the exercise display
        refreshEditExercise(exerciseIndex);
    }
}

// Function to add a set to an exercise in edit mode
function addSetToExercise(exerciseIndex) {
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        workout.exercises[exerciseIndex].sets.push({
            weight: '',
            reps: '',
            rpe: '',
            completed: false,
            notes: ''
        });
        
        // Refresh the exercise display
        refreshEditExercise(exerciseIndex);
    }
}

// Function to remove an entire exercise from edit mode
function removeExerciseFromEdit(exerciseIndex) {
    if (editingWorkoutIndex >= 0 && confirm('Are you sure you want to remove this entire exercise?')) {
        const workout = workoutHistory[editingWorkoutIndex];
        workout.exercises.splice(exerciseIndex, 1);
        
        // Refresh the entire edit modal
        closeEditWorkout();
        editWorkout(editingWorkoutIndex);
    }
}

// Function to add a new exercise to the workout being edited
function addExerciseToEdit() {
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        
        const newExercise = {
            name: 'New Exercise',
            sets: [{
                weight: '',
                reps: '',
                rpe: '',
                completed: false,
                notes: ''
            }],
            exerciseNotes: ''
        };
        
        workout.exercises.push(newExercise);
        
        // Refresh the entire edit modal
        closeEditWorkout();
        editWorkout(editingWorkoutIndex);
    }
}

// Function to refresh a single exercise in the edit modal
function refreshEditExercise(exerciseIndex) {
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        const exercise = workout.exercises[exerciseIndex];
        const exerciseContainer = document.getElementById(`editExercise_${exerciseIndex}`);
        
        // Rebuild sets container
        const setsContainer = exerciseContainer.querySelector('.sets-container');
        let setsHTML = `
            <div class="set-row" style="font-weight: bold; background: rgba(0, 212, 255, 0.1);">
                <div>Set</div>
                <div>Weight</div>
                <div>Reps</div>
                <div>RPE</div>
                <div>Notes</div>
                <div>Completed</div>
                <div>Action</div>
            </div>
        `;
        
        exercise.sets.forEach((set, setIndex) => {
            setsHTML += `
                <div class="set-row" id="editSet_${exerciseIndex}_${setIndex}">
                    <div>${setIndex + 1}</div>
                    <input type="number" class="set-input" value="${set.weight || ''}" step="0.5" 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
                    <input type="number" class="set-input" value="${set.reps || ''}" 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
                    <input type="number" class="set-input" value="${set.rpe || ''}" step="0.5" min="1" max="10"
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'rpe', this.value)">
                    <input type="text" class="set-input" value="${set.notes || ''}" 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'notes', this.value)">
                    <input type="checkbox" ${set.completed ? 'checked' : ''} 
                           onchange="updateEditSet(${exerciseIndex}, ${setIndex}, 'completed', this.checked)">
                    <button class="btn btn-danger btn-sm" onclick="removeSetFromEdit(${exerciseIndex}, ${setIndex})">Remove</button>
                </div>
            `;
        });
        
        setsContainer.innerHTML = setsHTML;
    }
}

// Function to handle video upload in edit mode
let newEditVideos = []; // Store new videos added during editing

function handleEditVideoUpload(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('editVideoPreview');
    
    files.forEach(file => {
        if (file.type.startsWith('video/')) {
            const videoId = Date.now() + Math.random().toString(36).substr(2, 5);
            
            const videoInfo = {
                id: videoId,
                name: file.name,
                size: file.size,
                type: file.type,
                file: file,
                lastModified: file.lastModified,
                isNew: true
            };
            
            newEditVideos.push(videoInfo);
            
            // Create a preview for new video
            const videoURL = URL.createObjectURL(file);
            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';
            videoContainer.style.cssText = 'margin: 15px 0; padding: 10px; background: rgba(0, 255, 0, 0.05); border-radius: 8px; border: 1px solid rgba(0, 255, 0, 0.3);';
            
            videoContainer.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong>${file.name} (NEW)</strong>
                    <button class="btn btn-danger" onclick="removeNewVideoFromEdit('${videoId}')">Remove</button>
                </div>
                <p>Size: ${(file.size / 1024 / 1024).toFixed(1)}MB</p>
                <video controls style="width: 300px; margin-top: 10px;" src="${videoURL}"></video>
            `;
            
            previewContainer.appendChild(videoContainer);
        }
    });
}

// Function to remove a video from edit mode
function removeVideoFromEdit(videoIndex) {
    if (editingWorkoutIndex >= 0 && confirm('Are you sure you want to remove this video?')) {
        const workout = workoutHistory[editingWorkoutIndex];
        const video = workout.videos[videoIndex];
        
        // If it's uploaded to GitHub, we'll handle deletion when saving
        workout.videos.splice(videoIndex, 1);
        
        // Refresh the edit modal
        closeEditWorkout();
        editWorkout(editingWorkoutIndex);
    }
}

// Function to remove a newly added video from edit mode
function removeNewVideoFromEdit(videoId) {
    newEditVideos = newEditVideos.filter(v => v.id !== videoId);
    
    // Remove the video container from DOM
    const videoContainers = document.querySelectorAll('.video-container');
    videoContainers.forEach(container => {
        if (container.textContent.includes(newEditVideos.find(v => v.id === videoId)?.name || '')) {
            container.remove();
        }
    });
}

// Function to upload new videos to GitHub during edit
async function uploadNewVideosToGitHub() {
    if (newEditVideos.length === 0) {
        alert('No new videos to upload.');
        return;
    }
    
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration in the Settings tab first.');
        return;
    }
    
    // Ensure the video-uploads branch exists
    const branchExists = await ensureVideoUploadsBranch();
    if (!branchExists) {
        alert('Could not create or access the video-uploads branch. Please check your GitHub permissions and try again.');
        return;
    }
    
    const uploadStatus = document.getElementById('editUploadStatus');
    const uploadProgress = document.getElementById('editUploadProgress');
    const progressBar = document.getElementById('editProgressBar');
    
    uploadStatus.innerHTML = '';
    uploadProgress.style.display = 'block';
    progressBar.style.width = '0%';
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < newEditVideos.length; i++) {
        const video = newEditVideos[i];
        
        try {
            progressBar.style.width = `${((i / newEditVideos.length) * 100).toFixed(0)}%`;
            
            const base64Data = await readFileAsBase64(video.file);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileExtension = video.name.split('.').pop();
            const fileName = `workout-video-${timestamp}.${fileExtension}`;
            const filePath = githubConfig.folder ? `${githubConfig.folder}/${fileName}` : fileName;
            
            const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;
            
            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Upload workout video: ${fileName}`,
                    content: base64Data.split(',')[1],
                    branch: 'video-uploads'
                })
            });
            
            if (response.ok) {
                successCount++;
                video.githubUrl = `https://github.com/${githubConfig.username}/${githubConfig.repo}/blob/video-uploads/${filePath}`;
                
                uploadStatus.innerHTML += `
                    <div class="upload-success">
                        ✓ Successfully uploaded: ${video.name} 
                        <a href="${video.githubUrl}" target="_blank" style="color: #00d4ff;">View on GitHub</a>
                    </div>
                `;
            } else {
                errorCount++;
                const errorData = await response.json();
                uploadStatus.innerHTML += `
                    <div class="upload-error">
                        ✗ Failed to upload: ${video.name} - ${errorData.message || 'Unknown error'}
                    </div>
                `;
            }
        } catch (error) {
            errorCount++;
            uploadStatus.innerHTML += `
                <div class="upload-error">
                    ✗ Error uploading: ${video.name} - ${error.message}
                </div>
            `;
        }
    }
    
    progressBar.style.width = '100%';
    
    uploadStatus.innerHTML += `
        <div class="upload-${errorCount === 0 ? 'success' : 'error'}">
            Upload complete: ${successCount} successful, ${errorCount} failed
        </div>
    `;
    
    // Add uploaded videos to the workout
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        if (!workout.videos) workout.videos = [];
        
        newEditVideos.forEach(video => {
            if (video.githubUrl) {
                workout.videos.push({
                    id: video.id,
                    name: video.name,
                    size: video.size,
                    type: video.type,
                    githubUrl: video.githubUrl
                });
            }
        });
    }
}

// Function to save the edited workout
function saveEditedWorkout() {
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        
        // Validate the workout data
        const validation = validateWorkoutData(workout);
        if (!validation.valid) {
            alert(validation.message);
            return;
        }
        
        // Update session notes
        const sessionNotes = document.getElementById('editSessionNotes').value;
        workout.sessionNotes = sessionNotes;
        
        // Update the last modified timestamp
        workout.lastModified = new Date().toISOString();
        
        // Add any new videos that were uploaded
        newEditVideos.forEach(video => {
            if (video.githubUrl && !workout.videos.find(v => v.id === video.id)) {
                workout.videos.push({
                    id: video.id,
                    name: video.name,
                    size: video.size,
                    type: video.type,
                    githubUrl: video.githubUrl
                });
            }
        });
        
        // Save to localStorage
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
        
        // Update workout data on GitHub
        uploadWorkoutDataToGitHub(workout).then(success => {
            if (!success && githubConfig.token) {
                console.warn('Failed to update workout backup on GitHub');
            }
        });
        
        // Reset new videos array
        newEditVideos = [];
        
        // Close modal
        closeEditWorkout();
        
        // Refresh history display
        loadHistory();
        updateStats();
        
        alert('Workout updated successfully!');
    }
}

// Additional helper functions to add to your script.js file

// Function to show loading state on buttons
function setButtonLoading(buttonElement, loading = true) {
    if (loading) {
        buttonElement.classList.add('loading');
        buttonElement.disabled = true;
    } else {
        buttonElement.classList.remove('loading');
        buttonElement.disabled = false;
    }
}

// Enhanced video upload with progress tracking
async function uploadNewVideosToGitHub() {
    if (newEditVideos.length === 0) {
        alert('No new videos to upload.');
        return;
    }
    
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration in the Settings tab first.');
        return;
    }
    
    const uploadButton = document.querySelector('[onclick="uploadNewVideosToGitHub()"]');
    setButtonLoading(uploadButton, true);
    
    try {
        // Ensure the video-uploads branch exists
        const branchExists = await ensureVideoUploadsBranch();
        if (!branchExists) {
            alert('Could not create or access the video-uploads branch. Please check your GitHub permissions and try again.');
            return;
        }
        
        const uploadStatus = document.getElementById('editUploadStatus');
        const uploadProgress = document.getElementById('editUploadProgress');
        const progressBar = document.getElementById('editProgressBar');
        
        uploadStatus.innerHTML = '';
        uploadProgress.style.display = 'block';
        progressBar.style.width = '0%';
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < newEditVideos.length; i++) {
            const video = newEditVideos[i];
            
            try {
                progressBar.style.width = `${((i / newEditVideos.length) * 100).toFixed(0)}%`;
                uploadStatus.innerHTML = `<div>Uploading ${video.name}... (${i + 1} of ${newEditVideos.length})</div>`;
                
                const base64Data = await readFileAsBase64(video.file);
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileExtension = video.name.split('.').pop();
                const fileName = `workout-video-${timestamp}.${fileExtension}`;
                const filePath = githubConfig.folder ? `${githubConfig.folder}/${fileName}` : fileName;
                
                const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;
                
                const response = await fetch(apiUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Upload workout video: ${fileName}`,
                        content: base64Data.split(',')[1],
                        branch: 'video-uploads'
                    })
                });
                
                if (response.ok) {
                    successCount++;
                    video.githubUrl = `https://github.com/${githubConfig.username}/${githubConfig.repo}/blob/video-uploads/${filePath}`;
                    
                    uploadStatus.innerHTML += `
                        <div class="upload-success">
                            ✓ Successfully uploaded: ${video.name} 
                            <a href="${video.githubUrl}" target="_blank" style="color: #00d4ff;">View on GitHub</a>
                        </div>
                    `;
                } else {
                    errorCount++;
                    const errorData = await response.json();
                    uploadStatus.innerHTML += `
                        <div class="upload-error">
                            ✗ Failed to upload: ${video.name} - ${errorData.message || 'Unknown error'}
                        </div>
                    `;
                }
            } catch (error) {
                errorCount++;
                uploadStatus.innerHTML += `
                    <div class="upload-error">
                        ✗ Error uploading: ${video.name} - ${error.message}
                    </div>
                `;
            }
        }
        
        progressBar.style.width = '100%';
        
        uploadStatus.innerHTML += `
            <div class="upload-${errorCount === 0 ? 'success' : 'error'}">
                Upload complete: ${successCount} successful, ${errorCount} failed
            </div>
        `;
        
        // Add uploaded videos to the workout
        if (editingWorkoutIndex >= 0) {
            const workout = workoutHistory[editingWorkoutIndex];
            if (!workout.videos) workout.videos = [];
            
            newEditVideos.forEach(video => {
                if (video.githubUrl) {
                    workout.videos.push({
                        id: video.id,
                        name: video.name,
                        size: video.size,
                        type: video.type,
                        githubUrl: video.githubUrl
                    });
                }
            });
            
            // Clear the new videos since they're now part of the workout
            newEditVideos = [];
        }
        
    } finally {
        setButtonLoading(uploadButton, false);
    }
}

// Function to validate workout data before saving
function validateWorkoutData(workout) {
    if (!workout.exercises || workout.exercises.length === 0) {
        return { valid: false, message: 'Workout must have at least one exercise.' };
    }
    
    for (let i = 0; i < workout.exercises.length; i++) {
        const exercise = workout.exercises[i];
        if (!exercise.name || exercise.name.trim() === '') {
            return { valid: false, message: `Exercise ${i + 1} must have a name.` };
        }
        
        if (!exercise.sets || exercise.sets.length === 0) {
            return { valid: false, message: `${exercise.name} must have at least one set.` };
        }
    }
    
    return { valid: true };
}

// Enhanced save function with validation
function saveEditedWorkout() {
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        
        // Validate the workout data
        const validation = validateWorkoutData(workout);
        if (!validation.valid) {
            alert(validation.message);
            return;
        }
        
        // Update session notes
        const sessionNotes = document.getElementById('editSessionNotes').value;
        workout.sessionNotes = sessionNotes;
        
        // Update the last modified timestamp
        workout.lastModified = new Date().toISOString();
        
        // Add any new videos that were uploaded
        newEditVideos.forEach(video => {
            if (video.githubUrl && !workout.videos.find(v => v.id === video.id)) {
                workout.videos.push({
                    id: video.id,
                    name: video.name,
                    size: video.size,
                    type: video.type,
                    githubUrl: video.githubUrl
                });
            }
        });
        
        // Save to localStorage
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
        
        // Reset new videos array
        newEditVideos = [];
        
        // Close modal
        closeEditWorkout();
        
        // Refresh history display
        loadHistory();
        updateStats();
        
        alert('Workout updated successfully!');
    }
}

// Function to duplicate a set (useful when editing)
function duplicateSet(exerciseIndex, setIndex) {
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        const originalSet = workout.exercises[exerciseIndex].sets[setIndex];
        
        // Create a copy of the set
        const duplicatedSet = {
            weight: originalSet.weight,
            reps: originalSet.reps,
            rpe: originalSet.rpe,
            completed: false, // Reset completed status
            notes: originalSet.notes
        };
        
        // Insert the duplicated set right after the original
        workout.exercises[exerciseIndex].sets.splice(setIndex + 1, 0, duplicatedSet);
        
        // Refresh the exercise display
        refreshEditExercise(exerciseIndex);
    }
}

// Function to reorder exercises (move up/down)
function moveExercise(exerciseIndex, direction) {
    if (editingWorkoutIndex >= 0) {
        const workout = workoutHistory[editingWorkoutIndex];
        const newIndex = direction === 'up' ? exerciseIndex - 1 : exerciseIndex + 1;
        
        // Check bounds
        if (newIndex < 0 || newIndex >= workout.exercises.length) {
            return;
        }
        
        // Swap exercises
        [workout.exercises[exerciseIndex], workout.exercises[newIndex]] = 
        [workout.exercises[newIndex], workout.exercises[exerciseIndex]];
        
        // Refresh the entire edit modal
        closeEditWorkout();
        editWorkout(editingWorkoutIndex);
    }
}

// Function to auto-save changes (optional - saves every 30 seconds)
let autoSaveTimer = null;

function enableAutoSave() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
    }
    
    autoSaveTimer = setInterval(() => {
        if (editingWorkoutIndex >= 0) {
            // Silently save to localStorage without showing alert
            localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
            console.log('Auto-saved workout changes');
        }
    }, 30000); // Auto-save every 30 seconds
}

function disableAutoSave() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
}

// Enable auto-save when editing starts
const originalEditWorkout = editWorkout;
editWorkout = function(workoutIndex) {
    originalEditWorkout(workoutIndex);
    enableAutoSave();
};

// Disable auto-save when editing ends
const originalCloseEditWorkout = closeEditWorkout;
closeEditWorkout = function() {
    originalCloseEditWorkout();
    disableAutoSave();
};

// Function to show confirmation when leaving edit mode with unsaved changes
function confirmLeaveEdit() {
    if (editingWorkoutIndex >= 0) {
        return confirm('You have unsaved changes. Are you sure you want to close without saving?');
    }
    return true;
}

// Override the close function to check for unsaved changes
closeEditWorkout = function() {
    if (confirmLeaveEdit()) {
        originalCloseEditWorkout();
        disableAutoSave();
    }
};

// Progress tracking functions
async function saveMeasurement() {
    const date = document.getElementById('measurementDate').value;
    const weight = document.getElementById('weight').value;
    const bodyFat = document.getElementById('bodyFat').value;
    const muscleMass = document.getElementById('muscleMass').value;

    if (!date || !weight) {
        alert('Please enter at least date and weight');
        return;
    }

    const measurement = {
        id: Date.now(),
        date: date,
        weight: parseFloat(weight),
        bodyFat: bodyFat ? parseFloat(bodyFat) : null,
        muscleMass: muscleMass ? parseFloat(muscleMass) : null,
        created: new Date().toISOString()
    };

    measurements.push(measurement);
    measurements.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    try {
        await saveDataToGitHub('measurements', measurements);
        localStorage.setItem('measurements', JSON.stringify(measurements));
        
        document.getElementById('measurementDate').value = '';
        document.getElementById('weight').value = '';
        document.getElementById('bodyFat').value = '';
        document.getElementById('muscleMass').value = '';
        
        loadMeasurements();
        updateMeasurementChart();
        alert('Measurement saved successfully to GitHub!');
    } catch (error) {
        alert('Error saving measurement to GitHub: ' + error.message);
        console.error('Measurement save error:', error);
    }
}

function handleProgressPictureUpload(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('progressPicturePreview');
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const pictureId = Date.now() + Math.random().toString(36).substr(2, 5);
            
            const pictureInfo = {
                id: pictureId,
                name: file.name,
                size: file.size,
                type: file.type,
                file: file,
                lastModified: file.lastModified
            };
            
            progressPictureFiles.push(pictureInfo);
            
            // Create preview
            const imageURL = URL.createObjectURL(file);
            const imageContainer = document.createElement('div');
            imageContainer.style.cssText = 'display: inline-block; margin: 10px; position: relative;';
            
            const imageElement = document.createElement('img');
            imageElement.src = imageURL;
            imageElement.style.cssText = 'width: 150px; height: 150px; object-fit: cover; border-radius: 8px; border: 2px solid #e8e8e8;';
            imageElement.dataset.id = pictureId;
            
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.className = 'btn btn-danger';
            removeBtn.style.cssText = 'position: absolute; top: -5px; right: -5px; padding: 2px 8px; font-size: 16px;';
            removeBtn.onclick = function() {
                progressPictureFiles = progressPictureFiles.filter(p => p.id !== pictureId);
                imageContainer.remove();
            };
            
            imageContainer.appendChild(imageElement);
            imageContainer.appendChild(removeBtn);
            previewContainer.appendChild(imageContainer);
        }
    });
}

function saveProgressPictures() {
    const date = document.getElementById('pictureDate').value;
    const notes = document.getElementById('pictureNotes').value;

    if (!date) {
        alert('Please select a date');
        return;
    }

    if (progressPictureFiles.length === 0) {
        alert('Please select at least one picture');
        return;
    }

    const pictureEntry = {
        id: Date.now(),
        date: date,
        notes: notes,
        pictures: progressPictureFiles.map(p => ({
            id: p.id,
            name: p.name,
            size: p.size,
            type: p.type,
            githubUrl: null
        })),
        created: new Date().toISOString()
    };

    progressPictures.push(pictureEntry);
    progressPictures.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
    
    // Clear form
    document.getElementById('pictureDate').value = '';
    document.getElementById('pictureNotes').value = '';
    document.getElementById('progressPicturePreview').innerHTML = '';
    document.getElementById('progressPictures').value = '';
    progressPictureFiles = [];
    
    loadProgressPictures();
    alert('Progress pictures saved successfully!');
}

async function uploadProgressPicturesToGitHub() {
    if (progressPictureFiles.length === 0) {
        alert('No pictures to upload. Please save pictures first, then upload them from the gallery.');
        return;
    }

    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration in the Settings tab first.');
        return;
    }

    // Similar upload logic to videos but for images
    // This is a simplified version - you'd implement similar to video upload
    alert('Picture upload functionality requires the same GitHub upload logic as videos. Implement similar to uploadVideosToGitHub()');
}

function loadMeasurements() {
    const measurementsList = document.getElementById('measurementsList');
    measurementsList.innerHTML = '';

    if (measurements.length === 0) {
        measurementsList.innerHTML = '<p style="text-align: center; color: #666;">No measurements recorded yet.</p>';
        return;
    }

    measurements.slice().reverse().forEach((measurement, index) => {
        const actualIndex = measurements.length - 1 - index;
        const measurementItem = document.createElement('div');
        measurementItem.className = 'measurement-item';
        measurementItem.style.cssText = 'background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid #28a745;';
        
        measurementItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div>
                    <h4>${new Date(measurement.date).toLocaleDateString()}</h4>
                    <p><strong>Weight:</strong> ${measurement.weight}kg</p>
                    ${measurement.bodyFat ? `<p><strong>Body Fat:</strong> ${measurement.bodyFat}%</p>` : ''}
                    ${measurement.muscleMass ? `<p><strong>Muscle Mass:</strong> ${measurement.muscleMass}kg</p>` : ''}
                </div>
                <button class="btn btn-danger" onclick="deleteMeasurement(${actualIndex})">Delete</button>
            </div>
        `;
        measurementsList.appendChild(measurementItem);
    });
}

function loadProgressPictures() {
    const gallery = document.getElementById('picturesGallery');
    gallery.innerHTML = '';

    if (progressPictures.length === 0) {
        gallery.innerHTML = '<p style="text-align: center; color: #666;">No progress pictures yet.</p>';
        return;
    }

    progressPictures.slice().reverse().forEach((entry, index) => {
        const actualIndex = progressPictures.length - 1 - index;
        const entryDiv = document.createElement('div');
        entryDiv.className = 'picture-entry';
        entryDiv.style.cssText = 'background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 12px; border-left: 4px solid #17a2b8;';
        
        let entryHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
                <div>
                    <h4>${new Date(entry.date).toLocaleDateString()}</h4>
                    <input type="date" value="${entry.date}" onchange="updatePictureDate(${actualIndex}, this.value)" style="margin-top: 5px;">
                    ${entry.notes ? `<p><strong>Notes:</strong> ${entry.notes}</p>` : ''}
                    <p><strong>Pictures:</strong> ${entry.pictures.length}</p>
                </div>
                <button class="btn btn-danger" onclick="deleteProgressPictureEntry(${actualIndex})">Delete Entry</button>
            </div>
            <div class="pictures-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px;">
        `;
        
        entry.pictures.forEach((picture, pictureIndex) => {
            if (picture.githubUrl) {
                const imageUrl = picture.githubUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
                entryHTML += `
                    <div style="position: relative;">
                        <img src="${imageUrl}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px; cursor: pointer;" onclick="viewProgressPicture('${imageUrl}', '${picture.name}')">
                        <button class="btn btn-danger btn-sm" onclick="deleteProgressPicture(${actualIndex}, ${pictureIndex})" style="position: absolute; top: 5px; right: 5px;">×</button>
                    </div>
                `;
            } else {
                entryHTML += `
                    <div style="background: rgba(255,255,255,0.5); padding: 20px; border-radius: 8px; text-align: center;">
                        <p>${picture.name}</p>
                        <small>Not uploaded to GitHub</small>
                    </div>
                `;
            }
        });
        
        entryHTML += '</div>';
        entryDiv.innerHTML = entryHTML;
        gallery.appendChild(entryDiv);
    });
}

function updateMeasurementChart() {
    const ctx = document.getElementById('measurementChart');
    if (!ctx) return;

    if (measurementChart) {
        measurementChart.destroy();
    }

    const labels = measurements.map(m => new Date(m.date).toLocaleDateString());
    const weightData = measurements.map(m => m.weight);
    const bodyFatData = measurements.map(m => m.bodyFat);

    measurementChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (kg)',
                data: weightData,
                borderColor: '#1a1a1a',
                backgroundColor: 'rgba(26, 26, 26, 0.1)',
                tension: 0.4
            }, {
                label: 'Body Fat %',
                data: bodyFatData,
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                tension: 0.4,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Weight (kg)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Body Fat %' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

function deleteMeasurement(index) {
    if (confirm('Are you sure you want to delete this measurement?')) {
        measurements.splice(index, 1);
        localStorage.setItem('measurements', JSON.stringify(measurements));
        loadMeasurements();
        updateMeasurementChart();
    }
}

function deleteProgressPictureEntry(index) {
    if (confirm('Are you sure you want to delete this entire progress picture entry?')) {
        progressPictures.splice(index, 1);
        localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
        loadProgressPictures();
    }
}

function updatePictureDate(index, newDate) {
    progressPictures[index].date = newDate;
    localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
    loadProgressPictures();
}

function viewProgressPicture(imageUrl, imageName) {
    // Similar to video modal but for images
    const imageModal = document.createElement('div');
    imageModal.className = 'modal';
    imageModal.style.display = 'block';
    imageModal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-height: 90%;">
            <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h3>${imageName}</h3>
            <img src="${imageUrl}" style="width: 100%; max-height: 80vh; object-fit: contain; border-radius: 8px;">
        </div>
    `;
    document.body.appendChild(imageModal);
}

// Enhanced picture upload to GitHub
async function uploadProgressPicturesToGitHub() {
    if (progressPictureFiles.length === 0) {
        alert('No new pictures to upload. Please add pictures first.');
        return;
    }

    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration in the Settings tab first.');
        return;
    }

    // Ensure the progress-pictures branch exists
    const branchExists = await ensureProgressPicturesBranch();
    if (!branchExists) {
        alert('Could not create or access the progress-pictures branch. Please check your GitHub permissions and try again.');
        return;
    }

    const uploadButton = document.querySelector('[onclick="uploadProgressPicturesToGitHub()"]');
    setButtonLoading(uploadButton, true);

    const uploadStatus = document.createElement('div');
    uploadStatus.id = 'pictureUploadStatus';
    uploadStatus.style.cssText = 'margin-top: 15px;';
    
    // Remove existing status if present
    const existingStatus = document.getElementById('pictureUploadStatus');
    if (existingStatus) existingStatus.remove();
    
    uploadButton.parentNode.appendChild(uploadStatus);

    try {
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < progressPictureFiles.length; i++) {
            const picture = progressPictureFiles[i];

            try {
                uploadStatus.innerHTML = `<div>Uploading ${picture.name}... (${i + 1} of ${progressPictureFiles.length})</div>`;

                const base64Data = await readFileAsBase64(picture.file);
                
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileExtension = picture.name.split('.').pop();
                const fileName = `progress-${timestamp}.${fileExtension}`;
                const folderPath = githubConfig.folder ? `${githubConfig.folder}/progress-pictures` : 'progress-pictures';
                const filePath = `${folderPath}/${fileName}`;

                const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

                const response = await fetch(apiUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Upload progress picture: ${fileName}`,
                        content: base64Data.split(',')[1],
                        branch: 'progress-pictures'
                    })
                });

                if (response.ok) {
                    successCount++;
                    picture.githubUrl = `https://github.com/${githubConfig.username}/${githubConfig.repo}/blob/progress-pictures/${filePath}`;
                    
                    uploadStatus.innerHTML += `
                        <div class="upload-success">
                            ✓ Successfully uploaded: ${picture.name} 
                            <a href="${picture.githubUrl}" target="_blank" style="color: #00d4ff;">View on GitHub</a>
                        </div>
                    `;
                } else {
                    errorCount++;
                    const errorData = await response.json();
                    uploadStatus.innerHTML += `
                        <div class="upload-error">
                            ✗ Failed to upload: ${picture.name} - ${errorData.message || 'Unknown error'}
                        </div>
                    `;
                }
            } catch (error) {
                errorCount++;
                uploadStatus.innerHTML += `
                    <div class="upload-error">
                        ✗ Error uploading: ${picture.name} - ${error.message}
                    </div>
                `;
            }
        }

        uploadStatus.innerHTML += `
            <div class="upload-${errorCount === 0 ? 'success' : 'error'}">
                Upload complete: ${successCount} successful, ${errorCount} failed
            </div>
        `;

        // Update the current progress pictures with GitHub URLs
        const currentDate = document.getElementById('pictureDate').value;
        if (currentDate && successCount > 0) {
            const pictureEntry = {
                id: Date.now(),
                date: currentDate,
                notes: document.getElementById('pictureNotes').value,
                pictures: progressPictureFiles.filter(p => p.githubUrl).map(p => ({
                    id: p.id,
                    name: p.name,
                    size: p.size,
                    type: p.type,
                    githubUrl: p.githubUrl
                })),
                created: new Date().toISOString()
            };

            progressPictures.push(pictureEntry);
            progressPictures.sort((a, b) => new Date(a.date) - new Date(b.date));
            localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
            
            // Clear the upload queue
            progressPictureFiles = [];
            document.getElementById('progressPicturePreview').innerHTML = '';
            document.getElementById('progressPictures').value = '';
            
            loadProgressPictures();
        }

    } finally {
        setButtonLoading(uploadButton, false);
    }
}

// Ensure progress-pictures branch exists
async function ensureProgressPicturesBranch() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }
    
    try {
        // Check if the progress-pictures branch exists
        const branchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/branches/progress-pictures`, 
            {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (branchResponse.ok) {
            return true; // Branch exists
        }
        
        // If branch doesn't exist, create it from the main branch
        const mainBranchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/git/refs/heads/main`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (!mainBranchResponse.ok) {
            console.error('Could not get main branch info');
            return false;
        }
        
        const mainBranchData = await mainBranchResponse.json();
        const mainSha = mainBranchData.object.sha;
        
        // Create the progress-pictures branch
        const createBranchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/git/refs`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ref: 'refs/heads/progress-pictures',
                    sha: mainSha
                })
            }
        );
        
        return createBranchResponse.ok;
    } catch (error) {
        console.error('Error ensuring progress-pictures branch exists:', error);
        return false;
    }
}

// Ensure training-data branch exists
async function ensureTrainingDataBranch() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }
    
    try {
        // Check if the training-data branch exists
        const branchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/branches/training-data`, 
            {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (branchResponse.ok) {
            return true; // Branch exists
        }
        
        // If branch doesn't exist, create it from the main branch
        const mainBranchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/git/refs/heads/main`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        if (!mainBranchResponse.ok) {
            console.error('Could not get main branch info');
            return false;
        }
        
        const mainBranchData = await mainBranchResponse.json();
        const mainSha = mainBranchData.object.sha;
        
        // Create the training-data branch
        const createBranchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/git/refs`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ref: 'refs/heads/training-data',
                    sha: mainSha
                })
            }
        );
        
        return createBranchResponse.ok;
    } catch (error) {
        console.error('Error ensuring training-data branch exists:', error);
        return false;
    }
}

// Upload workout data to GitHub as JSON
async function uploadWorkoutDataToGitHub(workout, isDelete = false) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }

    try {
        // Ensure the training-data branch exists
        const branchExists = await ensureTrainingDataBranch();
        if (!branchExists) {
            console.error('Could not create or access the training-data branch');
            return false;
        }

        const fileName = `workout-${workout.date.split('T')[0]}-${workout.programName.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
        const filePath = `workouts/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        if (isDelete) {
            // Get the file SHA first, then delete
            try {
                const getResponse = await fetch(`${apiUrl}?ref=training-data`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (getResponse.ok) {
                    const fileData = await getResponse.json();
                    const deleteResponse = await fetch(apiUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `token ${githubConfig.token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: `Delete workout data: ${fileName}`,
                            sha: fileData.sha,
                            branch: 'training-data'
                        })
                    });
                    return deleteResponse.ok;
                }
            } catch (error) {
                console.error('Error deleting workout from GitHub:', error);
                return false;
            }
        } else {
            // Upload/update the workout
            const workoutData = {
                ...workout,
                exportedAt: new Date().toISOString(),
                version: "1.0"
            };

            const content = btoa(JSON.stringify(workoutData, null, 2));

            // Check if file already exists
            let sha = null;
            try {
                const existingResponse = await fetch(`${apiUrl}?ref=training-data`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (existingResponse.ok) {
                    const existingData = await existingResponse.json();
                    sha = existingData.sha;
                }
            } catch (error) {
                // File doesn't exist, which is fine for new uploads
            }

            const uploadResponse = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: sha ? `Update workout data: ${fileName}` : `Add workout data: ${fileName}`,
                    content: content,
                    branch: 'training-data',
                    ...(sha && { sha })
                })
            });

            return uploadResponse.ok;
        }
    } catch (error) {
        console.error('Error managing workout data on GitHub:', error);
        return false;
    }
}

// Delete progress picture from GitHub
async function deleteProgressPicture(entryIndex, pictureIndex) {
    const entry = progressPictures[entryIndex];
    const picture = entry.pictures[pictureIndex];
    
    if (!confirm(`Are you sure you want to delete this progress picture "${picture.name}"?`)) {
        return;
    }
    
    // If the picture was uploaded to GitHub, delete it from there too
    if (picture.githubUrl) {
        try {
            // Extract the file path from the GitHub URL
            const url = new URL(picture.githubUrl);
            const pathParts = url.pathname.split('/');
            
            // Find the index after "blob" and "progress-pictures"
            const blobIndex = pathParts.indexOf('blob');
            if (blobIndex === -1 || blobIndex + 2 >= pathParts.length) {
                throw new Error('Invalid GitHub URL format');
            }
            
            // Reconstruct the file path
            const filePath = pathParts.slice(blobIndex + 2).join('/');
            
            // Get the SHA of the file to delete
            const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}?ref=progress-pictures`;
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const fileData = await response.json();
                const sha = fileData.sha;
                
                // Delete the file from GitHub
                const deleteResponse = await fetch(apiUrl, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `token ${githubConfig.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `Delete progress picture: ${picture.name}`,
                        sha: sha,
                        branch: 'progress-pictures'
                    })
                });
                
                if (!deleteResponse.ok) {
                    const errorData = await deleteResponse.json();
                    console.error('Failed to delete picture from GitHub:', errorData);
                    alert('Picture was removed locally but could not be deleted from GitHub. Error: ' + 
                          (errorData.message || 'Unknown error'));
                }
            } else {
                console.error('Failed to get file info from GitHub:', await response.json());
                alert('Picture was removed locally but could not be deleted from GitHub (file not found).');
            }
        } catch (error) {
            console.error('Error deleting picture from GitHub:', error);
            alert('Picture was removed locally but there was an error deleting it from GitHub: ' + error.message);
        }
    }
    
    // Remove the picture from the entry
    entry.pictures.splice(pictureIndex, 1);
    
    // If this was the last picture, remove the entire entry
    if (entry.pictures.length === 0) {
        progressPictures.splice(entryIndex, 1);
    }
    
    // Update localStorage
    localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
    
    // Refresh the display
    loadProgressPictures();
    
    alert('Progress picture deleted successfully!');
}

async function syncDataWithGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration first.');
        return;
    }
    
    const syncButton = document.querySelector('[onclick="syncDataWithGitHub()"]');
    if (syncButton) setButtonLoading(syncButton, true);
    
    try {
        await saveDataToGitHub('measurements', measurements);
        await saveDataToGitHub('workouts', workoutHistory);
        await saveDataToGitHub('progress-pictures', progressPictures);
        
        alert('All data synchronized with GitHub successfully!');
    } catch (error) {
        alert('Error synchronizing data with GitHub: ' + error.message);
        console.error('Sync error:', error);
    } finally {
        if (syncButton) setButtonLoading(syncButton, false);
    }
}







