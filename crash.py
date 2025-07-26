from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from decimal import Decimal
from datetime import datetime, timedelta
import hashlib
import math
import time
import os
import secrets

from models import User, CrashGameRound, ServerSeed
from database import get_db
from dependencies import get_current_user

router = APIRouter(prefix="/crash", tags=["Crash"])

# --- Provably fair crash multiplier (5% house edge) ---
MIN_BET = 0.01
MAX_BET = 10000.0
HOUSE_EDGE = 0.05  # 5% house edge

def generate_server_seed() -> str:
    """Generate a new random server seed"""
    return secrets.token_hex(32)

def get_server_seed_hash(server_seed: str) -> str:
    """Get the hash of the server seed for pre-commitment"""
    return hashlib.sha256(server_seed.encode()).hexdigest()

def generate_crash_multiplier(server_seed: str, client_seed: str, nonce: int) -> float:
    """Generate crash multiplier using provably fair method"""
    # Combine seeds and nonce
    combined_string = f"{server_seed}:{client_seed}:{nonce}"
    hash_result = hashlib.sha256(combined_string.encode()).hexdigest()
    h = int(hash_result, 16)
    
    # 5% house edge: 1 in 20 games crash at 1.00x
    if h % 20 == 0:
        return 1.00
    
    # Use the classic exponential formula for other games
    X = ((h >> 8) % (10 ** 16)) / float(10 ** 16)
    crash = math.floor((1 / (1 - X)) * 100) / 100
    return min(crash, 1000000.0)

def verify_fairness(server_seed: str, client_seed: str, nonce: int, expected_crash: float) -> bool:
    """Verify that the crash multiplier matches the expected value"""
    actual_crash = generate_crash_multiplier(server_seed, client_seed, nonce)
    return abs(actual_crash - expected_crash) < 0.01

# --- Endpoints ---

@router.post("/get-server-seed")
async def get_server_seed(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a new server seed hash for the next game"""
    # Generate new server seed
    server_seed = generate_server_seed()
    seed_hash = get_server_seed_hash(server_seed)
    
    # Store the server seed in database
    seed_obj = ServerSeed(
        user_id=current_user.id,
        server_seed=server_seed,
        seed_hash=seed_hash,
        used=False
    )
    db.add(seed_obj)
    await db.commit()
    await db.refresh(seed_obj)
    
    return {
        "seed_hash": seed_hash,
        "seed_id": seed_obj.id
    }

@router.post("/start")
async def start_crash_round(
    bet_amount: float,
    client_seed: str,
    seed_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Start a new crash game round with provably fair system"""
    if bet_amount < MIN_BET:
        raise HTTPException(status_code=400, detail=f"Minimum bet is ${MIN_BET}")
    if bet_amount > MAX_BET:
        raise HTTPException(status_code=400, detail=f"Maximum bet is ${MAX_BET}")
    if bet_amount > float(current_user.credits):
        raise HTTPException(status_code=400, detail="Insufficient credits")
    
    bet_amount = round(bet_amount, 2)
    
    # Get the server seed for this game
    seed_obj = await db.get(ServerSeed, seed_id)
    if not seed_obj or seed_obj.user_id != current_user.id or seed_obj.used:
        raise HTTPException(status_code=400, detail="Invalid or used seed")
    
    # Get next round id for nonce
    result = await db.execute(select(CrashGameRound.id).order_by(CrashGameRound.id.desc()).limit(1))
    last_round = result.scalar_one_or_none()
    nonce = (last_round or 0) + 1
    
    # Generate crash multiplier
    crash_multiplier = generate_crash_multiplier(seed_obj.server_seed, client_seed, nonce)
    
    # Mark seed as used
    seed_obj.used = True
    
    # Deduct bet
    current_user.credits = Decimal(str(current_user.credits)) - Decimal(str(bet_amount))
    
    # Create game round
    round_obj = CrashGameRound(
        user_id=current_user.id,
        bet_amount=Decimal(str(bet_amount)),
        crashed_at=Decimal(str(crash_multiplier)),
        cashed_out_at=None,
        server_seed=seed_obj.server_seed,
        client_seed=client_seed,
        nonce=nonce
    )
    
    db.add(round_obj)
    await db.commit()
    await db.refresh(round_obj)
    await db.refresh(current_user)
    
    return {
        "id": round_obj.id,
        "bet_amount": float(round_obj.bet_amount),
        "cashed_out_at": None,
        "crashed_at": None,  # Hide crash point until game ends
        "created_at": round_obj.created_at,
        "seed_hash": seed_obj.seed_hash,
        "client_seed": client_seed,
        "nonce": nonce
    }

@router.post("/cashout")
async def cash_out_crash_round(
    round_id: int,
    cash_out_multiplier: float,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cash out from current game round"""
    round_obj = await db.get(CrashGameRound, round_id)
    if not round_obj or round_obj.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Round not found")
    if round_obj.cashed_out_at is not None:
        raise HTTPException(status_code=400, detail="Already cashed out")
    if cash_out_multiplier < 1.0:
        raise HTTPException(status_code=400, detail="Invalid cash out multiplier")
    if cash_out_multiplier >= float(round_obj.crashed_at):
        raise HTTPException(status_code=400, detail="Game has already crashed")
    
    winnings = round_obj.bet_amount * Decimal(str(cash_out_multiplier))
    current_user.credits = Decimal(str(current_user.credits)) + winnings
    round_obj.cashed_out_at = Decimal(str(round(cash_out_multiplier, 2)))
    
    await db.commit()
    await db.refresh(round_obj)
    await db.refresh(current_user)
    
    return {
        "id": round_obj.id,
        "bet_amount": float(round_obj.bet_amount),
        "cashed_out_at": float(round_obj.cashed_out_at),
        "crashed_at": float(round_obj.crashed_at),
        "winnings": float(winnings),
        "created_at": round_obj.created_at,
        "server_seed": round_obj.server_seed,
        "client_seed": round_obj.client_seed,
        "nonce": round_obj.nonce
    }

@router.get("/verify/{round_id}")
async def verify_round_fairness(
    round_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Verify the fairness of a completed round"""
    round_obj = await db.get(CrashGameRound, round_id)
    if not round_obj or round_obj.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Round not found")
    
    # Verify the crash multiplier
    expected_crash = generate_crash_multiplier(
        round_obj.server_seed, 
        round_obj.client_seed, 
        round_obj.nonce
    )
    
    is_fair = abs(expected_crash - float(round_obj.crashed_at)) < 0.01
    
    return {
        "round_id": round_obj.id,
        "server_seed": round_obj.server_seed,
        "client_seed": round_obj.client_seed,
        "nonce": round_obj.nonce,
        "expected_crash": expected_crash,
        "actual_crash": float(round_obj.crashed_at),
        "is_fair": is_fair,
        "verification_string": f"{round_obj.server_seed}:{round_obj.client_seed}:{round_obj.nonce}"
    }

@router.get("/rounds")
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
    
    return [
        {
            "id": r.id,
            "bet_amount": float(r.bet_amount),
            "cashed_out_at": float(r.cashed_out_at) if r.cashed_out_at is not None else None,
            "crashed_at": float(r.crashed_at),
            "created_at": r.created_at,
            "server_seed": r.server_seed,
            "client_seed": r.client_seed,
            "nonce": r.nonce
        }
        for r in rounds
    ]

@router.get("/stats")
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's game statistics"""
    result = await db.execute(select(CrashGameRound).where(CrashGameRound.user_id == current_user.id))
    rounds = result.scalars().all()
    
    total_rounds = len(rounds)
    cashed_out_rounds = len([r for r in rounds if r.cashed_out_at is not None])
    crashed_rounds = total_rounds - cashed_out_rounds
    total_bet = sum(float(r.bet_amount) for r in rounds)
    total_won = sum(float(r.bet_amount) * float(r.cashed_out_at) for r in rounds if r.cashed_out_at is not None)
    rtp = (total_won / total_bet * 100) if total_bet > 0 else 0
    avg_crash = sum(float(r.crashed_at) for r in rounds) / total_rounds if total_rounds > 0 else 0
    highest_win = max([float(r.bet_amount) * float(r.cashed_out_at) for r in rounds if r.cashed_out_at is not None], default=0)
    profit = total_won - total_bet
    
    return {
        "total_rounds": total_rounds,
        "cashed_out_rounds": cashed_out_rounds,
        "crashed_rounds": crashed_rounds,
        "win_rate": (cashed_out_rounds / total_rounds * 100) if total_rounds > 0 else 0,
        "total_bet": round(total_bet, 2),
        "total_won": round(total_won, 2),
        "rtp": round(rtp, 2),
        "average_crash": round(avg_crash, 2),
        "highest_win": round(highest_win, 2),
        "profit": round(profit, 2)
    }

@router.get("/recent")
async def get_recent_crashes(db: AsyncSession = Depends(get_db)):
    """Get recent crash multipliers for display"""
    result = await db.execute(
        select(CrashGameRound)
        .order_by(CrashGameRound.created_at.desc())
        .limit(20)
    )
    rounds = result.scalars().all()
    
    return [
        {"multiplier": float(r.crashed_at)} for r in rounds
    ]
