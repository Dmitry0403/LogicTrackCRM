require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

const corsOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(express.json());

// Exchange authorization code or refresh token with Google
app.post('/oauth/token', async (req, res) => {
  try {
    const { code, refresh_token, grant_type } = req.body;
    let params = new URLSearchParams();

    if (code) {
      params.set('code', code);
      params.set('grant_type', 'authorization_code');
      params.set('redirect_uri', process.env.REDIRECT_URI || 'http://localhost:5173/');
    } else if (refresh_token) {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', refresh_token);
    } else {
      return res.status(400).json({ error: 'missing_code_or_refresh_token' });
    }

    params.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
    params.set('client_secret', process.env.GOOGLE_CLIENT_SECRET || '');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(tokenRes.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('oauth proxy error', err);
    res.status(500).json({ error: 'server_error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`OAuth proxy listening on http://localhost:${port}`));
