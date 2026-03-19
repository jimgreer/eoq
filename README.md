# EOQ - Live Document Review

A real-time collaborative document review tool designed for large groups (250+ concurrent users). Select a Google Doc, share a link, and everyone can select text and leave threaded comments — like Google Docs commenting, but without the 100-person limit.

## How it works

1. Sign in with Google and click "Select from Google Drive"
2. Pick a Google Doc from your Drive using the file picker
3. Share the review link with your team
4. Participants sign in with Google, select text, and comment in real time

## Features

- **Real-time comments**: Threaded discussions with instant updates via WebSocket
- **Text anchoring**: Comments are linked to specific text selections in the document
- **Emoji reactions**: React to comments with emoji
- **Resolve/reopen**: Mark comment threads as resolved
- **Google Drive integration**: Access controlled via Google Doc sharing permissions
- **Organization sharing**: Share sessions with everyone in your Google Workspace org

## Stack

- **Frontend**: React, Vite, Socket.IO client
- **Backend**: Node.js, Express, Socket.IO
- **Database**: SQLite (via better-sqlite3)
- **Auth**: Google OAuth 2.0

## Local development

### Prerequisites

- Node.js 22+
- Google Cloud project with:
  - **OAuth 2.0 Client ID** ([create here](https://console.cloud.google.com/apis/credentials))
    - Add `http://localhost:3000/auth/google/callback` as an authorized redirect URI
    - Add `http://localhost:5173` as an authorized JavaScript origin
  - **APIs enabled**: Google Drive API, Google Picker API
  - **API Key** for the Picker (restrict to Picker API and your domains)

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
