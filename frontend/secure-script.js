// ============================================
// SECURE LOGIN - FRONTEND JAVASCRIPT
// Comprehensive Security Features
// ============================================

const API_BASE_URL = '/api';

// Session storage
let currentSession = {
    token: null,
    csrfToken: null,
    userId: null,
    deviceId: null
};

let registrationSession = {
    token: null
};

// Initialize device ID
function initializeDevice() {
    const storedDeviceId = localStorage.getItem('deviceId');
    if (storedDeviceId) {
        currentSession.deviceId = storedDeviceId;
    } else {
        currentSession.deviceId = generateClientId();
        localStorage.setItem('deviceId', currentSession.deviceId);
    }
}

// Generate unique device ID
function generateClientId() {
    return 'device_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeDevice();
    checkResetToken();
});

// ============================================
// FORM NAVIGATION
// ============================================

function showForm(formId) {
    const targetForm = document.getElementById(formId);
    if (!targetForm) {
        if (formId === 'login-form') {
            window.location.href = '/login.html';
        }
        return;
    }

    // Hide all forms
    document.querySelectorAll('.form-section').forEach(form => {
        form.classList.remove('active');
    });

    // Show target form
    targetForm.classList.add('active');

    // Clear form data
    clearAllForms();
}

function clearAllForms() {
    document.querySelectorAll('input').forEach(input => {
        if (input.type !== 'checkbox') input.value = '';
        if (input.type === 'checkbox') input.checked = false;
    });

    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
    });

    document.querySelectorAll('.success-message, .warning-message').forEach(el => {
        el.classList.remove('show');
    });
}

// ============================================
// PASSWORD UTILITIES
// ============================================

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

function checkPasswordStrength() {
    const password = document.getElementById('register-password')?.value ||
                     document.getElementById('reset-password')?.value || '';

    if (!password) return;

    const criteria = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    };

    // Update strength meter
    const strengthFill = document.getElementById('strength-fill');
    const strengthText = document.getElementById('strength-text');

    if (strengthFill) {
        const score = Object.values(criteria).filter(Boolean).length;
        strengthFill.classList.remove('weak', 'medium', 'strong');
        strengthText.classList.remove('weak', 'medium', 'strong');

        if (score < 2) {
            strengthFill.classList.add('weak');
            strengthText.classList.add('weak');
            strengthText.textContent = 'Password strength: Weak';
        } else if (score < 4) {
            strengthFill.classList.add('medium');
            strengthText.classList.add('medium');
            strengthText.textContent = 'Password strength: Medium';
        } else {
            strengthFill.classList.add('strong');
            strengthText.classList.add('strong');
            strengthText.textContent = 'Password strength: Strong';
        }
    }

    // Update requirements checklist
    updateRequirementsList(criteria);
}

function updateRequirementsList(criteria) {
    const requirements = {
        'req-length': criteria.length,
        'req-uppercase': criteria.uppercase,
        'req-lowercase': criteria.lowercase,
        'req-number': criteria.number,
        'req-special': criteria.special
    };

    Object.entries(requirements).forEach(([id, met]) => {
        const element = document.getElementById(id);
        if (element) {
            if (met) {
                element.classList.add('met');
            } else {
                element.classList.remove('met');
            }
        }
    });
}

// ============================================
// VALIDATION UTILITIES
// ============================================

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = message;
}

function clearError(elementId) {
    const element = document.getElementById(elementId);
    if (element) element.textContent = '';
}

function showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.classList.add('show');
    }
}

function showWarning(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.classList.add('show');
    }
}

// ============================================
// AUTHENTICATION HANDLERS
// ============================================

// Handle Registration
async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    // Validation
    let isValid = true;

    if (!username || username.length < 3) {
        showError('register-username-error', 'Username must be at least 3 characters');
        isValid = false;
    } else {
        clearError('register-username-error');
    }

    if (!email || !validateEmail(email)) {
        showError('register-email-error', 'Valid email required');
        isValid = false;
    } else {
        clearError('register-email-error');
    }

    if (!password || password.length < 8) {
        showError('register-password-error', 'Password must be at least 8 characters');
        isValid = false;
    } else {
        clearError('register-password-error');
    }

    if (password !== confirmPassword) {
        showError('register-confirm-password-error', 'Passwords do not match');
        isValid = false;
    } else {
        clearError('register-confirm-password-error');
    }

    if (!isValid) return;

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password, confirmPassword })
        });

        const data = await response.json();

        if (data.ok) {
            registrationSession.token = data.registrationToken;
            showForm('register-2fa-form');

            const qrImage = document.getElementById('register-qr-code-image');
            const secretInput = document.getElementById('register-secret-key');
            if (qrImage) qrImage.src = data.qrCode || '';
            if (secretInput) secretInput.value = data.secret || '';

            showSuccess('register-2fa-success', '✓ QR generated. Scan and enter OTP to finish registration.');
        } else {
            showError('register-email-error', data.message || 'Registration failed');
            if (data.errors) {
                data.errors.forEach(error => {
                    console.error('Error:', error);
                });
            }
        }
    } catch (error) {
        console.error('Error:', error);
        showError('register-email-error', 'Connection error. Please try again.');
    }
}

async function handleCompleteRegistration2FA(event) {
    event.preventDefault();

    const code = document.getElementById('register-verification-code')?.value.trim();

    if (!registrationSession.token) {
        showError('register-2fa-error', 'Registration session expired. Please register again.');
        return;
    }

    if (!code || code.length !== 6) {
        showError('register-2fa-error', 'Enter a valid 6-digit OTP code');
        return;
    }

    clearError('register-2fa-error');

    try {
        const response = await fetch(`${API_BASE_URL}/register/verify-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                registrationToken: registrationSession.token,
                code
            })
        });

        const data = await response.json();

        if (data.ok) {
            registrationSession.token = null;
            showSuccess('register-2fa-success', '✓ Registration complete! Redirecting to login...');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
        } else {
            showError('register-2fa-error', data.message || 'OTP verification failed');
        }
    } catch (error) {
        showError('register-2fa-error', 'Connection error. Please try again.');
    }
}

// Handle Login
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const rememberDevice = document.getElementById('remember-device').checked;
    const agreeTerms = document.getElementById('agree-terms').checked;

    // Validation
    if (!username) {
        showError('login-username-error', 'Username or email required');
        return;
    } else {
        clearError('login-username-error');
    }

    if (!password) {
        showError('login-password-error', 'Password required');
        return;
    } else {
        clearError('login-password-error');
    }

    if (!agreeTerms) {
        showWarning('login-warning', 'Please agree to Terms of Service');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                password,
                deviceId: currentSession.deviceId
            })
        });

        const data = await response.json();

        if (data.ok) {
            currentSession.token = data.sessionToken;
            currentSession.csrfToken = data.csrfToken;
            currentSession.userId = data.user?.id;

            if (rememberDevice) {
                localStorage.setItem('sessionToken', data.sessionToken);
                localStorage.setItem('deviceId', currentSession.deviceId);
            }

            if (data.requires2FA) {
                showForm('verify-2fa-form');
            } else {
                showSuccess('login-success', '✓ Login successful! Welcome!');
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            }
        } else {
            showError('login-username-error', data.message || 'Login failed');
        }
    } catch (error) {
        console.error('Error:', error);
        showError('login-username-error', 'Connection error. Please try again.');
    }
}

// ============================================
// 2FA HANDLERS
// ============================================

// Setup 2FA
async function handleSetup2FA(event) {
    event.preventDefault();

    if (!currentSession.userId) {
        showError('2fa-error', 'Please login first');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/setup-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentSession.userId })
        });

        const data = await response.json();

        if (data.ok) {
            document.getElementById('qr-code-image').src = data.qrCode;
            document.getElementById('secret-key').value = data.secret;
        } else {
            showError('2fa-error', 'Setup failed');
        }
    } catch (error) {
        showError('2fa-error', 'Connection error');
    }
}

// Enable 2FA
async function handleEnable2FA(event) {
    event.preventDefault();

    const code = document.getElementById('verification-code').value.trim();
    const secret = document.getElementById('secret-key').value;

    if (!code || code.length !== 6) {
        showError('2fa-error', 'Enter 6-digit code');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/enable-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentSession.userId,
                secret,
                code
            })
        });

        const data = await response.json();

        if (data.ok) {
            showSuccess('2fa-error', '✓ 2FA enabled successfully!');
            setTimeout(() => showForm('login-form'), 1500);
        } else {
            showError('2fa-error', data.message || '2FA setup failed');
        }
    } catch (error) {
        showError('2fa-error', 'Connection error');
    }
}

// Verify 2FA
async function handleVerify2FA(event) {
    event.preventDefault();

    const code = document.getElementById('verify-2fa-code').value.trim();

    if (!code || code.length !== 6) {
        showError('verify-2fa-error', 'Enter 6-digit code');
        return;
    }

    if (!currentSession.token) {
        showError('verify-2fa-error', 'Session expired');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/verify-2fa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionToken: currentSession.token,
                code
            })
        });

        const data = await response.json();

        if (data.ok) {
            showSuccess('verify-2fa-error', '✓ 2FA verified! Logging in...');
            setTimeout(() => {
                window.location.href = '/';
            }, 1500);
        } else {
            showError('verify-2fa-error', data.message || 'Invalid code');
        }
    } catch (error) {
        showError('verify-2fa-error', 'Connection error');
    }
}

// ============================================
// PASSWORD RECOVERY HANDLERS
// ============================================

// Forgot Password
async function handleForgotPassword(event) {
    event.preventDefault();

    const email = document.getElementById('forgot-email').value.trim();

    if (!email || !validateEmail(email)) {
        showError('forgot-email-error', 'Valid email required');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (data.ok) {
            showSuccess('forgot-success', '✓ If account exists, reset link sent to email');
            clearError('forgot-email-error');
            setTimeout(() => showForm('login-form'), 3000);
        } else {
            showError('forgot-email-error', data.message || 'Request failed');
        }
    } catch (error) {
        showError('forgot-email-error', 'Connection error');
    }
}

// Reset Password
async function handleResetPassword(event) {
    event.preventDefault();

    const token = new URLSearchParams(window.location.search).get('token');
    const password = document.getElementById('reset-password').value;
    const confirmPassword = document.getElementById('reset-confirm-password').value;

    // Validation
    if (!password || password.length < 8) {
        showError('reset-password-error', 'Password must be at least 8 characters');
        return;
    } else {
        clearError('reset-password-error');
    }

    if (password !== confirmPassword) {
        showError('reset-confirm-password-error', 'Passwords do not match');
        return;
    } else {
        clearError('reset-confirm-password-error');
    }

    if (!token) {
        showError('reset-password-error', 'Invalid reset link');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password, confirmPassword })
        });

        const data = await response.json();

        if (data.ok) {
            showSuccess('reset-success', '✓ Password reset successful! Redirecting to login...');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } else {
            showError('reset-password-error', data.message || 'Reset failed');
        }
    } catch (error) {
        showError('reset-password-error', 'Connection error');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Copy to clipboard
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.value;

    navigator.clipboard.writeText(text).then(() => {
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        setTimeout(() => {
            button.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

// Check for reset token in URL
function checkResetToken() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
        if (document.getElementById('reset-password-form')) {
            showForm('reset-password-form');
        } else {
            window.location.href = `/login.html?token=${encodeURIComponent(token)}`;
        }
    }
}

// ============================================
// SECURITY: CSRF PROTECTION
// ============================================

function getCSRFToken() {
    return currentSession.csrfToken;
}

// Add CSRF token to all API requests
function addCSRFHeader(headers) {
    return {
        ...headers,
        'X-CSRF-Token': getCSRFToken()
    };
}

// ============================================
// SECURITY: INPUT SANITIZATION
// ============================================

function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

// XSS Prevention on output
function safeText(text) {
    return text.replace(/[<>]/g, '');
}

// ============================================
// SESSION MANAGEMENT
// ============================================

// Check if session is valid
function isSessionValid() {
    return currentSession.token && currentSession.csrfToken;
}

// Logout
function logout() {
    currentSession = {
        token: null,
        csrfToken: null,
        userId: null,
        deviceId: null
    };
    localStorage.removeItem('sessionToken');
    showForm('login-form');
}

// Auto-logout on inactivity (30 minutes)
let inactivityTimeout;

function resetInactivityTimer() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
        logout();
        alert('Session expired due to inactivity');
    }, 30 * 60 * 1000);
}

document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);
document.addEventListener('click', resetInactivityTimer);
