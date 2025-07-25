# 🎰 Sweepstake Crash Game

A modern, provably fair crash game built with FastAPI and React. Features real-time gameplay, auto cashout, auto play, and professional casino-grade mechanics.

## 🚀 Features

### Core Gameplay
- **Provably Fair System** - SHA256-based crash multiplier generation
- **Real-time Multiplier** - Smooth counting animation with sound effects
- **Auto Cashout** - Set automatic cashout at specific multipliers
- **Auto Play** - Automatically play multiple games with configurable settings
- **Professional RTP** - 96% Return to Player with 4% house edge

### User Experience
- **Modern UI** - Glassmorphism design with smooth animations
- **Responsive Design** - Works on desktop and mobile devices
- **Sound Effects** - Audio feedback for wins, crashes, and ticks
- **Game History** - Track all games with filtering options
- **Statistics** - Comprehensive player statistics and RTP tracking

### Security & Fairness
- **JWT Authentication** - Secure user authentication
- **Password Hashing** - bcrypt password security
- **Input Validation** - Comprehensive server-side validation
- **Provably Fair** - Verifiable random number generation
- **Decimal Precision** - Accurate financial calculations

## 🛠️ Setup

### Prerequisites
- Python 3.8+
- Node.js 16+
- npm or yarn

### Backend Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chic
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   ```

3. **Activate virtual environment**
   ```bash
   # Windows
   venv\Scripts\activate
   
   # macOS/Linux
   source venv/bin/activate
   ```

4. **Install dependencies**
   ```bash
   pip install fastapi uvicorn sqlalchemy aiosqlite passlib python-jose[cryptography] python-multipart
   ```

5. **Set environment variables** (optional)
   ```bash
   # Create .env file
   SECRET_KEY=your_super_secret_key_here
   SERVER_SEED=your_provably_fair_seed_here
   ```

6. **Run the backend**
   ```bash
   python main.py
   ```

The backend will be available at `http://127.0.0.1:8000`

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm start
   ```

The frontend will be available at `http://localhost:3000`

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | `your_super_secret_key_change_in_production_2024` |
| `SERVER_SEED` | Provably fair seed | `casino_provably_fair_seed_2024` |

### Game Settings

| Setting | Value | Description |
|---------|-------|-------------|
| `MIN_BET` | $1.00 | Minimum bet amount |
| `MAX_BET` | $1000.00 | Maximum bet amount |
| `STARTING_CREDITS` | $1000.00 | New user starting balance |
| `HOUSE_EDGE` | 4% | House edge (96% RTP) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 60 | JWT token expiration |

## 🎮 How to Play

1. **Register/Login** - Create an account or login
2. **Set Bet Amount** - Choose your bet (min $1, max $1000)
3. **Configure Auto Cashout** (optional) - Set automatic cashout multiplier
4. **Start Game** - Click "Start Game" or use "Auto Play"
5. **Cash Out** - Click "Cash Out" before the game crashes
6. **Watch Multiplier** - Game crashes when multiplier reaches the crash point

### Auto Play Features

- **Number of Games** - Set how many games to play (1-50)
- **Delay Between Games** - Set delay in seconds (1-10)
- **Auto Cashout** - Works with auto play for hands-free gaming
- **Progress Tracking** - Real-time progress bar and status updates

## 🔒 Security Features

### Authentication
- JWT-based authentication with 60-minute expiration
- bcrypt password hashing
- Secure token storage in localStorage

### Input Validation
- Server-side validation for all inputs
- SQL injection protection via SQLAlchemy
- XSS protection via proper input sanitization

### Provably Fair System
- SHA256-based random number generation
- Server seed + round ID + timestamp
- Verifiable crash multiplier calculation
- Transparent house edge implementation

## 📊 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `GET /user` - Get current user info

### Game
- `POST /crash/start` - Start new game
- `POST /crash/cashout` - Cash out from game
- `GET /crash/round/{id}` - Get round details
- `GET /crash/rounds` - Get game history
- `GET /crash/stats` - Get user statistics
- `GET /crash/active` - Get active game

## 🎯 Game Mechanics

### Crash Multiplier Generation
1. Combine server seed + round ID + timestamp
2. Generate SHA256 hash
3. Use first 8 characters as random value
4. Apply house edge formula: `1 / (random_value ^ (1 / (1 - house_edge)))`
5. Round to 2 decimal places

### Multiplier Calculation
- Game increases by 0.1x per second
- Crash time = `(crash_multiplier - 1.0) / 0.1` seconds
- Frontend counts up to exact crash multiplier

### House Edge
- 4% house edge = 96% RTP
- Ensures long-term profitability for the house
- Mathematically fair for players

## 🚨 Production Considerations

### Security
- Change default SECRET_KEY and SERVER_SEED
- Use HTTPS in production
- Implement rate limiting
- Add request logging and monitoring
- Consider using Redis for session storage

### Performance
- Use PostgreSQL instead of SQLite for production
- Implement database connection pooling
- Add caching for frequently accessed data
- Consider WebSocket for real-time updates

### Deployment
- Use Gunicorn or uWSGI for production server
- Set up proper reverse proxy (nginx)
- Configure CORS for production domain
- Set up automated backups

## 📝 License

This project is for educational purposes. Please ensure compliance with local gambling laws before deploying.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For issues or questions, please open an issue on GitHub.

---

**⚠️ Disclaimer**: This is a sweepstake game for entertainment purposes. Please ensure compliance with local laws and regulations regarding online gaming. 