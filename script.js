// Global variables
let programs = [];
let workoutHistory = [];
let measurements = [];
let progressPhotos = [];
let currentProgramIndex = -1;
let currentWorkout = null;
let sessionVideos = [];
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let editingWorkoutIndex = -1;
let newEditVideos = [];
let newProgressPhotos = [];
let githubConfig = {
    token: '',
    username: '',
    repo: '',
    folder: 'videos',
    photoFolder: 'photos'
};

// Chart instances
let volumeChart = null;
let strengthChart = null;
let measurementChart = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadFromStorage();
    loadPrograms();
    loadHistory();
    updateStats();
    loadGithubConfig();
    loadMeasurements();
    loadProgressPhotos();
    
    // Set default dates
    document.getElementById('measurementDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('photoDate').value = new Date().toISOString().split('T')[0];
    
    // Initialize charts
    initializeCharts();
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
    
    // Update charts when switching to analytics tab
    if (tabName === 'stats') {
        setTimeout(() => {
            updateCharts();
        }, 100);
    }
    
    // Update measurement chart when switching to progress tab
    if (tabName === 'progress') {
        setTimeout(() => {
            updateMeasurementChart();
        }, 100);
    }
}

// Progress tab management
function showProgressTab(tabName) {
    // Hide all progress tabs
    const tabs = document.querySelectorAll('.progress-tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all progress nav buttons
    const navBtns = document.querySelectorAll('.progress-tab-btn');
    navBtns.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked button
    event.target.classList.add('active');
    
    // Update measurement chart if switching to measurements
    if (tabName === 'measurements') {
        setTimeout(() => {
            updateMeasurementChart();
        }, 100);
    }
}

// Initialize charts
function initializeCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
            }
        },
        scales: {
            x: {
                grid: {
                    color: 'rgba(148, 163, 184, 0.1)'
                }
            },
            y: {
                grid: {
                    color: 'rgba(148, 163, 184, 0.1)'
                }
            }
        }
    };

    // Volume Chart
    const volumeCtx = document.getElementById('volumeChart')?.getContext('2d');
    if (volumeCtx) {
        volumeChart = new Chart(volumeCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Total Volume (kg)',
                    data: [],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: chartOptions
        });
    }

    // Strength Chart
    const strengthCtx = document.getElementById('strengthChart')?.getContext('2d');
    if (strengthCtx) {
        strengthChart = new Chart(strengthCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: chartOptions
        });
    }

    // Measurement Chart
    const measurementCtx = document.getElementById('measurementChart')?.getContext('2d');
    if (measurementCtx) {
        measurementChart = new Chart(measurementCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: chartOptions
        });
    }
}

// Update charts based on filters
function updateCharts() {
    const exerciseFilter = document.getElementById('exerciseFilter')?.value || '';
    const periodFilter = parseInt(document.getElementById('periodFilter')?.value || '90');
    
    updateVolumeChart(exerciseFilter, periodFilter);
    updateStrengthChart(exerciseFilter, periodFilter);
    updateExerciseFilter();
}

// Update exercise filter dropdown
function updateExerciseFilter() {
    const exerciseFilter = document.getElementById('exerciseFilter');
    if (!exerciseFilter) return;
    
    const exercises = new Set();
    workoutHistory.forEach(workout => {
        workout.exercises.forEach(exercise => {
            exercises.add(exercise.name);
        });
    });
    
    const currentValue = exerciseFilter.value;
    exerciseFilter.innerHTML = '<option value="">All Exercises</option>';
    
    Array.from(exercises).sort().forEach(exercise => {
        const option = document.createElement('option');
        option.value = exercise;
        option.textContent = exercise;
        if (exercise === currentValue) {
            option.selected = true;
        }
        exerciseFilter.appendChild(option);
    });
}

// Update volume chart
function updateVolumeChart(exerciseFilter, periodFilter) {
    if (!volumeChart) return;
    
    const cutoffDate = periodFilter === 'all' ? new Date(0) : 
                     new Date(Date.now() - periodFilter * 24 * 60 * 60 * 1000);
    
    const filteredWorkouts = workoutHistory
        .filter(workout => new Date(workout.date) >= cutoffDate)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const labels = [];
    const data = [];
    
    filteredWorkouts.forEach(workout => {
        let totalVolume = 0;
        
        workout.exercises.forEach(exercise => {
            if (!exerciseFilter || exercise.name === exerciseFilter) {
                exercise.sets.forEach(set => {
                    if (set.completed && set.weight && set.reps) {
                        totalVolume += parseFloat(set.weight) * parseInt(set.reps);
                    }
                });
            }
        });
        
        if (totalVolume > 0) {
            labels.push(new Date(workout.date).toLocaleDateString());
            data.push(totalVolume);
        }
    });
    
    volumeChart.data.labels = labels;
    volumeChart.data.datasets[0].data = data;
    volumeChart.data.datasets[0].label = exerciseFilter ? 
        `${exerciseFilter} Volume (kg)` : 'Total Volume (kg)';
    volumeChart.update();
}

// Update strength chart
function updateStrengthChart(exerciseFilter, periodFilter) {
    if (!strengthChart) return;
    
    const cutoffDate = periodFilter === 'all' ? new Date(0) : 
                     new Date(Date.now() - periodFilter * 24 * 60 * 60 * 1000);
    
    const exerciseData = {};
    
    workoutHistory
        .filter(workout => new Date(workout.date) >= cutoffDate)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach(workout => {
            workout.exercises.forEach(exercise => {
                if (!exerciseFilter || exercise.name === exerciseFilter) {
                    const maxWeight = Math.max(...exercise.sets
                        .filter(set => set.completed && set.weight)
                        .map(set => parseFloat(set.weight)));
                    
                    if (maxWeight > 0) {
                        if (!exerciseData[exercise.name]) {
                            exerciseData[exercise.name] = [];
                        }
                        exerciseData[exercise.name].push({
                            date: workout.date,
                            weight: maxWeight
                        });
                    }
                }
            });
        });
    
    const datasets = [];
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    let colorIndex = 0;
    
    Object.entries(exerciseData).forEach(([exerciseName, data]) => {
        const color = colors[colorIndex % colors.length];
        colorIndex++;
        
        datasets.push({
            label: exerciseName,
            data: data.map(item => ({
                x: new Date(item.date).toLocaleDateString(),
                y: item.weight
            })),
            borderColor: color,
            backgroundColor: color + '20',
            tension: 0.4
        });
    });
    
    strengthChart.data.datasets = datasets;
    strengthChart.update();
}

// Measurements functionality
function saveMeasurement() {
    const date = document.getElementById('measurementDate').value;
    const weight = document.getElementById('weight').value;
    const bodyFat = document.getElementById('bodyFat').value;
    const muscleMass = document.getElementById('muscleMass').value;
    const chest = document.getElementById('chest').value;
    const waist = document.getElementById('waist').value;
    const arms = document.getElementById('arms').value;
    const thighs = document.getElementById('thighs').value;
    const notes = document.getElementById('measurementNotes').value;
    
    if (!date) {
        alert('Please select a date for the measurement.');
        return;
    }
    
    if (!weight && !bodyFat && !muscleMass && !chest && !waist && !arms && !thighs) {
        alert('Please enter at least one measurement.');
        return;
    }
    
    const measurement = {
        id: Date.now(),
        date: date,
        weight: weight ? parseFloat(weight) : null,
        bodyFat: bodyFat ? parseFloat(bodyFat) : null,
        muscleMass: muscleMass ? parseFloat(muscleMass) : null,
        chest: chest ? parseFloat(chest) : null,
        waist: waist ? parseFloat(waist) : null,
        arms: arms ? parseFloat(arms) : null,
        thighs: thighs ? parseFloat(thighs) : null,
        notes: notes,
        created: new Date().toISOString()
    };
    
    measurements.push(measurement);
    localStorage.setItem('measurements', JSON.stringify(measurements));
    
    // Clear form
    document.getElementById('weight').value = '';
    document.getElementById('bodyFat').value = '';
    document.getElementById('muscleMass').value = '';
    document.getElementById('chest').value = '';
    document.getElementById('waist').value = '';
    document.getElementById('arms').value = '';
    document.getElementById('thighs').value = '';
    document.getElementById('measurementNotes').value = '';
    
    loadMeasurements();
    updateMeasurementChart();
    
    alert('Measurement saved successfully!');
}

function loadMeasurements() {
    const measurementsList = document.getElementById('measurementsList');
    if (!measurementsList) return;
    
    measurementsList.innerHTML = '';
    
    if (measurements.length === 0) {
        measurementsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">No measurements recorded yet. Add your first measurement to start tracking progress.</p>';
        return;
    }
    
    // Sort measurements by date (newest first)
    const sortedMeasurements = measurements.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedMeasurements.forEach(measurement => {
        const measurementItem = document.createElement('div');
        measurementItem.className = 'measurement-item';
        measurementItem.style.cssText = `
            background: var(--background);
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 16px;
            border: 1px solid var(--border);
            transition: all 0.3s ease;
        `;
        
        let measurementHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                <h4>${new Date(measurement.date).toLocaleDateString()}</h4>
                <button class="btn btn-danger btn-sm" onclick="deleteMeasurement(${measurement.id})">Delete</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
        `;
        
        if (measurement.weight) measurementHTML += `<div><strong>Weight:</strong> ${measurement.weight}kg</div>`;
        if (measurement.bodyFat) measurementHTML += `<div><strong>Body Fat:</strong> ${measurement.bodyFat}%</div>`;
        if (measurement.muscleMass) measurementHTML += `<div><strong>Muscle Mass:</strong> ${measurement.muscleMass}kg</div>`;
        if (measurement.chest) measurementHTML += `<div><strong>Chest:</strong> ${measurement.chest}cm</div>`;
        if (measurement.waist) measurementHTML += `<div><strong>Waist:</strong> ${measurement.waist}cm</div>`;
        if (measurement.arms) measurementHTML += `<div><strong>Arms:</strong> ${measurement.arms}cm</div>`;
        if (measurement.thighs) measurementHTML += `<div><strong>Thighs:</strong> ${measurement.thighs}cm</div>`;
        
        measurementHTML += '</div>';
        
        if (measurement.notes) {
            measurementHTML += `<div style="margin-top: 12px;"><strong>Notes:</strong> ${measurement.notes}</div>`;
        }
        
        measurementItem.innerHTML = measurementHTML;
        measurementsList.appendChild(measurementItem);
    });
}

function deleteMeasurement(measurementId) {
    if (!confirm('Are you sure you want to delete this measurement? This cannot be undone.')) {
        return;
    }
    
    measurements = measurements.filter(m => m.id !== measurementId);
    localStorage.setItem('measurements', JSON.stringify(measurements));
    
    loadMeasurements();
    updateMeasurementChart();
    
    alert('Measurement deleted successfully!');
}

function updateMeasurementChart() {
    if (!measurementChart || measurements.length === 0) return;
    
    // Sort measurements by date
    const sortedMeasurements = measurements.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const labels = sortedMeasurements.map(m => new Date(m.date).toLocaleDateString());
    const datasets = [];
    const colors = {
        weight: '#6366f1',
        bodyFat: '#ef4444',
        muscleMass: '#10b981',
        chest: '#f59e0b',
        waist: '#8b5cf6',
        arms: '#06b6d4',
        thighs: '#ec4899'
    };
    
    // Create datasets for each measurement type
    Object.entries(colors).forEach(([key, color]) => {
        const data = sortedMeasurements.map(m => m[key] || null);
        const hasData = data.some(value => value !== null);
        
        if (hasData) {
            datasets.push({
                label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
                data: data,
                borderColor: color,
                backgroundColor: color + '20',
                tension: 0.4,
                spanGaps: true,
                yAxisID: key === 'bodyFat' ? 'y1' : 'y'
            });
        }
    });
    
    measurementChart.data.labels = labels;
    measurementChart.data.datasets = datasets;
    
    // Update scales for dual y-axis
    measurementChart.options.scales = {
        x: {
            grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
            title: { display: true, text: 'Weight/Measurements' }
        },
        y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Body Fat %' }
        }
    };
    
    measurementChart.update();
}

// Progress Photos functionality
function handleProgressPhotoUpload(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('photoPreview');
    
    files.forEach(file => {
        if (file.type.startsWith('image/')) {
            const photoId = Date.now() + Math.random().toString(36).substr(2, 5);
            
            const photoInfo = {
                id: photoId,
                name: file.name,
                size: file.size,
                type: file.type,
                file: file,
                lastModified: file.lastModified
            };
            
            newProgressPhotos.push(photoInfo);
            
            // Create preview
            const photoURL = URL.createObjectURL(file);
            const photoContainer = document.createElement('div');
            photoContainer.className = 'photo-preview-item';
            
            photoContainer.innerHTML = `
                <img src="${photoURL}" alt="${file.name}">
                <button class="photo-remove-btn" onclick="removeNewPhoto('${photoId}')">&times;</button>
            `;
            
            previewContainer.appendChild(photoContainer);
        }
    });
}

function removeNewPhoto(photoId) {
    newProgressPhotos = newProgressPhotos.filter(p => p.id !== photoId);
    
    // Remove from preview
    const previewContainer = document.getElementById('photoPreview');
    const photoElements = previewContainer.querySelectorAll('.photo-preview-item');
    photoElements.forEach(element => {
        if (element.innerHTML.includes(photoId)) {
            element.remove();
        }
    });
}

function saveProgressPhotos() {
    if (newProgressPhotos.length === 0) {
        alert('Please select at least one photo to save.');
        return;
    }
    
    const date = document.getElementById('photoDate').value;
    const notes = document.getElementById('photoNotes').value;
    
    if (!date) {
        alert('Please select a date for the photos.');
        return;
    }
    
    const photoSession = {
        id: Date.now(),
        date: date,
        notes: notes,
        photos: newProgressPhotos.map(photo => ({
            id: photo.id,
            name: photo.name,
            size: photo.size,
            type: photo.type,
            dataUrl: null, // Will be populated when we read the file
            githubUrl: null
        })),
        created: new Date().toISOString()
    };
    
    // Read files as data URLs for local storage
    Promise.all(newProgressPhotos.map(photo => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const photoData = photoSession.photos.find(p => p.id === photo.id);
                if (photoData) {
                    photoData.dataUrl = e.target.result;
                }
                resolve();
            };
            reader.readAsDataURL(photo.file);
        });
    })).then(() => {
        progressPhotos.push(photoSession);
        localStorage.setItem('progressPhotos', JSON.stringify(progressPhotos));
        
        // Clear form
        document.getElementById('photoNotes').value = '';
        document.getElementById('photoPreview').innerHTML = '';
        newProgressPhotos = [];
        
        loadProgressPhotos();
        alert('Progress photos saved successfully!');
    });
}

function loadProgressPhotos() {
    const photoHistory = document.getElementById('photoHistory');
    if (!photoHistory) return;
    
    photoHistory.innerHTML = '';
    
    if (progressPhotos.length === 0) {
        photoHistory.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">No progress photos yet. Upload your first photos to start tracking visual progress.</p>';
        return;
    }
    
    // Sort by date (newest first)
    const sortedPhotos = progressPhotos.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedPhotos.forEach((session, sessionIndex) => {
        const sessionDiv = document.createElement('div');
        sessionDiv.className = 'photo-session';
        sessionDiv.style.cssText = `
            background: var(--background);
            padding: 24px;
            border-radius: 16px;
            margin-bottom: 24px;
            border: 1px solid var(--border);
        `;
        
        let sessionHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
                <div>
                    <h4 class="photo-date">${new Date(session.date).toLocaleDateString()}</h4>
                    ${session.notes ? `<p class="photo-notes">${session.notes}</p>` : ''}
                </div>
                <button class="btn btn-danger btn-sm" onclick="deletePhotoSession(${session.id})">Delete Session</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px;">
        `;
        
        session.photos.forEach((photo, photoIndex) => {
            const displayUrl = photo.githubUrl ? 
                photo.githubUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/') : 
                photo.dataUrl;
                
            sessionHTML += `
                <div class="photo-history-item" style="margin: 0;">
                    <img src="${displayUrl}" alt="${photo.name}" onclick="viewPhotoFullsize('${displayUrl}', '${photo.name}')">
                    <div style="padding: 8px 0;">
                        <small style="color: var(--text-secondary);">${photo.name}</small>
                        <div style="margin-top: 8px;">
                            ${photo.githubUrl ? 
                                `<a href="${photo.githubUrl}" target="_blank" class="btn btn-sm" style="margin-right: 8px;">View on GitHub</a>` : 
                                ''}
                            <button class="btn btn-danger btn-sm" onclick="deletePhotoFromSession(${session.id}, '${photo.id}')">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        sessionHTML += '</div>';
        sessionDiv.innerHTML = sessionHTML;
        photoHistory.appendChild(sessionDiv);
    });
}

function deletePhotoSession(sessionId) {
    if (!confirm('Are you sure you want to delete this entire photo session? This cannot be undone.')) {
        return;
    }
    
    progressPhotos = progressPhotos.filter(session => session.id !== sessionId);
    localStorage.setItem('progressPhotos', JSON.stringify(progressPhotos));
    
    loadProgressPhotos();
    alert('Photo session deleted successfully!');
}

function deletePhotoFromSession(sessionId, photoId) {
    if (!confirm('Are you sure you want to delete this photo? This cannot be undone.')) {
        return;
    }
    
    const session = progressPhotos.find(s => s.id === sessionId);
    if (session) {
        session.photos = session.photos.filter(p => p.id !== photoId);
        if (session.photos.length === 0) {
            // Delete entire session if no photos left
            progressPhotos = progressPhotos.filter(s => s.id !== sessionId);
        }
        localStorage.setItem('progressPhotos', JSON.stringify(progressPhotos));
        
        loadProgressPhotos();
        alert('Photo deleted successfully!');
    }
}

function viewPhotoFullsize(photoUrl, photoName) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'photoViewModal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-height: 90%; padding: 20px;">
            <span class="close" onclick="closePhotoModal()">&times;</span>
            <h3 style="margin-bottom: 20px;">${photoName}</h3>
            <img src="${photoUrl}" style="max-width: 100%; max-height: 70vh; border-radius: 12px;" alt="${photoName}">
        </div>
    `;
    
    document.body.appendChild(modal);
}

function closePhotoModal() {
    const modal = document.getElementById('photoViewModal');
    if (modal) {
        modal.remove();
    }
}

function filterPhotos() {
    const filterValue = document.getElementById('photoDateFilter').value;
    // This would filter the photos based on the selected period
    // For now, we'll just reload all photos
    loadProgressPhotos();
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

// Enhanced GitHub configuration
function loadGithubConfig() {
    const savedConfig = localStorage.getItem('githubConfig');
    if (savedConfig) {
        githubConfig = JSON.parse(savedConfig);
        document.getElementById('githubToken').value = githubConfig.token || '';
        document.getElementById('githubUsername').value = githubConfig.username || '';
        document.getElementById('githubRepo').value = githubConfig.repo || '';
        document.getElementById('githubFolder').value = githubConfig.folder || 'videos';
        document.getElementById('githubPhotoFolder').value = githubConfig.photoFolder || 'photos';
    }
}

function saveGithubConfig() {
    githubConfig = {
        token: document.getElementById('githubToken').value.trim(),
        username: document.getElementById('githubUsername').value.trim(),
        repo: document.getElementById('githubRepo').value.trim(),
        folder: document.getElementById('githubFolder').value.trim() || 'videos',
        photoFolder: document.getElementById('githubPhotoFolder').value.trim() || 'photos'
    };
    
    localStorage.setItem('githubConfig', JSON.stringify(githubConfig));
    alert('GitHub configuration saved successfully!');
}

function testGithubConnection() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please complete all GitHub configuration fields first.');
        return;
    }
    
    fetch(`https://api.github.com/user/repos`, {
        method: 'GET',
        headers: {
            'Authorization': `token ${githubConfig.token}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    })
    .then(response => {
        if (response.ok) {
            alert('GitHub connection successful!');
        } else {
            alert('GitHub connection failed. Please check your credentials.');
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
            return true;
        }
        
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
            return false;
        }
        
        const mainBranchData = await mainBranchResponse.json();
        const mainSha = mainBranchData.object.sha;
        
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
    
    if (sessionVideos.length === 0) {
        alert('No videos to upload. Please select videos first.');
        return;
    }
    
    const branchExists = await ensureVideoUploadsBranch();
    if (!branchExists) {
        alert('Could not create or access the video-uploads branch.');
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
    
    for (let i = 0; i < sessionVideos.length; i++) {
        const video = sessionVideos[i];
        
        try {
            progressBar.style.width = `${((i / sessionVideos.length) * 100).toFixed(0)}%`;
            
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
    
    if (successCount > 0) {
        localStorage.setItem('sessionVideos', JSON.stringify(sessionVideos));
    }
}

async function uploadPhotosToGitHub() {
    if (newProgressPhotos.length === 0) {
        alert('No new photos to upload. Please select photos first.');
        return;
    }
    
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration in the Settings tab first.');
        showTab('settings');
        return;
    }
    
    const branchExists = await ensureVideoUploadsBranch();
    if (!branchExists) {
        alert('Could not create or access the upload branch.');
        return;
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < newProgressPhotos.length; i++) {
        const photo = newProgressPhotos[i];
        
        try {
            const base64Data = await readFileAsBase64(photo.file);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileExtension = photo.name.split('.').pop();
            const fileName = `progress-photo-${timestamp}.${fileExtension}`;
            const filePath = githubConfig.photoFolder ? `${githubConfig.photoFolder}/${fileName}` : fileName;
            
            const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;
            
            const response = await fetch(apiUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubConfig.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Upload progress photo: ${fileName}`,
                    content: base64Data.split(',')[1],
                    branch: 'video-uploads'
                })
            });
            
            if (response.ok) {
                successCount++;
                photo.githubUrl = `https://github.com/${githubConfig.username}/${githubConfig.repo}/blob/video-uploads/${filePath}`;
            } else {
                errorCount++;
            }
        } catch (error) {
            errorCount++;
            console.error('Error uploading photo:', error);
        }
    }
    
    alert(`Photo upload complete: ${successCount} successful, ${errorCount} failed`);
}

// Enhanced data loading
function loadFromStorage() {
    const savedPrograms = localStorage.getItem('trainingPrograms');
    const savedHistory = localStorage.getItem('workoutHistory');
    const savedVideos = localStorage.getItem('sessionVideos');
    const savedMeasurements = localStorage.getItem('measurements');
    const savedPhotos = localStorage.getItem('progressPhotos');
    
    if (savedPrograms) programs = JSON.parse(savedPrograms);
    if (savedHistory) workoutHistory = JSON.parse(savedHistory);
    if (savedVideos) sessionVideos = JSON.parse(savedVideos);
    if (savedMeasurements) measurements = JSON.parse(savedMeasurements);
    if (savedPhotos) progressPhotos = JSON.parse(savedPhotos);
}

// Enhanced clear all data function
function clearAllData() {
    if (confirm('Are you sure you want to delete ALL data including programs, workout history, measurements, photos, and settings? This cannot be undone.')) {
        if (confirm('This will permanently delete ALL your data. Are you absolutely sure?')) {
            programs = [];
            workoutHistory = [];
            measurements = [];
            progressPhotos = [];
            sessionVideos = [];
            githubConfig = {
                token: '',
                username: '',
                repo: '',
                folder: 'videos',
                photoFolder: 'photos'
            };
            localStorage.clear();
            loadPrograms();
            loadHistory();
            loadMeasurements();
            loadProgressPhotos();
            updateStats();
            loadGithubConfig();
            alert('All data has been cleared.');
        }
    }
}

// Enhanced export data function
function exportData() {
    const data = {
        programs: programs,
        workoutHistory: workoutHistory,
        measurements: measurements,
        progressPhotos: progressPhotos.map(session => ({
            ...session,
            photos: session.photos.map(photo => ({
                ...photo,
                dataUrl: null // Don't export large data URLs
            }))
        })),
        exportDate: new Date().toISOString(),
        version: "2.0"
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// Enhanced import data function
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
                measurements = data.measurements || [];
                progressPhotos = data.progressPhotos || [];
                
                localStorage.setItem('trainingPrograms', JSON.stringify(programs));
                localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
                localStorage.setItem('measurements', JSON.stringify(measurements));
                localStorage.setItem('progressPhotos', JSON.stringify(progressPhotos));
                
                loadPrograms();
                loadHistory();
                loadMeasurements();
                loadProgressPhotos();
                updateStats();
                updateCharts();
                updateMeasurementChart();
                alert('Data imported successfully!');
            }
        } catch (error) {
            alert('Error importing data. Please check the file format.');
        }
    };
    reader.readAsText(file);
}

// Enhanced updateStats function
function updateStats() {
    // Personal Records
    const prContainer = document.getElementById('personalRecords');
    if (!prContainer) return;
    
    const exerciseMaxes = {};
    
    workoutHistory.forEach(workout => {
        workout.exercises.forEach(exercise => {
            if (!exerciseMaxes[exercise.name]) {
                exerciseMaxes[exercise.name] = { 
                    maxWeight: 0, 
                    maxVolume: 0, 
                    maxReps: 0,
                    maxWeightDate: null,
                    maxVolumeDate: null,
                    maxRepsDate: null
                };
            }
            
            exercise.sets.forEach(set => {
                if (set.weight && set.reps && set.completed) {
                    const weight = parseFloat(set.weight);
                    const reps = parseInt(set.reps);
                    const volume = weight * reps;
                    
                    if (weight > exerciseMaxes[exercise.name].maxWeight) {
                        exerciseMaxes[exercise.name].maxWeight = weight;
                        exerciseMaxes[exercise.name].maxWeightDate = workout.date;
                    }
                    if (volume > exerciseMaxes[exercise.name].maxVolume) {
                        exerciseMaxes[exercise.name].maxVolume = volume;
                        exerciseMaxes[exercise.name].maxVolumeDate = workout.date;
                    }
                    if (reps > exerciseMaxes[exercise.name].maxReps) {
                        exerciseMaxes[exercise.name].maxReps = reps;
                        exerciseMaxes[exercise.name].maxRepsDate = workout.date;
                    }
                }
            });
        });
    });

    if (Object.keys(exerciseMaxes).length === 0) {
        prContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No personal records yet. Complete some workouts to see your progress here.</p>';
    } else {
        prContainer.innerHTML = Object.entries(exerciseMaxes)
            .sort(([,a], [,b]) => b.maxWeight - a.maxWeight)
            .slice(0, 10)
            .map(([exercise, maxes]) => `
                <div style="margin-bottom: 20px; padding: 16px; background: var(--background); border-radius: 12px; border: 1px solid var(--border);">
                    <strong style="font-size: 1.1em; color: var(--text-primary);">${exercise}</strong><br>
                    <div style="margin-top: 8px; display: grid; gap: 4px;">
                        <div style="color: var(--text-secondary);">Max Weight: <span style="color: var(--primary-color); font-weight: 600;">${maxes.maxWeight}kg</span> <small>(${new Date(maxes.maxWeightDate).toLocaleDateString()})</small></div>
                        <div style="color: var(--text-secondary);">Max Volume: <span style="color: var(--accent-color); font-weight: 600;">${maxes.maxVolume.toFixed(1)}kg</span> <small>(${new Date(maxes.maxVolumeDate).toLocaleDateString()})</small></div>
                        <div style="color: var(--text-secondary);">Max Reps: <span style="color: var(--warning-color); font-weight: 600;">${maxes.maxReps}</span> <small>(${new Date(maxes.maxRepsDate).toLocaleDateString()})</small></div>
                    </div>
                </div>
            `).join('');
    }

    // Frequency Analysis
    const frequencyContainer = document.getElementById('frequencyAnalysis');
    if (!frequencyContainer) return;
    
    const exerciseFrequency = {};
    const recentWorkouts = workoutHistory.filter(workout => 
        new Date(workout.date) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    recentWorkouts.forEach(workout => {
        workout.exercises.forEach(exercise => {
            exerciseFrequency[exercise.name] = (exerciseFrequency[exercise.name] || 0) + 1;
        });
    });

    if (Object.keys(exerciseFrequency).length === 0) {
        frequencyContainer.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No recent activity. Complete some workouts to see frequency analysis.</p>';
    } else {
        frequencyContainer.innerHTML = `
            <div style="margin-bottom: 16px;">
                <strong style="color: var(--text-primary);">Last 30 Days</strong>
            </div>
        ` + Object.entries(exerciseFrequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8)
            .map(([exercise, count]) => {
                const percentage = Math.round((count / recentWorkouts.length) * 100);
                return `
                    <div style="margin-bottom: 16px; padding: 12px; background: var(--background); border-radius: 8px; border: 1px solid var(--border);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <strong style="color: var(--text-primary);">${exercise}</strong>
                            <span style="color: var(--primary-color); font-weight: 600;">${count} sessions</span>
                        </div>
                        <div style="width: 100%; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;">
                            <div style="width: ${percentage}%; height: 100%; background: var(--gradient-primary); transition: width 0.3s ease;"></div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    updateExerciseFilter();
}

// Core workout management functions
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
        programList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">No programs found. Create your first program to get started.</p>';
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
                <div class="set-row" style="font-weight: bold; background: rgba(99, 102, 241, 0.1);">
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
        
        // Update session notes
        const sessionNotes = document.getElementById('editSessionNotes').value;
        workout.sessionNotes = sessionNotes;
        
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
