"""Non-secret operating settings shared by workers through the database."""
import json
from .config import settings
from .db import Content

KEY = 'admin-operating-settings'


def operating_settings(db):
    cfg = settings()
    result = {key: getattr(cfg, key) for key in ('membership_demo_enabled', 'daily_ai_request_limit', 'daily_service_request_limit')}
    row = db.get(Content, KEY)
    if row:
        values = json.loads(row.payload)
        result.update({key: values[key] for key in result if key in values})
    return result
