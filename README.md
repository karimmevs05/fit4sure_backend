# Fit4Sure — Backend Server

Node.js + Express + PostgreSQL API for the Fit4Sure mobile app.

## Requirements

- Node.js 20 LTS (via [nvm](https://github.com/nvm-sh/nvm))
- PostgreSQL 12+
- npm

## Setup

### 1. Clone the repository
```bash
git clone git@github.com:FIT4SURE/fit4sure_backend.git
cd fit4sure_backend
```

### 2. Install dependencies
```bash
~/.nvm/versions/node/v20.20.2/bin/node ~/.nvm/versions/node/v20.20.2/bin/npm install
```

### 3. Configure environment variables
```bash
cp .env.example .env
```
Open `.env` and fill in the required values:
- `JWT_SECRET` — any long random string (e.g. generate with `openssl rand -hex 64`)
- `STRIPE_SECRET_KEY` — from your [Stripe dashboard](https://dashboard.stripe.com)
- `STRIPE_WEBHOOK_SECRET` — from your Stripe webhook settings
- `APPLE_CLIENT_ID` — your Apple app bundle ID (`com.fit4sure.app`)
- `GOOGLE_CLIENT_ID` — from your [Google Cloud Console](https://console.cloud.google.com)

### 4. Start PostgreSQL
```bash
brew services start postgresql@12
```

### 5. Create and seed the database
```bash
createdb fit4sure
psql fit4sure -f src/config/schema.sql
psql fit4sure -f src/config/seed.sql
```

### 6. Start the server
```bash
~/.nvm/versions/node/v20.20.2/bin/node src/index.js
```

The server runs on `http://localhost:3000`.

To run with auto-restart on file changes (development):
```bash
~/.nvm/versions/node/v20.20.2/bin/node ~/.nvm/versions/node/v20.20.2/bin/nodemon src/index.js
```

## Health Check
```bash
curl http://localhost:3000/health
# → { "status": "ok" }
```

## API Routes

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Email/password signup |
| POST | `/api/auth/login` | No | Email/password login |
| POST | `/api/auth/apple` | No | Apple Sign-In |
| POST | `/api/auth/google` | No | Google Sign-In |
| GET | `/api/auth/me` | Yes | Current user |

### Meals
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/meals` | No | All available meals |
| GET | `/api/meals/:meal_id` | No | Single meal detail |
| GET | `/api/weekly-menus?week=YYYY-MM-DD` | No | Weekly menu |

### Boxes (Orders)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/boxes` | Optional | Place a box (guest or logged-in) |
| GET | `/api/boxes` | Yes | Customer's box history |
| GET | `/api/boxes/:box_id` | Yes | Single box detail |

### Other
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/delivery-zones/check?zip=XXXXX` | No | Check ZIP delivery availability |
| GET | `/api/bulk-discounts` | No | Bulk discount tiers |
| GET | `/api/diet-profile` | Yes | Customer's diet profile |
| PUT | `/api/diet-profile` | Yes | Update diet profile |
| POST | `/api/meal-logs` | Yes | Log a meal eaten |
| GET | `/api/meal-logs?date=YYYY-MM-DD` | Yes | Meal logs for a date |
| GET | `/api/xp` | Yes | Customer's XP total |
| POST | `/api/payments/checkout` | Optional | Create Stripe PaymentIntent |
| POST | `/api/payments/webhook` | No (Stripe sig) | Stripe payment webhook |

## Database

Connect to the local database:
```bash
psql fit4sure
```

To reset the database from scratch:
```bash
dropdb fit4sure
createdb fit4sure
psql fit4sure -f src/config/schema.sql
psql fit4sure -f src/config/seed.sql
```
