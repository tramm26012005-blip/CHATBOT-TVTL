from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: str = 'sqlite:///./tuvantamly.db'
    ai_provider: str = 'gemini'
    gemini_api_key: str = Field(default='', repr=False)
    gemini_chat_model: str = 'gemini-3.6-flash'
    gemini_transcribe_model: str = 'gemini-3.6-flash'
    gemini_tts_model: str = 'gemini-3.8-flash-lite-tts'
    openai_api_key: str = ''
    openai_chat_model: str = ''
    @property
    def chat_configured(self):
        if self.ai_provider == 'gemini':
            return bool(self.gemini_api_key.strip() and self.gemini_chat_model.strip())
        return bool(self.openai_api_key and self.openai_chat_model)

    @property
    def voice_configured(self):
        if self.ai_provider == 'gemini':
            return bool(self.chat_configured and self.gemini_transcribe_model and self.gemini_tts_model)
        return bool(self.chat_configured and self.openai_transcribe_model and self.openai_tts_model)

    @property
    def voice_style_supported(self):
        return self.ai_provider == 'gemini' or self.openai_tts_instructions_supported

    book_knowledge_enabled: bool = True
    openai_transcribe_model: str = ''
    openai_tts_model: str = ''
    openai_tts_instructions_supported: bool = False
    app_origin: str = 'http://localhost:3000'
    cookie_secure: bool = False
    membership_demo_enabled: bool = False
    payments_enabled: bool = False
    payment_public_origin: str = ''
    payos_client_id: str = Field(default='', repr=False)
    payos_api_key: str = Field(default='', repr=False)
    payos_checksum_key: str = Field(default='', repr=False)
    mb_account_number: str = ''
    momo_partner_code: str = ''
    momo_access_key: str = Field(default='', repr=False)
    momo_secret_key: str = Field(default='', repr=False)
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
