from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from models import User, CoinflipRound
from database import get_db
from config import SERVER_SEED
from dependencies import get_current_user
import hashlib
from datetime import datetime

router = APIRouter()

@router.post("/coinflip/play")
async def play_coinflip(
    bet_amount: float = Body(...),
    guess: str = Body(...),  # "heads" or "tails"
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if guess not in ["heads", "tails"]:
        raise HTTPException(status_code=400, detail="Guess must be 'heads' or 'tails'")
    if bet_amount <= 0 or bet_amount > float(current_user.credits):
        raise HTTPException(status_code=400, detail="Invalid bet amount")
    # Provably fair: hash of server seed, user id, timestamp, and bet
    timestamp = int(datetime.utcnow().timestamp())
    round_string = f"{SERVER_SEED}:{current_user.id}:{timestamp}:{bet_amount}"
    hash_result = hashlib.sha256(round_string.encode()).hexdigest()
    coin = "heads" if int(hash_result, 16) % 2 == 0 else "tails"
    win = int(guess == coin)
    # Update credits
    if win:
        current_user.credits += bet_amount
    else:
        current_user.credits -= bet_amount
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
    return {
        "result": coin,
        "win": bool(win),
        "hash": hash_result,
        "credits": float(current_user.credits)
    } 