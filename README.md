# UNIQUE — Event Management Backend API

[![Express.js](https://img.shields.io/badge/Express.js-5.3.0-000000?style=for-the-badge&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-7.9.0-47A248?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/atlas)
[![JWT](https://img.shields.io/badge/JWT-Protected_APIs-purple?style=for-the-badge&logo=json-web-tokens)](https://jwt.io/)
[![Vercel Ready](https://img.shields.io/badge/Vercel-Serverless_Ready-black?style=for-the-badge&logo=vercel)](https://vercel.com/)

RESTful API backend for the UNIQUE Community Event Management platform, built with Express.js, MongoDB Atlas native driver, and JWT-guarded routes.

---

## Features
- **Smart Chronological Sorting**:
  - Upcoming events (`GET /events/upcoming` or `GET /events?timeframe=upcoming`) sorted nearest date first.
  - Past events (`GET /events/past` or `GET /events?timeframe=past`) sorted descending.
- **JWT Protection**:
  - Issue tokens via `POST /jwt`.
  - Guarded middleware `requireJwtAuth` on all write and profile operations.
- **Event Management (CRUD)**:
  - Create events with validation (`POST /events`).
  - Update events (`PUT /events/:id`).
  - Delete events (`DELETE /events/:id`).
- **Volunteer Management**:
  - Join events (`POST /events/:id/join`) with duplicate enrollment prevention.
  - Track registered volunteer counts in real time.
- **User Profile Sync**:
  - View user activity stats (`GET /user/profile`).
  - Update user name and avatar (`PUT /user/profile`).
- **Vercel Serverless Ready**:
  - Configured with `vercel.json` for instant deployment on Vercel as a Serverless Function.

---

## API Endpoints Reference

### Public Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Health check endpoint |
| `GET` | `/events` | Get events with optional query parameters (`timeframe`, `eventType`, `limit`) |
| `GET` | `/events/upcoming` | Get upcoming events sorted ascending (nearest first) |
| `GET` | `/events/past` | Get past events sorted descending |
| `GET` | `/events/:id` | Get single event details with live volunteer count |

### Authentication & JWT
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/jwt` | Generate a signed JWT token (`{ token }`) from user email & name |

### Protected Endpoints (Requires `Authorization: Bearer <token>`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/events` | Create a new community event (strict validation enforced) |
| `PUT` | `/events/:id` | Update event details (creator only) |
| `DELETE` | `/events/:id` | Delete event (creator only) |
| `POST` | `/events/:id/join` | Register volunteer participation |
| `GET` | `/events/user/:email` | Get events organized by a user |
| `GET` | `/user/joined-events` | Get events joined by authenticated user |
| `GET` | `/user/profile` | Get user profile stats |
| `PUT` | `/user/profile` | Update user name and avatar image |

---

## Environment Variables
Create a `.env` file in the root of this project:
```env
PORT=5000
MONGO_USERNAME=your_mongodb_username
MONGO_PASSWORD=your_mongodb_password
JWT_SECRET=your_jwt_secret_key
MONGODB_URI=your_full_mongodb_connection_string_optional
```

---

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server with Nodemon:
   ```bash
   npm run dev
   ```
3. Run in production:
   ```bash
   npm start
   ```

---

## Deploying to Vercel

This repository includes a preconfigured `vercel.json`:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```

1. Push this repository to GitHub: `https://github.com/web3Riyad/event-management-backend`.
2. In your Vercel Dashboard, click **Add New...** -> **Project** -> Select **event-management-backend**.
3. Under **Environment Variables**, add:
   - `MONGO_USERNAME`
   - `MONGO_PASSWORD`
   - `JWT_SECRET`
4. Click **Deploy**.
