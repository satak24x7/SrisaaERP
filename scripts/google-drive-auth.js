/**
 * Google Drive OAuth Setup — One-time script to get a refresh token.
 *
 * Usage:
 *   node scripts/google-drive-auth.js <client_id> <client_secret>
 *
 * Steps:
 *   1. Create OAuth Client ID (Desktop App) in Google Cloud Console
 *   2. Run this script with the client ID and secret
 *   3. Open the URL it prints in your browser
 *   4. Sign in and authorize
 *   5. Copy the authorization code from the redirect
 *   6. Paste it back here
 *   7. It prints the JSON to paste into System → Configuration
 */

const http = require('http');
const url = require('url');

const CLIENT_ID = process.argv[2];
const CLIENT_SECRET = process.argv[3];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nUsage: node scripts/google-drive-auth.js <client_id> <client_secret>\n');
  console.error('Get these from Google Cloud Console → APIs & Services → Credentials → Create OAuth Client ID (Desktop App)\n');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3939/callback';
const SCOPES = 'https://www.googleapis.com/auth/drive';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log('\n=== Google Drive OAuth Setup ===\n');
console.log('1. Open this URL in your browser:\n');
console.log(authUrl);
console.log('\n2. Sign in with your Google account and authorize the app');
console.log('3. You will be redirected — the token will be captured automatically\n');
console.log('Waiting for authorization...\n');

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = parsed.query.code;
  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received');
    return;
  }

  // Exchange code for tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      console.error('\nError:', tokens.error, '-', tokens.error_description);
      res.writeHead(400);
      res.end('Error: ' + tokens.error_description);
      server.close();
      process.exit(1);
    }

    const credentials = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    };

    console.log('\n=== SUCCESS ===\n');
    console.log('Paste this JSON into System → Configuration → Google Service Account Credentials:\n');
    console.log(JSON.stringify(credentials, null, 2));
    console.log('\n(The app will detect this is OAuth credentials and use them instead of service account)\n');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h1 style="color:green">✓ Authorization Successful!</h1>
        <p>Go back to the terminal to copy the credentials JSON.</p>
        <p>Then paste it into <b>System → Configuration → Document Storage → Credentials</b></p>
        <p>You can close this tab.</p>
      </body></html>
    `);

    server.close();
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    console.error('\nFailed to exchange code:', err.message);
    res.writeHead(500);
    res.end('Failed to exchange authorization code');
    server.close();
    process.exit(1);
  }
});

server.listen(3939, () => {
  // Try to open the URL automatically
  const { exec } = require('child_process');
  const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  exec(`${cmd} "${authUrl.replace(/&/g, '^&')}"`);
});
