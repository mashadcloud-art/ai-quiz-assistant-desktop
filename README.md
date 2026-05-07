# AI Quiz Assistant – Desktop + Chrome/Edge Extension

A premium‑styled **Electron** desktop companion that uses **Google Gemini** to answer both free‑form and multiple‑choice (MCQ) quizzes (e.g., Coursera). An optional Chrome/Edge extension bridges the quiz page to the local app via native‑messaging, keeping the API key secure and enforcing a user‑in‑the‑loop workflow.

---

## Features

- **/api/answer** – free‑form text answer from Gemini.
- **/api/answer-mcq** – MCQ answer (option letter) with optional image support.
- **Browser extension** that reads Coursera DOM, calls the local API, shows a confirmation overlay, and fills the chosen answer.
- **Secure native‑messaging** – the Gemini API key never leaves the desktop.
- **Auto‑update** via GitHub releases (`electron-updater`).

---

## Quick‑Start (Local Development)

```bash
# 1️⃣ Clone the repository
git clone https://github.com/<YOUR_USERNAME>/ai-quiz-assistant-desktop.git
cd ai-quiz-assistant-desktop

# 2️⃣ Install dependencies (Node 20+ required)
npm ci

# 3️⃣ Add your Gemini API key
cp .env.example .env
# edit .env and set GEMINI_API_KEY=your‑key-here

# 4️⃣ Run the app in development mode
npm run dev   # starts Electron + local Express API
```

### Test the API

```bash
# Replace 3000 with the port printed by the app (e.g., 45678)
curl -X POST http://127.0.0.1:3000/api/answer \
  -H "Content-Type: application/json" \
  -d '{"quiz":"What is the capital of France?"}'

curl -X POST http://127.0.0.1:3000/api/answer-mcq \
  -H "Content-Type: application/json" \
  -d '{"question":"Which planet is red?","options":["Earth","Mars","Jupiter","Saturn"]}'
```

Both commands should return JSON with an `answer` field.

---

## Installing the Chrome/Edge Extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** → **Load unpacked** → select the `extension/` folder.
3. Register the native‑messaging host – see [`docs/native-messaging.md`](docs/native-messaging.md).

The extension will now read Coursera quizzes, ask the desktop app for an answer, show a confirmation overlay, and automatically fill the selected option after the user clicks **Accept**.

---

## Releases & Auto‑Update

The repo uses **electron‑builder** + **electron‑updater**. When you create a GitHub release (e.g., tag `v1.0.0`) with the built installer (`dist/*.exe`) as an asset, the app automatically checks `https://github.com/<YOUR_USERNAME>/ai-quiz-assistant-desktop/releases/latest` on start‑up and prompts the user to update.

---

## Contributing

Feel free to open Issues or PRs. Keep the Gemini API key out of the repository (`.env` is ignored via `.gitignore`).
