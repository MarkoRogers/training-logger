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
    
    // Load programs from GitHub first, fallback to localStorage
    await loadProgramsFromGitHub();
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
        const response = await fetch(`${apiUrl}?ref=training-programs`, {
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

        const response = await fetch(`${apiUrl}?ref=training-programs`, {
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
    if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.textContent = 'Uploading...';
    }

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

function deleteProgressPicture(entryIndex, pictureIndex) {
    const entry = progressPictures[entryIndex];
    const picture = entry.pictures[pictureIndex];
    
    if (!confirm(`Are you sure you want to delete this progress picture "${picture.name}"?`)) {
        return;
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
