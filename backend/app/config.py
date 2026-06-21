from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 1440
    anthropic_api_key: str = ""
    ai_model: str = "claude-opus-4-8"
    ai_max_tokens: int = 4096
    ai_timeout_seconds: float = 60.0
    ai_max_retries: int = 2


settings = Settings()
