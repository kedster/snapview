# SnapView - Google OAuth Quick Setup

## Quick Setup for Production

To enable Google OAuth 2.0 authentication in SnapView:

### 1. Get Google Client ID
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select project → APIs & Services → Credentials
3. Create OAuth 2.0 Client ID for Web application
4. Add your domain to authorized JavaScript origins

### 2. Configure SnapView
In `script.js`, update these two lines:
```javascript
const GOOGLE_CLIENT_ID = 'your-actual-client-id.apps.googleusercontent.com';
const DEMO_MODE = false; // Set to false for production
```

### 3. Deploy
- Serve over HTTPS (required for Google OAuth)
- Test sign-in flow

## Demo Mode (Current Default)
- `DEMO_MODE = true` - Shows functional demo without Google setup
- Perfect for testing and development
- Click "Sign in with Google (Demo)" to test the UI

## Features
- ✅ Optional Google OAuth 2.0 authentication
- ✅ Session persistence (24-hour expiration)
- ✅ Privacy-first (basic profile only, stored locally)
- ✅ Responsive design (mobile/desktop)
- ✅ Maintains full app functionality without auth
- ✅ Ready for future user-based features

See `GOOGLE_AUTH_SETUP.md` for detailed setup instructions.