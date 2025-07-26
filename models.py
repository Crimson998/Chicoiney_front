from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, DECIMAL, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    credits = Column(DECIMAL(10, 2), default=1000.00)  # 10 digits total, 2 decimal places
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_admin = Column(Boolean, default=False)

    crash_rounds = relationship('CrashGameRound', back_populates='user')
    server_seeds = relationship('ServerSeed', back_populates='user')

class ServerSeed(Base):
    __tablename__ = 'server_seeds'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    server_seed = Column(String, nullable=False)  # The actual server seed
    seed_hash = Column(String, nullable=False)    # Hash of server seed for pre-commitment
    used = Column(Boolean, default=False)         # Whether this seed has been used
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship('User', back_populates='server_seeds')

class CrashGameRound(Base):
    __tablename__ = 'crash_game_rounds'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    bet_amount = Column(DECIMAL(10, 2), nullable=False)  # 10 digits total, 2 decimal places
    cashed_out_at = Column(DECIMAL(10, 2), nullable=True)  # Multiplier at which user cashed out
    crashed_at = Column(DECIMAL(10, 2), nullable=False)    # Multiplier at which round crashed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Provably fair fields
    server_seed = Column(String, nullable=False)  # Server seed used for this round
    client_seed = Column(String, nullable=False)  # Client seed provided by user
    nonce = Column(Integer, nullable=False)       # Round number for uniqueness

    user = relationship('User', back_populates='crash_rounds')

class CoinflipRound(Base):
    __tablename__ = "coinflip_rounds"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    bet_amount = Column(Float)
    guess = Column(String)  # "heads" or "tails"
    result = Column(String)  # "heads" or "tails"
    win = Column(Integer)  # 1 for win, 0 for loss
    hash = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Provably fair fields
    server_seed = Column(String, nullable=False)  # Server seed used for this round
    client_seed = Column(String, nullable=False)  # Client seed provided by user
    nonce = Column(Integer, nullable=False)       # Round number for uniqueness
    
    user = relationship("User")

class CoinflipSession(Base):
    __tablename__ = "coinflip_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    amount = Column(Float, nullable=False)
    flips = Column(Integer, default=1)
    last_guess = Column(String, nullable=False)
    last_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User") 