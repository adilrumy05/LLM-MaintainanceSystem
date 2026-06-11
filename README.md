# Maintenance Copilot: AI-Powered Decision Support

![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)

An advanced, Human-in-the-Loop (HITL) decision support system designed specifically for FedEx maintenance technicians. 

Developed as part of the **Computing Technology Project A** curriculum, this platform leverages a custom Retrieval-Augmented Generation (RAG) pipeline to provide accurate, context-aware maintenance guidance, troubleshooting, and system monitoring.

---

## ✨ Key Features

* **Multi-Agent Architecture:** Features autonomous background agents, including a **Priority Adjustment Agent**, which evaluates incoming queries and dynamically escalates critical maintenance tasks within the system.
* **Advanced RAG Pipeline with OCR:** Utilizes a Qdrant vector database and Python FastAPI service to feed high-fidelity context to the LLM. Includes custom Jupyter notebook pipelines for Optical Character Recognition (OCR) to parse complex maintenance diagrams.
* **Mobile Support:** Built with React Native and Expo Router, ensuring technicians have immediate, localized access to AI assistance directly on the workshop floor.
* **Real-Time Audit Logging:** Fully integrated with Firebase Firestore. Every user query, AI response, and source document citation is permanently logged, establishing a verifiable trail for safety and compliance.
* **Security & Sanitization Middleware:** Implements robust backend validation and LLM output sanitization to prevent prompt injection and ensure AI responses adhere to strict mechanical safety guidelines.
* **Role-Based Access Control (RBAC):** Distinct interfaces and strict permission boundaries tailored for `Admin`, `Expert`, `Intermediate`, and `Beginner` roles.

---

## 🛠️ Tech Stack

- **Mobile:** React Native + Expo (SDK 55), Expo Router
- **Backend:** Node.js + Express (port 8000)
- **RAG Service:** Python FastAPI (port 8001), Qdrant vector DB (port 6333)
- **LLM:** OpenAI API
- **Database:** Firebase Firestore
- **Auth:** Firebase Authentication

---

## 🔒 Roles & Permissions

| Role | Access Level |
|---|---|
| **Admin** | Full access — dashboard, activity, global audit logs, analytics, tasks, documents, user management |
| **Expert** | Dashboard, activity, personal sessions |
| **Intermediate** | Dashboard, activity, personal sessions |
| **Beginner** | Dashboard, activity, personal sessions |

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- Docker (for Qdrant)
- Expo Go app installed on your mobile device
- **Network Note:** Your mobile phone and PC *must* be on the same WiFi network.

### Setup Instructions

1. Copy `.env.example` to `.env` and fill in your required API keys.
2. Install the Node backend dependencies:
   ```bash
   npm install
   ```
3. Install the mobile frontend dependencies:
   ```bash
   cd LLM-Mobile
   npm install
   ```

### Running the System

Use the one-click startup script from the root folder:

```bash
start.bat
```

This script automatically orchestrates all 4 primary services:
1. Qdrant vector database (via Docker)
2. Python FastAPI RAG service (Port 8001)
3. Node.js Express backend (Port 8000)
4. Expo Mobile Server in LAN mode (Scan the generated QR code with Expo Go)

---

## 🏗️ Project Structure

```text
LLM-MaintainanceSystem/
├── LLM-Mobile/          # React Native Expo mobile app
│   ├── app/             # Screens (Expo Router file-based navigation)
│   ├── hooks/           # Custom hooks (e.g., useRole)
│   ├── services/        # API service layer integration
│   └── firebaseConfig.js# Mobile Firebase initialization
├── server/              # Python FastAPI RAG retrieval service
├── server.js            # Node.js Express backend entry point
├── models/              # AI data processing models
├── uploads/             # Script uploads and document ingestion
└── start.bat            # One-click system startup script
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`. This file contains all required keys with descriptions.

> **Security Note:** The `.env` file is excluded from version control via `.gitignore`. Each developer must set their own local IP, API keys, and Firebase configurations. Check `.env.example` for the complete list of required variables.

---

## 🔥 Firebase Setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Firestore Database** and **Authentication** (Email/Password provider).
3. Generate a new private key and add your `serviceAccountKey.json` to the root folder.
4. Update `firebaseConfig.js` (inside `LLM-Mobile/`) with your public project credentials.

### Firestore Database Schema

| Collection | Purpose |
|---|---|
| `Users` | Stores user accounts, permissions, and roles |
| `Alerts` | Powers the real-time activity feed |
| `audit_logs` | Stores all HITL session history, AI outputs, and user inputs |
| `maintenance_tasks` | Handles active task tracking and management |
| `ManualDocuments` | Metadata and references for the RAG document library |

---

## 👥 Contributors

This system was collaboratively designed, developed, and tested by a 5-person project team to provide an enterprise-grade AI solution for modern maintenance workflows.
