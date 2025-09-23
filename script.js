// Training Logger with Complete GitHub Integration
// Global variables
let currentProgram = null;
let workoutTimer = null;
let timerSeconds = 0;
let isTimerRunning = false;
let currentWorkoutData = null;
let editingWorkoutId = null;
let editingMeasurementId = null;
let editingProgressPicturesId = null;

// GitHub configuration
let githubConfig = {
    token: '',
    username: '',
    repo: '',
    folder: 'data'
};

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    loadGithubConfig();
    loadPrograms();
    loadWorkoutHistory();
    loadMeasurements();
    loadProgressPictures();
    updateAnalytics();
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    const measurementDate = document.getElementById('measurementDate');
    const pictureDate = document.getElementById('pictureDate');
    if (measurementDate) measurementDate.value = today;
    if (pictureDate) pictureDate.value = today;
});

// =============================================================================
// GITHUB INTEGRATION CORE FUNCTIONS
// =============================================================================

async function makeGithubRequest(endpoint, method = 'GET', data = null) {
    const config = getGithubConfig();
    if (!config.token || !config.username || !config.repo) {
        throw new Error('GitHub configuration is incomplete');
    }

    const headers = {
        'Authorization': `token ${config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };

    const options = {
        method,
        headers
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(`https://api.github.com/repos/${config.username}/${config.repo}/${endpoint}`, options);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`GitHub API Error: ${response.status} - ${error.message}`);
    }

    return response.json();
}

async function getFileFromGitHub(filename) {
    try {
        const config = getGithubConfig();
        const path = config.folder ? `${config.folder}/${filename}` : filename;
        const response = await makeGithubRequest(`contents/${path}`);
        const content = atob(response.content.replace(/\n/g, ''));
        return {
            content: JSON.parse(content),
            sha: response.sha
        };
    } catch (error) {
        if (error.message.includes('404')) {
            return null; // File doesn't exist
        }
        throw error;
    }
}

async function saveFileToGitHub(filename, data, commitMessage, sha = null) {
    try {
        const config = getGithubConfig();
        const path = config.folder ? `${config.folder}/${filename}` : filename;
        
        const fileData = {
            message: commitMessage,
            content: btoa(JSON.stringify(data, null, 2)),
            branch: 'main'
        };

        if (sha) {
            fileData.sha = sha;
        }

        await makeGithubRequest(`contents/${path}`, 'PUT', fileData);
        return true;
    } catch (error) {
        console.error('Error saving to GitHub:', error);
        showMessage(`GitHub sync failed: ${error.message}`, 'error');
        return false;
    }
}

async function deleteFileFromGitHub(filename) {
    try {
        const config = getGithubConfig();
        const path = config.folder ? `${config.folder}/${filename}` : filename;
        
        // Get file SHA first
        const fileInfo = await makeGithubRequest(`contents/${path}`);
        
        await makeGithubRequest(`contents/${path}`, 'DELETE', {
            message: `Delete ${filename}`,
            sha: fileInfo.sha,
            branch: 'main'
        });
        return true;
    } catch (error) {
        console.error('Error deleting from GitHub:', error);
        return false;
    }
}

// =============================================================================
// DATA MANAGEMENT WITH GITHUB SYNC
// =============================================================================

function getStorageKey(type) {
    const keys = {
        programs: 'trainingPrograms',
        workouts: 'workoutHistory',
        measurements: 'bodyMeasurements',
        progressPictures: 'progressPictures',
        github: 'githubConfig'
    };
    return keys[type] || type;
}

function getGithubFilename(type) {
    const date = new Date().toISOString().split('T')[0];
    return `${type}-${date}.json`;
}

async function loadDataFromStorage(type) {
    const key = getStorageKey(type);
    const localData = JSON.parse(localStorage.getItem(key) || '[]');
    
    // Try to sync with GitHub if configured
    if (isGithubConfigured()) {
        try {
            const filename = getGithubFilename(type);
            const githubData = await getFileFromGitHub(filename);
            
            if (githubData && githubData.content.data) {
                // Merge or use GitHub data
                localStorage.setItem(key, JSON.stringify(githubData.content.data));
                return githubData.content.data;
            }
        } catch (error) {
            console.warn(`Failed to load ${type} from GitHub:`, error);
        }
    }
    
    return localData;
}

async function saveDataToStorage(type, data) {
    const key = getStorageKey(type);
    
    // Save locally first
    localStorage.setItem(key, JSON.stringify(data));
    
    // Auto-sync to GitHub if configured
    if (isGithubConfigured()) {
        try {
            const filename = getGithubFilename(type);
            const dataStructure = {
                type: type,
                data: data,
                lastUpdated: new Date().toISOString()
            };
            
            // Get existing file SHA if it exists
            const existing = await getFileFromGitHub(filename);
            const sha = existing ? existing.sha : null;
            
            await saveFileToGitHub(
                filename, 
                dataStructure, 
                `Update ${type} data - ${new Date().toLocaleString()}`,
                sha
            );
            
            showMessage(`${type} synced to GitHub successfully`, 'success');
        } catch (error) {
            console.error(`Failed to sync ${type} to GitHub:`, error);
            showMessage(`Local save successful, GitHub sync failed: ${error.message}`, 'warning');
        }
    }
}

function isGithubConfigured() {
    const config = getGithubConfig();
    return config.token && config.username && config.repo;
}

// =============================================================================
// PROGRAMS MANAGEMENT
// =============================================================================

async function loadPrograms() {
    try {
        const programs = await loadDataFromStorage('programs');
        displayPrograms(programs);
    } catch (error) {
        console.error('Error loading programs:', error);
        displayPrograms([]);
    }
}

function displayPrograms(programs) {
    const programList = document.getElementById('programList');
    if (!programList) return;

    if (programs.length === 0) {
        programList.innerHTML = '<p style="text-align: center; color: #666; font-size: 1.2em; font-weight: 600;">No programs created yet. Create your first program!</p>';
        return;
    }

    programList.innerHTML = programs.map(program => `
        <div class="program-card" onclick="selectProgram('${program.id}')">
            <h3>${program.name}</h3>
            <p>${program.description || 'No description'}</p>
            <p><strong>${program.exercises.length}</strong> exercises</p>
            <div class="btn-group" onclick="event.stopPropagation()">
                <button class="btn btn-sm" onclick="editProgram('${program.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProgram('${program.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function selectProgram(programId) {
    const programs = await loadDataFromStorage('programs');
    currentProgram = programs.find(p => p.id === programId);
    
    if (!currentProgram) return;

    showTab('workout');
    displayCurrentWorkout();
    showTimer();
}

function displayCurrentWorkout() {
    const container = document.getElementById('currentProgram');
    if (!container || !currentProgram) return;

    container.innerHTML = `
        <div class="exercise-card">
            <h3>${currentProgram.name}</h3>
            <p>${currentProgram.description}</p>
        </div>
        <div id="workoutExercises">
            ${currentProgram.exercises.map(exercise => `
                <div class="exercise-card" data-exercise="${exercise.name}">
                    <div class="exercise-header">
                        <h4 class="exercise-name">${exercise.name}</h4>
                    </div>
                    <div class="sets-container">
                        ${generateSetsHTML(exercise)}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function generateSetsHTML(exercise) {
    const sets = exercise.sets || 3;
    return Array.from({ length: sets }, (_, i) => `
        <div class="set-row">
            <span>Set ${i + 1}</span>
            <input type="number" class="set-input" placeholder="Reps" data-set="${i}" data-field="reps">
            <input type="number" class="set-input" placeholder="Weight" data-set="${i}" data-field="weight" step="0.5">
            <input type="number" class="set-input" placeholder="RPE" data-set="${i}" data-field="rpe" min="1" max="10">
            <input type="text" class="set-input" placeholder="Notes" data-set="${i}" data-field="notes">
            <button class="btn btn-sm btn-success" onclick="markSetComplete(this)">✓</button>
        </div>
    `).join('');
}

function createProgram() {
    document.getElementById('modalTitle').textContent = 'Create New Program';
    document.getElementById('programName').value = '';
    document.getElementById('programDescription').value = '';
    document.getElementById('exerciseList').innerHTML = '';
    addExercise(); // Add first exercise
    document.getElementById('programModal').style.display = 'block';
}

async function editProgram(programId) {
    const programs = await loadDataFromStorage('programs');
    const program = programs.find(p => p.id === programId);
    if (!program) return;

    document.getElementById('modalTitle').textContent = 'Edit Program';
    document.getElementById('programName').value = program.name;
    document.getElementById('programDescription').value = program.description || '';
    
    const exerciseList = document.getElementById('exerciseList');
    exerciseList.innerHTML = '';
    
    program.exercises.forEach(exercise => {
        addExercise(exercise);
    });
    
    // Store the program ID for editing
    document.getElementById('programModal').dataset.editingId = programId;
    document.getElementById('programModal').style.display = 'block';
}

function addExercise(exerciseData = null) {
    const exerciseList = document.getElementById('exerciseList');
    const exerciseId = Date.now().toString();
    
    const exerciseHTML = `
        <div class="exercise-card" data-exercise-id="${exerciseId}">
            <div class="exercise-header">
                <input type="text" class="exercise-name-input" placeholder="Exercise name" value="${exerciseData?.name || ''}" required>
                <button class="btn btn-sm btn-danger" onclick="removeExercise('${exerciseId}')">Remove</button>
            </div>
            <div class="form-group">
                <label>Sets</label>
                <input type="number" class="sets-input" min="1" max="20" value="${exerciseData?.sets || 3}">
            </div>
            <div class="form-group">
                <label>Notes (optional)</label>
                <textarea class="exercise-notes" rows="2" placeholder="Form cues, tempo, etc.">${exerciseData?.notes || ''}</textarea>
            </div>
        </div>
    `;
    
    exerciseList.insertAdjacentHTML('beforeend', exerciseHTML);
}

function removeExercise(exerciseId) {
    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
    if (exerciseCard) {
        exerciseCard.remove();
    }
}

async function saveProgram() {
    const name = document.getElementById('programName').value.trim();
    if (!name) {
        alert('Program name is required');
        return;
    }

    const exercises = [];
    const exerciseCards = document.querySelectorAll('#exerciseList .exercise-card');
    
    exerciseCards.forEach(card => {
        const exerciseName = card.querySelector('.exercise-name-input').value.trim();
        const sets = parseInt(card.querySelector('.sets-input').value) || 3;
        const notes = card.querySelector('.exercise-notes').value.trim();
        
        if (exerciseName) {
            exercises.push({
                name: exerciseName,
                sets: sets,
                notes: notes
            });
        }
    });

    if (exercises.length === 0) {
        alert('At least one exercise is required');
        return;
    }

    const programs = await loadDataFromStorage('programs');
    const modal = document.getElementById('programModal');
    const editingId = modal.dataset.editingId;

    const programData = {
        id: editingId || Date.now().toString(),
        name: name,
        description: document.getElementById('programDescription').value.trim(),
        exercises: exercises,
        created: editingId ? programs.find(p => p.id === editingId)?.created : new Date().toISOString(),
        modified: new Date().toISOString()
    };

    if (editingId) {
        const index = programs.findIndex(p => p.id === editingId);
        if (index !== -1) {
            programs[index] = programData;
        }
        delete modal.dataset.editingId;
    } else {
        programs.push(programData);
    }

    await saveDataToStorage('programs', programs);
    await loadPrograms();
    closeModal();
}

async function deleteProgram(programId) {
    if (!confirm('Are you sure you want to delete this program?')) return;

    const programs = await loadDataFromStorage('programs');
    const filteredPrograms = programs.filter(p => p.id !== programId);
    
    await saveDataToStorage('programs', filteredPrograms);
    await loadPrograms();
}

// =============================================================================
// WORKOUT MANAGEMENT
// =============================================================================

async function saveWorkout() {
    if (!currentProgram) {
        alert('No program selected');
        return;
    }

    const workoutData = {
        id: Date.now().toString(),
        programId: currentProgram.id,
        programName: currentProgram.name,
        date: new Date().toISOString(),
        duration: timerSeconds,
        exercises: [],
        notes: document.getElementById('sessionNotes').value.trim(),
        videos: currentWorkoutData?.videos || []
    };

    // Collect exercise data
    const exerciseCards = document.querySelectorAll('#workoutExercises .exercise-card');
    exerciseCards.forEach(card => {
        const exerciseName = card.dataset.exercise;
        const sets = [];
        
        const setRows = card.querySelectorAll('.set-row');
        setRows.forEach(row => {
            const setData = {
                reps: parseInt(row.querySelector('[data-field="reps"]').value) || null,
                weight: parseFloat(row.querySelector('[data-field="weight"]').value) || null,
                rpe: parseInt(row.querySelector('[data-field="rpe"]').value) || null,
                notes: row.querySelector('[data-field="notes"]').value.trim(),
                completed: row.classList.contains('completed')
            };
            
            // Only save sets with some data
            if (setData.reps || setData.weight || setData.notes) {
                sets.push(setData);
            }
        });

        if (sets.length > 0) {
            workoutData.exercises.push({
                name: exerciseName,
                sets: sets
            });
        }
    });

    if (workoutData.exercises.length === 0) {
        alert('No exercise data to save');
        return;
    }

    const workouts = await loadDataFromStorage('workouts');
    workouts.push(workoutData);
    
    await saveDataToStorage('workouts', workouts);
    
    // Reset workout state
    currentProgram = null;
    currentWorkoutData = null;
    resetTimer();
    hideTimer();
    document.getElementById('currentProgram').innerHTML = '<p>Select a program to start your workout</p>';
    document.getElementById('sessionNotes').value = '';
    
    showMessage('Workout saved successfully!', 'success');
    showTab('history');
    await loadWorkoutHistory();
}

async function loadWorkoutHistory() {
    try {
        const workouts = await loadDataFromStorage('workouts');
        displayWorkoutHistory(workouts);
    } catch (error) {
        console.error('Error loading workout history:', error);
        displayWorkoutHistory([]);
    }
}

function displayWorkoutHistory(workouts) {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    if (workouts.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #666;">No workout history yet.</p>';
        return;
    }

    // Sort by date (newest first)
    const sortedWorkouts = workouts.sort((a, b) => new Date(b.date) - new Date(a.date));

    historyList.innerHTML = sortedWorkouts.map(workout => {
        const date = new Date(workout.date).toLocaleDateString();
        const duration = formatDuration(workout.duration || 0);
        const exerciseCount = workout.exercises.length;
        const totalSets = workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0);

        return `
            <div class="history-item" onclick="showWorkoutDetails('${workout.id}')">
                <h4>${workout.programName}</h4>
                <p><strong>Date:</strong> ${date}</p>
                <p><strong>Duration:</strong> ${duration}</p>
                <p><strong>Exercises:</strong> ${exerciseCount} (${totalSets} sets)</p>
                ${workout.notes ? `<p><strong>Notes:</strong> ${workout.notes}</p>` : ''}
                ${workout.videos && workout.videos.length > 0 ? `<p><strong>Videos:</strong> ${workout.videos.length}</p>` : ''}
            </div>
        `;
    }).join('');
}

async function showWorkoutDetails(workoutId) {
    const workouts = await loadDataFromStorage('workouts');
    const workout = workouts.find(w => w.id === workoutId);
    if (!workout) return;

    const modal = document.getElementById('workoutDetailsModal');
    const title = document.getElementById('workoutDetailsTitle');
    const content = document.getElementById('workoutDetailsContent');

    title.textContent = `${workout.programName} - ${new Date(workout.date).toLocaleDateString()}`;

    let detailsHTML = `
        <div class="workout-details">
            <p><strong>Duration:</strong> ${formatDuration(workout.duration || 0)}</p>
            ${workout.notes ? `<p><strong>Session Notes:</strong> ${workout.notes}</p>` : ''}
            
            <h3>Exercises</h3>
            ${workout.exercises.map(exercise => `
                <div class="exercise-detail">
                    <h4>${exercise.name}</h4>
                    <div class="sets-detail">
                        ${exercise.sets.map((set, index) => `
                            <div class="set-detail">
                                <span>Set ${index + 1}:</span>
                                ${set.reps ? `${set.reps} reps` : ''} 
                                ${set.weight ? `@ ${set.weight}kg` : ''} 
                                ${set.rpe ? `(RPE ${set.rpe})` : ''}
                                ${set.notes ? `- ${set.notes}` : ''}
                                ${set.completed ? ' ✓' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
            
            ${workout.videos && workout.videos.length > 0 ? `
                <h3>Videos</h3>
                <div class="video-list">
                    ${workout.videos.map(video => `
                        <div class="video-item">
                            <p>${video.name}</p>
                            ${video.url ? `<a href="${video.url}" target="_blank">View on GitHub</a>` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;

    content.innerHTML = detailsHTML;
    modal.style.display = 'block';
    
    // Store workout ID for editing/deleting
    modal.dataset.workoutId = workoutId;
}

async function editWorkoutFromDetails() {
    const modal = document.getElementById('workoutDetailsModal');
    const workoutId = modal.dataset.workoutId;
    if (!workoutId) return;

    closeWorkoutDetails();
    await editWorkout(workoutId);
}

async function deleteWorkoutFromDetails() {
    const modal = document.getElementById('workoutDetailsModal');
    const workoutId = modal.dataset.workoutId;
    if (!workoutId) return;

    if (!confirm('Are you sure you want to delete this workout?')) return;

    const workouts = await loadDataFromStorage('workouts');
    const filteredWorkouts = workouts.filter(w => w.id !== workoutId);
    
    await saveDataToStorage('workouts', filteredWorkouts);
    await loadWorkoutHistory();
    closeWorkoutDetails();
    showMessage('Workout deleted successfully', 'success');
}

// =============================================================================
// MEASUREMENTS MANAGEMENT
// =============================================================================

async function loadMeasurements() {
    try {
        const measurements = await loadDataFromStorage('measurements');
        displayMeasurementsChart(measurements);
        displayMeasurementsList(measurements);
    } catch (error) {
        console.error('Error loading measurements:', error);
        displayMeasurementsChart([]);
        displayMeasurementsList([]);
    }
}

async function saveMeasurement() {
    const date = document.getElementById('measurementDate').value;
    const weight = parseFloat(document.getElementById('weight').value);
    
    if (!date || !weight) {
        alert('Date and weight are required');
        return;
    }

    const measurements = await loadDataFromStorage('measurements');
    
    const measurementData = {
        id: Date.now().toString(),
        date: date,
        weight: weight,
        bodyFat: parseFloat(document.getElementById('bodyFat').value) || null,
        muscleMass: parseFloat(document.getElementById('muscleMass').value) || null,
        created: new Date().toISOString()
    };

    measurements.push(measurementData);
    await saveDataToStorage('measurements', measurements);
    
    // Clear form
    document.getElementById('weight').value = '';
    document.getElementById('bodyFat').value = '';
    document.getElementById('muscleMass').value = '';
    
    await loadMeasurements();
    showMessage('Measurement saved successfully!', 'success');
}

function displayMeasurementsChart(measurements) {
    const canvas = document.getElementById('measurementChart');
    if (!canvas || measurements.length === 0) return;

    const ctx = canvas.getContext('2d');
    
    // Sort by date
    const sortedData = measurements.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const labels = sortedData.map(m => new Date(m.date).toLocaleDateString());
    const weightData = sortedData.map(m => m.weight);
    const bodyFatData = sortedData.map(m => m.bodyFat).filter(v => v !== null);
    const muscleMassData = sortedData.map(m => m.muscleMass).filter(v => v !== null);

    // Simple canvas chart implementation
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (weightData.length > 0) {
        drawLineChart(ctx, weightData, 'Weight (kg)', '#000', canvas.width, canvas.height);
    }
}

function displayMeasurementsList(measurements) {
    const measurementsList = document.getElementById('measurementsList');
    if (!measurementsList) return;

    if (measurements.length === 0) {
        measurementsList.innerHTML = '<p>No measurements recorded yet.</p>';
        return;
    }

    const sortedMeasurements = measurements.sort((a, b) => new Date(b.date) - new Date(a.date));

    measurementsList.innerHTML = sortedMeasurements.map(measurement => `
        <div class="measurement-item history-item">
            <h4>${new Date(measurement.date).toLocaleDateString()}</h4>
            <p><strong>Weight:</strong> ${measurement.weight}kg</p>
            ${measurement.bodyFat ? `<p><strong>Body Fat:</strong> ${measurement.bodyFat}%</p>` : ''}
            ${measurement.muscleMass ? `<p><strong>Muscle Mass:</strong> ${measurement.muscleMass}kg</p>` : ''}
            <div class="btn-group">
                <button class="btn btn-sm" onclick="editMeasurement('${measurement.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteMeasurement('${measurement.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function editMeasurement(measurementId) {
    const measurements = await loadDataFromStorage('measurements');
    const measurement = measurements.find(m => m.id === measurementId);
    if (!measurement) return;

    editingMeasurementId = measurementId;
    
    document.getElementById('editMeasurementDate').value = measurement.date;
    document.getElementById('editWeight').value = measurement.weight;
    document.getElementById('editBodyFat').value = measurement.bodyFat || '';
    document.getElementById('editMuscleMass').value = measurement.muscleMass || '';
    
    document.getElementById('editMeasurementModal').style.display = 'block';
}

async function saveMeasurementEdit() {
    if (!editingMeasurementId) return;

    const date = document.getElementById('editMeasurementDate').value;
    const weight = parseFloat(document.getElementById('editWeight').value);
    
    if (!date || !weight) {
        alert('Date and weight are required');
        return;
    }

    const measurements = await loadDataFromStorage('measurements');
    const index = measurements.findIndex(m => m.id === editingMeasurementId);
    
    if (index !== -1) {
        measurements[index] = {
            ...measurements[index],
            date: date,
            weight: weight,
            bodyFat: parseFloat(document.getElementById('editBodyFat').value) || null,
            muscleMass: parseFloat(document.getElementById('editMuscleMass').value) || null,
            modified: new Date().toISOString()
        };

        await saveDataToStorage('measurements', measurements);
        await loadMeasurements();
        closeEditMeasurement();
        showMessage('Measurement updated successfully!', 'success');
    }
}

async function deleteMeasurement(measurementId) {
    if (!confirm('Are you sure you want to delete this measurement?')) return;

    const measurements = await loadDataFromStorage('measurements');
    const filteredMeasurements = measurements.filter(m => m.id !== measurementId);
    
    await saveDataToStorage('measurements', filteredMeasurements);
    await loadMeasurements();
    showMessage('Measurement deleted successfully', 'success');
}

// =============================================================================
// PROGRESS PICTURES MANAGEMENT
// =============================================================================

let currentProgressPictures = [];
let editProgressPictures = [];

async function loadProgressPictures() {
    try {
        const pictures = await loadDataFromStorage('progressPictures');
        displayProgressPicturesGallery(pictures);
    } catch (error) {
        console.error('Error loading progress pictures:', error);
        displayProgressPicturesGallery([]);
    }
}

function handleProgressPictureUpload(event) {
    const files = Array.from(event.target.files);
    currentProgressPictures = [];
    
    const preview = document.getElementById('progressPicturePreview');
    preview.innerHTML = '';

    files.forEach((file, index) => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.cssText = 'width: 150px; height: 150px; object-fit: cover; border: 3px solid #000; margin: 5px;';
                preview.appendChild(img);

                currentProgressPictures.push({
                    name: file.name,
                    data: e.target.result,
                    size: file.size,
                    type: file.type
                });
            };
            reader.readAsDataURL(file);
        }
    });
}

async function saveProgressPictures() {
    const date = document.getElementById('pictureDate').value;
    const notes = document.getElementById('pictureNotes').value.trim();
    
    if (!date) {
        alert('Date is required');
        return;
    }

    if (currentProgressPictures.length === 0) {
        alert('Please select at least one picture');
        return;
    }

    const pictures = await loadDataFromStorage('progressPictures');
    
    const pictureData = {
        id: Date.now().toString(),
        date: date,
        notes: notes,
        pictures: currentProgressPictures,
        created: new Date().toISOString()
    };

    pictures.push(pictureData);
    await saveDataToStorage('progressPictures', pictures);
    
    // Clear form
    document.getElementById('pictureNotes').value = '';
    document.getElementById('progressPictures').value = '';
    document.getElementById('progressPicturePreview').innerHTML = '';
    currentProgressPictures = [];
    
    await loadProgressPictures();
    showMessage('Progress pictures saved successfully!', 'success');
}

function displayProgressPicturesGallery(pictures) {
    const gallery = document.getElementById('picturesGallery');
    if (!gallery) return;

    if (pictures.length === 0) {
        gallery.innerHTML = '<p>No progress pictures yet.</p>';
        return;
    }

    const sortedPictures = pictures.sort((a, b) => new Date(b.date) - new Date(a.date));

    gallery.innerHTML = sortedPictures.map(entry => `
        <div class="picture-entry history-item">
            <h4>${new Date(entry.date).toLocaleDateString()}</h4>
            ${entry.notes ? `<p><strong>Notes:</strong> ${entry.notes}</p>` : ''}
            <div class="pictures-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin: 15px 0;">
                ${entry.pictures.map(pic => `
                    <img src="${pic.data}" alt="${pic.name}" style="width: 100%; height: 150px; object-fit: cover; border: 3px solid #000; cursor: pointer;" onclick="openImageModal('${pic.data}')">
                `).join('')}
            </div>
            <div class="btn-group">
                <button class="btn btn-sm" onclick="editProgressPicturesEntry('${entry.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProgressPicturesEntry('${entry.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

async function editProgressPicturesEntry(entryId) {
    const pictures = await loadDataFromStorage('progressPictures');
    const entry = pictures.find(p => p.id === entryId);
    if (!entry) return;

    editingProgressPicturesId = entryId;
    
    document.getElementById('editProgressPictureDate').value = entry.date;
    document.getElementById('editProgressPictureNotes').value = entry.notes || '';
    
    // Display current pictures
    const currentGrid = document.getElementById('editCurrentPicturesGrid');
    currentGrid.innerHTML = entry.pictures.map((pic, index) => `
        <div class="current-picture" style="position: relative;">
            <img src="${pic.data}" alt="${pic.name}" style="width: 100%; height: 150px; object-fit: cover; border: 3px solid #000;">
            <button class="btn btn-sm btn-danger" style="position: absolute; top: 5px; right: 5px; padding: 5px 8px;" onclick="removeCurrentPicture(${index})">×</button>
        </div>
    `).join('');
    
    editProgressPictures = [...entry.pictures];
    document.getElementById('editProgressPicturesModal').style.display = 'block';
}

function removeCurrentPicture(index) {
    editProgressPictures.splice(index, 1);
    // Refresh the display
    const currentGrid = document.getElementById('editCurrentPicturesGrid');
    currentGrid.innerHTML = editProgressPictures.map((pic, i) => `
        <div class="current-picture" style="position: relative;">
            <img src="${pic.data}" alt="${pic.name}" style="width: 100%; height: 150px; object-fit: cover; border: 3px solid #000;">
            <button class="btn btn-sm btn-danger" style="position: absolute; top: 5px; right: 5px; padding: 5px 8px;" onclick="removeCurrentPicture(${i})">×</button>
        </div>
    `).join('');
}

function handleEditProgressPictureUpload(event) {
    const files = Array.from(event.target.files);
    const newPictures = [];
    
    const preview = document.getElementById('editProgressPicturePreview');
    preview.innerHTML = '';

    files.forEach((file, index) => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.cssText = 'width: 150px; height: 150px; object-fit: cover; border: 3px solid #000; margin: 5px;';
                preview.appendChild(img);

                newPictures.push({
                    name: file.name,
                    data: e.target.result,
                    size: file.size,
                    type: file.type
                });
            };
            reader.readAsDataURL(file);
        }
    });
    
    // Store new pictures temporarily
    document.getElementById('editProgressPicturesUpload').newPictures = newPictures;
}

async function saveProgressPicturesEdit() {
    if (!editingProgressPicturesId) return;

    const date = document.getElementById('editProgressPictureDate').value;
    const notes = document.getElementById('editProgressPictureNotes').value.trim();
    
    if (!date) {
        alert('Date is required');
        return;
    }

    const pictures = await loadDataFromStorage('progressPictures');
    const index = pictures.findIndex(p => p.id === editingProgressPicturesId);
    
    if (index !== -1) {
        // Get new pictures from upload
        const newPictures = document.getElementById('editProgressPicturesUpload').newPictures || [];
        
        pictures[index] = {
            ...pictures[index],
            date: date,
            notes: notes,
            pictures: [...editProgressPictures, ...newPictures],
            modified: new Date().toISOString()
        };

        await saveDataToStorage('progressPictures', pictures);
        await loadProgressPictures();
        closeEditProgressPictures();
        showMessage('Progress pictures updated successfully!', 'success');
    }
}

async function deleteProgressPicturesEntry(entryId) {
    if (!confirm('Are you sure you want to delete this progress pictures entry?')) return;

    const pictures = await loadDataFromStorage('progressPictures');
    const filteredPictures = pictures.filter(p => p.id !== entryId);
    
    await saveDataToStorage('progressPictures', filteredPictures);
    await loadProgressPictures();
    showMessage('Progress pictures deleted successfully', 'success');
}

// =============================================================================
// VIDEO UPLOAD MANAGEMENT
// =============================================================================

let currentVideos = [];

function handleVideoUpload(event) {
    const files = Array.from(event.target.files);
    currentVideos = [];
    
    const preview = document.getElementById('videoPreview');
    preview.innerHTML = '';

    files.forEach(file => {
        if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.controls = true;
            video.style.cssText = 'width: 300px; height: 200px; border: 3px solid #000; margin: 10px;';
            video.src = URL.createObjectURL(file);
            preview.appendChild(video);

            currentVideos.push({
                name: file.name,
                file: file,
                size: file.size,
                type: file.type
            });
        }
    });
}

async function uploadVideosToGitHub() {
    if (!isGithubConfigured()) {
        alert('Please configure GitHub settings first');
        showTab('settings');
        return;
    }

    if (currentVideos.length === 0) {
        alert('No videos to upload');
        return;
    }

    const uploadBtn = document.querySelector('[onclick="uploadVideosToGitHub()"]');
    const progressBar = document.getElementById('progressBar');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadStatus = document.getElementById('uploadStatus');

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    uploadProgress.style.display = 'block';
    uploadStatus.innerHTML = '';

    try {
        const uploadedVideos = [];
        
        for (let i = 0; i < currentVideos.length; i++) {
            const video = currentVideos[i];
            const progress = ((i + 1) / currentVideos.length) * 100;
            progressBar.style.width = `${progress}%`;
            
            uploadStatus.innerHTML = `Uploading ${video.name}... (${i + 1}/${currentVideos.length})`;
            
            // Convert video to base64
            const base64Data = await fileToBase64(video.file);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `workout-video-${timestamp}-${video.name}`;
            
            const success = await uploadFileToGitHub(filename, base64Data, `Upload workout video: ${video.name}`, 'videos');
            
            if (success) {
                uploadedVideos.push({
                    name: video.name,
                    filename: filename,
                    url: `https://github.com/${getGithubConfig().username}/${getGithubConfig().repo}/blob/main/videos/${filename}`,
                    uploadDate: new Date().toISOString()
                });
            }
        }

        if (!currentWorkoutData) currentWorkoutData = {};
        currentWorkoutData.videos = uploadedVideos;

        uploadStatus.innerHTML = `<div class="upload-success">Successfully uploaded ${uploadedVideos.length} videos!</div>`;
        showMessage(`${uploadedVideos.length} videos uploaded to GitHub successfully!`, 'success');

    } catch (error) {
        console.error('Video upload error:', error);
        uploadStatus.innerHTML = `<div class="upload-error">Upload failed: ${error.message}</div>`;
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload Videos to GitHub';
        uploadProgress.style.display = 'none';
    }
}

async function uploadProgressPicturesToGitHub() {
    if (!isGithubConfigured()) {
        alert('Please configure GitHub settings first');
        showTab('settings');
        return;
    }

    if (currentProgressPictures.length === 0) {
        alert('No pictures to upload');
        return;
    }

    const uploadBtn = document.querySelector('[onclick="uploadProgressPicturesToGitHub()"]');
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';

    try {
        for (const picture of currentProgressPictures) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `progress-${timestamp}-${picture.name}`;
            
            // Remove data URL prefix
            const base64Data = picture.data.split(',')[1];
            
            await uploadFileToGitHub(filename, base64Data, `Upload progress picture: ${picture.name}`, 'progress-pictures');
            
            // Update picture with GitHub URL
            picture.url = `https://github.com/${getGithubConfig().username}/${getGithubConfig().repo}/blob/main/progress-pictures/${filename}`;
        }

        showMessage('Progress pictures uploaded to GitHub successfully!', 'success');

    } catch (error) {
        console.error('Progress picture upload error:', error);
        showMessage(`Upload failed: ${error.message}`, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Upload to GitHub';
    }
}

async function uploadFileToGitHub(filename, base64Data, commitMessage, folder = 'uploads') {
    try {
        const config = getGithubConfig();
        const path = `${folder}/${filename}`;
        
        await makeGithubRequest(`contents/${path}`, 'PUT', {
            message: commitMessage,
            content: base64Data,
            branch: 'main'
        });
        
        return true;
    } catch (error) {
        console.error(`Error uploading ${filename}:`, error);
        throw error;
    }
}

// =============================================================================
// ANALYTICS AND CHARTS
// =============================================================================

async function updateAnalytics() {
    try {
        const workouts = await loadDataFromStorage('workouts');
        
        displayPersonalRecords(workouts);
        displayVolumeChart(workouts);
        displayStrengthChart(workouts);
        displayFrequencyAnalysis(workouts);
    } catch (error) {
        console.error('Error updating analytics:', error);
    }
}

function displayPersonalRecords(workouts) {
    const recordsContainer = document.getElementById('personalRecords');
    if (!recordsContainer) return;

    const records = {};
    
    workouts.forEach(workout => {
        workout.exercises.forEach(exercise => {
            exercise.sets.forEach(set => {
                if (set.weight && set.reps) {
                    const exerciseName = exercise.name;
                    const oneRM = calculateOneRM(set.weight, set.reps);
                    
                    if (!records[exerciseName] || oneRM > records[exerciseName].oneRM) {
                        records[exerciseName] = {
                            oneRM: oneRM,
                            weight: set.weight,
                            reps: set.reps,
                            date: workout.date
                        };
                    }
                }
            });
        });
    });

    const recordEntries = Object.entries(records)
        .sort((a, b) => b[1].oneRM - a[1].oneRM)
        .slice(0, 10);

    if (recordEntries.length === 0) {
        recordsContainer.innerHTML = '<p>No personal records yet. Start tracking your workouts!</p>';
        return;
    }

    recordsContainer.innerHTML = recordEntries.map(([exercise, record]) => `
        <div class="record-item" style="padding: 10px; border-bottom: 2px solid #000; margin-bottom: 10px;">
            <strong>${exercise}</strong><br>
            <span>${record.weight}kg × ${record.reps} reps</span><br>
            <small>Est. 1RM: ${Math.round(record.oneRM)}kg</small><br>
            <small>${new Date(record.date).toLocaleDateString()}</small>
        </div>
    `).join('');
}

function calculateOneRM(weight, reps) {
    // Epley formula: 1RM = weight × (1 + reps/30)
    return weight * (1 + reps / 30);
}

function displayVolumeChart(workouts) {
    const canvas = document.getElementById('volumeChart');
    if (!canvas || workouts.length === 0) {
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#666';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No workout data available', canvas.width/2, canvas.height/2);
        }
        return;
    }

    // Calculate weekly volume
    const weeklyVolume = {};
    
    workouts.forEach(workout => {
        const weekStart = getWeekStart(new Date(workout.date));
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeklyVolume[weekKey]) {
            weeklyVolume[weekKey] = 0;
        }
        
        workout.exercises.forEach(exercise => {
            exercise.sets.forEach(set => {
                if (set.weight && set.reps) {
                    weeklyVolume[weekKey] += set.weight * set.reps;
                }
            });
        });
    });

    const sortedWeeks = Object.keys(weeklyVolume).sort();
    const volumeData = sortedWeeks.map(week => weeklyVolume[week]);
    
    const ctx = canvas.getContext('2d');
    drawBarChart(ctx, volumeData, sortedWeeks.map(w => new Date(w).toLocaleDateString()), 'Weekly Volume', '#000', canvas.width, canvas.height);
}

function displayStrengthChart(workouts) {
    const canvas = document.getElementById('strengthChart');
    if (!canvas || workouts.length === 0) {
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#666';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No workout data available', canvas.width/2, canvas.height/2);
        }
        return;
    }

    // Find most tracked exercise
    const exerciseFrequency = {};
    workouts.forEach(workout => {
        workout.exercises.forEach(exercise => {
            exerciseFrequency[exercise.name] = (exerciseFrequency[exercise.name] || 0) + 1;
        });
    });

    const topExercise = Object.entries(exerciseFrequency)
        .sort((a, b) => b[1] - a[1])[0];

    if (!topExercise) return;

    const exerciseName = topExercise[0];
    const strengthData = [];

    workouts
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .forEach(workout => {
            const exercise = workout.exercises.find(ex => ex.name === exerciseName);
            if (exercise) {
                const maxSet = exercise.sets.reduce((max, set) => {
                    if (set.weight && set.reps) {
                        const oneRM = calculateOneRM(set.weight, set.reps);
                        return oneRM > (max || 0) ? oneRM : max;
                    }
                    return max;
                }, 0);
                
                if (maxSet > 0) {
                    strengthData.push({
                        date: workout.date,
                        oneRM: maxSet
                    });
                }
            }
        });

    const ctx = canvas.getContext('2d');
    const dates = strengthData.map(d => new Date(d.date).toLocaleDateString());
    const values = strengthData.map(d => d.oneRM);
    
    drawLineChart(ctx, values, dates, `${exerciseName} Strength Progress`, '#000', canvas.width, canvas.height);
}

function displayFrequencyAnalysis(workouts) {
    const frequencyContainer = document.getElementById('frequencyAnalysis');
    if (!frequencyContainer) return;

    const exerciseCount = {};
    const totalWorkouts = workouts.length;

    workouts.forEach(workout => {
        workout.exercises.forEach(exercise => {
            exerciseCount[exercise.name] = (exerciseCount[exercise.name] || 0) + 1;
        });
    });

    const frequencyData = Object.entries(exerciseCount)
        .map(([exercise, count]) => ({
            exercise,
            count,
            percentage: ((count / totalWorkouts) * 100).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    if (frequencyData.length === 0) {
        frequencyContainer.innerHTML = '<p>No exercise data available.</p>';
        return;
    }

    frequencyContainer.innerHTML = frequencyData.map(item => `
        <div class="frequency-item" style="padding: 8px; border-bottom: 1px solid #000; display: flex; justify-content: space-between;">
            <span>${item.exercise}</span>
            <span>${item.count} times (${item.percentage}%)</span>
        </div>
    `).join('');
}

// =============================================================================
// CHART DRAWING UTILITIES
// =============================================================================

function drawLineChart(ctx, data, labels, title, color, width, height) {
    ctx.clearRect(0, 0, width, height);
    
    if (data.length === 0) return;
    
    const margin = 60;
    const chartWidth = width - 2 * margin;
    const chartHeight = height - 2 * margin;
    
    const minValue = Math.min(...data) * 0.95;
    const maxValue = Math.max(...data) * 1.05;
    const valueRange = maxValue - minValue;
    
    // Draw axes
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.stroke();
    
    // Draw data line
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    data.forEach((value, index) => {
        const x = margin + (index / (data.length - 1)) * chartWidth;
        const y = height - margin - ((value - minValue) / valueRange) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Draw data points
    ctx.fillStyle = color;
    data.forEach((value, index) => {
        const x = margin + (index / (data.length - 1)) * chartWidth;
        const y = height - margin - ((value - minValue) / valueRange) * chartHeight;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    });
    
    // Draw title
    ctx.fillStyle = color;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 30);
}

function drawBarChart(ctx, data, labels, title, color, width, height) {
    ctx.clearRect(0, 0, width, height);
    
    if (data.length === 0) return;
    
    const margin = 60;
    const chartWidth = width - 2 * margin;
    const chartHeight = height - 2 * margin;
    
    const maxValue = Math.max(...data) * 1.1;
    const barWidth = chartWidth / data.length * 0.8;
    const barSpacing = chartWidth / data.length * 0.2;
    
    // Draw axes
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, margin);
    ctx.lineTo(margin, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.stroke();
    
    // Draw bars
    ctx.fillStyle = color;
    data.forEach((value, index) => {
        const x = margin + index * (barWidth + barSpacing);
        const barHeight = (value / maxValue) * chartHeight;
        const y = height - margin - barHeight;
        
        ctx.fillRect(x, y, barWidth, barHeight);
    });
    
    // Draw title
    ctx.fillStyle = color;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 30);
}

// =============================================================================
// TIMER FUNCTIONALITY
// =============================================================================

function showTimer() {
    document.getElementById('timerContainer').style.display = 'flex';
}

function hideTimer() {
    document.getElementById('timerContainer').style.display = 'none';
}

function startTimer() {
    if (!isTimerRunning) {
        isTimerRunning = true;
        workoutTimer = setInterval(updateTimer, 1000);
        document.getElementById('startTimerBtn').style.display = 'none';
        document.getElementById('pauseTimerBtn').style.display = 'inline-flex';
    }
}

function pauseTimer() {
    if (isTimerRunning) {
        isTimerRunning = false;
        clearInterval(workoutTimer);
        document.getElementById('startTimerBtn').style.display = 'inline-flex';
        document.getElementById('pauseTimerBtn').style.display = 'none';
    }
}

function resetTimer() {
    isTimerRunning = false;
    clearInterval(workoutTimer);
    timerSeconds = 0;
    updateTimerDisplay();
    document.getElementById('startTimerBtn').style.display = 'inline-flex';
    document.getElementById('pauseTimerBtn').style.display = 'none';
}

function updateTimer() {
    timerSeconds++;
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;
    
    const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timerDisplay').textContent = display;
}

// =============================================================================
// GITHUB SETTINGS MANAGEMENT
// =============================================================================

function loadGithubConfig() {
    const config = JSON.parse(localStorage.getItem('githubConfig') || '{}');
    githubConfig = { ...githubConfig, ...config };
    
    // Populate form fields
    if (document.getElementById('githubToken')) {
        document.getElementById('githubToken').value = githubConfig.token || '';
        document.getElementById('githubUsername').value = githubConfig.username || '';
        document.getElementById('githubRepo').value = githubConfig.repo || '';
        document.getElementById('githubFolder').value = githubConfig.folder || 'data';
    }
}

function getGithubConfig() {
    return githubConfig;
}

function saveGithubConfig() {
    const config = {
        token: document.getElementById('githubToken').value.trim(),
        username: document.getElementById('githubUsername').value.trim(),
        repo: document.getElementById('githubRepo').value.trim(),
        folder: document.getElementById('githubFolder').value.trim() || 'data'
    };
    
    githubConfig = config;
    localStorage.setItem('githubConfig', JSON.stringify(config));
    
    showMessage('GitHub configuration saved successfully!', 'success');
}

async function testGithubConnection() {
    if (!isGithubConfigured()) {
        alert('Please fill in all GitHub configuration fields');
        return;
    }

    const btn = document.querySelector('[onclick="testGithubConnection()"]');
    btn.disabled = true;
    btn.textContent = 'Testing...';

    try {
        await makeGithubRequest('');
        showMessage('GitHub connection successful!', 'success');
    } catch (error) {
        showMessage(`GitHub connection failed: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection';
    }
}

// =============================================================================
// SYNC FUNCTIONS
// =============================================================================

async function syncProgramsWithGitHub() {
    if (!isGithubConfigured()) {
        alert('GitHub not configured');
        return;
    }

    const btn = document.querySelector('[onclick="syncProgramsWithGitHub()"]');
    btn.disabled = true;
    btn.textContent = 'Syncing...';

    try {
        const programs = await loadDataFromStorage('programs');
        await saveDataToStorage('programs', programs);
        showMessage('Programs synced with GitHub successfully!', 'success');
    } catch (error) {
        showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sync Programs with GitHub';
    }
}

async function syncHistoryWithGitHub() {
    if (!isGithubConfigured()) {
        alert('GitHub not configured');
        return;
    }

    const btn = document.querySelector('[onclick="syncHistoryWithGitHub()"]');
    btn.disabled = true;
    btn.textContent = 'Syncing...';

    try {
        const workouts = await loadDataFromStorage('workouts');
        await saveDataToStorage('workouts', workouts);
        showMessage('History synced with GitHub successfully!', 'success');
    } catch (error) {
        showMessage(`Sync failed: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sync with GitHub';
    }
}

async function syncAllDataWithGitHub() {
    if (!isGithubConfigured()) {
        alert('GitHub not configured');
        return;
    }

    const btn = document.querySelector('[onclick="syncAllDataWithGitHub()"]');
    btn.disabled = true;
    btn.textContent = 'Syncing...';

    try {
        const [programs, workouts, measurements, pictures] = await Promise.all([
            loadDataFromStorage('programs'),
            loadDataFromStorage('workouts'),
            loadDataFromStorage('measurements'),
            loadDataFromStorage('progressPictures')
        ]);

        await Promise.all([
            saveDataToStorage('programs', programs),
            saveDataToStorage('workouts', workouts),
            saveDataToStorage('measurements', measurements),
            saveDataToStorage('progressPictures', pictures)
        ]);

        showMessage('All data synced with GitHub successfully!', 'success');
    } catch (error) {
        showMessage(`Full sync failed: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Full Data Sync';
    }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all nav buttons
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => btn.classList.remove('active'));
    
    // Show selected tab
    const targetTab = document.getElementById(tabName);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // Add active class to clicked nav button
    const targetButton = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }
    
    // Update analytics when stats tab is shown
    if (tabName === 'stats') {
        updateAnalytics();
    }
}

function showMessage(message, type = 'info') {
    const messageEl = document.createElement('div');
    messageEl.className = `upload-${type === 'error' ? 'error' : type === 'warning' ? 'error' : 'success'}`;
    messageEl.textContent = message;
    messageEl.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 400px; padding: 15px; border: 3px solid #000; background: #fff;';
    
    document.body.appendChild(messageEl);
    
    setTimeout(() => {
        if (messageEl.parentNode) {
            messageEl.parentNode.removeChild(messageEl);
        }
    }, 5000);
}

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        return `${remainingSeconds}s`;
    }
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

function markSetComplete(button) {
    const setRow = button.closest('.set-row');
    setRow.classList.toggle('completed');
    button.textContent = setRow.classList.contains('completed') ? '✓' : '○';
    button.classList.toggle('btn-success');
    button.classList.toggle('btn-secondary');
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function openImageModal(imageSrc) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-height: 90%; padding: 20px;">
            <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
            <img src="${imageSrc}" style="width: 100%; height: auto; max-height: 80vh; object-fit: contain; border: 3px solid #000;">
        </div>
    `;
    document.body.appendChild(modal);
    
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
}

// =============================================================================
// SEARCH FUNCTIONALITY
// =============================================================================

function searchPrograms(query) {
    const programs = JSON.parse(localStorage.getItem('trainingPrograms') || '[]');
    const filtered = programs.filter(program => 
        program.name.toLowerCase().includes(query.toLowerCase()) ||
        program.description.toLowerCase().includes(query.toLowerCase()) ||
        program.exercises.some(ex => ex.name.toLowerCase().includes(query.toLowerCase()))
    );
    displayPrograms(filtered);
}

function searchHistory(query) {
    const workouts = JSON.parse(localStorage.getItem('workoutHistory') || '[]');
    const filtered = workouts.filter(workout => 
        workout.programName.toLowerCase().includes(query.toLowerCase()) ||
        workout.notes.toLowerCase().includes(query.toLowerCase()) ||
        workout.exercises.some(ex => ex.name.toLowerCase().includes(query.toLowerCase()))
    );
    displayWorkoutHistory(filtered);
}

function searchStats(query) {
    // This would filter analytics based on exercise names
    updateAnalytics(); // For now, just refresh analytics
}

// =============================================================================
// DATA IMPORT/EXPORT
// =============================================================================

function exportData() {
    const data = {
        programs: JSON.parse(localStorage.getItem('trainingPrograms') || '[]'),
        workouts: JSON.parse(localStorage.getItem('workoutHistory') || '[]'),
        measurements: JSON.parse(localStorage.getItem('bodyMeasurements') || '[]'),
        progressPictures: JSON.parse(localStorage.getItem('progressPictures') || '[]'),
        githubConfig: JSON.parse(localStorage.getItem('githubConfig') || '{}'),
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-data-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showMessage('Data exported successfully!', 'success');
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.version) {
            throw new Error('Invalid export file format');
        }

        const confirmImport = confirm('This will replace all existing data. Are you sure you want to continue?');
        if (!confirmImport) return;

        // Import data
        if (data.programs) localStorage.setItem('trainingPrograms', JSON.stringify(data.programs));
        if (data.workouts) localStorage.setItem('workoutHistory', JSON.stringify(data.workouts));
        if (data.measurements) localStorage.setItem('bodyMeasurements', JSON.stringify(data.measurements));
        if (data.progressPictures) localStorage.setItem('progressPictures', JSON.stringify(data.progressPictures));
        if (data.githubConfig) localStorage.setItem('githubConfig', JSON.stringify(data.githubConfig));

        // Reload all data
        loadGithubConfig();
        await loadPrograms();
        await loadWorkoutHistory();
        await loadMeasurements();
        await loadProgressPictures();
        updateAnalytics();

        showMessage('Data imported successfully!', 'success');
        
    } catch (error) {
        console.error('Import error:', error);
        showMessage(`Import failed: ${error.message}`, 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

// =============================================================================
// CLEAR DATA FUNCTIONS
// =============================================================================

async function clearAllHistory() {
    if (!confirm('Are you sure you want to clear all workout history? This cannot be undone.')) return;

    await saveDataToStorage('workouts', []);
    await loadWorkoutHistory();
    updateAnalytics();
    showMessage('All workout history cleared', 'success');
}

async function clearAllData() {
    if (!confirm('Are you sure you want to clear ALL data? This will delete programs, history, measurements, and settings. This cannot be undone.')) return;

    // Clear local storage
    localStorage.removeItem('trainingPrograms');
    localStorage.removeItem('workoutHistory');
    localStorage.removeItem('bodyMeasurements');
    localStorage.removeItem('progressPictures');
    localStorage.removeItem('githubConfig');

    // If GitHub is configured, clear remote data too
    if (isGithubConfigured()) {
        const confirmRemote = confirm('Also delete data from GitHub?');
        if (confirmRemote) {
            try {
                const dataTypes = ['programs', 'workouts', 'measurements', 'progressPictures'];
                for (const type of dataTypes) {
                    const filename = getGithubFilename(type);
                    await deleteFileFromGitHub(filename);
                }
                showMessage('All data cleared from local storage and GitHub', 'success');
            } catch (error) {
                showMessage('Local data cleared, but GitHub deletion failed', 'warning');
            }
        }
    } else {
        showMessage('All data cleared successfully', 'success');
    }

    // Reset app state
    currentProgram = null;
    currentWorkoutData = null;
    editingWorkoutId = null;
    editingMeasurementId = null;
    editingProgressPicturesId = null;
    githubConfig = { token: '', username: '', repo: '', folder: 'data' };

    // Reload UI
    loadGithubConfig();
    await loadPrograms();
    await loadWorkoutHistory();
    await loadMeasurements();
    await loadProgressPictures();
    updateAnalytics();
}

// =============================================================================
// MODAL MANAGEMENT
// =============================================================================

function closeModal() {
    const modal = document.getElementById('programModal');
    modal.style.display = 'none';
    delete modal.dataset.editingId;
}

function closeWorkoutDetails() {
    const modal = document.getElementById('workoutDetailsModal');
    modal.style.display = 'none';
    delete modal.dataset.workoutId;
}

function closeEditWorkout() {
    const modal = document.getElementById('editWorkoutModal');
    modal.style.display = 'none';
    editingWorkoutId = null;
}

function closeEditMeasurement() {
    const modal = document.getElementById('editMeasurementModal');
    modal.style.display = 'none';
    editingMeasurementId = null;
}

function closeEditProgressPictures() {
    const modal = document.getElementById('editProgressPicturesModal');
    modal.style.display = 'none';
    editingProgressPicturesId = null;
    editProgressPictures = [];
    document.getElementById('editProgressPicturePreview').innerHTML = '';
    document.getElementById('editProgressPicturesUpload').value = '';
}

// =============================================================================
// WORKOUT EDITING FUNCTIONALITY
// =============================================================================

async function editWorkout(workoutId) {
    const workouts = await loadDataFromStorage('workouts');
    const workout = workouts.find(w => w.id === workoutId);
    if (!workout) return;

    editingWorkoutId = workoutId;
    
    // Populate edit form
    document.getElementById('editWorkoutDate').value = new Date(workout.date).toISOString().split('T')[0];
    document.getElementById('editProgramName').value = workout.programName;
    document.getElementById('editSessionNotes').value = workout.notes || '';

    // Populate exercises
    const exerciseList = document.getElementById('editExerciseList');
    exerciseList.innerHTML = workout.exercises.map(exercise => `
        <div class="exercise-card" data-exercise="${exercise.name}">
            <div class="exercise-header">
                <h4 class="exercise-name">${exercise.name}</h4>
            </div>
            <div class="sets-container">
                ${exercise.sets.map((set, index) => `
                    <div class="set-row ${set.completed ? 'completed' : ''}">
                        <span>Set ${index + 1}</span>
                        <input type="number" class="set-input" placeholder="Reps" data-set="${index}" data-field="reps" value="${set.reps || ''}">
                        <input type="number" class="set-input" placeholder="Weight" data-set="${index}" data-field="weight" step="0.5" value="${set.weight || ''}">
                        <input type="number" class="set-input" placeholder="RPE" data-set="${index}" data-field="rpe" min="1" max="10" value="${set.rpe || ''}">
                        <input type="text" class="set-input" placeholder="Notes" data-set="${index}" data-field="notes" value="${set.notes || ''}">
                        <button class="btn btn-sm ${set.completed ? 'btn-success' : 'btn-secondary'}" onclick="markSetComplete(this)">${set.completed ? '✓' : '○'}</button>
                    </div>
                `).join('')}
                <button class="btn btn-sm" onclick="addSetToExercise(this)">Add Set</button>
            </div>
        </div>
    `).join('');

    // Populate videos
    const videoList = document.getElementById('editVideoList');
    if (workout.videos && workout.videos.length > 0) {
        videoList.innerHTML = workout.videos.map(video => `
            <div class="video-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border: 2px solid #000; margin: 5px 0;">
                <span>${video.name}</span>
                ${video.url ? `<a href="${video.url}" target="_blank" class="btn btn-sm">View</a>` : ''}
                <button class="btn btn-sm btn-danger" onclick="removeVideoFromEdit('${video.name}')">Remove</button>
            </div>
        `).join('');
    } else {
        videoList.innerHTML = '<p>No videos in this workout</p>';
    }

    document.getElementById('editWorkoutModal').style.display = 'block';
}

function addSetToExercise(button) {
    const setsContainer = button.parentElement;
    const existingSets = setsContainer.querySelectorAll('.set-row').length;
    const newSetIndex = existingSets;

    const newSetHTML = `
        <div class="set-row">
            <span>Set ${newSetIndex + 1}</span>
            <input type="number" class="set-input" placeholder="Reps" data-set="${newSetIndex}" data-field="reps">
            <input type="number" class="set-input" placeholder="Weight" data-set="${newSetIndex}" data-field="weight" step="0.5">
            <input type="number" class="set-input" placeholder="RPE" data-set="${newSetIndex}" data-field="rpe" min="1" max="10">
            <input type="text" class="set-input" placeholder="Notes" data-set="${newSetIndex}" data-field="notes">
            <button class="btn btn-sm btn-secondary" onclick="markSetComplete(this)">○</button>
        </div>
    `;

    button.insertAdjacentHTML('beforebegin', newSetHTML);
}

function removeVideoFromEdit(videoName) {
    const videoItems = document.querySelectorAll('#editVideoList .video-item');
    videoItems.forEach(item => {
        if (item.textContent.includes(videoName)) {
            item.remove();
        }
    });
}

let editWorkoutNewVideos = [];

function handleEditVideoUpload(event) {
    const files = Array.from(event.target.files);
    editWorkoutNewVideos = [];
    
    const preview = document.getElementById('editVideoPreview');
    preview.innerHTML = '';

    files.forEach(file => {
        if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.controls = true;
            video.style.cssText = 'width: 200px; height: 150px; border: 3px solid rgba(0, 255, 0, 0.5); margin: 5px;';
            video.src = URL.createObjectURL(file);
            preview.appendChild(video);

            editWorkoutNewVideos.push({
                name: file.name,
                file: file,
                size: file.size,
                type: file.type
            });
        }
    });
}

async function saveWorkoutEdit() {
    if (!editingWorkoutId) return;

    const workouts = await loadDataFromStorage('workouts');
    const workoutIndex = workouts.findIndex(w => w.id === editingWorkoutId);
    
    if (workoutIndex === -1) {
        showMessage('Workout not found', 'error');
        return;
    }

    const workout = workouts[workoutIndex];
    
    // Update basic info
    const newDate = document.getElementById('editWorkoutDate').value;
    workout.date = new Date(newDate).toISOString();
    workout.notes = document.getElementById('editSessionNotes').value.trim();
    workout.modified = new Date().toISOString();

    // Update exercises
    const exerciseCards = document.querySelectorAll('#editExerciseList .exercise-card');
    workout.exercises = [];
    
    exerciseCards.forEach(card => {
        const exerciseName = card.dataset.exercise;
        const sets = [];
        
        const setRows = card.querySelectorAll('.set-row');
        setRows.forEach(row => {
            const setData = {
                reps: parseInt(row.querySelector('[data-field="reps"]').value) || null,
                weight: parseFloat(row.querySelector('[data-field="weight"]').value) || null,
                rpe: parseInt(row.querySelector('[data-field="rpe"]').value) || null,
                notes: row.querySelector('[data-field="notes"]').value.trim(),
                completed: row.classList.contains('completed')
            };
            
            // Only save sets with some data
            if (setData.reps || setData.weight || setData.notes || setData.completed) {
                sets.push(setData);
            }
        });

        if (sets.length > 0) {
            workout.exercises.push({
                name: exerciseName,
                sets: sets
            });
        }
    });

    // Handle new videos if any
    if (editWorkoutNewVideos.length > 0) {
        const btn = document.querySelector('[onclick="saveWorkoutEdit()"]');
        btn.disabled = true;
        btn.textContent = 'Uploading Videos...';

        try {
            if (isGithubConfigured()) {
                const uploadedVideos = [];
                
                for (const video of editWorkoutNewVideos) {
                    const base64Data = await fileToBase64(video.file);
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filename = `workout-video-${timestamp}-${video.name}`;
                    
                    await uploadFileToGitHub(filename, base64Data, `Upload workout video: ${video.name}`, 'videos');
                    
                    uploadedVideos.push({
                        name: video.name,
                        filename: filename,
                        url: `https://github.com/${getGithubConfig().username}/${getGithubConfig().repo}/blob/main/videos/${filename}`,
                        uploadDate: new Date().toISOString()
                    });
                }

                // Add new videos to existing ones
                workout.videos = [...(workout.videos || []), ...uploadedVideos];
                showMessage(`${uploadedVideos.length} new videos uploaded successfully!`, 'success');
            } else {
                // Store videos locally if GitHub not configured
                const localVideos = editWorkoutNewVideos.map(video => ({
                    name: video.name,
                    size: video.size,
                    type: video.type,
                    uploadDate: new Date().toISOString()
                }));
                workout.videos = [...(workout.videos || []), ...localVideos];
            }
        } catch (error) {
            showMessage(`Video upload failed: ${error.message}`, 'error');
        }

        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }

    // Save updated workout
    workouts[workoutIndex] = workout;
    await saveDataToStorage('workouts', workouts);
    
    await loadWorkoutHistory();
    updateAnalytics();
    closeEditWorkout();
    showMessage('Workout updated successfully!', 'success');
}

// =============================================================================
// INITIALIZATION AND EVENT HANDLERS
// =============================================================================

// Close modals when clicking outside
document.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});

// Close modals on Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal[style*="block"]');
        openModals.forEach(modal => {
            modal.style.display = 'none';
        });
    }
});

// Auto-save measurements date
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    const measurementDate = document.getElementById('measurementDate');
    const pictureDate = document.getElementById('pictureDate');
    
    if (measurementDate && !measurementDate.value) {
        measurementDate.value = today;
    }
    if (pictureDate && !pictureDate.value) {
        pictureDate.value = today;
    }
});

// Prevent form submission on Enter key in inputs
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'submit') {
        event.preventDefault();
    }
});

console.log('Training Logger initialized successfully!');
