# Secure Login System - Express.js + SQLite + 2FA

## 🎯 Project Overview

Enterprise-grade authentication system with:

- **Frontend**: Pure HTML, CSS, JavaScript (vanilla - no frameworks)
- **Backend**: Express.js + Node.js
- **Database**: SQLite (file-based, in-memory compatible)
- **Security**:
  - bcrypt password hashing
  - Two-Factor Authentication (2FA) with Google Authenticator
  - CSRF protection
  - Rate limiting & account lockout
  - Device tracking
  - Password recovery & reset
  - Secure session management

## 📁 Project Structure

```
Cyber_Security/
├── frontend/                    # Frontend application
│   ├── index.html              # Landing page
│   ├── login.html              # Login with 2FA
│   ├── register.html           # Registration with 2FA setup
│   ├── dashboard.html          # User dashboard (profile, settings)
│   ├── secure-script.js        # Authentication & form handling
│   └── secure-styles.css       # Styling
│
├── backend/                     # Express.js backend
│   ├── server-express.js       # Main server file
│   └── auth.db                 # SQLite database (auto-created)
│
├── package.json                # Dependencies
└── README.md                    # This file
```

## ✨ Features

### Authentication

✅ User registration with email validation
✅ Secure login with 2FA (Google Authenticator/Authy)
✅ Password hashing with bcrypt (12 rounds)
✅ Rate limiting (3 attempts, 15 min lockout)
✅ Device tracking & device recognition
✅ Persistent sessions with token-based auth

### User Dashboard

✅ View profile (username & email)
✅ Change password securely
✅ Enable/Disable 2FA
✅ Change 2FA settings anytime
✅ Logout functionality

### Security

✅ Email notifications on successful login
✅ Password recovery via email
✅ Password reset with secure tokens
✅ CSRF protection
✅ Input validation & sanitization
✅ XSS prevention
✅ Session timeout (30 minutes)
✅ Account lockout after failed attempts

## 🚀 Getting Started

### Prerequisites

- Node.js (v14+)
- npm

### Setup & Installation

1. **Navigate to project directory:**

```bash
cd Cyber_Security
```

1. **Install dependencies:**

```bash
npm install
```

1. **Start the server:**

```bash
npm start
```

1. **Open in browser:**

```
http://localhost:8080/
```

The SQLite database will be created automatically on first run. 🎉

### What Happens on First Run

- SQLite database `backend/auth.db` is created
- Database tables are initialized:
  - `users` - User accounts
  - `sessions` - Active sessions
  - `login_devices` - Trusted devices
  - `login_history` - Login logs
  - `password_resets` - Reset tokens
  - `pending_registrations` - Incomplete registrations
- Server starts on `http://localhost:8080`

### Troubleshooting

**Port 8080 already in use?**

```bash
# Edit backend/server-express.js line 23
# Change: const PORT = 8080;
# To your preferred port
```

**Dependencies not working?**

```bash
rm -rf node_modules package-lock.json
npm install
```

**Database corrupted?**

```bash
# Delete the database file and restart
rm backend/auth.db
npm start
```

## 🔗 API Endpoints

### Authentication

**Register User**

```
POST /api/register
Content-Type: application/json

Request:
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "Password123!",
  "confirmPassword": "Password123!"
}

Response (200):
{
  "ok": true,
  "message": "Scan the QR code and verify OTP to complete registration.",
  "registrationToken": "<token>",
  "secret": "<base32-secret>",
  "qrCode": "data:image/png;base64,..."
}
```

**Complete Registration (Verify 2FA)**

```
POST /api/register/verify-2fa
Content-Type: application/json

Request:
{
  "registrationToken": "<token>",
  "code": "123456"
}

Response (201):
{
  "ok": true,
  "message": "Registration complete. You can now log in."
}
```

**Login User**

```
POST /api/login
Content-Type: application/json

Request:
{
  "username": "john_doe",
  "password": "Password123!",
  "deviceId": "<device-id>"
}

Response (200):
{
  "ok": true,
  "message": "Enter 2FA code",
  "requires2FA": true,
  "sessionToken": "<token>",
  "csrfToken": "<csrf-token>"
}
```

**Verify 2FA Code**

```
POST /api/verify-2fa
Content-Type: application/json

Request:
{
  "sessionToken": "<token>",
  "code": "123456"
}

Response (200):
{
  "ok": true,
  "message": "2FA verified",
  "user": {
    "id": 1,
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

### User Profile & Settings

**Get User Profile** (Requires Auth)

```
GET /api/profile
Authorization: Bearer <sessionToken>

Response (200):
{
  "ok": true,
  "username": "john_doe",
  "email": "john@example.com",
  "two_factor_enabled": true
}
```

**Logout** (Requires Auth)

```
POST /api/logout
Authorization: Bearer <sessionToken>

Response (200):
{
  "ok": true,
  "message": "Logged out successfully"
}
```

**Change Password** (Requires Auth)

```
POST /api/change-password
Authorization: Bearer <sessionToken>
Content-Type: application/json

Request:
{
  "currentPassword": "Password123!",
  "newPassword": "NewPassword456!"
}

Response (200):
{
  "ok": true,
  "message": "Password updated successfully"
}
```

### 2FA Management

**Setup 2FA** (Requires Auth)

```
POST /api/setup-2fa
Authorization: Bearer <sessionToken>

Response (200):
{
  "ok": true,
  "secret": "<base32-secret>",
  "qrCode": "data:image/png;base64,..."
}
```

**Enable 2FA** (Requires Auth)

```
POST /api/enable-2fa
Authorization: Bearer <sessionToken>
Content-Type: application/json

Request:
{
  "secret": "<base32-secret>",
  "code": "123456"
}

Response (200):
{
  "ok": true,
  "message": "2FA enabled successfully"
}
```

### Password Recovery

**Forgot Password**

```
POST /api/forgot-password
Content-Type: application/json

Request:
{
  "email": "john@example.com"
}

Response (200):
{
  "ok": true,
  "message": "If account exists, reset link sent to email"
}
```

**Reset Password**

```
POST /api/reset-password
Content-Type: application/json

Request:
{
  "token": "<reset-token>",
  "newPassword": "NewPassword456!",
  "confirmPassword": "NewPassword456!"
}

Response (200):
{
  "ok": true,
  "message": "Password reset successful. Please log in."
}
```

### Utility

**Health Check**

```
GET /api/health

Response (200):
{
  "ok": true,
  "message": "Server running",
  "db": true
}
```

## 🔐 Security Features

### Authentication & Authorization

- ✅ **bcrypt Hashing**: 12 salt rounds for password security
- ✅ **Session Management**: Token-based with 30-minute timeout
- ✅ **CSRF Protection**: Token validation on state-changing requests
- ✅ **Two-Factor Authentication**: Time-based OTP (TOTP) with Google Authenticator
- ✅ **Device Tracking**: Remember trusted devices
- ✅ **Rate Limiting**: 3 failed login attempts → 15-minute lockout

### Data Protection

- ✅ **Input Validation**: Both frontend and backend validation
- ✅ **Input Sanitization**: XSS and HTML injection prevention
- ✅ **Email Validation**: RFC-compliant format checking
- ✅ **SQL Injection Prevention**: Parameterized queries
- ✅ **Password Requirements**: Min 8 chars, uppercase, lowercase, numbers, symbols

### User Privacy

- ✅ **Secure Password Reset**: Time-limited tokens (1 hour)
- ✅ **No Plain Text Storage**: All passwords hashed
- ✅ **Login Notifications**: Email alerts on successful authentication
- ✅ **Login History**: Track all login attempts
- ✅ **Session Tracking**: Monitor active sessions
- ✅ **Secure Logout**: Server-side session invalidation

### HTTP Security

- ✅ **Security Headers**: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- ✅ **HSTS**: Strict-Transport-Security for HTTPS
- ✅ **CSP**: Content-Security-Policy headers
- ✅ **CORS**: Properly configured cross-origin requests

## �️ Backend Implementation

### Architecture

- **Framework**: Express.js (lightweight, flexible)
- **Database**: SQLite with sql.js (in-memory or file-based)
- **Authentication**: JWT-style tokens + Session management
- **2FA**: TOTP (Time-based One-Time Password)
- **Email**: Nodemailer (with mock email fallback)

### File: `backend/server-express.js`

The main server file that handles:

- **Express middleware**: CORS, JSON parsing, security headers
- **Database initialization**: Creates tables on startup
- **Authentication routes**: Register, login, verify 2FA
- **Protected routes**: Profile, logout, password change
- **2FA setup**: Generate QR codes and secrets
- **Password recovery**: Reset tokens and email
- **Device tracking**: Remember and manage trusted devices
- **Rate limiting**: Lockout after failed attempts
- **Email notifications**: Login alerts (with mock fallback)

### Database Schema

**Users Table**

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,          -- bcrypt hash
  two_factor_secret TEXT,          -- base32 encoded
  two_factor_enabled INTEGER,      -- 0 or 1
  failed_attempts INTEGER,         -- for rate limiting
  locked_until DATETIME,           -- lockout expiry
  password_changed_at DATETIME,
  created_at DATETIME,
  last_login DATETIME
)
```

**Sessions Table**

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  session_token TEXT UNIQUE,
  csrf_token TEXT UNIQUE,
  device_id TEXT,
  expires_at DATETIME,
  created_at DATETIME
)
```

**Login Devices Table**

```sql
CREATE TABLE login_devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  device_id TEXT UNIQUE,
  device_name TEXT,
  device_type TEXT,
  last_seen DATETIME,
  is_trusted INTEGER,
  ip_address TEXT,
  user_agent TEXT
)
```

**Login History Table**

```sql
CREATE TABLE login_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER,
  login_time DATETIME
)
```

### Key Functions

**Authentication Middleware**

```javascript
authenticateUser(req, res, next)
- Validates Authorization header
- Checks session token validity
- Verifies session expiration
- Attaches user ID to request
```

**Password Hashing**

```javascript
bcrypt.hash(password, 12)        // Secure hashing
bcrypt.compare(input, hash)      // Safe comparison
```

**TOTP Generation & Verification**

```javascript
speakeasy.generateSecret()       // Create 2FA secret
speakeasy.totp.verify()          // Verify OTP codes
```

### Email Notifications

**Login Notification Email**
When a user logs in successfully:

- Recipient: User's registered email
- Subject: "Login Notification"
- Content: IP address, timestamp, security warning

**Mock Email Mode** (when SMTP not configured):

- Logs email content to console
- Shows: To, Subject, Body
- Useful for development without email server

**Enable Real Emails**:
Set environment variables:

```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your@gmail.com
export SMTP_PASS=your_app_password
export EMAIL_FROM=your@gmail.com
```

## 🎨 Frontend Pages

### Landing Page (`index.html`)

- Welcome message
- Links to Login and Register pages

### Login Page (`login.html`)

- Username/email input
- Password input with show/hide toggle
- 2FA verification form
- Password recovery form
- Device remember option
- Form validation

### Register Page (`register.html`)

- Username, email, password inputs
- Password strength indicator
- 2FA setup with QR code
- OTP verification

### Dashboard Page (`dashboard.html`)

- **Profile Section**: View username and email
- **Security Section**:
  - View 2FA status
  - Enable/Change 2FA
- **Password Section**: Change password securely
- **Logout Button**: Secure session termination

### Styling

- **File**: `frontend/secure-styles.css`
- Responsive design (mobile & desktop)
- Beautiful gradient backgrounds
- Smooth animations
- Dark theme with accent colors

## 🎯 Customization

To customize the frontend:

1. **Colors & Theme**: Edit CSS variables in `secure-styles.css`
2. **Icons**: Change emojis in HTML files (e.g., 🔐 → 🔒)
3. **Messages**: Update text in HTML files and `secure-script.js`
4. **Logo**: Add your own logo to `index.html`
5. **Email Messages**: Edit email content in `backend/server-express.js`

## 🧪 Testing the Application

### Manual Testing Flow

1. **Start the server:**

```bash
npm start
```

1. **Open in browser:**

```
http://localhost:8080/
```

1. **Test Registration:**
   - Click "Create Account"
   - Enter username, email, password
   - Scan QR code with Google Authenticator/Authy
   - Enter the 6-digit code
   - Account created ✓

2. **Test Login:**
   - Enter username and password
   - Enter 2FA code from authenticator
   - Redirected to dashboard ✓

3. **Test Dashboard:**
   - View profile information ✓
   - Change password ✓
   - Change 2FA settings ✓
   - Click Logout ✓

4. **Test Email Notifications:**
   - Check server console for login notification emails
   - (Or configure SMTP to send real emails)

### API Testing with cURL

```bash
# Health check
curl http://localhost:8080/api/health

# Register user
curl -X POST http://localhost:8080/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "email": "test@example.com",
    "password": "TestPass123!"
  }'

# Login
curl -X POST http://localhost:8080/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "password": "TestPass123!"
  }'

# Get profile (requires auth)
curl -H "Authorization: Bearer <SESSION_TOKEN>" \
  http://localhost:8080/api/profile

# Logout (requires auth)
curl -X POST \
  -H "Authorization: Bearer <SESSION_TOKEN>" \
  http://localhost:8080/api/logout
```

## 📂 Database Viewing

### Using SQLite CLI

```bash
# Open the database
sqlite3 backend/auth.db

# View all tables
.tables

# View all users
SELECT id, username, email, created_at, last_login FROM users;

# View login history
SELECT user_id, ip_address, success, login_time FROM login_history;

# Exit
.exit
```

### Using DB Browser GUI

1. Download: <https://sqlitebrowser.org/>
2. Open: `backend/auth.db`
3. Browse tables and data visually
4. View user records, session tokens, login history, devices, etc.

## 📱 Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## 📚 Dependencies

Core dependencies in `package.json`:

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.18.2 | Web framework |
| bcrypt | 6.0.0 | Password hashing |
| speakeasy | 2.0.0 | TOTP generation |
| qrcode | 1.5.3 | QR code generation |
| sql.js | 1.8.0 | SQLite database |
| nodemailer | 8.0.7 | Email sending |

## 🚀 Deployment Notes

### Production Checklist

- [ ] Set strong `SESSION_TIMEOUT` (currently 30 min)
- [ ] Configure SMTP environment variables for real emails
- [ ] Use HTTPS in production (modify CSP header)
- [ ] Set secure cookie flags
- [ ] Enable HSTS header
- [ ] Rate limit public endpoints
- [ ] Monitor login attempts and suspicious activity
- [ ] Regular database backups
- [ ] Keep dependencies updated

### Environment Variables

```bash
# SMTP Configuration (optional, uses mock email if not set)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yoursite.com

# Server Config (optional)
PORT=8080
HOST=127.0.0.1
```

## 📞 Support & Troubleshooting

### Common Issues

**Q: "Port 8080 already in use"**
A: Change PORT in `backend/server-express.js` line 23

**Q: "Cannot find module 'speakeasy'"**
A: Run `npm install` to install all dependencies

**Q: "Database is locked"**
A: Delete `backend/auth.db` and restart the server

**Q: "Email not sending"**
A: Check SMTP credentials or use mock email mode (default)

**Q: "2FA code not working"**
A: Ensure your device time is synchronized
B: Try TOTP with 2-second window tolerance (default)

**Q: "Session token expired"**
A: Login again. Session timeout is 30 minutes by default

## 📄 License

This project is open source and available for educational purposes.

## 🎓 Learning Resources

- [bcrypt Documentation](https://github.com/kelektiv/node.bcrypt.js)
- [Speakeasy TOTP](https://github.com/speakeasyjs/speakeasy)
- [Express.js Guide](https://expressjs.com/)
- [SQLite Best Practices](https://www.sqlite.org/bestpractice.html)
- [OWASP Security Guidelines](https://owasp.org/www-project-top-ten/)

---

Built with ❤️ for secure authentication

- Password strength color coding

**script.js**: Includes:

- Form validation logic (used by both pages)
- Password strength calculator
- Show/hide password toggle
- Error message handling
- Backend integration templates

## 💡 Notes

- Frontend is fully functional and can be tested immediately
- All validation happens on the frontend (add server-side validation too!)
- Includes detailed comments for backend integration
- Ready for production after backend implementation and testing
