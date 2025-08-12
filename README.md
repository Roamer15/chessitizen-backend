# Chessizen Backend

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)

The backend powering Chessizen - an AI-native chess platform with OTP authentication, real-time multiplayer, and LLM-powered move suggestions.

## 🚀 Features

- **OTP Authentication** (SMS/Email)
- **Chess Game Engine** (chess.js integration)
- **Real-time Multiplayer** (Socket.IO)
- **AI Move Suggestions** (LLM integration)
- **Game History & Analytics**
- **RESTful API** (NestJS)

## 📦 System Architecture

```mermaid
graph TD
    A[Client] --> B[NestJS Server]
    B --> C[Redis]
    B --> D[MongoDB]
    B --> E[LLM API]
    C -->|OTP Storage| B
    D -->|Game State| B
    E -->|AI Suggestions| B

## 🛠 Setup Instructions

Prerequisites
Node.js v22+

MongoDB v6+

Redis v7+

npm v9+

Installation
Clone the repository:

bash
git clone https://github.com/Roamer15/chessizen-backend.git
cd chessizen-backend
Install dependencies:

bash
npm install
Configure environment variables:

bash
cp .env.example .env
# Edit .env with your credentials
Running the Server
bash
# Development mode (watch)
npm run start:dev

# Production build
npm run build
npm run start:prod
🌐 API Endpoints
Endpoint	Method	Description
/auth/request-otp	POST	Initiate OTP flow
/auth/verify-otp	POST	Verify OTP
/games	POST	Create new game
/games/:id/move	PATCH	Submit chess move
/games/:id/suggest	GET	Get AI suggestion
📂 Project Structure
text
src/
├── auth/               # Authentication flows
├── game/               # Chess game logic
├── ai/                 # AI integration
├── sockets/            # Real-time communication
├── shared/             # Common utilities
└── main.ts             # Application entry
🧪 Testing
bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
🛡️ Environment Variables
Variable	Required	Description
MONGODB_URI	Yes	MongoDB connection string
REDIS_HOST	Yes	Redis server host
TWILIO_*	For SMS	Twilio credentials
JWT_SECRET	Yes	JWT signing key
🤝 Contributing
Fork the project

Create your feature branch (git checkout -b feature/AmazingFeature)

Commit your changes (git commit -m 'Add some AmazingFeature')

Push to the branch (git push origin feature/AmazingFeature)

Open a Pull Request

📄 License
Distributed under the MIT License. See LICENSE for more information.

✉️ Contact
Your Name - @yourtwitter - your.email@example.com

Project Link: https://github.com/your-username/chessizen-backend
```
