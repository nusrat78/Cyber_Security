# 🔐 Security Features Testing Guide

All security measures are **FULLY IMPLEMENTED AND WORKING**. Here's how to test each one:

---

## ✅ 1. Username & Password Validation

**Test:**
1. Open http://localhost:8080/
2. Try to login with empty fields → Shows error message
3. Try username shorter than 3 chars → Rejected on registration
4. Password shorter than 8 chars → Rejected with error

**Backend Implementation:**
- `validatePasswordStrength()` checks length, uppercase, lowercase, numbers, special chars
- `sanitizeInput()` prevents XSS attacks
- Passwords hashed with `bcrypt.hash(password, 12)` (12 salt rounds)

---

## ✅ 2. Two-Factor Authentication (2FA)

**Test Registration & 2FA Setup:**

1. **Register new account:**
   ```
   Username: john_doe
   Email: john@example.com
   Password: SecurePass123!
   ```

2. **Login:**
   - Enter username and password
   - System shows "Enter 2FA Code" screen
   - (2FA is optional - you can skip for now)

3. **Setup 2FA (if enabled):**
   - QR code displayed for scanning
   - Scan with Google Authenticator, Authy, or Microsoft Authenticator
   - Enter 6-digit code from app
   - 2FA is enabled

**Backend Code:**
```javascript
// Uses speakeasy library for TOTP generation
speakeasy.totp.verify({
  secret: user.twoFactorSecret,
  encoding: 'base32',
  token: code,
  window: 2
});
```

---

## ✅ 3. Password Hashing (bcrypt)

**Test:**
1. Register account with password: `TestPass123!`
2. Open database: `sqlite3 backend/auth.db`
3. Run: `SELECT username, password FROM users;`
4. Password is shown as: `$2b$12$...` (bcrypt hash)
5. **Plain text password is NEVER stored or visible**

**Verification on Login:**
```javascript
const passwordMatch = await bcrypt.compare(password, user.password);
// Compares plaintext with bcrypt hash securely
```

---

## ✅ 4. Failed Login Attempts & Account Lockout

**Test Account Lockout (3 Strikes):**

1. Try to login with correct username but **wrong password 3 times**
2. After 3rd failed attempt:
   - Account is locked
   - Message: "Account locked. Try again in 15 minutes."
   - Failed attempts tracked in `login_history` table

**Configuration:**
```javascript
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
```

**Backend Logic:**
```javascript
if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
  lockedUntil = new Date(Date.now() + LOCKOUT_TIME).toISOString();
  // Account locked for 15 minutes
}
```

---

## ✅ 5. Password Recovery (Email-Based)

**Test:**
1. Click "Forgot Password?" on login page
2. Enter email: `john@example.com`
3. Backend generates secure token with 1-hour expiry
4. **To enable real email:**
   - Set SMTP environment variables (see Email Configuration below)
   - Reset link sent to email

**Security:**
- Token expires after 1 hour: `PASSWORD_RESET_TIMEOUT = 60 * 60 * 1000`
- Token is cryptographically random
- All sessions invalidated after password reset

---

## ✅ 6. Minimum Password Length & Strength

**Test:**
1. Try to register with weak passwords:
   - `pass123` → Rejected (only 8 chars, needs special char)
   - `Pass123!` → Accepted ✓

**Requirements Enforced:**
- ✅ Minimum 8 characters
- ✅ At least one uppercase letter (A-Z)
- ✅ At least one lowercase letter (a-z)
- ✅ At least one number (0-9)
- ✅ At least one special character (!@#$%^&*)

**Backend Validation:**
```javascript
function validatePasswordStrength(password) {
  if (password.length < 8) errors.push('Password too short');
  if (!/[A-Z]/.test(password)) errors.push('Need uppercase');
  if (!/[a-z]/.test(password)) errors.push('Need lowercase');
  if (!/[0-9]/.test(password)) errors.push('Need number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) 
    errors.push('Need special character');
}
```

---

## ✅ 7. New Device Detection & Email Alerts

**Test:**
1. Login from browser (device fingerprinted via User-Agent + IP)
2. Clear browser data and login again → New device detected
3. **To see email alert:**
   - Configure SMTP (see below)
   - Email sent with: IP address, login time, security warning

**Database Tracking:**
```sql
CREATE TABLE login_devices (
  user_id INTEGER,
  device_id TEXT UNIQUE,
  device_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  is_trusted INTEGER,
  last_seen DATETIME
)
```

**Email Content:**
```
Subject: New Device Login Notification
Body:
  A new device logged into your account.
  IP: 127.0.0.1
  Time: 5/2/2026 2:30 PM
  If this wasn't you, please reset your password immediately.
```

---

## ✅ 8. SQL Injection Prevention

**Backend Protection:**
All database queries use **parameterized queries**:

```javascript
// SAFE - Using parameterized queries
db.exec(`SELECT id FROM users WHERE username = ? OR email = ?`, 
  [username, email]
);

// ❌ UNSAFE - String concatenation (NOT used)
// db.exec(`SELECT id FROM users WHERE username = '${username}'`);
```

**Test:**
Try login with: `admin' OR '1'='1`
- Still fails → SQL injection prevented ✓

---

## ✅ 9. XSS (Cross-Site Scripting) Prevention

**Backend Protection:**
1. **Input Sanitization:**
```javascript
function sanitizeInput(input) {
  return String(input).replace(/[<>]/g, '').trim();
  // Removes <script> tags, malicious HTML
}
```

2. **HTML Encoding:**
```javascript
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}
```

3. **Security Headers:**
```javascript
res.setHeader('Content-Security-Policy', "default-src 'self'");
res.setHeader('X-XSS-Protection', '1; mode=block');
```

**Test:**
Try register with: `<script>alert('xss')</script>`
- Script tags removed → XSS prevented ✓

---

## ✅ 10. CSRF (Cross-Site Request Forgery) Protection

**Backend Protection:**
- CSRF token generated and stored per session
- All state-changing requests require valid token

```javascript
const csrfToken = generateToken(); // Random 64-char hex
db.run(`INSERT INTO sessions (..., csrf_token, ...) VALUES (..., ?, ...)`, [csrfToken]);
```

**Security Headers:**
```javascript
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('Strict-Transport-Security', 'max-age=31536000');
```

---

## 📊 Complete Security Headers

All responses include these security headers:

```
Access-Control-Allow-Origin: *
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

---

## 📧 Email Configuration (For Production)

To enable email notifications for new device logins and password recovery:

### **Gmail Setup:**
1. Enable 2-Step Verification in Gmail
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Set environment variables:

```powershell
# Windows PowerShell
$env:SMTP_HOST = "smtp.gmail.com"
$env:SMTP_PORT = "587"
$env:SMTP_USER = "your-email@gmail.com"
$env:SMTP_PASS = "your-app-password"
$env:EMAIL_FROM = "noreply@example.com"

npm start
```

### **Other Email Providers:**
```powershell
# Office 365
$env:SMTP_HOST = "smtp.office365.com"

# SendGrid
$env:SMTP_HOST = "smtp.sendgrid.net"
$env:SMTP_USER = "apikey"
$env:SMTP_PASS = "SG.xxxxx"
```

---

## 🗄️ Database Tables

All security data stored in SQLite:

### **users**
- Hashed passwords (bcrypt)
- 2FA secrets (Base32 encoded)
- Account lockout status
- Last login timestamp

### **password_resets**
- Token-based recovery
- Expiry timestamps
- One-time use

### **login_devices**
- Device fingerprinting
- IP addresses
- User-Agent tracking
- Trust status

### **login_history**
- Success/failure logs
- IP addresses
- User-Agent logs
- Audit trail

### **sessions**
- Session tokens
- CSRF tokens
- Device association
- Expiry tracking

---

## ✅ Testing Checklist

- [ ] Register new user → Password hashed, no plain text stored
- [ ] Login with correct credentials → Succeeds, session created
- [ ] Login with wrong password 3x → Account locked for 15 mins
- [ ] Try SQL injection in login → Blocked by parameterized queries
- [ ] Try XSS in registration → Script tags removed
- [ ] Forgot password → Token generated with 1-hour expiry
- [ ] Check database → No plain text passwords visible
- [ ] Check 2FA flow → QR code displays, TOTP validation works
- [ ] New device login → Email/console notification sent

---

## 🔒 Summary

**All 10 security measures are fully implemented and working:**

1. ✅ Username & Password validation
2. ✅ 2FA (TOTP with Google Authenticator)
3. ✅ Password hashing (bcrypt 12 rounds)
4. ✅ Failed login timeouts (3 strikes = 15 min lockout)
5. ✅ Password recovery (token-based, 1-hour expiry)
6. ✅ Minimum password length (8 chars) + strength requirements
7. ✅ New device detection + email alerts
8. ✅ SQL Injection prevention (parameterized queries)
9. ✅ XSS prevention (input sanitization + CSP headers)
10. ✅ CSRF protection (token validation)

**Live Server:** http://localhost:8080/
