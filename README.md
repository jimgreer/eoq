# EOQ - Live Document Review

A real-time collaborative document review tool designed for large groups (250+ concurrent users). Upload a Google Doc as HTML, share a link, and everyone can select text and leave threaded comments — like Google Docs commenting, but without the 100-person limit.

## How it works

1. Export your Google Doc: **File → Download → Web Page (.html)**
2. Upload the HTML file and give the session a title
3. Share the review link with your team
4. Participants sign in with Google, select text, and comment in real time

## Stack

- **Frontend**: React, Vite, Socket.IO client
- **Backend**: Node.js, Express, Socket.IO
- **Database**: SQLite (via better-sqlite3)
- **Auth**: Google OAuth 2.0
- **Deployment**: Docker, Fly.io

## Local development

### Prerequisites

- Node.js 22+
- A Google OAuth 2.0 Client ID ([create one here](https://console.cloud.google.com/apis/credentials))
  - Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI
  - Add `http://localhost:5173` as an authorized JavaScript origin

### Setup

```bash
# Install dependencies
npm install

# Copy env file and fill in your Google OAuth credentials
cp .env.example .env

# Run database migrations
npm run migrate

# Start dev servers (backend on :3000, frontend on :5173)
npm run dev
```

Visit http://localhost:5173.

### Environment variables

| Variable | Description | Default |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | (required) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | (required) |
| `GOOGLE_CALLBACK_URL` | OAuth callback URL | `http://localhost:3000/auth/google/callback` |
| `GOOGLE_ALLOWED_DOMAIN` | Restrict login to a specific email domain | (any) |
| `SESSION_SECRET` | Secret for signing session cookies | (required in production) |
| `CLIENT_URL` | Frontend URL (for CORS and redirects) | `http://localhost:5173` |
| `PORT` | Server port | `3000` |

## Deploy to Fly.io

```bash
# Install flyctl and authenticate
curl -L https://fly.io/install.sh | sh
flyctl auth login

# Create app and persistent volume
flyctl apps create your-app-name
flyctl volumes create eoq_data --region sjc --size 1

# Set secrets
flyctl secrets set \
  GOOGLE_CLIENT_ID=... \
  GOOGLE_CLIENT_SECRET=... \
  GOOGLE_CALLBACK_URL=https://your-app-name.fly.dev/auth/google/callback \
  CLIENT_URL=https://your-app-name.fly.dev \
  SESSION_SECRET=$(openssl rand -base64 32)

# Deploy
flyctl deploy
```

Remember to add `https://your-app-name.fly.dev/auth/google/callback` as an authorized redirect URI in Google Cloud Console.

## Project structure

```
shared/          Shared TypeScript types
server/
  src/
    auth/        Google OAuth + middleware
    routes/      REST endpoints (sessions, comments)
    socket/      Socket.IO real-time comment handlers
    migrations/  SQLite schema
client/
  src/
    components/  DocumentViewer, CommentSidebar, etc.
    hooks/       useComments (real-time comment state)
    lib/         Text selection anchoring logic
    pages/       SessionList, ReviewPage
```
