from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://givova:configure@localhost:5432/givova_ti"
    allowed_origins: list[str] = ["http://localhost:3000"]
    cookie_secure: bool = False
    session_hours: int = 8
    timezone: str = "America/Sao_Paulo"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
