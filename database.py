from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql+asyncpg://postgres:qRWrnrkoNwCygDtzIZpLWXIAWOhxliqy@hopper.proxy.rlwy.net:41380/railway"

engine = create_async_engine(
    DATABASE_URL, 
    echo=True
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
) 