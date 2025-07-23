from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import User, CoinflipRound, CoinflipSession
from database import get_db
from config import SERVER_SEED
from dependencies import get_current_user
import hashlib
from datetime import datetime

router = APIRouter()

HOUSE_EDGE = 0.05
PAYOUT_MULTIPLIER = 1 + (1 - HOUSE_EDGE)  # 1.95

@router.post("/coinflip/start")
async def start_coinflip(
    bet_amount: float = Body(...),
    guess: str = Body(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if guess not in ["heads", "tails"]:
        raise HTTPException(status_code=400, detail="Guess must be 'heads' or 'tails'")
    if bet_amount <= 0 or bet_amount > float(current_user.credits):
        raise HTTPException(status_code=400, detail="Invalid bet amount")
    # Deduct initial bet
    current_user.credits -= bet_amount
    await db.commit()
    await db.refresh(current_user)
    # Provably fair
    timestamp = int(datetime.utcnow().timestamp())
    round_string = f"{SERVER_SEED}:{current_user.id}:{timestamp}:0:{bet_amount}"
    hash_result = hashlib.sha256(round_string.encode()).hexdigest()
    coin = "heads" if int(hash_result, 16) % 2 == 0 else "tails"
    win = int(guess == coin)
    payout = bet_amount * PAYOUT_MULTIPLIER if win else 0
    # Record round
    round_obj = CoinflipRound(
        user_id=current_user.id,
        bet_amount=bet_amount,
        guess=guess,
        result=coin,
        win=win,
        hash=hash_result
    )
    db.add(round_obj)
    await db.commit()
    await db.refresh(current_user)
    # Remove any existing session for this user
    await db.execute(
        CoinflipSession.__table__.delete().where(CoinflipSession.user_id == current_user.id)
    )
    # Create new session if win
    if win:
        session_obj = CoinflipSession(
            user_id=current_user.id,
            amount=payout,
            flips=1,
            last_guess=guess,
            last_hash=hash_result
        )
        db.add(session_obj)
        await db.commit()
    return {
        "result": coin,
        "win": bool(win),
        "hash": hash_result,
        "amount": payout,
        "credits": float(current_user.credits),
        "flips": 1,
        "can_ride": bool(win)
    }

@router.post("/coinflip/ride")
async def ride_coinflip(
    guess: str = Body(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CoinflipSession).where(CoinflipSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session or session.amount <= 0:
        raise HTTPException(status_code=400, detail="No active session. Start a new game.")
    amount = session.amount
    flips = session.flips
    # Provably fair
    timestamp = int(datetime.utcnow().timestamp())
    round_string = f"{SERVER_SEED}:{current_user.id}:{timestamp}:{flips}:{amount}"
    hash_result = hashlib.sha256(round_string.encode()).hexdigest()
    coin = "heads" if int(hash_result, 16) % 2 == 0 else "tails"
    win = int(guess == coin)
    payout = amount * PAYOUT_MULTIPLIER if win else 0
    # Record round
    round_obj = CoinflipRound(
        user_id=current_user.id,
        bet_amount=amount,
        guess=guess,
        result=coin,
        win=win,
        hash=hash_result
    )
    db.add(round_obj)
    await db.commit()
    await db.refresh(current_user)
    # Update session
    if win:
        session.amount = payout
        session.flips = flips + 1
        session.last_guess = guess
        session.last_hash = hash_result
        await db.commit()
    else:
        await db.delete(session)
        await db.commit()
    return {
        "result": coin,
        "win": bool(win),
        "hash": hash_result,
        "amount": payout,
        "credits": float(current_user.credits),
        "flips": flips + 1,
        "can_ride": bool(win)
    }

@router.post("/coinflip/cashout")
async def cashout_coinflip(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CoinflipSession).where(CoinflipSession.user_id == current_user.id)
    )
    session = result.scalar_one_or_none()
    if not session or session.amount <= 0:
        raise HTTPException(status_code=400, detail="No winnings to cash out.")
    payout = session.amount
    current_user.credits += payout
    await db.delete(session)
    await db.commit()
    await db.refresh(current_user)
    return {
        "payout": payout,
        "credits": float(current_user.credits),
        "flips": session.flips
    } 