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
    folder: 'videos'
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    showLanding();
    loadGithubConfig();
    
    // Load all data
    await loadProgramsFromGitHub();
    await loadMeasurementsFromGitHub();
    await loadProgressPicturesFromGitHub();
    await loadWorkoutHistoryFromGitHub();
    
    loadPrograms();
    loadHistory();
    loadMeasurements();
    loadProgressPictures();
    updateStats();
    updateMeasurementChart();
});

// Navigation functions
function showLanding() {
    document.getElementById('landing').style.display = 'flex';
    document.getElementById('appWrapper').style.display = 'none';
}

function showApp() {
    document.getElementById('landing').style.display = 'none';
    document.getElementById('appWrapper').style.display = 'block';
    showTab('programs');
}

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-link').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab and activate nav button
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    // Show timer if on workout tab with active workout
    if (tabName === 'workout' && currentWorkout) {
        document.getElementById('timerContainer').style.display = 'flex';
    } else {
        document.getElementById('timerContainer').style.display = 'none';
    }

    // Refresh data for specific tabs
    if (tabName === 'measurements') {
        loadMeasurements();
        loadProgressPictures();
        updateMeasurementChart();
        
        // Set default dates to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('measurementDate').value = today;
        document.getElementById('pictureDate').value = today;
    }
    
    if (tabName === 'stats') {
        updateStats();
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

// GitHub configuration
function loadGithubConfig() {
    const savedConfig = localStorage.getItem('githubConfig');
    if (savedConfig) {
        githubConfig = JSON.parse(savedConfig);
        document.getElementById('githubToken').value = githubConfig.token || '';
        document.getElementById('githubUsername').value = githubConfig.username || '';
        document.getElementById('githubRepo').value = githubConfig.repo || '';
        document.getElementById('githubFolder').value = githubConfig.folder || 'videos';
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
    alert('GitHub configuration saved!');
}

async function testGithubConnection() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please complete all GitHub configuration fields first.');
        return;
    }
    
    try {
        const response = await fetch(`https://api.github.com/user/repos`, {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            alert('GitHub connection successful!');
        } else {
            alert('GitHub connection failed. Please check your credentials.');
        }
    } catch (error) {
        alert('Error testing GitHub connection: ' + error.message);
    }
}

// Core GitHub data functions
async function saveDataToGitHub(dataType, data, fileName = null) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        throw new Error('GitHub configuration required');
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const actualFileName = fileName || `${dataType}-${timestamp}.json`;
    const filePath = `data/${actualFileName}`;
    const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

    const content = btoa(JSON.stringify({
        type: dataType,
        data: data,
        lastUpdated: new Date().toISOString()
    }, null, 2));

    // Check if file exists to get SHA
    let sha = null;
    try {
        const existingResponse = await fetch(apiUrl, {
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
            branch: 'main'
        })
    });

    if (!response.ok) {
        throw new Error('Failed to save to GitHub');
    }

    return true;
}

async function loadDataFromGitHub(dataType) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return null;
    }

    try {
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/data`;
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const files = await response.json();
            const dataFile = files.find(f => f.name.startsWith(dataType));
            
            if (dataFile) {
                const fileResponse = await fetch(dataFile.download_url);
                const content = await fileResponse.json();
                return content.data;
            }
        }
    } catch (error) {
        console.error(`Error loading ${dataType} from GitHub:`, error);
    }

    return null;
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
            <input type="text" placeholder="Exercise name" class="exercise-name-input">
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
            <label>Rest Time (seconds)</label>
            <input type="number" class="rest-input" value="180" min="30" step="30">
        </div>
    `;
    
    exerciseList.appendChild(exerciseDiv);
}

function removeExercise(button) {
    button.closest('.exercise-card').remove();
}

async function saveProgram() {
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
            rest: parseInt(card.querySelector('.rest-input').value)
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
        created: currentProgramIndex >= 0 ? programs[currentProgramIndex].created : new Date().toISOString()
    };

    try {
        if (currentProgramIndex >= 0) {
            programs[currentProgramIndex] = program;
        } else {
            programs.push(program);
        }

        localStorage.setItem('trainingPrograms', JSON.stringify(programs));
        
        if (githubConfig.token) {
            await saveDataToGitHub('programs', programs);
        }

        closeModal();
        loadPrograms();
        alert('Program saved successfully!');
        
    } catch (error) {
        alert('Error saving program: ' + error.message);
    }
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
            <div style="margin-top: 15px;">
                <button class="btn btn-success" onclick="startWorkout(${index})">Start Workout</button>
                <button class="btn" onclick="editProgram(${index})">Edit</button>
                <button class="btn btn-danger" onclick="deleteProgram(${index})">Delete</button>
            </div>
        `;
        programList.appendChild(programCard);
    });
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
                <input type="text" placeholder="Exercise name" class="exercise-name-input" value="${exercise.name}">
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
                <label>Rest Time (seconds)</label>
                <input type="number" class="rest-input" value="${exercise.rest}" min="30" step="30">
            </div>
        `;
        exerciseList.appendChild(exerciseDiv);
    });
    
    document.getElementById('programModal').style.display = 'block';
}

async function deleteProgram(programIndex) {
    const program = programs[programIndex];
    
    if (!confirm(`Are you sure you want to delete "${program.name}"?`)) {
        return;
    }
    
    programs.splice(programIndex, 1);
    localStorage.setItem('trainingPrograms', JSON.stringify(programs));
    loadPrograms();
    alert('Program deleted!');
}

function startWorkout(programIndex) {
    currentProgramIndex = programIndex;
    const program = programs[programIndex];
    
    currentWorkout = {
        programId: program.id,
        programName: program.name,
        date: new Date().toISOString(),
        exercises: program.exercises.map(ex => ({
            ...ex,
            sets: Array(ex.sets).fill().map(() => ({
                weight: '',
                reps: '',
                completed: false,
                notes: ''
            }))
        })),
        sessionNotes: '',
        videos: []
    };

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
                <strong>Target:</strong> ${exercise.sets.length} sets × ${exercise.reps} reps
                <br><strong>Rest:</strong> ${Math.floor(exercise.rest / 60)}:${(exercise.rest % 60).toString().padStart(2, '0')}
            </div>
            <div class="sets-container">
                <div class="set-row" style="font-weight: bold; background: rgba(0, 212, 255, 0.1);">
                    <div>Set</div>
                    <div>Weight</div>
                    <div>Reps</div>
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
                        <input type="text" class="set-input" placeholder="Optional notes"
                               onchange="updateSet(${exerciseIndex}, ${setIndex}, 'notes', this.value)">
                        <input type="checkbox" onchange="updateSet(${exerciseIndex}, ${setIndex}, 'completed', this.checked)">
                    </div>
                `).join('')}
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

// Video upload functions
function handleVideoUpload(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('videoPreview');
    
    files.forEach(file => {
        if (file.type.startsWith('video/')) {
            const videoId = Date.now() + Math.random().toString(36).substr(2, 5);
            
            const videoInfo = {
                id: videoId,
                name: file.name,
                file: file
            };
            
            sessionVideos.push(videoInfo);
            
            const videoURL = URL.createObjectURL(file);
            const videoElement = document.createElement('video');
            videoElement.controls = true;
            videoElement.className = 'video-preview';
            videoElement.style.width = '300px';
            videoElement.style.margin = '10px';
            videoElement.src = videoURL;
            
            const videoContainer = document.createElement('div');
            videoContainer.style.position = 'relative';
            videoContainer.style.display = 'inline-block';
            
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.className = 'btn btn-danger';
            removeBtn.style.position = 'absolute';
            removeBtn.style.top = '5px';
            removeBtn.style.right = '5px';
            removeBtn.onclick = function() {
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

    currentWorkout.sessionNotes = document.getElementById('sessionNotes').value;
    currentWorkout.videos = sessionVideos;
    currentWorkout.completed = new Date().toISOString();
    currentWorkout.duration = timerSeconds;

    workoutHistory.push(currentWorkout);
    
    try {
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
        
        if (githubConfig.token) {
            await saveDataToGitHub('workouts', workoutHistory);
        }

        alert('Workout saved successfully!');
        
        // Reset workout state
        currentWorkout = null;
        sessionVideos = [];
        document.getElementById('currentProgram').innerHTML = '<p>Select a program to start your workout</p>';
        document.getElementById('sessionNotes').value = '';
        document.getElementById('videoPreview').innerHTML = '';
        
        document.getElementById('timerContainer').style.display = 'none';
        resetTimer();
        
        loadPrograms();
        loadHistory();
        updateStats();
        
    } catch (error) {
        alert('Error saving workout: ' + error.message);
    }
}

// History management
function loadHistory() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (workoutHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No workout history found.</p>';
        return;
    }

    workoutHistory.slice().reverse().forEach((workout, index) => {
        const actualIndex = workoutHistory.length - 1 - index;
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const completedSets = workout.exercises.reduce((total, exercise) => 
            total + exercise.sets.filter(set => set.completed).length, 0);
        const totalSets = workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
        
        historyItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <h4>${workout.programName}</h4>
                    <p><strong>Date:</strong> ${new Date(workout.date).toLocaleDateString()}</p>
                    <p><strong>Sets Completed:</strong> ${completedSets}/${totalSets}</p>
                    ${workout.sessionNotes ? `<p><strong>Notes:</strong> ${workout.sessionNotes}</p>` : ''}
                </div>
                <button class="btn btn-danger" onclick="deleteWorkout(${actualIndex})">Delete</button>
            </div>
        `;
        historyList.appendChild(historyItem);
    });
}

function deleteWorkout(index) {
    if (!confirm('Are you sure you want to delete this workout?')) return;
    
    workoutHistory.splice(index, 1);
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
    loadHistory();
    updateStats();
    alert('Workout deleted!');
}

// Progress tracking
function saveMeasurement() {
    const date = document.getElementById('measurementDate').value;
    const weight = document.getElementById('weight').value;

    if (!date || !weight) {
        alert('Please enter date and weight');
        return;
    }

    const measurement = {
        id: Date.now(),
        date: date,
        weight: parseFloat(weight),
        bodyFat: document.getElementById('bodyFat').value ? parseFloat(document.getElementById('bodyFat').value) : null,
        created: new Date().toISOString()
    };

    measurements.push(measurement);
    measurements.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('measurements', JSON.stringify(measurements));
    
    // Clear form
    document.getElementById('measurementDate').value = '';
    document.getElementById('weight').value = '';
    document.getElementById('bodyFat').value = '';
    
    loadMeasurements();
    updateMeasurementChart();
    alert('Measurement saved!');
}

function loadMeasurements() {
    const measurementsList = document.getElementById('measurementsList');
    measurementsList.innerHTML = '';

    if (measurements.length === 0) {
        measurementsList.innerHTML = '<p style="text-align: center; color: #666;">No measurements recorded yet.</p>';
        return;
    }

    measurements.slice().reverse().forEach((measurement, index) => {
        const measurementItem = document.createElement('div');
        measurementItem.className = 'measurement-item';
        measurementItem.style.cssText = 'background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px;';
        
        measurementItem.innerHTML = `
            <h4>${new Date(measurement.date).toLocaleDateString()}</h4>
            <p><strong>Weight:</strong> ${measurement.weight}kg</p>
            ${measurement.bodyFat ? `<p><strong>Body Fat:</strong> ${measurement.bodyFat}%</p>` : ''}
            <button class="btn btn-danger btn-sm" onclick="deleteMeasurement(${measurements.length - 1 - index})">Delete</button>
        `;
        measurementsList.appendChild(measurementItem);
    });
}

function deleteMeasurement(index) {
    if (!confirm('Delete this measurement?')) return;
    
    measurements.splice(index, 1);
    localStorage.setItem('measurements', JSON.stringify(measurements));
    loadMeasurements();
    updateMeasurementChart();
}

function updateMeasurementChart() {
    const ctx = document.getElementById('measurementChart');
    if (!ctx) return;

    if (measurementChart) {
        measurementChart.destroy();
    }

    if (measurements.length === 0) return;

    const labels = measurements.map(m => new Date(m.date).toLocaleDateString());
    const weightData = measurements.map(m => m.weight);

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
            }]
        }
    });
}

// Analytics
function updateStats() {
    updatePersonalRecords();
    updateVolumeChart();
}

function updatePersonalRecords() {
    const recordsContainer = document.getElementById('personalRecords');
    
    if (workoutHistory.length === 0) {
        recordsContainer.innerHTML = '<p style="color: #666;">No workout data available.</p>';
        return;
    }
    
    const exerciseRecords = {};
    
    workoutHistory.forEach(workout => {
        workout.exercises.forEach(exercise => {
            if (!exerciseRecords[exercise.name]) {
                exerciseRecords[exercise.name] = { maxWeight: 0 };
            }
            
            exercise.sets.forEach(set => {
                if (set.completed && set.weight) {
                    const weight = parseFloat(set.weight);
                    if (weight > exerciseRecords[exercise.name].maxWeight) {
                        exerciseRecords[exercise.name].maxWeight = weight;
                    }
                }
            });
        });
    });
    
    let recordsHTML = '';
    Object.entries(exerciseRecords).forEach(([exercise, records]) => {
        if (records.maxWeight > 0) {
            recordsHTML += `<p><strong>${exercise}:</strong> ${records.maxWeight}kg</p>`;
        }
    });
    
    recordsContainer.innerHTML = recordsHTML || '<p style="color: #666;">No records found.</p>';
}

function updateVolumeChart() {
    const ctx = document.getElementById('volumeChart');
    if (!ctx) return;

    if (volumeChart) {
        volumeChart.destroy();
    }

    if (workoutHistory.length === 0) return;

    const volumeData = {};
    
    workoutHistory.forEach(workout => {
        const date = new Date(workout.date).toLocaleDateString();
        let totalVolume = 0;
        
        workout.exercises.forEach(exercise => {
            exercise.sets.forEach(set => {
                if (set.completed && set.weight && set.reps) {
                    totalVolume += parseFloat(set.weight) * parseInt(set.reps);
                }
            });
        });
        
        if (totalVolume > 0) {
            volumeData[date] = (volumeData[date] || 0) + totalVolume;
        }
    });

    const labels = Object.keys(volumeData).sort((a, b) => new Date(a) - new Date(b));
    const data = labels.map(date => volumeData[date]);

    volumeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Volume (kg)',
                data: data,
                borderColor: '#1a1a1a',
                backgroundColor: 'rgba(26, 26, 26, 0.1)',
                tension: 0.4
            }]
        }
    });
}

// Data management
function exportData() {
    const exportData = {
        programs: programs,
        workoutHistory: workoutHistory,
        measurements: measurements,
        exportDate: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `training-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (!confirm('This will replace all current data. Continue?')) return;
            
            if (importedData.programs) programs = importedData.programs;
            if (importedData.workoutHistory) workoutHistory = importedData.workoutHistory;
            if (importedData.measurements) measurements = importedData.measurements;
            
            localStorage.setItem('trainingPrograms', JSON.stringify(programs));
            localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
            localStorage.setItem('measurements', JSON.stringify(measurements));
            
            loadPrograms();
            loadHistory();
            loadMeasurements();
            updateStats();
            updateMeasurementChart();
            
            alert('Data imported successfully!');
            
        } catch (error) {
            alert('Error importing data: ' + error.message);
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    if (!confirm('This will permanently delete ALL data. Continue?')) return;
    
    programs = [];
    workoutHistory = [];
    measurements = [];
    
    localStorage.removeItem('trainingPrograms');
    localStorage.removeItem('workoutHistory');
    localStorage.removeItem('measurements');
    
    loadPrograms();
    loadHistory();
    loadMeasurements();
    updateStats();
    updateMeasurementChart();
    
    alert('All data cleared.');
}

// GitHub data loading
async function loadProgramsFromGitHub() {
    if (!githubConfig.token) {
        loadFromStorage('trainingPrograms', 'programs');
        return;
    }

    try {
        const data = await loadDataFromGitHub('programs');
        if (data) {
            programs = data;
        } else {
            loadFromStorage('trainingPrograms', 'programs');
        }
    } catch (error) {
        loadFromStorage('trainingPrograms', 'programs');
    }
}

async function loadWorkoutHistoryFromGitHub() {
    if (!githubConfig.token) {
        loadFromStorage('workoutHistory', 'workoutHistory');
        return;
    }

    try {
        const data = await loadDataFromGitHub('workouts');
        if (data) {
            workoutHistory = data;
        } else {
            loadFromStorage('workoutHistory', 'workoutHistory');
        }
    } catch (error) {
        loadFromStorage('workoutHistory', 'workoutHistory');
    }
}

async function loadMeasurementsFromGitHub() {
    if (!githubConfig.token) {
        loadFromStorage('measurements', 'measurements');
        return;
    }

    try {
        const data = await loadDataFromGitHub('measurements');
        if (data) {
            measurements = data;
        } else {
            loadFromStorage('measurements', 'measurements');
        }
    } catch (error) {
        loadFromStorage('measurements', 'measurements');
    }
}

function loadFromStorage(storageKey, targetArray) {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
        window[targetArray] = JSON.parse(saved);
    }
}

// Progress pictures (simplified)
function handleProgressPictureUpload(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('progressPicturePreview');
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const imageURL = URL.createObjectURL(file);
            const img = document.createElement('img');
            img.src = imageURL;
            img.style.cssText = 'width: 150px; height: 150px; object-fit: cover; margin: 10px; border-radius: 8px;';
            previewContainer.appendChild(img);
            
            progressPictureFiles.push(file);
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

    const pictureEntry = {
        id: Date.now(),
        date: date,
        notes: notes,
        pictures: progressPictureFiles.length,
        created: new Date().toISOString()
    };

    progressPictures.push(pictureEntry);
    localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
    
    document.getElementById('pictureDate').value = '';
    document.getElementById('pictureNotes').value = '';
    document.getElementById('progressPicturePreview').innerHTML = '';
    progressPictureFiles = [];
    
    loadProgressPictures();
    alert('Progress pictures saved!');
}

function loadProgressPictures() {
    const gallery = document.getElementById('picturesGallery');
    if (!gallery) return;
    
    gallery.innerHTML = '';

    if (progressPictures.length === 0) {
        gallery.innerHTML = '<p style="text-align: center; color: #666;">No progress pictures yet.</p>';
        return;
    }

    progressPictures.slice().reverse().forEach((entry, index) => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'picture-entry';
        entryDiv.style.cssText = 'background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 12px;';
        
        entryDiv.innerHTML = `
            <h4>${new Date(entry.date).toLocaleDateString()}</h4>
            ${entry.notes ? `<p><strong>Notes:</strong> ${entry.notes}</p>` : ''}
            <p><strong>Pictures:</strong> ${entry.pictures}</p>
            <button class="btn btn-danger" onclick="deleteProgressPictureEntry(${progressPictures.length - 1 - index})">Delete</button>
        `;
        gallery.appendChild(entryDiv);
    });
}

function deleteProgressPictureEntry(index) {
    if (!confirm('Delete this progress entry?')) return;
    
    progressPictures.splice(index, 1);
    localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
    loadProgressPictures();
}

// Modal functions
function closeModal() {
    document.getElementById('programModal').style.display = 'none';
}

// Click outside modal to close
window.onclick = function(event) {
    const modals = ['programModal', 'workoutDetailsModal', 'editWorkoutModal', 
                   'editMeasurementModal', 'editProgressPicturesModal'];
    
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Search functions
function searchPrograms(query) {
    const programCards = document.querySelectorAll('.program-card');
    const searchQuery = query.toLowerCase().trim();
    
    programCards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(searchQuery) ? 'block' : 'none';
    });
}

function searchHistory(query) {
    const historyItems = document.querySelectorAll('.history-item');
    const searchQuery = query.toLowerCase().trim();
    
    historyItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchQuery) ? 'block' : 'none';
    });
}

// Sync functions
async function syncAllDataWithGitHub() {
    if (!githubConfig.token) {
        alert('Please configure GitHub integration first.');
        return;
    }
    
    try {
        await saveDataToGitHub('programs', programs);
        await saveDataToGitHub('workouts', workoutHistory);
        await saveDataToGitHub('measurements', measurements);
        alert('All data synchronized with GitHub!');
    } catch (error) {
        alert('Error syncing data: ' + error.message);
    }
}
