from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks, Body
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
from coinflip import router as coinflip_router
from crash import router as crash_router
from dependencies import get_current_user

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
    is_admin: bool
    
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
    """Provably fair crash multiplier with 5% house edge (1 in 20 crash at 1.00x)"""
    combined_string = f"{SERVER_SEED}:{round_id}:{timestamp}"
    hash_result = hashlib.sha256(combined_string.encode()).hexdigest()
    h = int(hash_result, 16)
    # 5% house edge: 1 in 20 games crash at 1.00x
    if h % 20 == 0:
        return Decimal("1.00")
    # Otherwise, use the classic exponential formula
    X = ((h >> 8) % (10 ** 16)) / float(10 ** 16)
    crash = math.floor((1 / (1 - X)) * 100) / 100
    # Clamp to a very high max (e.g., 1,000,000x)
    return Decimal(str(min(crash, 1000000.0)))

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

# Crash game endpoints are now handled by the separate crash.py router with provably fair system

# All crash game endpoints are now handled by the separate crash.py router with provably fair system 

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

@app.patch("/admin/user/{user_id}/credits", dependencies=[Depends(require_admin)])
async def update_user_credits(user_id: int, credits: float = Body(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.credits = Decimal(str(credits))
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "credits": float(user.credits)}

@app.patch("/admin/user/{user_id}/admin", dependencies=[Depends(require_admin)])
async def toggle_user_admin(user_id: int, is_admin: bool = Body(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = is_admin
    await db.commit()
    await db.refresh(user)
    return {"id": user.id, "is_admin": user.is_admin}

@app.delete("/admin/user/{user_id}", dependencies=[Depends(require_admin)])
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    await db.delete(user)
    await db.commit()
    return {"detail": "User deleted"}

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

# Import the provably fair routers
from crash import router as crash_router
from coinflip import router as coinflip_router

# Include the routers
app.include_router(crash_router)
app.include_router(coinflip_router) 