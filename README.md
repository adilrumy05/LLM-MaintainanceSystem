# Maintenance Copilot

An AI-powered, Human-in-the-Loop decision support system for FedEx maintenance technicians.

Built with React Native + Expo (mobile), Node.js (backend), and a Python FastAPI RAG service.

---

## Tech Stack

- **Mobile:** React Native + Expo (SDK 55), Expo Router
- **Backend:** Node.js + Express (port 8000)
- **RAG Service:** Python FastAPI (port 8001), Qdrant vector DB (port 6333)
- **LLM:** OpenRouter API (Google Gemma 3 27B)
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication

---

## Roles

| Role | Access |
|---|---|
| Admin | Full access — dashboard, activity, audit logs, analytics, tasks, documents, user management |
| Expert | Dashboard, activity, sessions |
| Intermediate | Dashboard, activity, sessions |
| Beginner | Dashboard, activity, sessions |

---

## Getting Started

### Prerequisites
- Node.js
- Python 3.10+
- Docker (for Qdrant)
- Expo Go app on your phone
- Phone and PC on the same WiFi network

### Setup

1. Copy `.env.example` to `.env` and fill in your API keys
2. Install server dependencies:
   ```bash
   npm install
   ```
3. Install mobile dependencies:
   ```bash
   cd LLM-Mobile
   npm install
   ```

### Running

Use the startup script from the root folder:

```bash
start.bat
```

This starts all 4 services automatically:
1. Qdrant vector database (Docker)
2. FastAPI RAG service on port 8001
3. Node.js backend on port 8000
4. Expo in LAN mode — scan QR code with Expo Go

> **Important:** Your phone must be on the same WiFi as your PC.

---

## Project Structure

```
LLM-MaintainanceSystem/
├── LLM-Mobile/          # React Native Expo mobile app
│   ├── app/             # Screens (Expo Router file-based navigation)
│   ├── hooks/           # Custom hooks (useRole)
│   ├── services/        # API service layer
│   └── firebaseConfig.js
├── server/              # Python FastAPI RAG service
├── server.js            # Node.js Express backend entry point
├── models/              # AI models
├── uploads/             # Uploaded documents
└── start.bat            # One-click startup script
```

---

## Environment Variables

Copy `.env.example` to `.env` — the file contains all required keys with descriptions.

> The `.env` file is not committed to Git. Each developer sets their own local IP and API keys.
> Check `.env.example` for the full list of required variables.

---

## Firebase Setup

1. Create a Firebase project
2. Enable Firestore and Authentication (Email/Password)
3. Add your `serviceAccountKey.json` to the root folder
4. Update `firebaseConfig.js` with your project credentials

### Firestore Collections

| Collection | Purpose |
|---|---|
| `Users` | User accounts and roles |
| `Alerts` | Real-time activity feed |
| `audit_logs` | HITL session history |
| `maintenance_tasks` | Task management |
| `ManualDocuments` | RAG document library |