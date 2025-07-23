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

class CrashGameRound(Base):
    __tablename__ = 'crash_game_rounds'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    bet_amount = Column(DECIMAL(10, 2), nullable=False)  # 10 digits total, 2 decimal places
    cashed_out_at = Column(DECIMAL(10, 2), nullable=True)  # Multiplier at which user cashed out
    crashed_at = Column(DECIMAL(10, 2), nullable=False)    # Multiplier at which round crashed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

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
    user = relationship("User") 