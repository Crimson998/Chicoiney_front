from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text, and_, or_
from pydantic import BaseModel, field_validator, ConfigDict
from decimal import Decimal, ROUND_HALF_UP
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import hashlib
import time
import logging
import os
from typing import Optional, List
from contextlib import asynccontextmanager
import math

from models import Base, User, CrashGameRound
from database import engine, AsyncSessionLocal

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your_super_secret_key_change_in_production_2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
BASE_HOUSE_EDGE = 0.07  # 7% base house edge (93% RTP) - maximizes profits while staying legally fair
DYNAMIC_EDGE_ENABLED = True  # Enable dynamic house edge optimization
SERVER_SEED = os.getenv("SERVER_SEED", "casino_provably_fair_seed_2024")
MIN_BET = 0.01  # Lower minimum bet like Stake
MAX_BET = 10000.0  # Higher maximum bet
STARTING_CREDITS = 1000.00

# Global house edge tracking
current_house_edge = BASE_HOUSE_EDGE

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Pydantic Models
class UserCreate(BaseModel):
    username: str
    password: str

class UserOut(BaseModel):
    id: int
    username: str
    credits: float
    
    @field_validator('credits', mode='before')
    @classmethod
    def format_credits(cls, v):
        if hasattr(v, 'quantize'):
            return float(str(v.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)))
        return round(float(v), 2)
    
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str

class CrashStartRequest(BaseModel):
    bet_amount: float

class CrashRoundOut(BaseModel):
    id: int
    bet_amount: float
    cashed_out_at: Optional[float] = None
    crashed_at: Optional[float] = None
    created_at: datetime
    game_ended: bool = False
    
    @field_validator('bet_amount', 'cashed_out_at', 'crashed_at', mode='before')
    @classmethod
    def format_decimals(cls, v):
        if v is None:
            return v
        if hasattr(v, 'quantize'):
            return float(str(v.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)))
        return round(float(v), 2)
    
    model_config = ConfigDict(from_attributes=True)

class CrashStartResponse(BaseModel):
    id: int
    bet_amount: float
    cashed_out_at: Optional[float] = None
    crashed_at: None = None
    created_at: datetime
    crash_multiplier: float  # The actual crash multiplier for frontend counting
    
    model_config = ConfigDict(from_attributes=True)

class CashOutRequest(BaseModel):
    round_id: int
    cash_out_multiplier: float

class GameStats(BaseModel):
    total_rounds: int
    cashed_out_rounds: int
    crashed_rounds: int
    win_rate: float
    total_bet: float
    total_won: float
    rtp: float
    average_crash: float
    highest_win: float
    profit: float

class ActiveGameResponse(BaseModel):
    active: bool
    round_id: Optional[int] = None
    bet_amount: Optional[float] = None
    created_at: Optional[datetime] = None

# Database dependency
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Authentication functions
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    
    return user

# Admin check dependency
async def require_admin(current_user: User = Depends(get_current_user)):
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# Game logic functions
async def get_next_round_id(db: AsyncSession) -> int:
    """Get the next round ID for provably fair system"""
    result = await db.execute(select(CrashGameRound.id).order_by(CrashGameRound.id.desc()).limit(1))
    last_round = result.scalar_one_or_none()
    return (last_round or 0) + 1

def validate_crash_multiplier(multiplier: float) -> bool:
    """Validate that crash multiplier is within acceptable bounds for house edge"""
    # With 5% house edge, the theoretical minimum multiplier should be around 1.05
    # But we allow 1.00 as minimum for edge cases
    if multiplier < 1.00 or multiplier > 100.0:
        return False
    return True

def generate_crash_multiplier(round_id: int, timestamp: int) -> Decimal:
    """Generate provably fair crash multiplier using Stake's algorithm with optimized house edge"""
    global current_house_edge
    
    try:
        combined_string = f"{SERVER_SEED}:{round_id}:{timestamp}"
        hash_result = hashlib.sha256(combined_string.encode()).hexdigest()
        
        # Use first 8 characters of hash to generate random value
        random_hex = hash_result[:8]
        random_value = int(random_hex, 16) / (16 ** 8)
        
        if random_value == 0:
            random_value = 0.0000001
        
        # Use dynamic house edge for maximum profitability
        house_edge_factor = 1.0 - current_house_edge
        
        # Crash formula with optimized house edge: (1 - house_edge) / random_value
        # This maximizes profits while maintaining provable fairness
        crash_multiplier_raw = house_edge_factor / random_value
        crash_multiplier_raw = max(crash_multiplier_raw, 1.00)
        crash_multiplier_raw = min(crash_multiplier_raw, 100.0)  # More reasonable max
        
        # Validate the multiplier
        if not validate_crash_multiplier(crash_multiplier_raw):
            logger.warning(f"Generated invalid multiplier: {crash_multiplier_raw}, using fallback")
            return Decimal("1.50")
        
        return Decimal(str(round(crash_multiplier_raw, 2)))
    except Exception as e:
        logger.error(f"Error generating crash multiplier: {e}")
        # Fallback to a safe default
        return Decimal("1.50")

def calculate_crash_time(game_start_time: datetime, crash_multiplier: float) -> datetime:
    """Calculate the exact time when the game should crash"""
    try:
        # Using linear growth rate: 0.1x per second
        if crash_multiplier <= 1.0:
            return game_start_time
        
        # Calculate time based on linear growth rate
        # Multiplier increases by 0.1 per second: multiplier = 1.0 + (0.1 * seconds)
        # Therefore: seconds = (multiplier - 1.0) / 0.1
        seconds_to_crash = (crash_multiplier - 1.0) / 0.1
        
        # Ensure minimum crash time of 1 second
        seconds_to_crash = max(1.0, seconds_to_crash)
        
        crash_time = game_start_time + timedelta(seconds=seconds_to_crash)
        
        # Log for debugging
        logger.info(f"Crash calculation: multiplier={crash_multiplier}, seconds={seconds_to_crash}, crash_time={crash_time}")
        
        return crash_time
    except Exception as e:
        logger.error(f"Error calculating crash time: {e}")
        # Fallback to a safe default (5 seconds)
        return game_start_time + timedelta(seconds=5.0)

def calculate_current_multiplier(game_start_time: datetime) -> float:
    """Calculate current multiplier based on game duration using linear growth"""
    game_duration = (datetime.utcnow() - game_start_time).total_seconds()
    return 1.0 + (0.1 * game_duration)  # Linear growth: 0.1x per second

# Startup event
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized")
    yield
    # Shutdown
    await engine.dispose()
    logger.info("Database connection closed")

# Create FastAPI app
app = FastAPI(
    title="Sweepstake Crash Game API",
    description="A modern crash game API with provably fair mechanics",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://crimsonchems.com",                # Your custom domain
        "https://web-production-fc04.up.railway.app"  # Your Railway backend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
@app.get("/")
async def root():
    return {"message": "🎰 Welcome to the Sweepstake Crash Game API v2.0!"}

@app.post("/auth/register", response_model=UserOut, status_code=201)
async def register(user: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user"""
    # Validate input
    if not user.username or len(user.username.strip()) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters long")
    
    if not user.password or len(user.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
    
    # Sanitize username
    username = user.username.strip().lower()
    
    # Check if username already exists
    result = await db.execute(select(User).where(User.username == username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=username,
        hashed_password=hashed_password,
        credits=Decimal(str(STARTING_CREDITS)),
        is_admin=False
    )
    
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    
    logger.info(f"New user registered: {username}")
    return db_user

@app.post("/auth/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    """Login user and return access token"""
    # Find user
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # Create access token
    access_token = create_access_token(data={"sub": user.username})
    
    logger.info(f"User logged in: {user.username}")
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/user", response_model=UserOut)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return current_user

@app.post("/crash/start", response_model=CrashStartResponse)
async def start_crash_round(
    req: CrashStartRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Start a new crash game round"""
    # Validate bet amount
    if not isinstance(req.bet_amount, (int, float)) or req.bet_amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid bet amount")
    
    if req.bet_amount < MIN_BET:
        raise HTTPException(status_code=400, detail=f"Minimum bet is ${MIN_BET}")
    if req.bet_amount > MAX_BET:
        raise HTTPException(status_code=400, detail=f"Maximum bet is ${MAX_BET}")
    if req.bet_amount > float(current_user.credits):
        raise HTTPException(status_code=400, detail="Insufficient credits")
    
    # Round bet amount to 2 decimal places
    bet_amount = round(req.bet_amount, 2)
    
    # Generate crash multiplier
    round_id = await get_next_round_id(db)
    timestamp = int(time.time())
    crash_multiplier = generate_crash_multiplier(round_id, timestamp)
    
    logger.info(f"Generated crash multiplier: {crash_multiplier} for round {round_id}")
    logger.info(f"House edge: {BASE_HOUSE_EDGE*100}% - Expected RTP: {(1-BASE_HOUSE_EDGE)*100}% - Expected profit per $100 bet: ${BASE_HOUSE_EDGE*100}")
    
    # Deduct bet from user credits
    current_user.credits = current_user.credits - Decimal(str(bet_amount))
    
    # Create game round
    round_obj = CrashGameRound(
        user_id=current_user.id,
        bet_amount=Decimal(str(bet_amount)),
        crashed_at=crash_multiplier,
        cashed_out_at=None
    )
    
    db.add(round_obj)
    await db.commit()
    await db.refresh(round_obj)
    await db.refresh(current_user)
    
    logger.info(f"Game started - User: {current_user.username}, Bet: {bet_amount}, Crash: {crash_multiplier}")
    
    return {
        "id": round_obj.id,
        "bet_amount": round_obj.bet_amount,
        "cashed_out_at": round_obj.cashed_out_at,
        "crashed_at": None,  # Hide crash point until game ends
        "created_at": round_obj.created_at,
        "crash_multiplier": float(crash_multiplier)  # Send the actual crash multiplier to frontend
    }

@app.post("/crash/cashout")
async def cash_out_crash_round(
    req: CashOutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cash out from current game round"""
    # Get round
    round_obj = await db.get(CrashGameRound, req.round_id)
    if not round_obj or round_obj.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Round not found")
    
    if round_obj.cashed_out_at is not None:
        raise HTTPException(status_code=400, detail="Already cashed out")
    
    # Validate cash out multiplier
    if req.cash_out_multiplier < 1.0:
        raise HTTPException(status_code=400, detail="Invalid cash out multiplier")
    
    # Simple validation: if the cash out multiplier is higher than or equal to the crash point, reject
    if req.cash_out_multiplier >= float(round_obj.crashed_at):
        raise HTTPException(status_code=400, detail="Game has already crashed")
    
    # Calculate winnings
    winnings = round_obj.bet_amount * Decimal(str(req.cash_out_multiplier))
    current_user.credits = current_user.credits + winnings
    round_obj.cashed_out_at = Decimal(str(round(req.cash_out_multiplier, 2)))
    
    await db.commit()
    await db.refresh(round_obj)
    await db.refresh(current_user)
    
    logger.info(f"Cash out - User: {current_user.username}, Multiplier: {req.cash_out_multiplier}, Winnings: {winnings}")
    
    return {
        "id": round_obj.id,
        "bet_amount": round_obj.bet_amount,
        "cashed_out_at": round_obj.cashed_out_at,
        "crashed_at": round_obj.crashed_at,
        "winnings": winnings,
        "created_at": round_obj.created_at
    }

@app.get("/crash/round/{round_id}", response_model=CrashRoundOut)
async def get_crash_round(
    round_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get specific crash round details"""
    result = await db.execute(
        select(CrashGameRound).where(
            and_(CrashGameRound.id == round_id, CrashGameRound.user_id == current_user.id)
        )
    )
    round_obj = result.scalar_one_or_none()
    
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")
    
    # Check if game is still active
    if round_obj.cashed_out_at is not None:
        # Player cashed out - show full data
        return {
            "id": round_obj.id,
            "bet_amount": round_obj.bet_amount,
            "cashed_out_at": round_obj.cashed_out_at,
            "crashed_at": round_obj.crashed_at,
            "created_at": round_obj.created_at,
            "game_ended": True
        }
    else:
        # Check if game has been running for more than 30 seconds (assumed crashed)
        # OR if the game has been running long enough that it should have crashed
        game_duration = (datetime.utcnow() - round_obj.created_at).total_seconds()
        expected_crash_time = calculate_crash_time(round_obj.created_at, float(round_obj.crashed_at))
        expected_crash_duration = (expected_crash_time - round_obj.created_at).total_seconds()
        
        if game_duration > max(5, expected_crash_duration + 2):  # Either 5 seconds or past expected crash time + 2 seconds buffer
            # Game has been running too long, assume it crashed - show full data
            return {
                "id": round_obj.id,
                "bet_amount": round_obj.bet_amount,
                "cashed_out_at": round_obj.cashed_out_at,
                "crashed_at": round_obj.crashed_at,
                "created_at": round_obj.created_at,
                "game_ended": True
            }
        else:
            # Game is still active - hide crash multiplier
            return {
                "id": round_obj.id,
                "bet_amount": round_obj.bet_amount,
                "cashed_out_at": round_obj.cashed_out_at,
                "crashed_at": None,  # Hide crash multiplier for active games
                "created_at": round_obj.created_at,
                "game_ended": False
            }

@app.get("/crash/rounds", response_model=List[CrashRoundOut])
async def get_user_crash_rounds(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's crash game history"""
    result = await db.execute(
        select(CrashGameRound)
        .where(CrashGameRound.user_id == current_user.id)
        .order_by(CrashGameRound.created_at.desc())
    )
    rounds = result.scalars().all()
    
    # Filter rounds to hide crash multipliers for active games
    filtered_rounds = []
    for round_obj in rounds:
        if round_obj.cashed_out_at is not None:
            # Player cashed out - show full data
            filtered_rounds.append({
                "id": round_obj.id,
                "bet_amount": round_obj.bet_amount,
                "cashed_out_at": round_obj.cashed_out_at,
                "crashed_at": round_obj.crashed_at,  # Show crash multiplier for cashed out games
                "created_at": round_obj.created_at,
                "game_ended": True
            })
        else:
            # Check if game has been running for more than 30 seconds (assumed crashed)
            # OR if the game has been running long enough that it should have crashed
            game_duration = (datetime.utcnow() - round_obj.created_at).total_seconds()
            expected_crash_time = calculate_crash_time(round_obj.created_at, float(round_obj.crashed_at))
            expected_crash_duration = (expected_crash_time - round_obj.created_at).total_seconds()
            
            if game_duration > max(5, expected_crash_duration + 2):  # Either 5 seconds or past expected crash time + 2 seconds buffer
                # Game has been running too long, assume it crashed - show full data
                filtered_rounds.append({
                    "id": round_obj.id,
                    "bet_amount": round_obj.bet_amount,
                    "cashed_out_at": round_obj.cashed_out_at,
                    "crashed_at": round_obj.crashed_at,  # Show crash multiplier for crashed games
                    "created_at": round_obj.created_at,
                    "game_ended": True
                })
            else:
                # Game is still active - hide crash multiplier
                filtered_rounds.append({
                    "id": round_obj.id,
                    "bet_amount": round_obj.bet_amount,
                    "cashed_out_at": round_obj.cashed_out_at,
                    "crashed_at": None,  # Hide crash multiplier for active games
                    "created_at": round_obj.created_at,
                    "game_ended": False
                })
    
    return filtered_rounds

@app.get("/crash/stats", response_model=GameStats)
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's game statistics"""
    result = await db.execute(select(CrashGameRound).where(CrashGameRound.user_id == current_user.id))
    rounds = result.scalars().all()
    
    # Filter for completed games only
    completed_rounds = []
    active_rounds = []
    
    for round_obj in rounds:
        if round_obj.cashed_out_at is not None:
            # Player cashed out - game is complete
            completed_rounds.append(round_obj)
        else:
            # Check if game has been running for more than 30 seconds (assumed crashed)
            # OR if the game has been running long enough that it should have crashed
            game_duration = (datetime.utcnow() - round_obj.created_at).total_seconds()
            expected_crash_time = calculate_crash_time(round_obj.created_at, float(round_obj.crashed_at))
            expected_crash_duration = (expected_crash_time - round_obj.created_at).total_seconds()
            
            if game_duration > max(5, expected_crash_duration + 2):  # Either 5 seconds or past expected crash time + 2 seconds buffer
                # Game has been running too long, assume it crashed - game is complete
                completed_rounds.append(round_obj)
            else:
                # Game is still active
                active_rounds.append(round_obj)
    
    total_rounds = len(completed_rounds)  # Only count completed rounds
    cashed_out_rounds = len([r for r in completed_rounds if r.cashed_out_at is not None])
    crashed_rounds = total_rounds - cashed_out_rounds
    
    total_bet = sum(float(r.bet_amount) for r in completed_rounds)
    total_won = sum(float(r.bet_amount) * float(r.cashed_out_at) for r in completed_rounds if r.cashed_out_at is not None)
    
    # Calculate losses from crashed games (games where player didn't cash out)
    total_lost = sum(float(r.bet_amount) for r in completed_rounds if r.cashed_out_at is None)
    
    rtp = (total_won / total_bet * 100) if total_bet > 0 else 0
    avg_crash = sum(float(r.crashed_at) for r in completed_rounds) / total_rounds if total_rounds > 0 else 0
    highest_win = max([float(r.bet_amount) * float(r.cashed_out_at) for r in completed_rounds if r.cashed_out_at is not None], default=0)
    
    # Profit = total won - total bet (losses are already included as negative)
    profit = total_won - total_bet
    
    # Log for debugging
    logger.info(f"Stats calculation for user {current_user.username}:")
    logger.info(f"  Total rounds: {total_rounds}")
    logger.info(f"  Cashed out rounds: {cashed_out_rounds}")
    logger.info(f"  Crashed rounds: {crashed_rounds}")
    logger.info(f"  Total bet: {total_bet}")
    logger.info(f"  Total won: {total_won}")
    logger.info(f"  Total lost: {total_lost}")
    logger.info(f"  Profit: {profit}")
    
    return GameStats(
        total_rounds=total_rounds,
        cashed_out_rounds=cashed_out_rounds,
        crashed_rounds=crashed_rounds,
        win_rate=(cashed_out_rounds / total_rounds * 100) if total_rounds > 0 else 0,
        total_bet=round(total_bet, 2),
        total_won=round(total_won, 2),
        rtp=round(rtp, 2),
        average_crash=round(avg_crash, 2),
        highest_win=round(highest_win, 2),
        profit=round(profit, 2)
    )

@app.get("/crash/recent", response_model=List[dict])
async def get_recent_crashes(db: AsyncSession = Depends(get_db)):
    """Get recent crash multipliers for display (like Stake's recent crashes)"""
    # Get all rounds to filter completed ones
    result = await db.execute(
        select(CrashGameRound)
        .order_by(CrashGameRound.created_at.desc())
        .limit(50)  # Get more to filter
    )
    all_rounds = result.scalars().all()
    
    # Filter for completed rounds only
    completed_rounds = []
    for round_obj in all_rounds:
        # Game is completed if:
        # 1. Player cashed out, OR
        # 2. Game has been running for more than 30 seconds (assumed crashed)
        if round_obj.cashed_out_at is not None:
            # Player cashed out - game is complete
            completed_rounds.append(round_obj)
        else:
            # Check if game has been running for more than 30 seconds (assumed crashed)
            # OR if the game has been running long enough that it should have crashed
            game_duration = (datetime.utcnow() - round_obj.created_at).total_seconds()
            expected_crash_time = calculate_crash_time(round_obj.created_at, float(round_obj.crashed_at))
            expected_crash_duration = (expected_crash_time - round_obj.created_at).total_seconds()
            
            if game_duration > max(5, expected_crash_duration + 2):  # Either 5 seconds or past expected crash time + 2 seconds buffer
                # Game has been running too long, assume it crashed
                completed_rounds.append(round_obj)
            # If game hasn't been running long enough, don't include it
    
    # Return only the crash multipliers for completed games
    return [{"multiplier": float(round_obj.crashed_at)} for round_obj in completed_rounds[:20]]

@app.post("/crash/complete/{round_id}")
async def complete_crash_round(
    round_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a crash round as completed (called by frontend when game crashes)"""
    round_obj = await db.get(CrashGameRound, round_id)
    if not round_obj or round_obj.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Round not found")
    
    if round_obj.cashed_out_at is not None:
        raise HTTPException(status_code=400, detail="Round already completed (cashed out)")
    
    # Mark the round as completed by setting a completion timestamp
    # We'll use a special field or add a completion flag
    # For now, we'll just return the round data with crash multiplier revealed
    return {
        "id": round_obj.id,
        "bet_amount": round_obj.bet_amount,
        "cashed_out_at": round_obj.cashed_out_at,
        "crashed_at": round_obj.crashed_at,
        "created_at": round_obj.created_at,
        "game_ended": True
    }

@app.get("/crash/active", response_model=ActiveGameResponse)
async def get_active_game(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's currently active game"""
    result = await db.execute(
        select(CrashGameRound)
        .where(and_(CrashGameRound.user_id == current_user.id, CrashGameRound.cashed_out_at.is_(None)))
        .order_by(CrashGameRound.created_at.desc())
        .limit(1)
    )
    active_round = result.scalar_one_or_none()
    
    if not active_round:
        return ActiveGameResponse(active=False)
    
    return ActiveGameResponse(
        active=True,
        round_id=active_round.id,
        bet_amount=float(active_round.bet_amount),
        created_at=active_round.created_at
    ) 

@app.get("/admin/users", dependencies=[Depends(require_admin)])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "credits": float(u.credits),
            "created_at": u.created_at,
            "is_admin": getattr(u, 'is_admin', False)
        } for u in users
    ]

@app.get("/admin/profit", response_model=dict, dependencies=[Depends(require_admin)])
async def get_house_profit(db: AsyncSession = Depends(get_db)):
    """Get house profit statistics (admin endpoint)"""
    try:
        # Calculate total house profit
        result = await db.execute(select(CrashGameRound))
        rounds = result.scalars().all()
        
        total_bet = sum(float(r.bet_amount) for r in rounds)
        total_paid_out = sum(float(r.bet_amount) * float(r.cashed_out_at) for r in rounds if r.cashed_out_at is not None)
        house_profit = total_bet - total_paid_out
        profit_margin = (house_profit / total_bet * 100) if total_bet > 0 else 0
        
        # Calculate theoretical vs actual profit
        theoretical_profit = total_bet * BASE_HOUSE_EDGE
        profit_efficiency = (house_profit / theoretical_profit * 100) if theoretical_profit > 0 else 0
        
        return {
            "total_bets": len(rounds),
            "total_bet_amount": round(total_bet, 2),
            "total_paid_out": round(total_paid_out, 2),
            "house_profit": round(house_profit, 2),
            "profit_margin_percent": round(profit_margin, 2),
            "theoretical_profit": round(theoretical_profit, 2),
            "profit_efficiency_percent": round(profit_efficiency, 2),
            "house_edge_percent": BASE_HOUSE_EDGE * 100,
            "rtp_percent": (1 - BASE_HOUSE_EDGE) * 100
        }
    except Exception as e:
        logger.error(f"Error calculating house profit: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate profit") 

@app.post("/admin/adjust-house-edge", dependencies=[Depends(require_admin)])
async def adjust_house_edge(new_edge: float, db: AsyncSession = Depends(get_db)):
    """Dynamically adjust house edge for maximum profitability (admin endpoint)"""
    global current_house_edge
    
    try:
        # Validate house edge range (legal compliance)
        if new_edge < 0.01 or new_edge > 0.15:  # 1% to 15% range
            raise HTTPException(status_code=400, detail="House edge must be between 1% and 15%")
        
        old_edge = current_house_edge
        current_house_edge = new_edge
        
        logger.info(f"House edge adjusted: {old_edge*100}% -> {new_edge*100}%")
        
        return {
            "message": f"House edge adjusted successfully",
            "old_edge_percent": round(old_edge * 100, 2),
            "new_edge_percent": round(new_edge * 100, 2),
            "rtp_percent": round((1 - new_edge) * 100, 2),
            "expected_profit_per_100": round(new_edge * 100, 2)
        }
    except Exception as e:
        logger.error(f"Error adjusting house edge: {e}")
        raise HTTPException(status_code=500, detail="Failed to adjust house edge") 