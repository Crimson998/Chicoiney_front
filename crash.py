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

# ---1 Provably fair crash multiplier (5% house edge, Stake/Yotta style) ---
SERVER_SEED = "casino_provably_fair_seed_2024"
MIN_BET = 0.01
MAX_BET = 10000.0
HOUSE_EDGE = 0.05  # 5% house edge


def generate_crash_multiplier(round_id: int, timestamp: int) -> float:
    combined_string = f"{SERVER_SEED}:{round_id}:{timestamp}"
    hash_result = hashlib.sha256(combined_string.encode()).hexdigest()
    h = int(hash_result, 16)
    if h % 20 == 0:
        return 1.00
    X = ((h >> 8) % (10 ** 16)) / float(10 ** 16)
    crash = math.floor((1 / (1 - X)) * 100) / 100
    return min(crash, 1000000.0)

@router.post("/start")
async def start_crash_round(
    bet_amount: float,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if bet_amount < MIN_BET or bet_amount > MAX_BET:
        raise HTTPException(status_code=400, detail=f"Bet must be between ${MIN_BET} and ${MAX_BET}")
    if bet_amount > float(current_user.credits):
        raise HTTPException(status_code=400, detail="Insufficient credits")
    round_id = (await db.execute(select(CrashGameRound.id).order_by(CrashGameRound.id.desc()).limit(1))).scalar_one_or_none() or 0
    round_id += 1
    timestamp = int(time.time())
    crash_multiplier = generate_crash_multiplier(round_id, timestamp)
    current_user.credits -= Decimal(str(bet_amount))
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
    return {
        "id": round_obj.id,
        "bet_amount": float(round_obj.bet_amount),
        "cashed_out_at": None,
        "crashed_at": None,
        "created_at": round_obj.created_at.isoformat() + "Z",
        "crash_multiplier": float(crash_multiplier)
    }

@router.post("/cashout")
async def cash_out_crash_round(
    round_id: int,
    cash_out_multiplier: float,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    current_user.credits += winnings
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
        "created_at": round_obj.created_at.isoformat() + "Z"
    }

@router.get("/round/{round_id}")
async def get_crash_round(
    round_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(CrashGameRound).where(CrashGameRound.id == round_id, CrashGameRound.user_id == current_user.id)
    )
    round_obj = result.scalar_one_or_none()
    if not round_obj:
        raise HTTPException(status_code=404, detail="Round not found")
    return {
        "id": round_obj.id,
        "bet_amount": float(round_obj.bet_amount),
        "cashed_out_at": float(round_obj.cashed_out_at) if round_obj.cashed_out_at else None,
        "crashed_at": float(round_obj.crashed_at),
        "created_at": round_obj.created_at.isoformat() + "Z"
    }

@router.get("/rounds")
async def get_user_crash_rounds(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(CrashGameRound).where(CrashGameRound.user_id == current_user.id).order_by(CrashGameRound.created_at.desc())
    )
    rounds = result.scalars().all()
    return [
        {
            "id": r.id,
            "bet_amount": float(r.bet_amount),
            "cashed_out_at": float(r.cashed_out_at) if r.cashed_out_at else None,
            "crashed_at": float(r.crashed_at),
            "created_at": r.created_at.isoformat() + "Z"
        }
        for r in rounds
    ]
