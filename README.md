# Secure Login Demo - Node.js + SQLite

## 🎯 Project Overview

Complete authentication system with:
- **Frontend**: Pure HTML, CSS, JavaScript (no frameworks)
- **Backend**: Core Node.js (no Express)
- **Database**: SQLite (file-based, no server needed)
- **Security**: bcrypt password hashing

## 📁 Project Structure

```
cyber_project/
├── frontend/                 # Frontend application
│   ├── index.html           # Router - Redirects to login.html
│   ├── login.html           # Login page
│   ├── register.html        # Register page
│   ├── styles.css           # Shared styling
│   └── script.js            # Form logic + MongoDB API calls
│
├── backend/                  # Node.js backend
│   └── server.js            # HTTP server + MongoDB integration
│
├── package.json             # Node.js dependencies
├── package-lock.json        # Dependency lock file
└── README.md                # This file
```

## ✨ Frontend Features

✅ Single page with Login & Register forms
✅ Smooth form switching with animations
✅ Real-time input validation
✅ Password strength indicator
✅ Show/Hide password toggle
✅ Responsive design (mobile & desktop)
✅ Error message display
✅ Success feedback
✅ Ready to integrate with backend

See `index.html`, `styles.css`, and `script.js` for the complete frontend implementation.

## 🚀 Getting Started

### Prerequisites

Just Node.js - that's it! SQLite comes built-in with the `better-sqlite3` package.

### Setup & Installation

1. **Install dependencies:**
```bash
cd cyber_project
npm install
```

2. **Start the server:**
```bash
npm start
```

3. **Open in browser:**
```
http://localhost:3000
```

That's it! The SQLite database will be created automatically. 🎉

### What Happens

When you first run `npm start`:
- SQLite database file `backend/auth.db` is created
- `users` table is automatically created
- Server starts and listens on `http://localhost:3000`

### Troubleshooting

**Port 3000 already in use?**
- Edit `backend/server.js` line 18 to change PORT

**Dependencies not installed?**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Database corrupted?**
- Simply delete `backend/auth.db` file
- It will be recreated on next server start

## 🔗 API Endpoints

### Register User (Step 1: Setup 2FA)
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

### Complete Registration (Step 2: Verify OTP)
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
  "message": "Registration complete. You can now log in with OTP."
}
```

### Login User (OTP Required Every Login)
```
POST /api/login
Content-Type: application/json

Request:
{
  "username": "john_doe",
  "password": "Password123!"
}

Response (200):
{
  "ok": true,
  "message": "Enter 2FA code",
  "requires2FA": true,
  "sessionToken": "<session-token>",
  "csrfToken": "<csrf-token>"
}
```

### Verify Login OTP
```
POST /api/verify-2fa
Content-Type: application/json

Request:
{
  "sessionToken": "<session-token>",
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

### Health Check
```
GET /api/health

Response (200):
{
  "ok": true,
  "message": "Server is running",
  "db": true
}
```

## 🔐 Security Features

✅ **Password Hashing**: bcrypt with 10 salt rounds
✅ **Input Validation**: Both frontend and backend
✅ **Input Sanitization**: Basic XSS prevention
✅ **Email Format Validation**: RFC-compliant regex
✅ **CORS Support**: Configured for frontend requests
✅ **No Plain Text Passwords**: Never stored or logged

## 🔒 Backend Files Explanation

**backend/server.js**: Core Node.js HTTP server that:
- Uses Node.js built-in `http` module (NO Express)
- Connects to SQLite database (`backend/auth.db`)
- Handles authentication endpoints:
  - `POST /api/register` - Register new user
  - `POST /api/login` - User login
  - `GET /api/health` - Health check
- Implements bcrypt password hashing (10 salt rounds)
- Serves static frontend files
- Includes CORS headers for cross-origin requests

### How It Works

1. **Registration Flow**:
   - Frontend sends: `{ username, email, password }`
   - Backend validates inputs
   - Passwords are hashed with bcrypt (never stored plain text)
   - User saved to SQLite database
   - Returns: `{ ok: true, userId }`

2. **Login Flow**:
   - Frontend sends: `{ email, password }`
   - Backend finds user in SQLite
   - Compares password with bcrypt hash
   - Updates last login time
   - Returns: `{ ok: true, user: { id, username, email } }`

### SQLite Database Schema

The database file is `backend/auth.db` with a `users` table:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
)
```

### View Database

**Using SQLite CLI:**
```bash
# Open database
sqlite3 backend/auth.db

# View all users
SELECT id, username, email, created_at, last_login FROM users;

# View specific user
SELECT * FROM users WHERE email = 'john@example.com';

# Exit
.exit
```

**Using DB Browser for SQLite:**
1. Download: https://sqlitebrowser.org
2. Open: `backend/auth.db`
3. Browse tables and data visually

## 📝 Frontend Customization

All frontend files are in the `frontend/` folder. To customize:

1. **Change Colors**: Edit `frontend/styles.css` (gradient, buttons, etc.)
2. **Change Icons**: Edit emojis in `frontend/login.html` and `frontend/register.html`
3. **Add Fields**: Add input groups in the respective HTML file and validation in `frontend/script.js`
4. **Modify Styling**: All CSS is in one file, easy to customize
5. **Add New Pages**: Create new HTML files in `frontend/` folder and update `frontend/index.html` routing if needed

## 🧪 Testing

### Frontend Testing
1. Test all form fields with valid and invalid inputs
2. Test password strength indicator on register page
3. Test show/hide password toggle
4. Test navigation between login and register pages
5. Test on mobile and desktop

### Backend Testing with cURL

```bash
# Health check
curl http://localhost:3000/api/health

# Register a user
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "Password123!"
  }'

# Login with registered user
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Password123!"
  }'

# Try login with wrong password (should fail)
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "WrongPassword"
  }'
```

### View Database with SQLite

**Option 1: Command Line**
```bash
# Open SQLite database
sqlite3 backend/auth.db

# List all tables
.tables

# View all users
SELECT id, username, email, created_at, last_login FROM users;

# View specific user's email
SELECT email, created_at FROM users WHERE username = 'john_doe';

# Exit
.exit
```

**Option 2: DB Browser GUI**
1. Download: https://sqlitebrowser.org/
2. File → Open → `cyber_project/backend/auth.db`
3. Click on "users" table
4. Browse all registered users and their data
5. See hashed passwords and timestamps

## 📱 Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## 📝 Frontend Files Explanation

All frontend files are in the `frontend/` folder:

**index.html**: Router file that acts as the entry point:
- Automatically redirects to login.html
- Can be customized for additional routing logic

**login.html**: Complete login page with:
- Email/Username input
- Password input with show/hide toggle
- Remember me checkbox
- Forgot password link
- Navigation link to register page

**register.html**: Complete registration page with:
- Username input
- Email input  
- Password input with strength indicator
- Confirm password field
- Navigation link to login page

**styles.css**: Provides:
- Beautiful purple gradient background
- Animated stars and forest silhouettes
- Responsive layout
- Mobile-friendly design
- Hover and focus effects
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
