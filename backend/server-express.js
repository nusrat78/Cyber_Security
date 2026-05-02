// ============================================
// SECURE LOGIN SYSTEM - EXPRESS.JS VERSION
// Express + SQLite + 2FA + Device Tracking
// ============================================

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const initSqlJs = require("sql.js");
const nodemailer = require("nodemailer");

const app = express();

// ============================================
// CONFIGURATION
// ============================================

const HOST = "127.0.0.1";
const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, "..", "frontend");
const DB_PATH = path.join(__dirname, "auth.db");

// Security settings
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_TIME = 15 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;
const SESSION_TIMEOUT = 30 * 60 * 1000;
const PASSWORD_RESET_TIMEOUT = 60 * 60 * 1000;
const REGISTRATION_SETUP_TIMEOUT = 10 * 60 * 1000;

// Email configuration
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "localhost",
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: process.env.SMTP_USER
        ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
          }
        : undefined,
});

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// Security headers
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Content-Security-Policy", "default-src 'self'");
    res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
    );
    next();
});

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
            console.log("✓ Loaded existing database");
        } else {
            db = new SQL.Database();
            console.log("✓ Created new database");
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
        console.log("✓ Database initialized with security tables");
        return true;
    } catch (err) {
        console.error("✗ Database error:", err.message);
        process.exit(1);
    }
}

function saveDatabase() {
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
        console.error("Error saving database:", err);
    }
}

// ============================================
// SECURITY UTILITIES
// ============================================

function generateToken(length = 32) {
    return crypto.randomBytes(length).toString("hex");
}

function generateDeviceId() {
    return crypto.randomBytes(16).toString("hex");
}

function sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return input.trim();
}

function getRawInput(input) {
    if (typeof input !== "string") return "";
    return input;
}

function containsUnsafeHtmlChars(input) {
    return /[<>]/.test(input);
}

function escapeHtml(text) {
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePasswordStrength(password) {
    const errors = [];

    if (password.length < PASSWORD_MIN_LENGTH) {
        errors.push(
            `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        );
    }
    if (!/[a-z]/.test(password)) {
        errors.push("Password must contain lowercase letters");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("Password must contain uppercase letters");
    }
    if (!/[0-9]/.test(password)) {
        errors.push("Password must contain numbers");
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push("Password must contain special characters");
    }

    return { valid: errors.length === 0, errors };
}

async function sendEmail(to, subject, text) {
    try {
        if (process.env.SMTP_HOST) {
            await emailTransporter.sendMail({
                from: process.env.EMAIL_FROM || "noreply@example.com",
                to,
                subject,
                text,
            });
            console.log(`✓ Email sent to ${to}`);
        } else {
            console.log(`\n--- MOCK EMAIL ---`);
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log(`Body:\n${text}`);
            console.log(`------------------\n`);
        }
        return true;
    } catch (err) {
        console.error("Email error:", err.message);
        return false;
    }
}

// ============================================
// AUTH HANDLERS
// ============================================

async function handleRegister(body) {
    const username = sanitizeInput(body.username);
    const email = sanitizeInput(body.email);
    const password = getRawInput(body.password);
    const confirmPassword = getRawInput(body.confirmPassword);

    if (!username || username.length < 3) {
        return {
            status: 400,
            data: {
                ok: false,
                message: "Username must be at least 3 characters",
            },
        };
    }

    if (containsUnsafeHtmlChars(username)) {
        return {
            status: 400,
            data: {
                ok: false,
                message: "Username contains invalid characters",
            },
        };
    }

    if (!email || !isValidEmail(email)) {
        return { status: 400, data: { ok: false, message: "Invalid email" } };
    }

    if (containsUnsafeHtmlChars(email)) {
        return { status: 400, data: { ok: false, message: "Invalid email" } };
    }

    if (password !== confirmPassword) {
        return {
            status: 400,
            data: { ok: false, message: "Passwords do not match" },
        };
    }

    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
        return {
            status: 400,
            data: {
                ok: false,
                message: "Weak password",
                errors: strength.errors,
            },
        };
    }

    try {
        db.run(
            `DELETE FROM pending_registrations WHERE expires_at <= strftime('%s', 'now')`,
        );

        const existing = db.exec(
            `SELECT id FROM users WHERE username = ? OR email = ?`,
            [username, email],
        );
        if (existing && existing[0] && existing[0].values.length > 0) {
            return {
                status: 409,
                data: { ok: false, message: "User already exists" },
            };
        }

        db.run(
            `DELETE FROM pending_registrations WHERE username = ? OR email = ?`,
            [username, email],
        );

        const hashedPassword = await bcrypt.hash(password, 12);
        const secret = speakeasy.generateSecret({
            name: `SecureLogin (${email})`,
            issuer: "SecureLogin App",
        });

        const registrationToken = generateToken();
        const expiresAt = Math.floor(
            (Date.now() + REGISTRATION_SETUP_TIMEOUT) / 1000,
        );

        db.run(
            `INSERT INTO pending_registrations (username, email, password, two_factor_secret, registration_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                username,
                email,
                hashedPassword,
                secret.base32,
                registrationToken,
                expiresAt,
            ],
        );

        const qrCode = await QRCode.toDataURL(secret.otpauth_url);
        saveDatabase();

        return {
            status: 200,
            data: {
                ok: true,
                message:
                    "Scan the QR code and verify OTP to complete registration.",
                registrationToken,
                secret: secret.base32,
                qrCode,
            },
        };
    } catch (err) {
        console.error("Register error:", err);
        return {
            status: 500,
            data: { ok: false, message: "Registration failed" },
        };
    }
}

async function handleCompleteRegistration2FA(body) {
    const registrationToken = sanitizeInput(body.registrationToken);
    const code = sanitizeInput(body.code);

    if (!registrationToken || !code) {
        return {
            status: 400,
            data: {
                ok: false,
                message: "Registration token and OTP code are required",
            },
        };
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
        return {
            status: 400,
            data: { ok: false, message: "Enter a valid 6-digit OTP code" },
        };
    }

    try {
        db.run(
            `DELETE FROM pending_registrations WHERE expires_at <= strftime('%s', 'now')`,
        );

        const pendingResult = db.exec(
            `SELECT username, email, password, two_factor_secret
       FROM pending_registrations
       WHERE registration_token = ? AND expires_at > strftime('%s', 'now')`,
            [registrationToken],
        );

        if (
            !pendingResult ||
            !pendingResult[0] ||
            !pendingResult[0].values.length
        ) {
            return {
                status: 401,
                data: {
                    ok: false,
                    message:
                        "Registration session expired. Please register again.",
                },
            };
        }

        const pending = pendingResult[0].values[0];
        const username = pending[0];
        const email = pending[1];
        const hashedPassword = pending[2];
        const secret = pending[3];

        const verified = speakeasy.totp.verify({
            secret,
            encoding: "base32",
            token: code,
            window: 1,
        });

        if (!verified) {
            return {
                status: 401,
                data: { ok: false, message: "Invalid OTP code" },
            };
        }

        db.run(
            `INSERT INTO users (username, email, password, two_factor_secret, two_factor_enabled)
       VALUES (?, ?, ?, ?, 1)`,
            [username, email, hashedPassword, secret],
        );

        db.run(
            `DELETE FROM pending_registrations WHERE registration_token = ?`,
            [registrationToken],
        );
        saveDatabase();

        return {
            status: 201,
            data: {
                ok: true,
                message: "Registration complete. You can now log in with OTP.",
            },
        };
    } catch (err) {
        console.error("Complete registration error:", err);
        return {
            status: 500,
            data: { ok: false, message: "Failed to complete registration" },
        };
    }
}

async function handleLogin(body, req) {
    const username = sanitizeInput(body.username);
    const password = getRawInput(body.password);
    const deviceId = body.deviceId || generateDeviceId();

    if (!username || !password) {
        return {
            status: 400,
            data: { ok: false, message: "Username and password required" },
        };
    }

    if (containsUnsafeHtmlChars(username)) {
        return {
            status: 400,
            data: { ok: false, message: "Invalid username or email" },
        };
    }

    try {
        const result = db.exec(
            `SELECT id, username, email, password, two_factor_enabled, two_factor_secret, failed_attempts, locked_until
       FROM users WHERE username = ? OR email = ?`,
            [username, username],
        );

        if (!result || !result[0] || !result[0].values.length) {
            return {
                status: 401,
                data: { ok: false, message: "Invalid credentials" },
            };
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
            lockedUntil: userRow[7],
        };

        if (user.lockedUntil) {
            const lockTime = new Date(user.lockedUntil);
            if (lockTime > new Date()) {
                const minutesLeft = Math.ceil((lockTime - new Date()) / 60000);
                return {
                    status: 429,
                    data: {
                        ok: false,
                        message: `Account locked. Try again in ${minutesLeft} minutes.`,
                    },
                };
            } else {
                db.run(
                    `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`,
                    [user.id],
                );
            }
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            const newAttempts = user.failedAttempts + 1;
            let lockedUntil = null;

            if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                lockedUntil = new Date(Date.now() + LOCKOUT_TIME).toISOString();
            }

            db.run(
                `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
                [newAttempts, lockedUntil, user.id],
            );

            saveDatabase();

            db.run(
                `INSERT INTO login_history (user_id, ip_address, user_agent, success)
         VALUES (?, ?, ?, 0)`,
                [user.id, req.ip || "unknown", req.headers["user-agent"] || ""],
            );

            if (lockedUntil) {
                return {
                    status: 429,
                    data: {
                        ok: false,
                        message:
                            "Too many failed attempts. Account locked for 15 minutes.",
                    },
                };
            }

            return {
                status: 401,
                data: { ok: false, message: "Invalid credentials" },
            };
        }

        db.run(
            `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`,
            [user.id],
        );

        const deviceResult = db.exec(
            `SELECT id, is_trusted FROM login_devices WHERE user_id = ? AND device_id = ?`,
            [user.id, deviceId],
        );

        const deviceExists =
            deviceResult &&
            deviceResult[0] &&
            deviceResult[0].values.length > 0;
        let isNewDevice = !deviceExists;

        if (deviceExists) {
            const deviceRow = deviceResult[0].values[0];
            db.run(
                `UPDATE login_devices SET last_seen = CURRENT_TIMESTAMP, ip_address = ?, user_agent = ? WHERE id = ?`,
                [
                    req.ip || "unknown",
                    req.headers["user-agent"] || "",
                    deviceRow[0],
                ],
            );
        } else {
            try {
                db.run(
                    `INSERT INTO login_devices (user_id, device_id, device_name, device_type, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        user.id,
                        deviceId,
                        "Unknown Device",
                        "Web",
                        req.ip || "unknown",
                        req.headers["user-agent"] || "",
                    ],
                );
            } catch (err) {
                db.run(
                    `UPDATE login_devices SET last_seen = CURRENT_TIMESTAMP, ip_address = ?, user_agent = ? WHERE device_id = ? AND user_id = ?`,
                    [
                        req.ip || "unknown",
                        req.headers["user-agent"] || "",
                        deviceId,
                        user.id,
                    ],
                );
            }
        }

        const sessionToken = generateToken();
        const csrfToken = generateToken();
        const expiresAt = new Date(Date.now() + SESSION_TIMEOUT).toISOString();

        db.run(
            `INSERT INTO sessions (user_id, session_token, csrf_token, device_id, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
            [user.id, sessionToken, csrfToken, deviceId, expiresAt],
        );

        db.run(
            `INSERT INTO login_history (user_id, ip_address, user_agent, success)
       VALUES (?, ?, ?, 1)`,
            [user.id, req.ip || "unknown", req.headers["user-agent"] || ""],
        );

        db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [
            user.id,
        ]);
        saveDatabase();

        if (isNewDevice) {
            sendEmail(
                user.email,
                "New Device Login Notification",
                `A new device logged into your account.\n\nIP: ${req.ip}\nTime: ${new Date().toLocaleString()}\n\nIf this wasn't you, please reset your password immediately.`,
            );
        }

        if (!user.twoFactorEnabled || !user.twoFactorSecret) {
            return {
                status: 403,
                data: {
                    ok: false,
                    message: "2FA is not configured for this account",
                },
            };
        }

        return {
            status: 200,
            data: {
                ok: true,
                message: "Enter 2FA code",
                requires2FA: true,
                sessionToken,
                csrfToken,
            },
        };
    } catch (err) {
        console.error("Login error:", err);
        return { status: 500, data: { ok: false, message: "Login failed" } };
    }
}

async function handleVerify2FA(body, req = {}) {
    const sessionToken = sanitizeInput(body.sessionToken);
    const code = sanitizeInput(body.code);

    if (!sessionToken || !code) {
        return {
            status: 400,
            data: { ok: false, message: "2FA code required" },
        };
    }

    try {
        const sessionResult = db.exec(
            `SELECT user_id FROM sessions WHERE session_token = ? AND expires_at > CURRENT_TIMESTAMP`,
            [sessionToken],
        );

        if (
            !sessionResult ||
            !sessionResult[0] ||
            !sessionResult[0].values.length
        ) {
            return {
                status: 401,
                data: { ok: false, message: "Session expired" },
            };
        }

        const userId = sessionResult[0].values[0][0];
        const userResult = db.exec(
            `SELECT username, email, two_factor_secret FROM users WHERE id = ?`,
            [userId],
        );

        const user = userResult[0].values[0];
        const verified = speakeasy.totp.verify({
            secret: user[2],
            encoding: "base32",
            token: code,
            window: 2,
        });

        if (!verified) {
            return {
                status: 401,
                data: { ok: false, message: "Invalid 2FA code" },
            };
        }

        sendEmail(
            user[1],
            "Login Notification",
            `A successful login to your account was just detected.\n\nIP: ${req.ip || "unknown"}\nTime: ${new Date().toLocaleString()}\n\nIf this wasn't you, please reset your password immediately.`,
        );

        return {
            status: 200,
            data: {
                ok: true,
                message: "2FA verified",
                user: { id: userId, username: user[0], email: user[1] },
            },
        };
    } catch (err) {
        console.error("2FA error:", err);
        return {
            status: 500,
            data: { ok: false, message: "2FA verification failed" },
        };
    }
}

async function handleSetup2FA(body) {
    const userId = body.userId;

    if (!userId) {
        return {
            status: 400,
            data: { ok: false, message: "User ID required" },
        };
    }

    try {
        const secret = speakeasy.generateSecret({
            name: "SecureLogin",
            issuer: "SecureLogin App",
        });

        const qrCode = await QRCode.toDataURL(secret.otpauth_url);

        return {
            status: 200,
            data: {
                ok: true,
                message: "2FA setup",
                secret: secret.base32,
                qrCode,
                userId,
            },
        };
    } catch (err) {
        console.error("2FA setup error:", err);
        return {
            status: 500,
            data: { ok: false, message: "2FA setup failed" },
        };
    }
}

async function handleEnable2FA(body) {
    const userId = body.userId;
    const secret = sanitizeInput(body.secret);
    const code = sanitizeInput(body.code);

    if (!userId || !secret || !code) {
        return {
            status: 400,
            data: { ok: false, message: "Missing required fields" },
        };
    }

    try {
        const verified = speakeasy.totp.verify({
            secret,
            encoding: "base32",
            token: code,
            window: 2,
        });

        if (!verified) {
            return {
                status: 401,
                data: { ok: false, message: "Invalid code" },
            };
        }

        db.run(
            `UPDATE users SET two_factor_secret = ?, two_factor_enabled = 1 WHERE id = ?`,
            [secret, userId],
        );

        saveDatabase();

        return {
            status: 200,
            data: { ok: true, message: "2FA enabled successfully" },
        };
    } catch (err) {
        console.error("Enable 2FA error:", err);
        return {
            status: 500,
            data: { ok: false, message: "Failed to enable 2FA" },
        };
    }
}

async function handleForgotPassword(body) {
    const email = sanitizeInput(body.email);

    if (!email || !isValidEmail(email)) {
        return {
            status: 400,
            data: { ok: false, message: "Valid email required" },
        };
    }

    if (containsUnsafeHtmlChars(email)) {
        return {
            status: 400,
            data: { ok: false, message: "Valid email required" },
        };
    }

    try {
        const userResult = db.exec(`SELECT id FROM users WHERE email = ?`, [
            email,
        ]);

        if (!userResult || !userResult[0] || !userResult[0].values.length) {
            return {
                status: 200,
                data: {
                    ok: true,
                    message: "If account exists, reset link sent to email",
                },
            };
        }

        const userId = userResult[0].values[0][0];
        const resetToken = generateToken();
        const expiresAt = new Date(
            Date.now() + PASSWORD_RESET_TIMEOUT,
        ).toISOString();

        db.run(
            `INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)`,
            [userId, resetToken, expiresAt],
        );

        saveDatabase();

        sendEmail(
            email,
            "Password Reset Request",
            `Click to reset password: http://localhost:8080/login.html?token=${resetToken}\n\nThis link expires in 1 hour.`,
        );

        return {
            status: 200,
            data: {
                ok: true,
                message: "If account exists, reset link sent to email",
            },
        };
    } catch (err) {
        console.error("Password reset error:", err);
        return { status: 500, data: { ok: false, message: "Request failed" } };
    }
}

async function handleResetPassword(body) {
    const token = sanitizeInput(body.token);
    const newPassword = getRawInput(body.password);
    const confirmPassword = getRawInput(body.confirmPassword);

    if (!token || !newPassword || !confirmPassword) {
        return {
            status: 400,
            data: { ok: false, message: "Missing required fields" },
        };
    }

    if (newPassword !== confirmPassword) {
        return {
            status: 400,
            data: { ok: false, message: "Passwords do not match" },
        };
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
        return {
            status: 400,
            data: {
                ok: false,
                message: "Weak password",
                errors: strength.errors,
            },
        };
    }

    try {
        const resetResult = db.exec(
            `SELECT user_id FROM password_resets
       WHERE token = ? AND expires_at > CURRENT_TIMESTAMP`,
            [token],
        );

        if (!resetResult || !resetResult[0] || !resetResult[0].values.length) {
            return {
                status: 401,
                data: { ok: false, message: "Invalid or expired token" },
            };
        }

        const userId = resetResult[0].values[0][0];
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        db.run(
            `UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [hashedPassword, userId],
        );

        db.run(`DELETE FROM password_resets WHERE token = ?`, [token]);
        db.run(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
        saveDatabase();

        return {
            status: 200,
            data: {
                ok: true,
                message: "Password reset successful. Please log in.",
            },
        };
    } catch (err) {
        console.error("Reset password error:", err);
        return { status: 500, data: { ok: false, message: "Reset failed" } };
    }
}

// ============================================
// ROUTES
// ============================================

app.get("/api/health", (req, res) => {
    res.json({ ok: true, db: !!db, message: "Server running" });
});

app.post("/api/register", async (req, res) => {
    const result = await handleRegister(req.body);
    res.status(result.status).json(result.data);
});

app.post("/api/register/verify-2fa", async (req, res) => {
    const result = await handleCompleteRegistration2FA(req.body);
    res.status(result.status).json(result.data);
});

app.post("/api/login", async (req, res) => {
    const result = await handleLogin(req.body, req);
    res.status(result.status).json(result.data);
});

app.post("/api/verify-2fa", async (req, res) => {
    const result = await handleVerify2FA(req.body, req);
    res.status(result.status).json(result.data);
});

app.post("/api/setup-2fa", authenticateUser, async (req, res) => {
    req.body.userId = req.userId;
    const result = await handleSetup2FA(req.body);
    res.status(result.status).json(result.data);
});

app.post("/api/enable-2fa", authenticateUser, async (req, res) => {
    req.body.userId = req.userId;
    const result = await handleEnable2FA(req.body);
    res.status(result.status).json(result.data);
});

app.post("/api/forgot-password", async (req, res) => {
    const result = await handleForgotPassword(req.body);
    res.status(result.status).json(result.data);
});

app.post("/api/reset-password", async (req, res) => {
    const result = await handleResetPassword(req.body);
    res.status(result.status).json(result.data);
});

// --- ADDED ENDPOINTS ---
async function authenticateUser(req, res, next) {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
    const token = authHeader.split(" ")[1];
    try {
        const sessionRes = db.exec(
            "SELECT user_id, expires_at FROM sessions WHERE session_token = ?",
            [token],
        );
        if (
            !sessionRes ||
            sessionRes.length === 0 ||
            sessionRes[0].values.length === 0
        ) {
            return res
                .status(401)
                .json({ ok: false, message: "Invalid session" });
        }
        const session = sessionRes[0].values[0];
        const userId = session[0];
        const expiresAt = session[1];
        if (new Date() > new Date(expiresAt)) {
            db.run("DELETE FROM sessions WHERE session_token = ?", [token]);
            return res
                .status(401)
                .json({ ok: false, message: "Session expired" });
        }
        req.userId = userId;
        req.sessionToken = token;
        next();
    } catch (err) {
        return res.status(500).json({ ok: false, message: "Server error" });
    }
}

app.get("/api/profile", authenticateUser, async (req, res) => {
    try {
        const userRes = db.exec(
            "SELECT username, email, two_factor_enabled FROM users WHERE id = ?",
            [req.userId],
        );
        if (!userRes || userRes.length === 0) {
            return res
                .status(404)
                .json({ ok: false, message: "User not found" });
        }
        const user = userRes[0].values[0];
        res.json({
            ok: true,
            username: user[0],
            email: user[1],
            two_factor_enabled: !!user[2],
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: "Server error" });
    }
});

app.post("/api/logout", authenticateUser, async (req, res) => {
    try {
        db.run("DELETE FROM sessions WHERE session_token = ?", [
            req.sessionToken,
        ]);
        res.json({ ok: true, message: "Logged out successfully" });
    } catch (err) {
        res.status(500).json({ ok: false, message: "Server error" });
    }
});

app.post("/api/change-password", authenticateUser, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ ok: false, message: "Missing fields" });
    }
    if (newPassword.length < 8) {
        return res
            .status(400)
            .json({ ok: false, message: "Password too short" });
    }
    try {
        const userRes = db.exec("SELECT password FROM users WHERE id = ?", [
            req.userId,
        ]);
        if (!userRes || userRes.length === 0)
            return res
                .status(404)
                .json({ ok: false, message: "User not found" });
        const user = userRes[0].values[0];
        const match = await bcrypt.compare(currentPassword, user[0]);
        if (!match)
            return res
                .status(400)
                .json({ ok: false, message: "Current password incorrect" });

        const hashed = await bcrypt.hash(newPassword, 12);
        db.run(
            "UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?",
            [hashed, req.userId],
        );
        res.json({ ok: true, message: "Password updated successfully" });
    } catch (err) {
        res.status(500).json({ ok: false, message: "Server error" });
    }
});
app.use((req, res) => {
    res.status(404).json({ ok: false, message: "Not Found" });
});

// ============================================
// START SERVER
// ============================================

async function start() {
    await initializeDatabase();

    app.listen(PORT, HOST, () => {
        const displayHost = HOST === "127.0.0.1" ? "localhost" : HOST;
        console.log(`\n🚀 Secure Login Server Running (Express.js)`);
        console.log(`📍 http://${displayHost}:${PORT}/`);
        console.log(`🗄️  Database: SQLite`);
        console.log(
            `🔒 Security Features: 2FA, Password Recovery, Device Tracking, Rate Limiting`,
        );
        console.log(`\n✓ Ready for connections\n`);
    });
}

process.on("SIGINT", () => {
    console.log("\n\nShutting down...");
    if (db) saveDatabase();
    process.exit(0);
});

start();
