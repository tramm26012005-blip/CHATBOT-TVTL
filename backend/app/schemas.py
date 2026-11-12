from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, model_validator
from datetime import datetime


class Register(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    privacy_accepted: bool
    previous_challenge: str | None = Field(default=None, min_length=20, max_length=200)

    @model_validator(mode='after')
    def gmail_only(self):
        if str(self.email).split('@')[-1].lower() != 'gmail.com':
            raise ValueError('Hiện tại chỉ nhận địa chỉ @gmail.com.')
        self.name = self.name.strip()
        if not self.name:
            raise ValueError('Vui lòng nhập họ tên.')
        return self


class RegisterVerify(BaseModel):
    challenge: str = Field(min_length=20, max_length=200)
    otp: str = Field(pattern=r'^[0-9]{6}$')


class RegisterCancel(BaseModel):
    challenge: str = Field(min_length=20, max_length=200)


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class Preferences(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    save_history: bool = False
    save_assessments: bool = False
    voice: Literal['alloy', 'coral', 'sage', 'ash', 'nova', 'onyx'] = 'coral'
    voice_style: Literal['warm', 'calm', 'clear'] = 'warm'
    speed: float = Field(default=1, ge=0.75, le=1.25)
    volume: float = Field(default=0.8, ge=0, le=1)
    theme: Literal['light', 'dark'] = 'light'


class Message(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=4000)


class Chat(BaseModel):
    voice_mode: bool = False
    messages: list[Message] = Field(min_length=1, max_length=24)
    conversation_id: str | None = None
    save: bool = False

    @model_validator(mode='after')
    def valid_turn(self):
        if self.messages[-1].role != 'user' or sum(len(m.content) for m in self.messages) > 24000:
            raise ValueError('Ngữ cảnh không hợp lệ hoặc quá dài.')
        return self


class Emotion(BaseModel):
    label: Literal['vui', 'buồn', 'lo lắng', 'căng thẳng', 'cô đơn', 'tức giận', 'chưa rõ']
    intensity: Literal['nhẹ', 'vừa', 'cao', 'chưa rõ']
    needs_confirmation: bool = True


class SupportContext(BaseModel):
    # Conversation routing only; this is not a clinical risk score.
    route: Literal['ordinary', 'safety_check', 'urgent']
    scope: Literal['mental_health', 'out_of_scope', 'unclear'] = 'mental_health'
    outside_topic: Literal['programming', 'math', 'general_knowledge', 'other'] = 'other'
    evidence_user_turn: int | None = None
    evidence_quote: str = Field(default='', max_length=300)
    safety_answered: bool
    no_trusted_contact: bool
    context_note: str = Field(max_length=400)


class AssessmentSubmit(BaseModel):
    answers: list[int] = Field(min_length=21, max_length=21)
    save: bool = False
    draft_acknowledged: bool = False


class ExpertContent(BaseModel):
    fee: int | None = Field(default=None, ge=0, le=100000000)
    name: str = Field(min_length=2, max_length=100)
    degree: str = Field(min_length=2, max_length=200)
    specialty: str = Field(min_length=2, max_length=300)
    workplace: str = Field(min_length=2, max_length=200)
    experience: str = Field(default='', max_length=200)
    phone: str = Field(pattern=r'^\+?[0-9 ()-]{8,20}$')
    zalo: HttpUrl | None = None
    image: HttpUrl | None = None
    description: str = Field(default='', max_length=2000)
    verification_source: str = Field(min_length=5, max_length=500)
    verified_at: str = Field(min_length=10, max_length=40)


class MusicContent(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default='', max_length=1000)
    category: str = Field(min_length=1, max_length=100)
    url: HttpUrl
    image: HttpUrl | None = None
    source_type: Literal['audio', 'youtube', 'external']
    rights_note: str = Field(min_length=3, max_length=500)
    # Curated library metadata, kept when an admin edits a seeded track.
    library_id: str | None = Field(default=None, max_length=64)
    cover_atlas: str | None = Field(default=None, pattern=r'^/images/[\w./-]+$')
    cover_position: str | None = Field(default=None, pattern=r'^[\d.]+% [\d.]+%$')
    channel: str | None = Field(default=None, max_length=200)
    channel_url: HttpUrl | None = None
    source_title: str | None = Field(default=None, max_length=300)
    duration_minutes: int | None = Field(default=None, ge=0, le=100000)


class SupportContent(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=2, max_length=1000)
    support_type: Literal['hotline', 'organization', 'internal', 'resource'] = 'organization'
    phone: str | None = Field(default=None, pattern=r'^\+?[0-9 ()-]{8,20}$')
    website: HttpUrl | None = None
    region: str = Field(min_length=2, max_length=100)
    hours: str = Field(min_length=2, max_length=200)
    verification_source: HttpUrl
    verified_at: str = Field(min_length=10, max_length=40)

    @model_validator(mode='after')
    def reachable(self):
        if not self.phone and not self.website:
            raise ValueError('Cần ít nhất số điện thoại hoặc website.')
        return self


class HospitalDepartment(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    doctors: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode='after')
    def clean(self):
        self.name = self.name.strip()
        self.doctors = list(dict.fromkeys(value.strip() for value in self.doctors))
        if len(self.name) < 2 or any(not value or len(value) > 150 for value in self.doctors):
            raise ValueError('Tên chuyên khoa hoặc bác sĩ chưa hợp lệ.')
        return self


class HospitalContent(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    address: str = Field(min_length=5, max_length=500)
    phone: str = Field(pattern=r'^\+?[0-9 ().-]{8,20}$')
    departments: list[HospitalDepartment] = Field(min_length=1, max_length=100)
    verification_source: str = Field(min_length=5, max_length=500)

    @model_validator(mode='after')
    def unique_departments(self):
        if len({row.name.casefold() for row in self.departments}) != len(self.departments):
            raise ValueError('Tên chuyên khoa không được trùng nhau.')
        return self


class ContentWrite(BaseModel):
    kind: Literal['experts', 'music', 'support', 'hospitals']
    published: bool = False
    data: dict

    @model_validator(mode='after')
    def validate_payload(self):
        schema = {'experts': ExpertContent, 'music': MusicContent, 'support': SupportContent, 'hospitals': HospitalContent}[self.kind]
        self.data = schema.model_validate(self.data).model_dump(mode='json')
        for key in ('url', 'image', 'zalo', 'verification_source', 'channel_url', 'website'):
            value = self.data.get(key)
            if value and str(value).startswith('http://'):
                raise ValueError('Liên kết công khai cần dùng HTTPS.')
        return self


# Consultations are held by phone, so a booking's contact must be a callable number.
CONTACT_PHONE = r'^\+?[0-9 ().-]{8,20}$'


class BookingCreate(BaseModel):
    expert_id: str
    starts_at: datetime
    contact: str = Field(pattern=CONTACT_PHONE)
    consent_contact: bool
    student_name: str | None = Field(default=None, min_length=2, max_length=100)
    student_email: EmailStr | None = None
    school: str = Field(default='', max_length=200)
    description: str = Field(default='', max_length=3000)
    consent_details: bool = False
    payment_method: Literal['bank', 'momo'] | None = None
    demo_payment_confirmed: bool = False
    expected_fee: int | None = Field(default=None, ge=0, le=100000000)


class BookingUpdate(BaseModel):
    starts_at: datetime
    contact: str | None = Field(default=None, pattern=CONTACT_PHONE)  # None keeps the current number.


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordReset(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class StaffCreate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal['expert']
    expert_id: str | None = None

    @model_validator(mode='after')
    def clean(self):
        self.name = self.name.strip()
        if len(self.name) < 2:
            raise ValueError('Vui lòng nhập họ tên.')
        return self


class AdminBookingCreate(BaseModel):
    user_id: str
    expert_id: str
    starts_at: datetime
    duration_minutes: int = Field(default=30, ge=15, le=30)
    mode: Literal['online', 'offline']
    topic: str = Field(default='', max_length=200)
    contact: str = Field(pattern=CONTACT_PHONE)


class StudentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    membership_tier: Literal['normal', 'vip'] = 'normal'

    @model_validator(mode='after')
    def clean(self):
        self.name = self.name.strip()
        if len(self.name) < 2:
            raise ValueError('Vui lòng nhập họ tên.')
        return self


class StaffUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    expert_id: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=80)

    @model_validator(mode='after')
    def clean(self):
        if self.name is not None:
            self.name = self.name.strip()
            if len(self.name) < 2:
                raise ValueError('Vui lòng nhập họ tên.')
        return self
