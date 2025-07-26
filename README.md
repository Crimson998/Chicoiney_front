# StakeYotta - Provably Fair Gaming Platform

A modern, provably fair gaming platform featuring Crash and Coinflip games with complete transparency and verifiable fairness.

## 🔒 Provably Fair System

Our platform implements a state-of-the-art provably fair system that ensures complete transparency and verifiable fairness for all games. Every game result can be independently verified by players using cryptographic methods.

### How It Works

1. **Server Seed Generation**: The server generates a cryptographically secure random seed
2. **Pre-commitment**: The server commits to the seed by providing its SHA256 hash before the game starts
3. **Client Seed**: The player provides their own client seed for additional randomness
4. **Result Generation**: The game result is determined by combining both seeds with a nonce
5. **Verification**: After the game, the server reveals the original seed, allowing players to verify the result

### Technical Implementation

#### Seed Combination Formula
```
verification_string = server_seed:client_seed:nonce
hash = SHA256(verification_string)
```

#### Crash Game Algorithm
- **House Edge**: 5% (95% RTP)
- **Special Case**: 1 in 20 games crash at exactly 1.00x
- **Standard Formula**: `crash = 1 / (1 - X)` where X is derived from the hash
- **Maximum Multiplier**: 1,000,000x

#### Coinflip Algorithm
- **Result**: `heads` if hash % 2 == 0, otherwise `tails`
- **Win Condition**: Player guess matches the result

### Verification Process

Players can verify any game result using:

1. **Server Seed**: Revealed after the game
2. **Client Seed**: Provided by the player
3. **Nonce**: Round number for uniqueness
4. **Verification Tool**: Available on the homepage

### Database Schema

#### ServerSeed Table
```sql
CREATE TABLE server_seeds (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    server_seed VARCHAR NOT NULL,
    seed_hash VARCHAR NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### CrashGameRound Table
```sql
CREATE TABLE crash_game_rounds (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    bet_amount DECIMAL(10,2) NOT NULL,
    cashed_out_at DECIMAL(10,2),
    crashed_at DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    server_seed VARCHAR NOT NULL,
    client_seed VARCHAR NOT NULL,
    nonce INTEGER NOT NULL
);
```

#### CoinflipRound Table
```sql
CREATE TABLE coinflip_rounds (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    bet_amount FLOAT,
    guess VARCHAR,
    result VARCHAR,
    win INTEGER,
    hash VARCHAR,
    created_at TIMESTAMP DEFAULT NOW(),
    server_seed VARCHAR NOT NULL,
    client_seed VARCHAR NOT NULL,
    nonce INTEGER NOT NULL
);
```

## 🚀 Features

### Games
- **Crash**: Ride the multiplier and cash out before it crashes
- **Coinflip**: Classic heads or tails with provably fair results
- **More Coming Soon**: Dice, Roulette, and other popular games

### Security Features
- **JWT Authentication**: Secure user authentication
- **Password Hashing**: bcrypt for secure password storage
- **CORS Protection**: Configured for production domains
- **Input Validation**: Comprehensive validation on all endpoints

### User Features
- **Account Management**: Registration, login, profile management
- **Credit System**: Virtual currency for betting
- **Game History**: Complete history of all games played
- **Statistics**: Win rates, RTP, and other metrics
- **Admin Panel**: User management and system administration

## 🛠️ Technology Stack

### Backend
- **FastAPI**: Modern Python web framework
- **SQLAlchemy**: Database ORM with async support
- **PostgreSQL**: Production database
- **JWT**: Authentication tokens
- **bcrypt**: Password hashing

### Frontend
- **React**: Modern JavaScript framework
- **React Router**: Client-side routing
- **Axios**: HTTP client for API calls
- **CSS3**: Modern styling with animations

### Deployment
- **Railway**: Cloud hosting platform
- **PostgreSQL**: Managed database service

## 📊 API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /user` - Get current user info

### Crash Game
- `POST /crash/get-server-seed` - Get server seed hash
- `POST /crash/start` - Start a new crash game
- `POST /crash/cashout` - Cash out from current game
- `GET /crash/verify/{round_id}` - Verify game fairness
- `GET /crash/rounds` - Get user's game history
- `GET /crash/stats` - Get user's statistics
- `GET /crash/recent` - Get recent crash multipliers

### Coinflip Game
- `POST /coinflip/get-server-seed` - Get server seed hash
- `POST /coinflip/play` - Play a coinflip game
- `GET /coinflip/verify/{round_id}` - Verify game fairness

### Admin (Admin Only)
- `GET /admin/users` - List all users
- `PATCH /admin/user/{user_id}/credits` - Update user credits
- `PATCH /admin/user/{user_id}/admin` - Toggle admin status
- `DELETE /admin/user/{user_id}` - Delete user

## 🔧 Installation & Setup

### Prerequisites
- Python 3.8+
- Node.js 16+
- PostgreSQL database

### Backend Setup
```bash
# Clone the repository
git clone <repository-url>
cd chic

# Install Python dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql://user:password@localhost/dbname"
export SECRET_KEY="your-secret-key"
export SERVER_SEED="your-server-seed"

# Run database migrations
python -c "from main import app; import asyncio; asyncio.run(app.startup())"

# Start the server
uvicorn main:app --reload
```

### Frontend Setup
```bash
# Navigate to frontend directory
cd src

# Install dependencies
npm install

# Set environment variables
export REACT_APP_API_URL="http://localhost:8000"

# Start development server
npm start
```

## 🔍 Verification Examples

### Crash Game Verification
```python
import hashlib

def verify_crash(server_seed, client_seed, nonce):
    verification_string = f"{server_seed}:{client_seed}:{nonce}"
    hash_result = hashlib.sha256(verification_string.encode()).hexdigest()
    h = int(hash_result, 16)
    
    # 5% house edge: 1 in 20 games crash at 1.00x
    if h % 20 == 0:
        return 1.00
    
    X = ((h >> 8) % (10 ** 16)) / float(10 ** 16)
    crash = math.floor((1 / (1 - X)) * 100) / 100
    return min(crash, 1000000.0)
```

### Coinflip Verification
```python
import hashlib

def verify_coinflip(server_seed, client_seed, nonce):
    verification_string = f"{server_seed}:{client_seed}:{nonce}"
    hash_result = hashlib.sha256(verification_string.encode()).hexdigest()
    return "heads" if int(hash_result, 16) % 2 == 0 else "tails"
```

## 📈 House Edge & RTP

- **Crash Game**: 5% house edge (95% RTP)
- **Coinflip Game**: 0% house edge (100% RTP)

The house edge is implemented through the game mechanics rather than unfair algorithms, ensuring transparency and trust.

## 🔐 Security Considerations

1. **Server Seeds**: Generated using cryptographically secure random number generators
2. **Client Seeds**: Players can provide their own seeds for additional randomness
3. **Nonce**: Ensures each game is unique even with identical seeds
4. **Pre-commitment**: Server commits to seeds before games begin
5. **Verification**: All results can be independently verified

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For support, email support@stakeyotta.com or create an issue in the repository. 