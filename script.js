// Global variables
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
document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();
    loadPrograms();
    loadHistory();
    updateStats();
    loadGithubConfig();
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
            <button class="btn" onclick="viewWorkoutDetails(${actualIndex})">View Details</button>
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

function saveWorkout() {
    if (!currentWorkout) {
        alert('No active workout to save');
        return;
    }

    // Validate that at least one set was completed
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
        githubUrl: v.githubUrl || null // Store GitHub URL if available
    }));
    currentWorkout.completed = new Date().toISOString();
    currentWorkout.duration = timerSeconds;

    workoutHistory.push(currentWorkout);
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));

    // Update program last used date
    const program = programs.find(p => p.id === currentWorkout.programId);
    if (program) {
        program.lastUsed = currentWorkout.completed;
        localStorage.setItem('trainingPrograms', JSON.stringify(programs));
    }

    alert('Workout saved successfully!');
    
    // Reset current workout
    currentWorkout = null;
    sessionVideos = [];
    document.getElementById('currentProgram').innerHTML = '<p>Select a program to start your workout</p>';
    document.getElementById('sessionNotes').value = '';
    document.getElementById('videoPreview').innerHTML = '';
    document.getElementById('uploadStatus').innerHTML = '';
    document.getElementById('uploadProgress').style.display = 'none';
    
    // Hide timer
    document.getElementById('timerContainer').style.display = 'none';
    resetTimer();
    
    loadPrograms();
    loadHistory();
    updateStats();
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

function deleteWorkout(workoutIndex) {
    const workout = workoutHistory[workoutIndex];
    if (confirm(`Are you sure you want to delete the workout from ${new Date(workout.date).toLocaleDateString()}? This cannot be undone.`)) {
        workoutHistory.splice(workoutIndex, 1);
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
        loadHistory();
        updateStats();
    }
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
            <p><strong>Total Volume:</strong> ${calculateWorkoutVolume(workout)}kg</p>
            <p><strong>Duration:</strong> ${workout.duration ? formatDuration(workout.duration) : 'Unknown'}</p>
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
    
    if (savedPrograms) programs = JSON.parse(savedPrograms);
    if (savedHistory) workoutHistory = JSON.parse(savedHistory);
    if (savedVideos) sessionVideos = JSON.parse(savedVideos);
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
    
    const videoModal = document.getElementById('videoModal');
    if (event.target === videoModal) {
        closeVideoModal();
    }
}
