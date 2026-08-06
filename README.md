# CloudSync

CloudSync is a beautiful, local-to-cloud synchronization tool built with Next.js and Firebase. It allows you to select local folders and seamlessly synchronize their contents securely to your Google Drive in the background.

## Key Features

- **Google Drive Integration**: Authenticate seamlessly via Google OAuth.
- **Background Sync**: Runs quietly in the background without freezing the UI.
- **Smart Hashing**: Calculates local file hashes (SHA-256) to ensure only modified files are uploaded, avoiding duplicates and saving bandwidth.
- **Local Settings Store**: Stores your sync preferences directly in the browser's IndexedDB so they persist across sessions.
- **Comprehensive Theme Engine**: Customize every aspect of the UI in real-time, including sidebars, cards, and primary buttons. Export your custom themes to share or import them back instantly.
- **Visual Element Picker**: Inspect and change the colors of any specific element directly on the screen.
- **Sleek UI/UX**: Crafted with modern, dark-themed aesthetics and micro-animations.

## Getting Started

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Configure Environment Variables**:
   Copy the provided `.env.example` file to `.env.local` in the root of the project:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and fill in the necessary API keys:
   - `GEMINI_API_KEY`: Your Gemini API key for AI features.
   - `APP_URL`: The URL where the app runs (usually `http://localhost:3000`).
   - `GOOGLE_CLIENT_ID`: Your Google OAuth client ID from the Google Cloud Console.
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret.
   - `GOOGLE_REDIRECT_URI`: The OAuth redirect URI (`http://localhost:3000/api/auth/callback/google`).

4. **Run the Development Server**: `npm run dev`

## Security and Push Checklist

Before pushing this repository to GitHub or any public source control, ensure the following sensitive files are NOT tracked (they are already ignored via `.gitignore`):

- `.env.local` (Contains client secrets and Google OAuth keys)
- `.env`
- `firebase-applet-config.json` (Contains Firebase project keys and configurations)
- `scripts/client_secret_*.json`

Always keep your API keys and credentials secure!
