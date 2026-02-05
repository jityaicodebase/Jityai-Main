/**
 * ============================================================================
 * CLIENT-SIDE AUTHENTICATION HANDLER
 * ============================================================================
 */

const AUTH_TOKEN_KEY = 'jityai_auth_token';
const USER_DATA_KEY = 'jityai_user_data';
const API_BASE = window.location.origin;

// ============================================================================
// AUTH UTILITIES
// ============================================================================

function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthToken(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function removeAuthToken() {
    // Completely clear local storage to prevent ghost sessions or cross-store state leaks
    localStorage.clear();
}

function getUserData() {
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
}

function setUserData(userData) {
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
}

function isAuthenticated() {
    return !!getAuthToken();
}

// ============================================================================
// API REQUEST WITH AUTH
// ============================================================================

async function apiRequest(endpoint, options = {}) {
    const token = getAuthToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Clean undefined headers (required for FormData to let browser set boundary)
    Object.keys(headers).forEach(key => {
        if (headers[key] === undefined) delete headers[key];
    });

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    // Handle unauthorized
    if (response.status === 401 || response.status === 403) {
        // Token expired or invalid
        removeAuthToken();
        if (window.location.pathname !== '/login.html') {
            window.location.href = '/login.html?expired=true';
        }
        throw new Error('Authentication expired');
    }

    return response;
}

// ============================================================================
// LOGIN HANDLER
// ============================================================================

if (document.getElementById('login-form')) {
    const loginForm = document.getElementById('login-form');
    const errorDiv = document.getElementById('error-message');
    const loginBtn = document.getElementById('login-btn');
    const btnText = document.getElementById('btn-text');
    const btnLoading = document.getElementById('btn-loading');

    // Check for expired session
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('expired') === 'true') {
        showError('Your session has expired. Please login again.');
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Disable form
        loginBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-block';
        hideError();

        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Store token and user data
            setAuthToken(data.token);
            setUserData(data.user);

            // Redirect to dashboard
            window.location.href = '/index.html';

        } catch (error) {
            showError(error.message || 'Login failed. Please try again.');

            // Re-enable form
            loginBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    });

    function showError(message) {
        let icon = '';
        if (message.includes('locked')) {
            icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
            errorDiv.style.borderColor = '#c53030';
        }
        errorDiv.innerHTML = `${icon}<span>${message}</span>`;
        errorDiv.classList.add('show');
    }

    function hideError() {
        errorDiv.classList.remove('show');
    }
}

// ============================================================================
// REGISTER HANDLER
// ============================================================================

if (document.getElementById('register-form')) {
    const registerForm = document.getElementById('register-form');
    const errorDiv = document.getElementById('error-message');
    const registerBtn = document.getElementById('register-btn');
    const btnText = document.getElementById('btn-text');
    const btnLoading = document.getElementById('btn-loading');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('fullName').value;
        const storeName = document.getElementById('storeName').value;
        const storeLocation = document.getElementById('storeLocation').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        // Disable form
        registerBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-block';
        hideError();

        try {
            const response = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fullName, storeName, storeLocation, email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            // Store token and user data
            setAuthToken(data.token);
            setUserData(data.user);

            // Redirect to dashboard (onboarding will trigger automatically if no data)
            window.location.href = '/index.html';

        } catch (error) {
            showError(error.message || 'Registration failed. Please try again.');

            // Re-enable form
            registerBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
        }
    });

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.add('show');
    }

    function hideError() {
        errorDiv.classList.remove('show');
    }
}

// ============================================================================
// LOGOUT HANDLER
// ============================================================================

async function logout() {
    try {
        // Call logout endpoint
        await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        // Clear local storage and redirect
        removeAuthToken();
        window.location.href = '/login.html';
    }
}

// Attach logout to global scope
window.logout = logout;

// ============================================================================
// PAGE PROTECTION
// ============================================================================

function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

// Protect dashboard pages
if (window.location.pathname === '/index.html' ||
    window.location.pathname === '/' ||
    window.location.pathname === '') {

    // Skip login page
    if (window.location.pathname !== '/login.html') {
        requireAuth();

        // Display user info
        const userData = getUserData();
        if (userData && document.getElementById('user-info')) {
            document.getElementById('user-info').innerHTML = `
                <strong>${userData.full_name || userData.email}</strong>
                <br>
                <small>${userData.store_id}</small>
            `;
        }
    }
}

// Redirect to dashboard if already logged in
if (window.location.pathname === '/login.html' && isAuthenticated()) {
    window.location.href = '/index.html';
}

// ============================================================================
// AUTO-REFRESH TOKEN (Optional - for silent refresh)
// ============================================================================

// Check token expiry every 10 minutes
setInterval(() => {
    const token = getAuthToken();
    if (token) {
        try {
            // Decode JWT to check expiry (simple check)
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiry = payload.exp * 1000; // Convert to milliseconds
            const now = Date.now();
            const timeLeft = expiry - now;

            // If less than 1 hour left, warn user
            if (timeLeft < 60 * 60 * 1000 && timeLeft > 0) {
                console.warn('⚠️ Session will expire in less than 1 hour');
            }

            // If expired, logout
            if (timeLeft <= 0) {
                console.warn('Session expired');
                logout();
            }
        } catch (error) {
            console.error('Token check error:', error);
        }
    }
}, 10 * 60 * 1000); // Every 10 minutes

// Export for use in other scripts
window.auth = {
    isAuthenticated,
    getUserData,
    apiRequest,
    logout,
    requireAuth
};
