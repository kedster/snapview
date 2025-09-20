# Google OAuth 2.0 Setup for SnapView

This document explains how to set up Google OAuth 2.0 authentication for SnapView.

## Overview

SnapView now includes optional Google OAuth 2.0 authentication that allows users to:
- Sign in with their Google account
- Store authentication state for session persistence
- Access future user-based features (saved history, higher rate limits, etc.)

## Demo Mode vs Production Mode

The application includes a demo mode for testing the authentication UI without requiring actual Google OAuth setup.

### Demo Mode (Current Default)
- Set `DEMO_MODE = true` in `script.js`
- Shows a functional sign-in button that simulates Google authentication
- Perfect for development and testing

### Production Mode
- Set `DEMO_MODE = false` in `script.js`
- Requires actual Google OAuth 2.0 configuration

## Setting up Google OAuth 2.0 for Production

### Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sign-In API

### Step 2: Configure OAuth 2.0

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client IDs**
3. Configure the consent screen:
   - Application name: "SnapView"
   - Add your domain to authorized domains
4. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Authorized JavaScript origins: Add your domain(s)
     - For local development: `http://localhost:8000`, `http://localhost:3000`, etc.
     - For production: `https://yourdomain.com`

### Step 3: Update Configuration

1. Copy your Client ID from the Google Cloud Console
2. In `script.js`, replace the placeholder:
   ```javascript
   const GOOGLE_CLIENT_ID = 'your-actual-client-id.apps.googleusercontent.com';
   ```
3. Set demo mode to false:
   ```javascript
   const DEMO_MODE = false;
   ```

### Step 4: Test the Integration

1. Serve your application over HTTPS (required for production)
2. Test the sign-in flow
3. Verify that user information is correctly stored and displayed

## Security Considerations

- **Client ID is public**: The Google Client ID can be public as it only identifies your application
- **No sensitive data**: Only basic profile information (name, email, picture) is stored
- **Local storage**: Authentication tokens are stored locally and expire after 24 hours
- **Optional authentication**: Users can still use the app without signing in
- **Privacy first**: No tracking unless explicitly opted in by the user

## Data Storage

The application stores minimal user data locally:
- User ID (Google)
- Name
- Email
- Profile picture URL
- Timestamp (for expiration)

This data is stored in both `localStorage` and `sessionStorage` and automatically expires after 24 hours.

## Future Enhancements

With authentication in place, future versions could include:
- Saved prompt history per user
- Higher rate limits for authenticated users
- User preferences and settings
- Premium features or tiers
- Usage analytics (with user consent)

## Troubleshooting

### Common Issues

1. **"Failed to load Google Identity Services"**
   - Ensure your domain is added to authorized origins
   - Check that the Client ID is correct
   - Verify HTTPS is being used (required for production)

2. **Sign-in button doesn't appear**
   - Check browser console for errors
   - Ensure the Google Identity Services script is loading
   - Verify `DEMO_MODE` is set correctly

3. **Authentication state not persisting**
   - Check if localStorage/sessionStorage is enabled
   - Verify the 24-hour expiration logic
   - Clear browser storage if corrupted

### Testing

To test the demo mode:
1. Set `DEMO_MODE = true`
2. Open the application
3. Click "Sign in with Google (Demo)"
4. Verify the user profile appears
5. Test sign-out functionality

## Support

For issues with Google OAuth setup, refer to:
- [Google Identity Services documentation](https://developers.google.com/identity/gsi/web)
- [Google Cloud Console Help](https://cloud.google.com/docs)