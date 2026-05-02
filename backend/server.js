// ============================================
// SECURE LOGIN SYSTEM WITH ADVANCED SECURITY
// Pure Node.js + SQLite + 2FA + Device Tracking
// ============================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const initSqlJs = require('sql.js');
const nodemailer = require('nodemailer');

// ============================================
// CONFIGURATION
// ============================================

const HOST = '127.0.0.1';
const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, '..', 'frontend');
const DB_PATH = path.join(__dirname, 'auth.db');

// Security settings
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
const PASSWORD_MIN_LENGTH = 8;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const PASSWORD_RESET_TIMEOUT = 60 * 60 * 1000; // 1 hour
const REGISTRATION_SETUP_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Email configuration (configure with your email service)
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: process.env.SMTP_USER ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
});

// ============================================
// MIME TYPES
// ============================================

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// ============================================
// DATABASE
// ============================================

let db = null;
let SQL = null;

async function initializeDatabase() {
  try {
    SQL = await initSqlJs();

    let data = null;
    try {
      data = fs.readFileSync(DB_PATH);
    } catch (err) {
      // New database
    }

    if (data) {
      db = new SQL.Database(data);
      console.log('✓ Loaded existing database');
    } else {
      db = new SQL.Database();
      console.log('✓ Created new database');
    }

    // Create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        two_factor_secret TEXT,
        two_factor_enabled INTEGER DEFAULT 0,
        failed_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        password_changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        two_factor_secret TEXT NOT NULL,
        registration_token TEXT UNIQUE NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS login_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        device_id TEXT UNIQUE NOT NULL,
        device_name TEXT NOT NULL,
        device_type TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_trusted INTEGER DEFAULT 0,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS login_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        success INTEGER DEFAULT 1,
        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        csrf_token TEXT UNIQUE NOT NULL,
        device_id TEXT,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    saveDatabase();
    console.log('✓ Database initialized with security tables');
    return true;
  } catch (err) {
    console.error('✗ Database error:', err.message);
    process.exit(1);
  }
}

function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

// ============================================
// SECURITY UTILITIES
// ============================================

// Generate secure tokens
function generateToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Generate device ID
function generateDeviceId() {
  return crypto.randomBytes(16).toString('hex');
}

// Hash input with salt (for hashing sensitive data like emails in some contexts)
function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Get client fingerprint (for device identification)
function getClientFingerprint(req) {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  return crypto.createHash('sha256')
    .update(userAgent + acceptLanguage)
    .digest('hex');
}

// Validate password strength
function validatePasswordStrength(password) {
  const errors = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain numbers');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain special characters');
  }

  return { valid: errors.length === 0, errors };
}

// SQL Injection prevention - parameterized queries
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim();
}

function getRawInput(input) {
  if (typeof input !== 'string') return '';
  return input;
}

function containsUnsafeHtmlChars(input) {
  return /[<>]/.test(input);
}

// XSS prevention - encode HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString(); });
    req.on('end', () => {
      const ct = (req.headers['content-type'] || '').split(';')[0];
      try {
        if (ct === 'application/json') return resolve(JSON.parse(raw || '{}'));
        if (ct === 'application/x-www-form-urlencoded') return resolve(querystring.parse(raw));
        try { return resolve(JSON.parse(raw)); } catch(e) { return resolve(querystring.parse(raw)); }
      } catch (err) { return reject(err); }
    });
    req.on('error', reject);
  });
}

// Send email
async function sendEmail(to, subject, text) {
  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to,
      subject,
      text
    });
    console.log(`✓ Email sent to ${to}`);
    return true;
  } catch (err) {
    console.error('Email error:', err);
    return false;
  }
}

// ============================================
// FILE SERVING
// ============================================

function send404(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, message: 'Not Found' }));
}

function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.end(JSON.stringify(data));
}

function serveStaticFile(filePath, res) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) return send404(res);

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => send404(res));
  });
}

// ============================================
// AUTH HANDLERS
// ============================================

// Register user
async function handleRegister(body) {
  const username = sanitizeInput(body.username);
  const email = sanitizeInput(body.email);
  const password = getRawInput(body.password);
  const confirmPassword = getRawInput(body.confirmPassword);

  // Validation
  if (!username || username.length < 3) {
    return { status: 400, data: { ok: false, message: 'Username must be at least 3 characters' } };
  }

  if (containsUnsafeHtmlChars(username)) {
    return { status: 400, data: { ok: false, message: 'Username contains invalid characters' } };
  }

  if (!email || !isValidEmail(email)) {
    return { status: 400, data: { ok: false, message: 'Invalid email' } };
  }

  if (containsUnsafeHtmlChars(email)) {
    return { status: 400, data: { ok: false, message: 'Invalid email' } };
  }

  if (password !== confirmPassword) {
    return { status: 400, data: { ok: false, message: 'Passwords do not match' } };
  }

  const strength = validatePasswordStrength(password);
  if (!strength.valid) {
    return { status: 400, data: { ok: false, message: 'Weak password', errors: strength.errors } };
  }

  try {
    db.run(`DELETE FROM pending_registrations WHERE expires_at <= strftime('%s', 'now')`);

    // Check if user exists
    const existing = db.exec(`SELECT id FROM users WHERE username = ? OR email = ?`, [username, email]);
    if (existing && existing[0] && existing[0].values.length > 0) {
      return { status: 409, data: { ok: false, message: 'User already exists' } };
    }

    db.run(`DELETE FROM pending_registrations WHERE username = ? OR email = ?`, [username, email]);

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const secret = speakeasy.generateSecret({
      name: `SecureLogin (${email})`,
      issuer: 'SecureLogin App'
    });
    const registrationToken = generateToken();
    const expiresAt = Math.floor((Date.now() + REGISTRATION_SETUP_TIMEOUT) / 1000);

    db.run(
      `INSERT INTO pending_registrations (username, email, password, two_factor_secret, registration_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, secret.base32, registrationToken, expiresAt]
    );

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    saveDatabase();

    return {
      status: 200,
      data: {
        ok: true,
        message: 'Scan the QR code and verify OTP to complete registration.',
        registrationToken,
        secret: secret.base32,
        qrCode
      }
    };
  } catch (err) {
    console.error('Register error:', err);
    return { status: 500, data: { ok: false, message: 'Registration failed' } };
  }
}

async function handleCompleteRegistration2FA(body) {
  const registrationToken = sanitizeInput(body.registrationToken);
  const code = sanitizeInput(body.code);

  if (!registrationToken || !code) {
    return { status: 400, data: { ok: false, message: 'Registration token and OTP code are required' } };
  }

  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return { status: 400, data: { ok: false, message: 'Enter a valid 6-digit OTP code' } };
  }

  try {
    db.run(`DELETE FROM pending_registrations WHERE expires_at <= strftime('%s', 'now')`);

    const pendingResult = db.exec(
      `SELECT username, email, password, two_factor_secret
       FROM pending_registrations
       WHERE registration_token = ? AND expires_at > strftime('%s', 'now')`,
      [registrationToken]
    );

    if (!pendingResult || !pendingResult[0] || !pendingResult[0].values.length) {
      return { status: 401, data: { ok: false, message: 'Registration session expired. Please register again.' } };
    }

    const pending = pendingResult[0].values[0];
    const username = pending[0];
    const email = pending[1];
    const hashedPassword = pending[2];
    const secret = pending[3];

    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return { status: 401, data: { ok: false, message: 'Invalid OTP code' } };
    }

    db.run(
      `INSERT INTO users (username, email, password, two_factor_secret, two_factor_enabled)
       VALUES (?, ?, ?, ?, 1)`,
      [username, email, hashedPassword, secret]
    );

    db.run(`DELETE FROM pending_registrations WHERE registration_token = ?`, [registrationToken]);
    saveDatabase();

    return {
      status: 201,
      data: { ok: true, message: 'Registration complete. You can now log in with OTP.' }
    };
  } catch (err) {
    console.error('Complete registration error:', err);
    return { status: 500, data: { ok: false, message: 'Failed to complete registration' } };
  }
}

// Login user
async function handleLogin(body, req) {
  const username = sanitizeInput(body.username);
  const password = getRawInput(body.password);
  const deviceId = body.deviceId || generateDeviceId();

  if (!username || !password) {
    return { status: 400, data: { ok: false, message: 'Username and password required' } };
  }

  if (containsUnsafeHtmlChars(username)) {
    return { status: 400, data: { ok: false, message: 'Invalid username or email' } };
  }

  try {
    // Find user
    const result = db.exec(
      `SELECT id, username, email, password, two_factor_enabled, two_factor_secret, failed_attempts, locked_until
       FROM users WHERE username = ? OR email = ?`,
      [username, username]
    );

    if (!result || !result[0] || !result[0].values.length) {
      return { status: 401, data: { ok: false, message: 'Invalid credentials' } };
    }

    const userRow = result[0].values[0];
    const user = {
      id: userRow[0],
      username: userRow[1],
      email: userRow[2],
      password: userRow[3],
      twoFactorEnabled: userRow[4],
      twoFactorSecret: userRow[5],
      failedAttempts: userRow[6],
      lockedUntil: userRow[7]
    };

    // Check if account is locked
    if (user.lockedUntil) {
      const lockTime = new Date(user.lockedUntil);
      if (lockTime > new Date()) {
        const minutesLeft = Math.ceil((lockTime - new Date()) / 60000);
        return {
          status: 429,
          data: { ok: false, message: `Account locked. Try again in ${minutesLeft} minutes.` }
        };
      } else {
        // Unlock account
        db.run(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, [user.id]);
      }
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      // Increment failed attempts
      const newAttempts = user.failedAttempts + 1;
      let lockedUntil = null;

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + LOCKOUT_TIME).toISOString();
      }

      db.run(
        `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
        [newAttempts, lockedUntil, user.id]
      );

      saveDatabase();

      // Log failed attempt
      db.run(
        `INSERT INTO login_history (user_id, ip_address, user_agent, success)
         VALUES (?, ?, ?, 0)`,
        [user.id, req.socket.remoteAddress || 'unknown', req.headers['user-agent'] || '']
      );

      if (lockedUntil) {
        return {
          status: 429,
          data: { ok: false, message: 'Too many failed attempts. Account locked for 15 minutes.' }
        };
      }

      return { status: 401, data: { ok: false, message: 'Invalid credentials' } };
    }

    // Reset failed attempts on success
    db.run(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`, [user.id]);

    // Check for new device
    const deviceResult = db.exec(
      `SELECT id, is_trusted FROM login_devices WHERE user_id = ? AND device_id = ?`,
      [user.id, deviceId]
    );

    const deviceExists = deviceResult && deviceResult[0] && deviceResult[0].values.length > 0;
    let isNewDevice = !deviceExists;

    if (deviceExists) {
      const deviceRow = deviceResult[0].values[0];
      db.run(
        `UPDATE login_devices SET last_seen = CURRENT_TIMESTAMP, ip_address = ?, user_agent = ? WHERE id = ?`,
        [req.socket.remoteAddress || 'unknown', req.headers['user-agent'] || '', deviceRow[0]]
      );
    } else {
      try {
        db.run(
          `INSERT INTO login_devices (user_id, device_id, device_name, device_type, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [user.id, deviceId, 'Unknown Device', 'Web', req.socket.remoteAddress || 'unknown', req.headers['user-agent'] || '']
        );
      } catch (err) {
        db.run(
          `UPDATE login_devices SET last_seen = CURRENT_TIMESTAMP, ip_address = ?, user_agent = ? WHERE device_id = ? AND user_id = ?`,
          [req.socket.remoteAddress || 'unknown', req.headers['user-agent'] || '', deviceId, user.id]
        );
      }
    }

    // Generate session
    const sessionToken = generateToken();
    const csrfToken = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TIMEOUT).toISOString();

    db.run(
      `INSERT INTO sessions (user_id, session_token, csrf_token, device_id, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, sessionToken, csrfToken, deviceId, expiresAt]
    );

    // Log successful login
    db.run(
      `INSERT INTO login_history (user_id, ip_address, user_agent, success)
       VALUES (?, ?, ?, 1)`,
      [user.id, req.socket.remoteAddress || 'unknown', req.headers['user-agent'] || '']
    );

    // Update last login
    db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

    saveDatabase();

    // Send new device notification
    if (isNewDevice) {
      sendEmail(
        user.email,
        'New Device Login Notification',
        `A new device logged into your account.\n\nIP: ${req.socket.remoteAddress}\nTime: ${new Date().toLocaleString()}\n\nIf this wasn't you, please reset your password immediately.`
      );
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return {
        status: 403,
        data: { ok: false, message: '2FA is not configured for this account' }
      };
    }

    return {
      status: 200,
      data: {
        ok: true,
        message: 'Enter 2FA code',
        requires2FA: true,
        sessionToken,
        csrfToken
      }
    };
  } catch (err) {
    console.error('Login error:', err);
    return { status: 500, data: { ok: false, message: 'Login failed' } };
  }
}

// Verify 2FA
async function handleVerify2FA(body) {
  const sessionToken = sanitizeInput(body.sessionToken);
  const code = sanitizeInput(body.code);

  if (!sessionToken || !code) {
    return { status: 400, data: { ok: false, message: '2FA code required' } };
  }

  try {
    // Get session
    const sessionResult = db.exec(
      `SELECT user_id FROM sessions WHERE session_token = ? AND expires_at > CURRENT_TIMESTAMP`,
      [sessionToken]
    );

    if (!sessionResult || !sessionResult[0] || !sessionResult[0].values.length) {
      return { status: 401, data: { ok: false, message: 'Session expired' } };
    }

    const userId = sessionResult[0].values[0][0];

    // Get user with 2FA secret
    const userResult = db.exec(
      `SELECT username, email, two_factor_secret FROM users WHERE id = ?`,
      [userId]
    );

    const user = userResult[0].values[0];
    const verified = speakeasy.totp.verify({
      secret: user[2],
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      return { status: 401, data: { ok: false, message: 'Invalid 2FA code' } };
    }

    return {
      status: 200,
      data: {
        ok: true,
        message: '2FA verified',
        user: {
          id: userId,
          username: user[0],
          email: user[1]
        }
      }
    };
  } catch (err) {
    console.error('2FA error:', err);
    return { status: 500, data: { ok: false, message: '2FA verification failed' } };
  }
}

// Setup 2FA
async function handleSetup2FA(body) {
  const userId = body.userId;

  if (!userId) {
    return { status: 400, data: { ok: false, message: 'User ID required' } };
  }

  try {
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: 'SecureLogin',
      issuer: 'SecureLogin App'
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      status: 200,
      data: {
        ok: true,
        message: '2FA setup',
        secret: secret.base32,
        qrCode,
        userId
      }
    };
  } catch (err) {
    console.error('2FA setup error:', err);
    return { status: 500, data: { ok: false, message: '2FA setup failed' } };
  }
}

// Enable 2FA
async function handleEnable2FA(body) {
  const userId = body.userId;
  const secret = sanitizeInput(body.secret);
  const code = sanitizeInput(body.code);

  if (!userId || !secret || !code) {
    return { status: 400, data: { ok: false, message: 'Missing required fields' } };
  }

  try {
    // Verify the code
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      return { status: 401, data: { ok: false, message: 'Invalid code' } };
    }

    // Update user
    db.run(
      `UPDATE users SET two_factor_secret = ?, two_factor_enabled = 1 WHERE id = ?`,
      [secret, userId]
    );

    saveDatabase();

    return {
      status: 200,
      data: {
        ok: true,
        message: '2FA enabled successfully'
      }
    };
  } catch (err) {
    console.error('Enable 2FA error:', err);
    return { status: 500, data: { ok: false, message: 'Failed to enable 2FA' } };
  }
}

// Request password reset
async function handleForgotPassword(body) {
  const email = sanitizeInput(body.email);

  if (!email || !isValidEmail(email)) {
    return { status: 400, data: { ok: false, message: 'Valid email required' } };
  }

  if (containsUnsafeHtmlChars(email)) {
    return { status: 400, data: { ok: false, message: 'Valid email required' } };
  }

  try {
    // Find user
    const userResult = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);

    if (!userResult || !userResult[0] || !userResult[0].values.length) {
      // Return success anyway for security (don't reveal if email exists)
      return {
        status: 200,
        data: { ok: true, message: 'If account exists, reset link sent to email' }
      };
    }

    const userId = userResult[0].values[0][0];
    const resetToken = generateToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TIMEOUT).toISOString();

    // Save reset token
    db.run(
      `INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)`,
      [userId, resetToken, expiresAt]
    );

    saveDatabase();

    // Send email
    sendEmail(
      email,
      'Password Reset Request',
      `Click to reset password: http://localhost:8080/login.html?token=${resetToken}\n\nThis link expires in 1 hour.`
    );

    return {
      status: 200,
      data: { ok: true, message: 'If account exists, reset link sent to email' }
    };
  } catch (err) {
    console.error('Password reset error:', err);
    return { status: 500, data: { ok: false, message: 'Request failed' } };
  }
}

// Reset password
async function handleResetPassword(body) {
  const token = sanitizeInput(body.token);
  const newPassword = getRawInput(body.password);
  const confirmPassword = getRawInput(body.confirmPassword);

  if (!token || !newPassword || !confirmPassword) {
    return { status: 400, data: { ok: false, message: 'Missing required fields' } };
  }

  if (newPassword !== confirmPassword) {
    return { status: 400, data: { ok: false, message: 'Passwords do not match' } };
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return { status: 400, data: { ok: false, message: 'Weak password', errors: strength.errors } };
  }

  try {
    // Verify token
    const resetResult = db.exec(
      `SELECT user_id FROM password_resets
       WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`,
      [token]
    );

    if (!resetResult || !resetResult[0] || !resetResult[0].values.length) {
      return { status: 401, data: { ok: false, message: 'Invalid or expired token' } };
    }

    const userId = resetResult[0].values[0][0];

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    db.run(
      `UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [hashedPassword, userId]
    );

    // Delete used token
    db.run(`DELETE FROM password_resets WHERE token = ?`, [token]);

    // Invalidate all sessions
    db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);

    saveDatabase();

    return {
      status: 200,
      data: { ok: true, message: 'Password reset successful. Please log in.' }
    };
  } catch (err) {
    console.error('Reset password error:', err);
    return { status: 500, data: { ok: false, message: 'Reset failed' } };
  }
}

// ============================================
// HTTP SERVER
// ============================================

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;
  const safePath = path.normalize(pathname).replace(/^\.+/, '');

  console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);

  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  // API Routes
  if (pathname === '/api/health') {
    return sendJSON(res, 200, { ok: true, db: !!db, message: 'Server running' });
  }

  if (pathname === '/api/register' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleRegister(body);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  if (pathname === '/api/register/verify-2fa' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleCompleteRegistration2FA(body);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleLogin(body, req);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  if (pathname === '/api/verify-2fa' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleVerify2FA(body);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  if (pathname === '/api/setup-2fa' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleSetup2FA(body);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  if (pathname === '/api/enable-2fa' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleEnable2FA(body);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  if (pathname === '/api/forgot-password' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleForgotPassword(body);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  if (pathname === '/api/reset-password' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const result = await handleResetPassword(body);
      return sendJSON(res, result.status, result.data);
    } catch (err) {
      return sendJSON(res, 500, { ok: false, message: 'Server error' });
    }
  }

  // Static files
  if (pathname === '/' || pathname === '') {
    const indexPath = path.join(PUBLIC_DIR, 'login.html');
    return serveStaticFile(indexPath, res);
  }

  if (req.method === 'GET') {
    const filePath = path.join(PUBLIC_DIR, safePath);
    return serveStaticFile(filePath, res);
  }

  return send404(res);
});

// ============================================
// START SERVER
// ============================================

async function start() {
  await initializeDatabase();

  server.listen(PORT, HOST, () => {
    const displayHost = (HOST === '127.0.0.1') ? 'localhost' : HOST;
    console.log(`\n🚀 Secure Login Server Running`);
    console.log(`📍 http://${displayHost}:${PORT}/`);
    console.log(`🗄️  Database: SQLite`);
    console.log(`🔒 Security Features: 2FA, Password Recovery, Device Tracking, Rate Limiting`);
    console.log(`\n✓ Ready for connections\n`);
  });
}

server.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  if (db) saveDatabase();
  server.close(() => process.exit(0));
});

start();
