from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = 'sqlite:///./tuvantamly.db'
    openai_api_key: str = ''
    openai_chat_model: str = ''
    book_knowledge_enabled: bool = True
    openai_transcribe_model: str = ''
    openai_tts_model: str = ''
    openai_tts_instructions_supported: bool = False
    app_origin: str = 'http://localhost:3000'
    cookie_secure: bool = False
    membership_demo_enabled: bool = False
    data_encryption_key: str = ''
    allow_draft_assessment: bool = False
    assessment_rights_verified: bool = False
    assessment_clinical_reviewed: bool = False
    daily_ai_request_limit: int = 60
    daily_service_request_limit: int = 1000
    max_voice_bytes: int = 5 * 1024 * 1024
    smtp_host: str = ''
    smtp_port: int = 587
    smtp_username: str = ''
    smtp_password: str = ''
    smtp_from: str = ''
    otp_secret_key: str = ''


@lru_cache
def settings():
    return Settings()
