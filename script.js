// Global variables
let isLandingPage = true;
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
document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('.container').style.display = 'none';
    loadGithubConfig();
    
    // Load all data from GitHub first, fallback to localStorage
    await loadProgramsFromGitHub();
    await loadMeasurementsFromGitHub();
    await loadProgressPicturesFromGitHub();
    
    // Only load workout history from the bulk storage method
    await loadWorkoutHistoryFromGitHub();
    
    loadPrograms();
    loadHistory();
    loadMeasurements();
    loadProgressPictures();
    updateStats();
    updateMeasurementChart();
});

// Add this helper function
function addCacheBuster(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_cb=${Date.now()}`;
}

// Tab management
function showTab(tabName) {
    // Hide landing page and show main container
    if (isLandingPage) {
        document.querySelector('.landing-page').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        isLandingPage = false;
    }
    
    // Hide all tabs
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all nav buttons
    const navBtns = document.querySelectorAll('.nav-link');
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

// Program GitHub Integration Functions
async function ensureTrainingProgramsBranch() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }
    
    try {
        // Check if the training-programs branch exists
        const branchResponse = await fetch(
            `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/branches/training-programs`, 
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
        
        // Create the training-programs branch
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
                    ref: 'refs/heads/training-programs',
                    sha: mainSha
                })
            }
        );
        
        return createBranchResponse.ok;
    } catch (error) {
        console.error('Error ensuring training-programs branch exists:', error);
        return false;
    }
}

async function saveProgramToGitHub(program) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }

    try {
        // Ensure the training-programs branch exists
        const branchExists = await ensureTrainingProgramsBranch();
        if (!branchExists) {
            console.error('Could not create or access the training-programs branch');
            return false;
        }

        const fileName = `program-${program.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${program.id}.json`;
        const filePath = `programs/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        const programData = {
            ...program,
            exportedAt: new Date().toISOString(),
            version: "1.0"
        };

        const content = btoa(JSON.stringify(programData, null, 2));

        // Check if file already exists (for updates)
        let sha = null;
        try {
            const existingResponse = await fetch(`${apiUrl}?ref=training-programs`, {
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
            // File doesn't exist, which is fine for new programs
        }

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: sha ? `Update program: ${program.name}` : `Add program: ${program.name}`,
                content: content,
                branch: 'training-programs',
                ...(sha && { sha })
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Error saving program to GitHub:', error);
        return false;
    }
}

async function loadProgramsFromGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        console.log('GitHub not configured, using localStorage for programs');
        loadProgramsFromStorage();
        return;
    }

    try {
        // Get all files in the programs directory
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/programs`;
        const response = await fetch(addCacheBuster(`${apiUrl}?ref=training-programs`), {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const files = await response.json();
            const programFiles = files.filter(f => f.name.startsWith('program-') && f.name.endsWith('.json'));
            
            programs = []; // Clear existing programs
            
            for (const file of programFiles) {
                try {
                    const programData = await loadProgramFromGitHub(file.name);
                    if (programData) {
                        programs.push(programData);
                    }
                } catch (error) {
                    console.error(`Error loading program file ${file.name}:`, error);
                }
            }
            
            // Sort programs by creation date or name
            programs.sort((a, b) => new Date(a.created) - new Date(b.created));
            
            console.log(`Loaded ${programs.length} programs from GitHub`);
        } else if (response.status === 404) {
            // Programs directory doesn't exist yet, which is fine
            console.log('Programs directory not found on GitHub, starting fresh');
            programs = [];
        } else {
            throw new Error(`Failed to load programs: ${response.status}`);
        }
    } catch (error) {
        console.error('Error loading programs from GitHub, falling back to localStorage:', error);
        loadProgramsFromStorage();
    }
}

async function loadProgramFromGitHub(fileName) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return null;
    }

    try {
        const filePath = `programs/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        const response = await fetch(addCacheBuster(`${apiUrl}?ref=training-programs`), {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const fileData = await response.json();
            const content = JSON.parse(atob(fileData.content));
            
            // Return just the program data, not the wrapper
            const { exportedAt, version, ...programData } = content;
            return programData;
        }
    } catch (error) {
        console.error(`Error loading program ${fileName} from GitHub:`, error);
    }

    return null;
}

async function deleteProgramFromGitHub(program) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }

    try {
        const fileName = `program-${program.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${program.id}.json`;
        const filePath = `programs/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        // Get the file SHA first
        const getResponse = await fetch(`${apiUrl}?ref=training-programs`, {
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
                    message: `Delete program: ${program.name}`,
                    sha: fileData.sha,
                    branch: 'training-programs'
                })
            });

            return deleteResponse.ok;
        }
    } catch (error) {
        console.error('Error deleting program from GitHub:', error);
    }
    
    return false;
}

function loadProgramsFromStorage() {
    const savedPrograms = localStorage.getItem('trainingPrograms');
    if (savedPrograms) {
        programs = JSON.parse(savedPrograms);
    } else {
        programs = [];
    }
}

async function syncProgramsWithGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration first.');
        return;
    }
    
    const syncButton = document.querySelector('[onclick="syncProgramsWithGitHub()"]');
    if (syncButton) {
        syncButton.disabled = true;
        syncButton.textContent = 'Syncing...';
    }
    
    try {
        // Upload all local programs to GitHub
        let successCount = 0;
        let errorCount = 0;
        
        for (const program of programs) {
            try {
                const success = await saveProgramToGitHub(program);
                if (success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error syncing program ${program.name}:`, error);
                errorCount++;
            }
        }
        
        if (errorCount === 0) {
            alert(`All ${successCount} programs synchronized with GitHub successfully!`);
        } else {
            alert(`Sync completed: ${successCount} successful, ${errorCount} failed. Check console for details.`);
        }
    } catch (error) {
        alert('Error synchronizing programs with GitHub: ' + error.message);
        console.error('Program sync error:', error);
    } finally {
        if (syncButton) {
            syncButton.disabled = false;
            syncButton.textContent = 'Sync Programs with GitHub';
        }
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
        lastUsed: currentProgramIndex >= 0 ? programs[currentProgramIndex].lastUsed : null,
        lastModified: new Date().toISOString()
    };

    try {
        // Save to GitHub first
        const githubSuccess = await saveProgramToGitHub(program);
        
        if (currentProgramIndex >= 0) {
            programs[currentProgramIndex] = program;
        } else {
            programs.push(program);
        }

        // Always save to localStorage as backup
        localStorage.setItem('trainingPrograms', JSON.stringify(programs));

        closeModal();
        loadPrograms();
        
        if (githubSuccess) {
            alert('Program saved successfully to GitHub!');
        } else if (githubConfig.token) {
            alert('Program saved locally, but failed to upload to GitHub. Check your settings.');
        } else {
            alert('Program saved locally. Configure GitHub to sync across devices.');
        }
        
    } catch (error) {
        alert('Error saving program: ' + error.message);
        console.error('Program save error:', error);
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

async function deleteProgram(programIndex) {
    const program = programs[programIndex];
    
    if (!confirm(`Are you sure you want to delete the program "${program.name}"? This cannot be undone.`)) {
        return;
    }
    
    try {
        // Delete from GitHub first
        const githubSuccess = await deleteProgramFromGitHub(program);
        
        // Remove from local array
        programs.splice(programIndex, 1);
        
        // Update localStorage
        localStorage.setItem('trainingPrograms', JSON.stringify(programs));
        
        // Refresh UI
        loadPrograms();
        
        if (githubSuccess) {
            alert('Program deleted successfully from GitHub!');
        } else if (githubConfig.token) {
            alert('Program deleted locally, but failed to delete from GitHub. Check your settings.');
        } else {
            alert('Program deleted locally.');
        }
        
    } catch (error) {
        alert('Error deleting program: ' + error.message);
        console.error('Program delete error:', error);
    }
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
                <strong>Target:</strong> ${exercise.sets.length} sets × ${exercise.reps} reps @ RPE ${exercise.rpe}
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
                size: file.size,
                type: file.type,
                file: file,
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
                sessionVideos = sessionVideos.filter(v => v.id !== videoId);
                videoContainer.remove();
            };
            
            videoContainer.appendChild(videoElement);
            videoContainer.appendChild(removeBtn);
            previewContainer.appendChild(videoContainer);
        }
    });
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
    
    if (successCount > 0) {
        localStorage.setItem('sessionVideos', JSON.stringify(sessionVideos));
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
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
        await saveDataToGitHub('workouts', workoutHistory);
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));

        const program = programs.find(p => p.id === currentWorkout.programId);
        if (program) {
            program.lastUsed = currentWorkout.completed;
            await saveProgramToGitHub(program);
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

// Utility and data management functions
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

function closeModal() {
    document.getElementById('programModal').style.display = 'none';
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
    
    const editWorkoutModal = document.getElementById('editWorkoutModal');
    if (event.target === editWorkoutModal) {
        closeEditWorkout();
    }
    
    const editMeasurementModal = document.getElementById('editMeasurementModal');
    if (event.target === editMeasurementModal) {
        closeEditMeasurement();
    }
    
    const editProgressPicturesModal = document.getElementById('editProgressPicturesModal');
    if (event.target === editProgressPicturesModal) {
        closeEditProgressPictures();
    }
}

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

    try {
        // Save to GitHub first
        const githubSuccess = await saveMeasurementToGitHub(measurement);
        
        // Add to local array
        measurements.push(measurement);
        measurements.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Always save to localStorage as backup
        localStorage.setItem('measurements', JSON.stringify(measurements));
        
        // Clear form
        document.getElementById('measurementDate').value = '';
        document.getElementById('weight').value = '';
        document.getElementById('bodyFat').value = '';
        document.getElementById('muscleMass').value = '';
        
        loadMeasurements();
        updateMeasurementChart();
        
        if (githubSuccess) {
            alert('Measurement saved successfully to GitHub!');
        } else if (githubConfig.token) {
            alert('Measurement saved locally, but failed to upload to GitHub. Check your settings.');
        } else {
            alert('Measurement saved locally. Configure GitHub to sync across devices.');
        }
        
    } catch (error) {
        alert('Error saving measurement: ' + error.message);
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
            githubUrl: null // Will be set when uploaded
        })),
        created: new Date().toISOString()
    };

    // Add to local array first (will be saved to GitHub when pictures are uploaded)
    progressPictures.push(pictureEntry);
    progressPictures.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
    
    // Clear form but keep files for uploading
    document.getElementById('pictureDate').value = '';
    document.getElementById('pictureNotes').value = '';
    
    loadProgressPictures();
    alert('Progress pictures entry created! Upload to GitHub to save permanently.');
}

async function uploadProgressPicturesToGitHub() {
    if (progressPictureFiles.length === 0) {
        alert('No new pictures to upload. Please add pictures first.');
        return;
    }

    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration in the Settings tab first.');
        return;
    }

    // Ensure the progress-pictures branch exists for actual image files
    const branchExists = await ensureProgressPicturesBranch();
    if (!branchExists) {
        alert('Could not create or access the progress-pictures branch. Please check your GitHub permissions and try again.');
        return;
    }

    const uploadButton = document.querySelector('[onclick="uploadProgressPicturesToGitHub()"]');
    if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.textContent = 'Uploading...';
    }

    const uploadStatus = document.createElement('div');
    uploadStatus.id = 'pictureUploadStatus';
    uploadStatus.style.cssText = 'margin-top: 15px;';
    
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

        // Now save the entry with GitHub URLs to GitHub as JSON
        if (successCount > 0) {
            const currentDate = document.getElementById('pictureDate').value || new Date().toISOString().split('T')[0];
            const currentNotes = document.getElementById('pictureNotes').value;
            
            const pictureEntry = {
                id: Date.now(),
                date: currentDate,
                notes: currentNotes,
                pictures: progressPictureFiles.filter(p => p.githubUrl).map(p => ({
                    id: p.id,
                    name: p.name,
                    size: p.size,
                    type: p.type,
                    githubUrl: p.githubUrl
                })),
                created: new Date().toISOString()
            };

            try {
                const githubSuccess = await saveProgressPictureEntryToGitHub(pictureEntry);
                
                // Update local array
                progressPictures.push(pictureEntry);
                progressPictures.sort((a, b) => new Date(a.date) - new Date(b.date));
                localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
                
                if (githubSuccess) {
                    uploadStatus.innerHTML += `<div class="upload-success">Progress picture entry saved to GitHub successfully!</div>`;
                } else {
                    uploadStatus.innerHTML += `<div class="upload-error">Images uploaded but failed to save entry metadata to GitHub.</div>`;
                }
            } catch (error) {
                uploadStatus.innerHTML += `<div class="upload-error">Images uploaded but failed to save entry: ${error.message}</div>`;
            }
            
            // Clear the upload queue
            progressPictureFiles = [];
            document.getElementById('progressPicturePreview').innerHTML = '';
            document.getElementById('progressPictures').value = '';
            document.getElementById('pictureDate').value = '';
            document.getElementById('pictureNotes').value = '';
            
            loadProgressPictures();
        }

    } finally {
        if (uploadButton) {
            uploadButton.disabled = false;
            uploadButton.textContent = 'Upload to GitHub';
        }
    }
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
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-sm" onclick="editMeasurement(${actualIndex})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteMeasurement(${actualIndex})">Delete</button>
                </div>
            </div>
        `;
        measurementsList.appendChild(measurementItem);
    });
}

// Update loadProgressPictures function to include edit buttons
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
                    ${entry.notes ? `<p><strong>Notes:</strong> ${entry.notes}</p>` : ''}
                    <p><strong>Pictures:</strong> ${entry.pictures.length}</p>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-sm" onclick="editProgressPictureEntry(${actualIndex})">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProgressPictureEntry(${actualIndex})">Delete</button>
                </div>
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

async function deleteMeasurement(index) {
    const measurement = measurements[index];
    
    if (!confirm('Are you sure you want to delete this measurement?')) {
        return;
    }
    
    try {
        // Delete from GitHub first
        const githubSuccess = await deleteMeasurementFromGitHub(measurement);
        
        // Remove from local array
        measurements.splice(index, 1);
        
        // Update localStorage
        localStorage.setItem('measurements', JSON.stringify(measurements));
        
        // Refresh displays
        loadMeasurements();
        updateMeasurementChart();
        
        if (githubSuccess) {
            alert('Measurement deleted successfully from GitHub!');
        } else if (githubConfig.token) {
            alert('Measurement deleted locally, but failed to delete from GitHub. Check your settings.');
        } else {
            alert('Measurement deleted locally.');
        }
        
    } catch (error) {
        alert('Error deleting measurement: ' + error.message);
        console.error('Measurement delete error:', error);
    }
}

async function deleteProgressPicture(entryIndex, pictureIndex) {
    const entry = progressPictures[entryIndex];
    const picture = entry.pictures[pictureIndex];
    
    if (!confirm(`Are you sure you want to delete this progress picture "${picture.name}"?`)) {
        return;
    }
    
    try {
        // Remove the picture from the entry
        entry.pictures.splice(pictureIndex, 1);
        
        // If this was the last picture, remove the entire entry
        if (entry.pictures.length === 0) {
            // Delete the entire entry from GitHub
            const githubSuccess = await deleteProgressPictureEntryFromGitHub(entry);
            progressPictures.splice(entryIndex, 1);
            
            if (githubSuccess) {
                alert('Progress picture entry deleted successfully from GitHub!');
            } else if (githubConfig.token) {
                alert('Progress picture entry deleted locally, but failed to delete from GitHub.');
            }
        } else {
            // Update the existing entry on GitHub
            const githubSuccess = await saveProgressPictureEntryToGitHub(entry);
            
            if (githubSuccess) {
                alert('Progress picture deleted and entry updated on GitHub successfully!');
            } else if (githubConfig.token) {
                alert('Progress picture deleted locally, but failed to update GitHub.');
            }
        }
        
        // Update localStorage
        localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
        
        // Refresh display
        loadProgressPictures();
        
    } catch (error) {
        alert('Error deleting progress picture: ' + error.message);
        console.error('Progress picture delete error:', error);
    }
}

async function deleteProgressPictureEntry(index) {
    const pictureEntry = progressPictures[index];
    
    if (!confirm('Are you sure you want to delete this entire progress picture entry?')) {
        return;
    }
    
    try {
        // Delete from GitHub first
        const githubSuccess = await deleteProgressPictureEntryFromGitHub(pictureEntry);
        
        // Remove from local array
        progressPictures.splice(index, 1);
        
        // Update localStorage
        localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
        
        // Refresh display
        loadProgressPictures();
        
        if (githubSuccess) {
            alert('Progress picture entry deleted successfully from GitHub!');
        } else if (githubConfig.token) {
            alert('Progress picture entry deleted locally, but failed to delete from GitHub. Check your settings.');
        } else {
            alert('Progress picture entry deleted locally.');
        }
        
    } catch (error) {
        alert('Error deleting progress picture entry: ' + error.message);
        console.error('Progress picture delete error:', error);
    }
}

function viewProgressPicture(imageUrl, imageName) {
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

// History management functions
function loadHistory() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';

    if (workoutHistory.length === 0) {
        historyList.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No workout history found. Complete your first workout to see it here.</p>';
        return;
    }

    const sortedHistory = [...workoutHistory].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedHistory.forEach((workout, index) => {
        const actualIndex = workoutHistory.findIndex(w => w.date === workout.date && w.programId === workout.programId);
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const completedSets = workout.exercises.reduce((total, exercise) => 
            total + exercise.sets.filter(set => set.completed).length, 0);
        const totalSets = workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
        
        const duration = workout.duration ? formatDuration(workout.duration) : 'Not recorded';
        
        historyItem.innerHTML = `
            <div style="display: flex; justify-content: between; align-items: start;">
                <div style="flex: 1;">
                    <h4>${workout.programName}</h4>
                    <p><strong>Date:</strong> ${new Date(workout.date).toLocaleDateString()}</p>
                    <p><strong>Duration:</strong> ${duration}</p>
                    <p><strong>Sets Completed:</strong> ${completedSets}/${totalSets}</p>
                    <p><strong>Exercises:</strong> ${workout.exercises.length}</p>
                    ${workout.videos && workout.videos.length > 0 ? `<p><strong>Videos:</strong> ${workout.videos.length}</p>` : ''}
                    ${workout.sessionNotes ? `<p><strong>Notes:</strong> ${workout.sessionNotes}</p>` : ''}
                </div>
                <div style="display: flex; gap: 8px; margin-left: 16px;">
                    <button class="btn btn-sm" onclick="editWorkout(${actualIndex})">Edit</button>
                    <button class="btn" onclick="viewWorkoutDetails(${actualIndex})">View Details</button>
                    <button class="btn btn-danger" onclick="deleteWorkout(${actualIndex})">Delete</button>
                </div>
            </div>
        `;
        historyList.appendChild(historyItem);
    });
}

async function deleteWorkout(index) {
    const workout = workoutHistory[index];
    
    if (!confirm(`Are you sure you want to delete the workout "${workout.programName}" from ${new Date(workout.date).toLocaleDateString()}? This cannot be undone.`)) {
        return;
    }
    
    try {
        // Remove from local array
        workoutHistory.splice(index, 1);
        
        // Save updated history to GitHub and localStorage
        await saveDataToGitHub('workouts', workoutHistory);
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
        
        // Refresh displays
        loadHistory();
        updateStats();
        
        alert('Workout deleted successfully from GitHub!');
        
    } catch (error) {
        if (githubConfig.token) {
            alert('Workout deleted locally, but failed to delete from GitHub: ' + error.message);
        } else {
            alert('Workout deleted locally.');
        }
        console.error('Workout delete error:', error);
    }
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

// Update the viewWorkoutDetails function to add Edit button
function viewWorkoutDetails(index) {
    const workout = workoutHistory[index];
    const modal = document.getElementById('workoutDetailsModal');
    const title = document.getElementById('workoutDetailsTitle');
    const content = document.getElementById('workoutDetailsContent');
    
    title.textContent = `${workout.programName} - ${new Date(workout.date).toLocaleDateString()}`;
    
    let detailsHTML = `
        <div style="margin-bottom: 20px;">
            <p><strong>Duration:</strong> ${workout.duration ? formatDuration(workout.duration) : 'Not recorded'}</p>
            ${workout.sessionNotes ? `<p><strong>Session Notes:</strong> ${workout.sessionNotes}</p>` : ''}
        </div>
    `;
    
    workout.exercises.forEach((exercise, exerciseIndex) => {
        detailsHTML += `
            <div class="exercise-card" style="margin-bottom: 20px;">
                <h4>${exercise.name}</h4>
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
                            <div>${set.weight || '-'}</div>
                            <div>${set.reps || '-'}</div>
                            <div>${set.rpe || '-'}</div>
                            <div>${set.notes || '-'}</div>
                            <div>${set.completed ? '✓' : '✗'}</div>
                        </div>
                    `).join('')}
                </div>
                ${exercise.exerciseNotes ? `<p style="margin-top: 12px;"><strong>Exercise Notes:</strong> ${exercise.exerciseNotes}</p>` : ''}
            </div>
        `;
    });
    
    if (workout.videos && workout.videos.length > 0) {
        detailsHTML += `
            <div style="margin-top: 20px;">
                <h4>Session Videos (${workout.videos.length})</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
        `;
        
        workout.videos.forEach(video => {
            if (video.githubUrl) {
                const videoUrl = video.githubUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
                detailsHTML += `
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 12px; border: 1px solid #e8e8e8;">
                        <video style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; cursor: pointer;" 
                               onclick="viewWorkoutVideo('${videoUrl}', '${video.name}')"
                               poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M8 5v14l11-7z'/%3E%3C/svg%3E">
                            <source src="${videoUrl}" type="video/mp4">
                        </video>
                        <p style="margin-top: 8px; font-size: 0.9em; color: #666; text-align: center;">${video.name}</p>
                        <div style="text-align: center; margin-top: 8px;">
                            <button class="btn btn-sm" onclick="viewWorkoutVideo('${videoUrl}', '${video.name}')">Play Video</button>
                            <a href="${video.githubUrl}" target="_blank" style="margin-left: 8px; color: #00d4ff; font-size: 0.85em;">GitHub</a>
                        </div>
                    </div>
                `;
            } else {
                detailsHTML += `
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 12px; border: 1px solid #e8e8e8; text-align: center;">
                        <div style="width: 100%; height: 120px; background: #e0e0e0; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #666;">
                            <span>Video not uploaded</span>
                        </div>
                        <p style="margin-top: 8px; font-size: 0.9em; color: #666;">${video.name}</p>
                    </div>
                `;
            }
        });
        
        detailsHTML += '</div></div>';
    }
    
    content.innerHTML = detailsHTML;
    modal.style.display = 'block';
    
    // Store current workout index for delete and edit functions
    window.currentWorkoutDetailsIndex = index;
}

function viewWorkoutVideo(videoUrl, videoName) {
    const videoModal = document.createElement('div');
    videoModal.className = 'modal';
    videoModal.style.display = 'block';
    videoModal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-height: 90%;">
            <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h3>${videoName}</h3>
            <video controls style="width: 100%; max-height: 70vh; border-radius: 8px;">
                <source src="${videoUrl}" type="video/mp4">
                <source src="${videoUrl}" type="video/webm">
                <source src="${videoUrl}" type="video/mov">
                Your browser does not support the video tag.
            </video>
            <p style="margin-top: 15px; text-align: center;">
                <a href="${videoUrl}" target="_blank" style="color: #00d4ff;">Open in new tab</a>
            </p>
        </div>
    `;
    document.body.appendChild(videoModal);
}

function closeWorkoutDetails() {
    document.getElementById('workoutDetailsModal').style.display = 'none';
}

// Update the deleteWorkoutFromDetails function to also include edit option
function deleteWorkoutFromDetails() {
    const index = window.currentWorkoutDetailsIndex;
    if (index !== undefined) {
        closeWorkoutDetails();
        deleteWorkout(index);
    }
}

// Add new function for editing from details modal
function editWorkoutFromDetails() {
    const index = window.currentWorkoutDetailsIndex;
    if (index !== undefined) {
        closeWorkoutDetails();
        editWorkout(index);
    }
}



async function syncHistoryWithGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration first.');
        return;
    }
    
    const syncButton = document.querySelector('[onclick="syncHistoryWithGitHub()"]');
    if (syncButton) {
        syncButton.disabled = true;
        syncButton.textContent = 'Syncing...';
    }
    
    try {
        await saveDataToGitHub('workouts', workoutHistory);
        alert('Workout history synchronized with GitHub successfully!');
    } catch (error) {
        alert('Error synchronizing workout history with GitHub: ' + error.message);
        console.error('History sync error:', error);
    } finally {
        if (syncButton) {
            syncButton.disabled = false;
            syncButton.textContent = 'Sync with GitHub';
        }
    }
}

// Search functions
function searchPrograms(query) {
    const programCards = document.querySelectorAll('.program-card');
    const searchQuery = query.toLowerCase().trim();
    
    programCards.forEach(card => {
        const programName = card.querySelector('h3').textContent.toLowerCase();
        const programDescription = card.querySelector('p').textContent.toLowerCase();
        
        if (programName.includes(searchQuery) || programDescription.includes(searchQuery)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function searchHistory(query) {
    const historyItems = document.querySelectorAll('.history-item');
    const searchQuery = query.toLowerCase().trim();
    
    historyItems.forEach(item => {
        const itemText = item.textContent.toLowerCase();
        
        if (itemText.includes(searchQuery)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function searchStats(query) {
    // This will filter the personal records and other stats displays
    const searchQuery = query.toLowerCase().trim();
    updateStats(searchQuery);
}

// Analytics and stats functions
function updateStats(searchFilter = '') {
    updatePersonalRecords(searchFilter);
    updateVolumeChart(searchFilter);
    updateStrengthChart(searchFilter);
    updateFrequencyAnalysis(searchFilter);
}

function updatePersonalRecords(searchFilter = '') {
    const recordsContainer = document.getElementById('personalRecords');
    
    if (workoutHistory.length === 0) {
        recordsContainer.innerHTML = '<p style="color: #666;">No workout data available for analysis.</p>';
        return;
    }
    
    const exerciseRecords = {};
    
    workoutHistory.forEach(workout => {
        workout.exercises.forEach(exercise => {
            const exerciseName = exercise.name.toLowerCase();
            
            // Apply search filter
            if (searchFilter && !exerciseName.includes(searchFilter.toLowerCase())) {
                return;
            }
            
            if (!exerciseRecords[exercise.name]) {
                exerciseRecords[exercise.name] = {
                    maxWeight: 0,
                    maxVolume: 0,
                    maxReps: 0,
                    bestSet: null
                };
            }
            
            exercise.sets.forEach(set => {
                if (set.completed && set.weight && set.reps) {
                    const weight = parseFloat(set.weight);
                    const reps = parseInt(set.reps);
                    const volume = weight * reps;
                    
                    if (weight > exerciseRecords[exercise.name].maxWeight) {
                        exerciseRecords[exercise.name].maxWeight = weight;
                        exerciseRecords[exercise.name].bestSet = {
                            weight: weight,
                            reps: reps,
                            date: workout.date
                        };
                    }
                    
                    if (volume > exerciseRecords[exercise.name].maxVolume) {
                        exerciseRecords[exercise.name].maxVolume = volume;
                    }
                    
                    if (reps > exerciseRecords[exercise.name].maxReps) {
                        exerciseRecords[exercise.name].maxReps = reps;
                    }
                }
            });
        });
    });
    
    if (Object.keys(exerciseRecords).length === 0) {
        recordsContainer.innerHTML = '<p style="color: #666;">No personal records found.</p>';
        return;
    }
    
    let recordsHTML = '<div style="max-height: 300px; overflow-y: auto;">';
    
    Object.entries(exerciseRecords).forEach(([exercise, records]) => {
        if (records.bestSet) {
            recordsHTML += `
                <div style="margin-bottom: 15px; padding: 12px; background: #ffffff; border-radius: 8px; border-left: 4px solid #28a745;">
                    <h4 style="margin-bottom: 8px; color: #1a1a1a;">${exercise}</h4>
                    <p><strong>Max Weight:</strong> ${records.maxWeight}kg × ${records.bestSet.reps} reps</p>
                    <p><strong>Date:</strong> ${new Date(records.bestSet.date).toLocaleDateString()}</p>
                </div>
            `;
        }
    });
    
    recordsHTML += '</div>';
    recordsContainer.innerHTML = recordsHTML;
}

function updateVolumeChart(searchFilter = '') {
    const ctx = document.getElementById('volumeChart');
    if (!ctx) return;

    if (volumeChart) {
        volumeChart.destroy();
    }

    if (workoutHistory.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        ctx.getContext('2d').fillStyle = '#666';
        ctx.getContext('2d').textAlign = 'center';
        ctx.getContext('2d').fillText('No data available', ctx.width / 2, ctx.height / 2);
        return;
    }

    const volumeData = {};
    
    workoutHistory.forEach(workout => {
        const date = new Date(workout.date).toLocaleDateString();
        let totalVolume = 0;
        
        workout.exercises.forEach(exercise => {
            const exerciseName = exercise.name.toLowerCase();
            
            // Apply search filter
            if (searchFilter && !exerciseName.includes(searchFilter.toLowerCase())) {
                return;
            }
            
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

function updateStrengthChart(searchFilter = '') {
    const ctx = document.getElementById('strengthChart');
    if (!ctx) return;

    if (strengthChart) {
        strengthChart.destroy();
    }

    if (workoutHistory.length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        ctx.getContext('2d').fillStyle = '#666';
        ctx.getContext('2d').textAlign = 'center';
        ctx.getContext('2d').fillText('No data available', ctx.width / 2, ctx.height / 2);
        return;
    }

    // Find the most frequently performed exercise (or use search filter)
    const exerciseFrequency = {};
    
    workoutHistory.forEach(workout => {
        workout.exercises.forEach(exercise => {
            const exerciseName = exercise.name.toLowerCase();
            
            if (searchFilter && !exerciseName.includes(searchFilter.toLowerCase())) {
                return;
            }
            
            exerciseFrequency[exercise.name] = (exerciseFrequency[exercise.name] || 0) + 1;
        });
    });

    if (Object.keys(exerciseFrequency).length === 0) {
        ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
        ctx.getContext('2d').fillStyle = '#666';
        ctx.getContext('2d').textAlign = 'center';
        ctx.getContext('2d').fillText('No matching exercises found', ctx.width / 2, ctx.height / 2);
        return;
    }

    const topExercise = Object.keys(exerciseFrequency).sort((a, b) => exerciseFrequency[b] - exerciseFrequency[a])[0];
    
    const strengthData = {};
    
    workoutHistory.forEach(workout => {
        const matchingExercise = workout.exercises.find(ex => ex.name === topExercise);
        if (matchingExercise) {
            const date = new Date(workout.date).toLocaleDateString();
            let maxWeight = 0;
            
            matchingExercise.sets.forEach(set => {
                if (set.completed && set.weight) {
                    maxWeight = Math.max(maxWeight, parseFloat(set.weight));
                }
            });
            
            if (maxWeight > 0) {
                strengthData[date] = maxWeight;
            }
        }
    });

    const labels = Object.keys(strengthData).sort((a, b) => new Date(a) - new Date(b));
    const data = labels.map(date => strengthData[date]);

    strengthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${topExercise} - Max Weight (kg)`,
                data: data,
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220, 53, 69, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Weight (kg)' }
                }
            }
        }
    });
}

function updateFrequencyAnalysis(searchFilter = '') {
    const frequencyContainer = document.getElementById('frequencyAnalysis');
    
    if (workoutHistory.length === 0) {
        frequencyContainer.innerHTML = '<p style="color: #666;">No workout data available for analysis.</p>';
        return;
    }
    
    const exerciseFrequency = {};
    const weeklyFrequency = {};
    
    workoutHistory.forEach(workout => {
        const date = new Date(workout.date);
        const weekKey = getWeekKey(date);
        
        workout.exercises.forEach(exercise => {
            const exerciseName = exercise.name.toLowerCase();
            
            // Apply search filter
            if (searchFilter && !exerciseName.includes(searchFilter.toLowerCase())) {
                return;
            }
            
            exerciseFrequency[exercise.name] = (exerciseFrequency[exercise.name] || 0) + 1;
        });
        
        if (!searchFilter || Object.keys(exerciseFrequency).length > 0) {
            weeklyFrequency[weekKey] = (weeklyFrequency[weekKey] || 0) + 1;
        }
    });
    
    let analysisHTML = '<div style="max-height: 300px; overflow-y: auto;">';
    
    // Exercise frequency
    const sortedExercises = Object.entries(exerciseFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
    
    if (sortedExercises.length > 0) {
        analysisHTML += '<h4>Most Performed Exercises:</h4>';
        sortedExercises.forEach(([exercise, count]) => {
            analysisHTML += `<p><strong>${exercise}:</strong> ${count} sessions</p>`;
        });
    }
    
    // Weekly frequency
    const weeklyAverage = Object.values(weeklyFrequency).reduce((sum, count) => sum + count, 0) / Object.keys(weeklyFrequency).length;
    
    analysisHTML += `<h4 style="margin-top: 20px;">Training Frequency:</h4>`;
    analysisHTML += `<p><strong>Average workouts per week:</strong> ${weeklyAverage.toFixed(1)}</p>`;
    analysisHTML += `<p><strong>Total workouts:</strong> ${workoutHistory.length}</p>`;
    
    analysisHTML += '</div>';
    frequencyContainer.innerHTML = analysisHTML;
}

function getWeekKey(date) {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - startOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${weekNumber}`;
}

// Data export/import functions
function exportData() {
    const exportData = {
        programs: programs,
        workoutHistory: workoutHistory,
        measurements: measurements,
        progressPictures: progressPictures,
        githubConfig: githubConfig,
        exportDate: new Date().toISOString(),
        version: "1.0"
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `training-logger-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (!confirm('This will replace all current data with the imported data. Are you sure you want to continue?')) {
                return;
            }
            
            // Import data
            if (importedData.programs) programs = importedData.programs;
            if (importedData.workoutHistory) workoutHistory = importedData.workoutHistory;
            if (importedData.measurements) measurements = importedData.measurements;
            if (importedData.progressPictures) progressPictures = importedData.progressPictures;
            
            // Don't import GitHub config for security reasons
            
            // Save to localStorage
            localStorage.setItem('trainingPrograms', JSON.stringify(programs));
            localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
            localStorage.setItem('measurements', JSON.stringify(measurements));
            localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
            
            // Refresh all displays
            loadPrograms();
            loadHistory();
            loadMeasurements();
            loadProgressPictures();
            updateStats();
            updateMeasurementChart();
            
            alert('Data imported successfully!');
            
        } catch (error) {
            alert('Error importing data: ' + error.message);
            console.error('Import error:', error);
        }
    };
    reader.readAsText(file);
}

async function syncAllDataWithGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        alert('Please configure GitHub integration first.');
        return;
    }
    
    const syncButton = document.querySelector('[onclick="syncAllDataWithGitHub()"]');
    if (syncButton) {
        syncButton.disabled = true;
        syncButton.textContent = 'Syncing All Data...';
    }
    
    try {
        let successCount = 0;
        let errorCount = 0;
        let errors = [];
        
        // Sync programs
        try {
            for (const program of programs) {
                await saveProgramToGitHub(program);
            }
            successCount++;
        } catch (error) {
            errorCount++;
            errors.push('Programs: ' + error.message);
        }
        
        // Sync workout history
        try {
            await saveDataToGitHub('workouts', workoutHistory);
            successCount++;
        } catch (error) {
            errorCount++;
            errors.push('Workout history: ' + error.message);
        }
        
        // Sync measurements
        try {
            await saveDataToGitHub('measurements', measurements);
            successCount++;
        } catch (error) {
            errorCount++;
            errors.push('Measurements: ' + error.message);
        }
        
        // Sync progress pictures metadata
        try {
            await saveDataToGitHub('progress-pictures', progressPictures);
            successCount++;
        } catch (error) {
            errorCount++;
            errors.push('Progress pictures: ' + error.message);
        }
        
        if (errorCount === 0) {
            alert('All data synchronized successfully with GitHub!');
        } else {
            alert(`Sync completed with ${successCount} successful and ${errorCount} failed operations.\n\nErrors:\n${errors.join('\n')}`);
        }
        
    } catch (error) {
        alert('Error during full sync: ' + error.message);
        console.error('Full sync error:', error);
    } finally {
        if (syncButton) {
            syncButton.disabled = false;
            syncButton.textContent = 'Full Data Sync';
        }
    }
}

// Clear all data function
function clearAllData() {
    if (!confirm('This will permanently delete ALL data including programs, workout history, measurements, and progress pictures. This cannot be undone. Are you sure?')) {
        return;
    }
    
    if (!confirm('Last chance! This will delete everything. Are you absolutely sure?')) {
        return;
    }
    
    // Clear all data
    programs = [];
    workoutHistory = [];
    measurements = [];
    progressPictures = [];
    sessionVideos = [];
    progressPictureFiles = [];
    currentWorkout = null;
    
    // Clear localStorage
    localStorage.removeItem('trainingPrograms');
    localStorage.removeItem('workoutHistory');
    localStorage.removeItem('measurements');
    localStorage.removeItem('progressPictures');
    localStorage.removeItem('sessionVideos');
    
    // Refresh all displays
    loadPrograms();
    loadHistory();
    loadMeasurements();
    loadProgressPictures();
    updateStats();
    updateMeasurementChart();
    
    // Clear current workout display
    document.getElementById('currentProgram').innerHTML = '<p>Select a program to start your workout</p>';
    document.getElementById('sessionNotes').value = '';
    document.getElementById('videoPreview').innerHTML = '';
    document.getElementById('uploadStatus').innerHTML = '';
    document.getElementById('uploadProgress').style.display = 'none';
    
    alert('All data has been cleared.');
}

function clearAllHistory() {
    if (!confirm('This will permanently delete all workout history. This cannot be undone. Are you sure?')) {
        return;
    }
    
    workoutHistory = [];
    localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
    
    // Try to sync the empty history to GitHub
    if (githubConfig.token && githubConfig.username && githubConfig.repo) {
        saveDataToGitHub('workouts', workoutHistory)
            .then(() => {
                alert('All workout history cleared and synced to GitHub.');
            })
            .catch(error => {
                alert('History cleared locally, but failed to sync to GitHub: ' + error.message);
            });
    } else {
        alert('All workout history cleared locally.');
    }
    
    loadHistory();
    updateStats();
}

// Individual measurement GitHub functions
async function saveMeasurementToGitHub(measurement) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }

    try {
        const branchExists = await ensureTrainingDataBranch();
        if (!branchExists) {
            console.error('Could not create or access the training-data branch');
            return false;
        }

        const fileName = `measurement-${measurement.date}-${measurement.id}.json`;
        const filePath = `measurements/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        const measurementData = {
            ...measurement,
            exportedAt: new Date().toISOString(),
            version: "1.0"
        };

        const content = btoa(JSON.stringify(measurementData, null, 2));

        // Check if file already exists (for updates)
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
            // File doesn't exist, which is fine for new measurements
        }

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: sha ? `Update measurement: ${measurement.date}` : `Add measurement: ${measurement.date}`,
                content: content,
                branch: 'training-data',
                ...(sha && { sha })
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Error saving measurement to GitHub:', error);
        return false;
    }
}

async function loadMeasurementsFromGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        console.log('GitHub not configured, using localStorage for measurements');
        loadMeasurementsFromStorage();
        return;
    }

    try {
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/measurements`;
        const response = await fetch(addCacheBuster(`${apiUrl}?ref=training-data`), {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const files = await response.json();
            const measurementFiles = files.filter(f => f.name.startsWith('measurement-') && f.name.endsWith('.json'));
            
            measurements = [];
            
            for (const file of measurementFiles) {
                try {
                    const measurementData = await loadMeasurementFromGitHub(file.name);
                    if (measurementData) {
                        measurements.push(measurementData);
                    }
                } catch (error) {
                    console.error(`Error loading measurement file ${file.name}:`, error);
                }
            }
            
            measurements.sort((a, b) => new Date(a.date) - new Date(b.date));
            console.log(`Loaded ${measurements.length} measurements from GitHub`);
            
        } else if (response.status === 404) {
            console.log('Measurements directory not found on GitHub, starting fresh');
            measurements = [];
        } else {
            throw new Error(`Failed to load measurements: ${response.status}`);
        }
    } catch (error) {
        console.error('Error loading measurements from GitHub, falling back to localStorage:', error);
        loadMeasurementsFromStorage();
    }
}

async function loadMeasurementFromGitHub(fileName) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return null;
    }

    try {
        const filePath = `measurements/${fileName}`;
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
            
            const { exportedAt, version, ...measurementData } = content;
            return measurementData;
        }
    } catch (error) {
        console.error(`Error loading measurement ${fileName} from GitHub:`, error);
    }

    return null;
}

async function deleteMeasurementFromGitHub(measurement) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }

    try {
        const fileName = `measurement-${measurement.date}-${measurement.id}.json`;
        const filePath = `measurements/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

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
                    message: `Delete measurement: ${measurement.date}`,
                    sha: fileData.sha,
                    branch: 'training-data'
                })
            });

            return deleteResponse.ok;
        }
    } catch (error) {
        console.error('Error deleting measurement from GitHub:', error);
    }
    
    return false;
}

function loadMeasurementsFromStorage() {
    const savedMeasurements = localStorage.getItem('measurements');
    if (savedMeasurements) {
        measurements = JSON.parse(savedMeasurements);
    } else {
        measurements = [];
    }
}

// Individual progress picture GitHub functions
async function saveProgressPictureEntryToGitHub(pictureEntry) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }

    try {
        const branchExists = await ensureTrainingDataBranch();
        if (!branchExists) {
            console.error('Could not create or access the training-data branch');
            return false;
        }

        const fileName = `progress-pictures-${pictureEntry.date}-${pictureEntry.id}.json`;
        const filePath = `progress-pictures/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        const pictureData = {
            ...pictureEntry,
            exportedAt: new Date().toISOString(),
            version: "1.0"
        };

        const content = btoa(JSON.stringify(pictureData, null, 2));

        // Check if file already exists (for updates)
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
            // File doesn't exist, which is fine for new entries
        }

        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: sha ? `Update progress pictures: ${pictureEntry.date}` : `Add progress pictures: ${pictureEntry.date}`,
                content: content,
                branch: 'training-data',
                ...(sha && { sha })
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Error saving progress picture entry to GitHub:', error);
        return false;
    }
}

async function loadProgressPicturesFromGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        console.log('GitHub not configured, using localStorage for progress pictures');
        loadProgressPicturesFromStorage();
        return;
    }

    try {
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/progress-pictures`;
        const response = await fetch(addCacheBuster(`${apiUrl}?ref=training-data`), {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const files = await response.json();
            const pictureFiles = files.filter(f => f.name.startsWith('progress-pictures-') && f.name.endsWith('.json'));
            
            progressPictures = [];
            
            for (const file of pictureFiles) {
                try {
                    const pictureData = await loadProgressPictureEntryFromGitHub(file.name);
                    if (pictureData) {
                        progressPictures.push(pictureData);
                    }
                } catch (error) {
                    console.error(`Error loading progress picture file ${file.name}:`, error);
                }
            }
            
            progressPictures.sort((a, b) => new Date(a.date) - new Date(b.date));
            console.log(`Loaded ${progressPictures.length} progress picture entries from GitHub`);
            
        } else if (response.status === 404) {
            console.log('Progress pictures directory not found on GitHub, starting fresh');
            progressPictures = [];
        } else {
            throw new Error(`Failed to load progress pictures: ${response.status}`);
        }
    } catch (error) {
        console.error('Error loading progress pictures from GitHub, falling back to localStorage:', error);
        loadProgressPicturesFromStorage();
    }
}

async function loadProgressPictureEntryFromGitHub(fileName) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return null;
    }

    try {
        const filePath = `progress-pictures/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

        const response = await fetch(addCacheBuster(`${apiUrl}?ref=training-data`), {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const fileData = await response.json();
            const content = JSON.parse(atob(fileData.content));
            
            const { exportedAt, version, ...pictureData } = content;
            return pictureData;
        }
    } catch (error) {
        console.error(`Error loading progress picture entry ${fileName} from GitHub:`, error);
    }

    return null;
}

async function deleteProgressPictureEntryFromGitHub(pictureEntry) {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        return false;
    }

    try {
        const fileName = `progress-pictures-${pictureEntry.date}-${pictureEntry.id}.json`;
        const filePath = `progress-pictures/${fileName}`;
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/${filePath}`;

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
                    message: `Delete progress pictures: ${pictureEntry.date}`,
                    sha: fileData.sha,
                    branch: 'training-data'
                })
            });

            return deleteResponse.ok;
        }
    } catch (error) {
        console.error('Error deleting progress picture entry from GitHub:', error);
    }
    
    return false;
}

function loadProgressPicturesFromStorage() {
    const savedProgressPictures = localStorage.getItem('progressPictures');
    if (savedProgressPictures) {
        progressPictures = JSON.parse(savedProgressPictures);
    } else {
        progressPictures = [];
    }
}

async function loadWorkoutHistoryFromGitHub() {
    if (!githubConfig.token || !githubConfig.username || !githubConfig.repo) {
        console.log('GitHub not configured, using localStorage for workout history');
        loadWorkoutHistoryFromStorage();
        return;
    }

    try {
        const apiUrl = `https://api.github.com/repos/${githubConfig.username}/${githubConfig.repo}/contents/data`;
        const response = await fetch(addCacheBuster(`${apiUrl}?ref=training-data`), {
            method: 'GET',
            headers: {
                'Authorization': `token ${githubConfig.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            const files = await response.json();
            const workoutFiles = files.filter(f => f.name.startsWith('workouts-'));
            
            if (workoutFiles.length > 0) {
                const latestWorkouts = workoutFiles.sort((a, b) => b.name.localeCompare(a.name))[0];
                const workoutData = await loadDataFromGitHub('workouts', latestWorkouts.name);
                if (workoutData) {
                    workoutHistory = workoutData;
                    console.log(`Loaded ${workoutHistory.length} workouts from GitHub`);
                }
            }
        } else if (response.status === 404) {
            console.log('Workout history not found on GitHub, starting fresh');
            workoutHistory = [];
        }
    } catch (error) {
        console.error('Error loading workout history from GitHub, falling back to localStorage:', error);
        loadWorkoutHistoryFromStorage();
    }
}

function loadWorkoutHistoryFromStorage() {
    const savedHistory = localStorage.getItem('workoutHistory');
    if (savedHistory) {
        workoutHistory = JSON.parse(savedHistory);
    } else {
        workoutHistory = [];
    }
}

// Edit workout functionality
let currentEditWorkoutIndex = -1;
let editWorkoutVideos = [];
let newEditWorkoutVideos = [];

function editWorkout(index) {
    currentEditWorkoutIndex = index;
    const workout = workoutHistory[index];
    
    // Populate modal with current workout data
    document.getElementById('editWorkoutTitle').textContent = `Edit: ${workout.programName}`;
    document.getElementById('editWorkoutDate').value = new Date(workout.date).toISOString().split('T')[0];
    document.getElementById('editProgramName').value = workout.programName;
    document.getElementById('editSessionNotes').value = workout.sessionNotes || '';
    
    // Load exercises
    loadEditExercises(workout.exercises);
    
    // Load existing videos
    editWorkoutVideos = [...(workout.videos || [])];
    newEditWorkoutVideos = [];
    loadEditWorkoutVideos();
    
    document.getElementById('editWorkoutModal').style.display = 'block';
}

function loadEditExercises(exercises) {
    const exerciseList = document.getElementById('editExerciseList');
    exerciseList.innerHTML = '';
    
    exercises.forEach((exercise, exerciseIndex) => {
        const exerciseDiv = document.createElement('div');
        exerciseDiv.className = 'exercise-card';
        exerciseDiv.innerHTML = `
            <div class="exercise-header">
                <div class="exercise-name">${exercise.name}</div>
                <button class="btn btn-danger btn-sm" onclick="removeEditExercise(${exerciseIndex})">Remove Exercise</button>
            </div>
            <div class="form-group">
                <label>Exercise Notes</label>
                <textarea onchange="updateEditExerciseNotes(${exerciseIndex}, this.value)" 
                          placeholder="How did this exercise feel? Any adjustments needed...">${exercise.exerciseNotes || ''}</textarea>
            </div>
            <div class="sets-container">
                <div class="set-row" style="font-weight: bold; background: rgba(0, 212, 255, 0.1);">
                    <div>Set</div>
                    <div>Weight</div>
                    <div>Reps</div>
                    <div>RPE</div>
                    <div>Notes</div>
                    <div>✓</div>
                    <div>Action</div>
                </div>
                ${exercise.sets.map((set, setIndex) => `
                    <div class="set-row">
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
                        <button class="btn btn-danger btn-sm" onclick="removeEditSet(${exerciseIndex}, ${setIndex})">×</button>
                    </div>
                `).join('')}
                <div style="margin-top: 10px;">
                    <button class="btn btn-sm" onclick="addEditSet(${exerciseIndex})">Add Set</button>
                </div>
            </div>
        `;
        exerciseList.appendChild(exerciseDiv);
    });
    
    // Add button to add new exercise
    const addExerciseButton = document.createElement('button');
    addExerciseButton.className = 'btn';
    addExerciseButton.textContent = 'Add New Exercise';
    addExerciseButton.onclick = addEditExercise;
    exerciseList.appendChild(addExerciseButton);
}

function updateEditSet(exerciseIndex, setIndex, field, value) {
    const workout = workoutHistory[currentEditWorkoutIndex];
    workout.exercises[exerciseIndex].sets[setIndex][field] = value;
}

function updateEditExerciseNotes(exerciseIndex, notes) {
    const workout = workoutHistory[currentEditWorkoutIndex];
    workout.exercises[exerciseIndex].exerciseNotes = notes;
}

function removeEditSet(exerciseIndex, setIndex) {
    const workout = workoutHistory[currentEditWorkoutIndex];
    workout.exercises[exerciseIndex].sets.splice(setIndex, 1);
    loadEditExercises(workout.exercises);
}

function addEditSet(exerciseIndex) {
    const workout = workoutHistory[currentEditWorkoutIndex];
    workout.exercises[exerciseIndex].sets.push({
        weight: '',
        reps: '',
        rpe: '',
        completed: false,
        notes: ''
    });
    loadEditExercises(workout.exercises);
}

function removeEditExercise(exerciseIndex) {
    if (!confirm('Are you sure you want to remove this exercise?')) return;
    
    const workout = workoutHistory[currentEditWorkoutIndex];
    workout.exercises.splice(exerciseIndex, 1);
    loadEditExercises(workout.exercises);
}

function addEditExercise() {
    const exerciseName = prompt('Enter exercise name:');
    if (!exerciseName) return;
    
    const workout = workoutHistory[currentEditWorkoutIndex];
    workout.exercises.push({
        name: exerciseName,
        sets: [{
            weight: '',
            reps: '',
            rpe: '',
            completed: false,
            notes: ''
        }],
        exerciseNotes: ''
    });
    loadEditExercises(workout.exercises);
}

function loadEditWorkoutVideos() {
    const videoList = document.getElementById('editVideoList');
    videoList.innerHTML = '';
    
    if (editWorkoutVideos.length === 0) {
        videoList.innerHTML = '<p style="color: #666;">No videos in this workout.</p>';
        return;
    }
    
    editWorkoutVideos.forEach((video, index) => {
        const videoDiv = document.createElement('div');
        videoDiv.style.cssText = 'background: #f8f9fa; border-radius: 8px; padding: 12px; margin: 8px 0; display: flex; justify-content: space-between; align-items: center;';
        
        videoDiv.innerHTML = `
            <div>
                <strong>${video.name}</strong>
                ${video.githubUrl ? `<a href="${video.githubUrl}" target="_blank" style="margin-left: 10px; color: #00d4ff;">View</a>` : '<span style="color: #666; margin-left: 10px;">(Not uploaded)</span>'}
            </div>
            <button class="btn btn-danger btn-sm" onclick="removeEditVideo(${index})">Remove</button>
        `;
        
        videoList.appendChild(videoDiv);
    });
}

function removeEditVideo(index) {
    if (!confirm('Are you sure you want to remove this video?')) return;
    
    editWorkoutVideos.splice(index, 1);
    loadEditWorkoutVideos();
}

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
                githubUrl: null
            };
            
            newEditWorkoutVideos.push(videoInfo);
            
            // Create preview
            const videoURL = URL.createObjectURL(file);
            const videoContainer = document.createElement('div');
            videoContainer.style.cssText = 'display: inline-block; margin: 10px; position: relative;';
            
            const videoElement = document.createElement('video');
            videoElement.controls = true;
            videoElement.style.cssText = 'width: 200px; height: 150px; object-fit: cover; border-radius: 8px;';
            videoElement.src = videoURL;
            videoElement.dataset.id = videoId;
            
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.className = 'btn btn-danger btn-sm';
            removeBtn.style.cssText = 'position: absolute; top: -5px; right: -5px;';
            removeBtn.onclick = function() {
                newEditWorkoutVideos = newEditWorkoutVideos.filter(v => v.id !== videoId);
                videoContainer.remove();
            };
            
            videoContainer.appendChild(videoElement);
            videoContainer.appendChild(removeBtn);
            previewContainer.appendChild(videoContainer);
        }
    });
}

async function saveWorkoutEdit() {
    const workout = workoutHistory[currentEditWorkoutIndex];
    
    // Update basic workout info
    workout.date = new Date(document.getElementById('editWorkoutDate').value + 'T12:00:00').toISOString();
    workout.sessionNotes = document.getElementById('editSessionNotes').value;
    workout.lastModified = new Date().toISOString();
    
    // Upload new videos if any
    if (newEditWorkoutVideos.length > 0) {
        const uploadSuccess = await uploadNewWorkoutVideos();
        if (uploadSuccess) {
            editWorkoutVideos = [...editWorkoutVideos, ...newEditWorkoutVideos.map(v => ({
                id: v.id,
                name: v.name,
                size: v.size,
                type: v.type,
                githubUrl: v.githubUrl
            }))];
        }
    }
    
    workout.videos = editWorkoutVideos;
    
    try {
        // Save to GitHub
        await saveDataToGitHub('workouts', workoutHistory);
        
        // Save to localStorage
        localStorage.setItem('workoutHistory', JSON.stringify(workoutHistory));
        
        // Refresh displays
        loadHistory();
        updateStats();
        closeEditWorkout();
        
        alert('Workout updated successfully!');
        
    } catch (error) {
        alert('Error saving workout changes: ' + error.message);
        console.error('Workout edit save error:', error);
    }
}

async function uploadNewWorkoutVideos() {
    if (newEditWorkoutVideos.length === 0) return true;
    
    const branchExists = await ensureVideoUploadsBranch();
    if (!branchExists) {
        alert('Could not access video-uploads branch');
        return false;
    }
    
    try {
        for (const video of newEditWorkoutVideos) {
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
                video.githubUrl = `https://github.com/${githubConfig.username}/${githubConfig.repo}/blob/video-uploads/${filePath}`;
            } else {
                throw new Error(`Failed to upload ${video.name}`);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('Error uploading new videos:', error);
        return false;
    }
}

function closeEditWorkout() {
    document.getElementById('editWorkoutModal').style.display = 'none';
    document.getElementById('editVideoPreview').innerHTML = '';
    currentEditWorkoutIndex = -1;
    editWorkoutVideos = [];
    newEditWorkoutVideos = [];
}

// Edit measurement functionality
let currentEditMeasurementIndex = -1;

function editMeasurement(index) {
    currentEditMeasurementIndex = index;
    const measurement = measurements[index];
    
    document.getElementById('editMeasurementDate').value = measurement.date;
    document.getElementById('editWeight').value = measurement.weight;
    document.getElementById('editBodyFat').value = measurement.bodyFat || '';
    document.getElementById('editMuscleMass').value = measurement.muscleMass || '';
    
    document.getElementById('editMeasurementModal').style.display = 'block';
}

async function saveMeasurementEdit() {
    const measurement = measurements[currentEditMeasurementIndex];
    const oldFileName = `measurement-${measurement.date}-${measurement.id}.json`;
    
    // Update measurement data
    measurement.date = document.getElementById('editMeasurementDate').value;
    measurement.weight = parseFloat(document.getElementById('editWeight').value);
    measurement.bodyFat = document.getElementById('editBodyFat').value ? parseFloat(document.getElementById('editBodyFat').value) : null;
    measurement.muscleMass = document.getElementById('editMuscleMass').value ? parseFloat(document.getElementById('editMuscleMass').value) : null;
    measurement.lastModified = new Date().toISOString();
    
    try {
        // If date changed, we need to delete old file and create new one
        const newFileName = `measurement-${measurement.date}-${measurement.id}.json`;
        
        if (oldFileName !== newFileName) {
            // Delete old file
            await deleteMeasurementFromGitHub({...measurement, date: measurement.date});
        }
        
        // Save updated measurement
        await saveMeasurementToGitHub(measurement);
        
        // Sort measurements by date
        measurements.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Save to localStorage
        localStorage.setItem('measurements', JSON.stringify(measurements));
        
        // Refresh displays
        loadMeasurements();
        updateMeasurementChart();
        closeEditMeasurement();
        
        alert('Measurement updated successfully!');
        
    } catch (error) {
        alert('Error saving measurement changes: ' + error.message);
        console.error('Measurement edit save error:', error);
    }
}

function closeEditMeasurement() {
    document.getElementById('editMeasurementModal').style.display = 'none';
    currentEditMeasurementIndex = -1;
}

// Edit progress pictures functionality
let currentEditProgressPicturesIndex = -1;
let editProgressPictureFiles = [];

function editProgressPictureEntry(index) {
    currentEditProgressPicturesIndex = index;
    const entry = progressPictures[index];
    
    document.getElementById('editProgressPictureDate').value = entry.date;
    document.getElementById('editProgressPictureNotes').value = entry.notes || '';
    
    // Load current pictures
    loadEditCurrentPictures(entry.pictures);
    
    document.getElementById('editProgressPicturesModal').style.display = 'block';
}

function loadEditCurrentPictures(pictures) {
    const grid = document.getElementById('editCurrentPicturesGrid');
    grid.innerHTML = '';
    
    pictures.forEach((picture, index) => {
        const pictureDiv = document.createElement('div');
        pictureDiv.style.cssText = 'position: relative;';
        
        if (picture.githubUrl) {
            const imageUrl = picture.githubUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            pictureDiv.innerHTML = `
                <img src="${imageUrl}" style="width: 100%; height: 150px; object-fit: cover; border-radius: 8px; cursor: pointer;" onclick="viewProgressPicture('${imageUrl}', '${picture.name}')">
                <button class="btn btn-danger btn-sm" onclick="removeEditCurrentPicture(${index})" style="position: absolute; top: 5px; right: 5px;">×</button>
                <p style="font-size: 0.8em; text-align: center; margin-top: 5px;">${picture.name}</p>
            `;
        } else {
            pictureDiv.innerHTML = `
                <div style="width: 100%; height: 150px; background: #e0e0e0; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #666;">
                    <span>Not uploaded</span>
                </div>
                <button class="btn btn-danger btn-sm" onclick="removeEditCurrentPicture(${index})" style="position: absolute; top: 5px; right: 5px;">×</button>
                <p style="font-size: 0.8em; text-align: center; margin-top: 5px;">${picture.name}</p>
            `;
        }
        
        grid.appendChild(pictureDiv);
    });
}

function removeEditCurrentPicture(index) {
    if (!confirm('Are you sure you want to remove this picture?')) return;
    
    const entry = progressPictures[currentEditProgressPicturesIndex];
    entry.pictures.splice(index, 1);
    loadEditCurrentPictures(entry.pictures);
}

function handleEditProgressPictureUpload(event) {
    const files = Array.from(event.target.files);
    const previewContainer = document.getElementById('editProgressPicturePreview');
    
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
            
            editProgressPictureFiles.push(pictureInfo);
            
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
            removeBtn.className = 'btn btn-danger btn-sm';
            removeBtn.style.cssText = 'position: absolute; top: -5px; right: -5px;';
            removeBtn.onclick = function() {
                editProgressPictureFiles = editProgressPictureFiles.filter(p => p.id !== pictureId);
                imageContainer.remove();
            };
            
            imageContainer.appendChild(imageElement);
            imageContainer.appendChild(removeBtn);
            previewContainer.appendChild(imageContainer);
        }
    });
}

async function uploadEditedProgressPicturesToGitHub() {
    if (editProgressPictureFiles.length === 0) {
        alert('No new pictures to upload.');
        return;
    }
    
    const branchExists = await ensureProgressPicturesBranch();
    if (!branchExists) {
        alert('Could not access progress-pictures branch');
        return;
    }
    
    try {
        for (const picture of editProgressPictureFiles) {
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
                picture.githubUrl = `https://github.com/${githubConfig.username}/${githubConfig.repo}/blob/progress-pictures/${filePath}`;
            } else {
                throw new Error(`Failed to upload ${picture.name}`);
            }
        }
        
        // Add new pictures to entry
        const entry = progressPictures[currentEditProgressPicturesIndex];
        editProgressPictureFiles.forEach(newPic => {
            entry.pictures.push({
                id: newPic.id,
                name: newPic.name,
                size: newPic.size,
                type: newPic.type,
                githubUrl: newPic.githubUrl
            });
        });
        
        alert('New pictures uploaded successfully!');
        loadEditCurrentPictures(entry.pictures);
        
        // Clear upload queue
        editProgressPictureFiles = [];
        document.getElementById('editProgressPicturePreview').innerHTML = '';
        
    } catch (error) {
        alert('Error uploading pictures: ' + error.message);
        console.error('Picture upload error:', error);
    }
}

async function saveProgressPicturesEdit() {
    const entry = progressPictures[currentEditProgressPicturesIndex];
    
    // Update entry data
    entry.date = document.getElementById('editProgressPictureDate').value;
    entry.notes = document.getElementById('editProgressPictureNotes').value;
    entry.lastModified = new Date().toISOString();
    
    try {
        // Save updated entry to GitHub
        await saveProgressPictureEntryToGitHub(entry);
        
        // Sort entries by date
        progressPictures.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Save to localStorage
        localStorage.setItem('progressPictures', JSON.stringify(progressPictures));
        
        // Refresh displays
        loadProgressPictures();
        closeEditProgressPictures();
        
        alert('Progress pictures entry updated successfully!');
        
    } catch (error) {
        alert('Error saving progress pictures changes: ' + error.message);
        console.error('Progress pictures edit save error:', error);
    }
}

function closeEditProgressPictures() {
    document.getElementById('editProgressPicturesModal').style.display = 'none';
    currentEditProgressPicturesIndex = -1;
    editProgressPictureFiles = [];
    document.getElementById('editProgressPicturePreview').innerHTML = '';
}







