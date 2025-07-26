from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from models import User, CoinflipRound, ServerSeed
from database import get_db
from dependencies import get_current_user
import hashlib
import secrets
from datetime import datetime
from sqlalchemy import select

router = APIRouter()

def generate_server_seed() -> str:
    """Generate a new random server seed"""
    return secrets.token_hex(32)

def get_server_seed_hash(server_seed: str) -> str:
    """Get the hash of the server seed for pre-commitment"""
    return hashlib.sha256(server_seed.encode()).hexdigest()

def generate_coinflip_result(server_seed: str, client_seed: str, nonce: int) -> str:
    """Generate coinflip result using provably fair method"""
    combined_string = f"{server_seed}:{client_seed}:{nonce}"
    hash_result = hashlib.sha256(combined_string.encode()).hexdigest()
    return "heads" if int(hash_result, 16) % 2 == 0 else "tails"

@router.post("/coinflip/get-server-seed")
async def get_server_seed(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a new server seed hash for the next coinflip"""
    server_seed = generate_server_seed()
    seed_hash = get_server_seed_hash(server_seed)
    
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

@router.post("/coinflip/play")
async def play_coinflip(
    bet_amount: float = Body(...),
    guess: str = Body(...),  # "heads" or "tails"
    client_seed: str = Body(...),
    seed_id: int = Body(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if guess not in ["heads", "tails"]:
        raise HTTPException(status_code=400, detail="Guess must be 'heads' or 'tails'")
    if bet_amount <= 0 or bet_amount > float(current_user.credits):
        raise HTTPException(status_code=400, detail="Invalid bet amount")
    
    # Get the server seed for this game
    seed_obj = await db.get(ServerSeed, seed_id)
    if not seed_obj or seed_obj.user_id != current_user.id or seed_obj.used:
        raise HTTPException(status_code=400, detail="Invalid or used seed")
    
    # Get next round id for nonce
    result = await db.execute(select(CoinflipRound.id).order_by(CoinflipRound.id.desc()).limit(1))
    last_round = result.scalar_one_or_none()
    nonce = (last_round or 0) + 1
    
    # Generate result using provably fair method
    coin = generate_coinflip_result(seed_obj.server_seed, client_seed, nonce)
    win = int(guess == coin)
    
    # Mark seed as used
    seed_obj.used = True
    
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
        hash=f"{seed_obj.server_seed}:{client_seed}:{nonce}",
        server_seed=seed_obj.server_seed,
        client_seed=client_seed,
        nonce=nonce
    )
    db.add(round_obj)
    await db.commit()
    await db.refresh(current_user)
    
    return {
        "result": coin,
        "win": bool(win),
        "hash": f"{seed_obj.server_seed}:{client_seed}:{nonce}",
        "credits": float(current_user.credits),
        "server_seed": seed_obj.server_seed,
        "client_seed": client_seed,
        "nonce": nonce
    }

@router.get("/coinflip/verify/{round_id}")
async def verify_coinflip_fairness(
    round_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Verify the fairness of a completed coinflip round"""
    round_obj = await db.get(CoinflipRound, round_id)
    if not round_obj or round_obj.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Round not found")
    
    # Verify the result
    expected_result = generate_coinflip_result(
        round_obj.server_seed, 
        round_obj.client_seed, 
        round_obj.nonce
    )
    
    is_fair = expected_result == round_obj.result
    
    return {
        "round_id": round_obj.id,
        "server_seed": round_obj.server_seed,
        "client_seed": round_obj.client_seed,
        "nonce": round_obj.nonce,
        "expected_result": expected_result,
        "actual_result": round_obj.result,
        "is_fair": is_fair,
        "verification_string": f"{round_obj.server_seed}:{round_obj.client_seed}:{round_obj.nonce}"
    } 