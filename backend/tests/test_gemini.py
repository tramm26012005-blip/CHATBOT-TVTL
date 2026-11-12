import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from app.gemini import GeminiClient, SafetyCategories
from app.schemas import Emotion
from app.config import Settings


def test_gemini_routes_structured_output_and_safety():
    api = GeminiClient('test-key')
    parsed = SafetyCategories(dangerous_instructions=False, sexual_exploitation=False, violent_wrongdoing=True)
    parse = AsyncMock(return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed))]))
    api.api.chat.completions.parse = parse
    result = asyncio.run(api.moderate('untrusted text', 'gemini-test'))
    assert result.flagged
    kwargs = parse.await_args.kwargs
    assert kwargs['model'] == 'gemini-test'
    assert kwargs['response_format'] is SafetyCategories
    assert kwargs['messages'][-1] == {'role': 'user', 'content': 'untrusted text'}
    assert str(api.api.base_url) == 'https://generativelanguage.googleapis.com/v1beta/openai/'
    asyncio.run(api.close())


def test_missing_safety_result_fails_closed():
    api = GeminiClient('test-key')
    api.parse = AsyncMock(return_value=SimpleNamespace(output_parsed=None))
    with pytest.raises(ValueError):
        asyncio.run(api.moderate('hello', 'gemini-test'))
    asyncio.run(api.close())


def test_configuration_uses_selected_provider():
    cfg = Settings(_env_file=None, ai_provider='gemini', gemini_api_key='', openai_api_key='old', openai_chat_model='old')
    assert not cfg.chat_configured
    cfg.gemini_api_key = 'new'
    assert cfg.chat_configured


def test_voice_transcription_uses_inline_audio():
    import base64
    api = GeminiClient('test-key')
    api.generate_audio_content = AsyncMock(return_value=[{'text': 'Mình thấy vui.'}])
    assert asyncio.run(api.transcribe(b'audio', 'audio/webm', 'test-model')) == 'Mình thấy vui.'
    model, payload = api.generate_audio_content.await_args.args
    assert model == 'test-model'
    inline = payload['contents'][0]['parts'][0]['inlineData']
    assert inline['mimeType'] == 'audio/webm'
    assert base64.b64decode(inline['data']) == b'audio'
    asyncio.run(api.close())


@pytest.mark.parametrize('mime', ['audio/L16;codec=pcm;rate=24000', 'audio/wav'])
def test_voice_output_is_playable_wav(mime):
    import base64
    import io
    import wave
    pcm = b'\x00\x00' * 24
    out = io.BytesIO()
    with wave.open(out, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(24000)
        wav.writeframes(pcm)
    data = out.getvalue() if mime == 'audio/wav' else pcm
    api = GeminiClient('test-key')
    api.generate_audio_content = AsyncMock(return_value=[{'inlineData': {'mimeType': mime, 'data': base64.b64encode(data).decode()}}])
    audio, kind = asyncio.run(api.speak('Xin chào', 'gemini-3.8-flash-lite-tts', 'coral', 'warm', 1))
    assert kind == 'audio/wav'
    with wave.open(io.BytesIO(audio), 'rb') as wav:
        assert wav.getframerate() == 24000
        assert wav.readframes(24) == pcm
    payload = api.generate_audio_content.await_args.args[1]
    assert payload['contents'][0]['parts'][0]['text'] == 'Xin chào'
    assert payload['generationConfig']['speechConfig']['voiceConfig'] == {'voice': 'Kore'}
    asyncio.run(api.close())


@pytest.mark.parametrize('provider_status,expected', [(429, 429), (404, 503), (503, 503)])
def test_voice_provider_failure_is_sanitized(provider_status, expected):
    import httpx
    from fastapi import HTTPException
    api = GeminiClient('test-key')
    api.native = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(provider_status, json={'error': 'private provider body'})), base_url='https://example.com')
    with pytest.raises(HTTPException) as error:
        asyncio.run(api.transcribe(b'clip', 'audio/webm', 'test'))
    assert error.value.status_code == expected
    assert 'private provider body' not in error.value.detail
    asyncio.run(api.close())


@pytest.mark.parametrize('body,daily', [
    ({'error': {'details': [{'violations': [{'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]}}, True),
    ({'code': 'rate_limit_exceeded'}, False),
    ({'error': {'message': 'Generate content requests per day limit exceeded'}}, True),
])
def test_quota_messages_distinguish_daily_from_temporary(body, daily):
    from app.gemini import rate_limit_message
    message = rate_limit_message(body)
    assert ('hết hạn mức API trong ngày' in message) is daily
    assert ('chờ một lát' in message) is not daily
    assert 'GenerateRequests' not in message
