from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from decimal import Decimal
from datetime import datetime, timedelta
import hashlib
import math
import time

from models import User, CrashGameRound
from database import get_db
from dependencies import get_current_user

router = APIRouter(prefix="/crash", tags=["Crash"])

# --- Provably fair crash multiplier (5% house edge, Stake/Yotta style) ---
SERVER_SEED = "casino_provably_fair_seed_2024"
MIN_BET = 0.01
MAX_BET = 10000.0
HOUSE_EDGE = 0.05  # 5% house edge


def generate_crash_multiplier(round_id: int, timestamp: int) -> float:
    combined_string = f"{SERVER_SEED}:{round_id}:{timestamp}"
    hash_result = hashlib.sha256(combined_string.encode()).hexdigest()
    h = int(hash_result, 16)
    # 5% house edge: 1 in 20 games crash at 1.00x
    if h % 20 == 0:
        return 1.00
    X = ((h >> 8) % (10 ** 16)) / float(10 ** 16)
    crash = math.floor((1 / (1 - X)) * 100) / 100
    return min(crash, 1000000.0)

# --- Endpoints ---

@router.post("/start")
async def start_crash_round(
    bet_amount: float,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if bet_amount < MIN_BET:
        raise HTTPException(status_code=400, detail=f"Minimum bet is ${MIN_BET}")
    if bet_amount > MAX_BET:
        raise HTTPException(status_code=400, detail=f"Maximum bet is ${MAX_BET}")
    if bet_amount > float(current_user.credits):
        raise HTTPException(status_code=400, detail="Insufficient credits")
    bet_amount = round(bet_amount, 2)
    # Get next round id
    result = await db.execute(select(CrashGameRound.id).order_by(CrashGameRound.id.desc()).limit(1))
    last_round = result.scalar_one_or_none()
    round_id = (last_round or 0) + 1
    timestamp = int(time.time())
    crash_multiplier = generate_crash_multiplier(round_id, timestamp)
    # Deduct bet
    current_user.credits = Decimal(str(current_user.credits)) - Decimal(str(bet_amount))
    round_obj = CrashGameRound(
        user_id=current_user.id,
        bet_amount=Decimal(str(bet_amount)),
        crashed_at=Decimal(str(crash_multiplier)),
        cashed_out_at=None
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
        "crash_multiplier": float(crash_multiplier)
    }

@router.post("/cashout")
async def cash_out_crash_round(
    round_id: int,
    cash_out_multiplier: float,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
        "created_at": round_obj.created_at
    }

@router.get("/rounds")
async def get_user_crash_rounds(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
            "created_at": r.created_at
        }
        for r in rounds
    ]

@router.get("/stats")
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
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
    result = await db.execute(
        select(CrashGameRound)
        .order_by(CrashGameRound.created_at.desc())
        .limit(20)
    )
    rounds = result.scalars().all()
    return [
        {"multiplier": float(r.crashed_at)} for r in rounds
    ] 