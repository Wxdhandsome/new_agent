from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./workflow.db"
    SECRET_KEY: str = "your-secret-key-here-change-in-production"
    API_KEY: Optional[str] = None
    BASE_URL: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()
