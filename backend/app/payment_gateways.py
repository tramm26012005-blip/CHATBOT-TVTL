"""Server-only production payment clients; no wallet credentials in browser code."""
import hashlib
import hmac
import json
from datetime import timezone
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from .config import settings

PAYOS = 'https://api-merchant.payos.vn/v2/payment-requests'
MOMO = 'https://payment.momo.vn/v2/gateway/api'
MOMO_IPN_FIELDS = ('amount', 'extraData', 'message', 'orderId', 'orderInfo', 'orderType',
                   'partnerCode', 'payType', 'requestId', 'responseTime', 'resultCode', 'transId')


def https_origin(value):
    url = urlsplit(value)
    return (url.scheme == 'https' and bool(url.hostname) and not url.username and not url.password
            and not url.query and not url.fragment and url.path in ('', '/'))


def available_methods():
    c = settings()
    ready = c.payments_enabled and https_origin(c.payment_public_origin) and https_origin(c.app_origin)
    return {'bank': bool(ready and c.payos_client_id and c.payos_api_key and c.payos_checksum_key
                         and c.mb_account_number.isdigit()),
            'momo': bool(ready and c.momo_partner_code and not c.momo_partner_code.endswith('_TEST')
                         and c.momo_access_key and c.momo_secret_key)}


def require_method(method):
    if not available_methods().get(method):
        raise HTTPException(503, 'Phương thức thanh toán chưa được cấu hình. Vui lòng chọn phương thức khác hoặc liên hệ hỗ trợ.')


def signature(data, key):
    def value(v):
        if v is None or v in ('null', 'undefined'):
            return ''
        if isinstance(v, list):
            return json.dumps([dict(sorted(item.items())) for item in v], ensure_ascii=False, separators=(',', ':'))
        return str(v)
    raw = '&'.join(f'{k}={value(v)}' for k, v in sorted(data.items()))
    return hmac.new(key.encode(), raw.encode(), hashlib.sha256).hexdigest()


def verify_signature(data, supplied, key):
    if not key or not isinstance(supplied, str) or not hmac.compare_digest(signature(data, key).encode(), supplied.encode()):
        raise HTTPException(400, 'Chữ ký thanh toán không hợp lệ.')


def momo_ipn_signature(data):
    if any(field not in data for field in MOMO_IPN_FIELDS):
        raise HTTPException(400, 'Thiếu dữ liệu xác thực MoMo.')
    return signature({'accessKey': settings().momo_access_key,
                      **{field: data[field] for field in MOMO_IPN_FIELDS}}, settings().momo_secret_key)


def checkout_url(value, method):
    host = 'pay.payos.vn' if method == 'bank' else 'payment.momo.vn'
    parsed = urlsplit(value if isinstance(value, str) else '')
    try:
        valid_port = parsed.port in (None, 443)
    except ValueError:
        valid_port = False
    if parsed.scheme != 'https' or parsed.hostname != host or parsed.username or parsed.password or not valid_port:
        raise HTTPException(502, 'Địa chỉ thanh toán từ nhà cung cấp chưa hợp lệ.')
    return value


def request_json(method, url, **kwargs):
    try:
        with httpx.Client(timeout=35, follow_redirects=False) as client:
            response = client.request(method, url, **kwargs)
            response.raise_for_status()
            result = response.json()
            if not isinstance(result, dict):
                raise ValueError()
            return result
    except (httpx.HTTPError, ValueError):
        # Never leak response bodies, signed URLs, or API headers into UI/logs.
        raise HTTPException(502, 'Chưa kết nối được cổng thanh toán. Đơn đã được giữ lại; hãy thử lại để kiểm tra.') from None


def payos_request(method, suffix='', payload=None):
    c = settings()
    result = request_json(method, PAYOS + suffix, headers={'x-client-id': c.payos_client_id, 'x-api-key': c.payos_api_key},
                          **({'json': payload} if payload is not None else {}))
    if result.get('code') != '00' or not isinstance(result.get('data'), dict):
        raise HTTPException(502, 'payOS chưa xác nhận yêu cầu. Vui lòng kiểm tra lại đơn trước khi thanh toán.')
    verify_signature(result['data'], result.get('signature'), c.payos_checksum_key)
    return result['data']


def create_checkout(order):
    c = settings()
    require_method(order.method)
    back = f'{c.app_origin.rstrip("/")}/plans?payment_order={order.id}'
    if order.method == 'bank':
        payload = {'orderCode': order.order_code, 'amount': order.amount, 'description': f'VIP{order.order_code}',
                   'returnUrl': back, 'cancelUrl': back + '&payment_cancelled=1'}
        payload['signature'] = signature(payload, c.payos_checksum_key)
        expires = order.expires.replace(tzinfo=timezone.utc) if order.expires.tzinfo is None else order.expires
        payload['expiredAt'] = int(expires.timestamp())
        data = payos_request('POST', payload=payload)
        if (data.get('orderCode') != order.order_code or data.get('amount') != order.amount
                or data.get('currency') != 'VND' or data.get('bin') != '970422'
                or data.get('accountNumber') != c.mb_account_number or not data.get('paymentLinkId')):
            raise HTTPException(409, 'Thông tin tài khoản MB Bank hoặc đơn thanh toán không khớp cấu hình.')
        return str(data['paymentLinkId']), checkout_url(data.get('checkoutUrl'), 'bank')
    payload = {'partnerCode': c.momo_partner_code, 'requestId': order.id, 'orderId': order.id,
               'amount': order.amount, 'orderInfo': 'Goi VIP Lac Lac 30 ngay', 'redirectUrl': back,
               'ipnUrl': c.payment_public_origin.rstrip('/') + '/api/payments/momo/ipn',
               'requestType': 'captureWallet', 'extraData': ''}
    payload['signature'] = signature({'accessKey': c.momo_access_key, **payload}, c.momo_secret_key)
    payload.update({'lang': 'vi', 'autoCapture': True})
    data = request_json('POST', MOMO + '/create', json=payload)
    if (data.get('resultCode') != 0 or data.get('orderId') != order.id
            or data.get('requestId') != order.id or data.get('amount') != order.amount
            or data.get('partnerCode') != c.momo_partner_code):
        raise HTTPException(502, 'MoMo chưa tạo được phiên thanh toán. Hãy thử lại cùng đơn hàng.')
    return order.id, checkout_url(data.get('payUrl'), 'momo')


def query_order(order):
    require_method(order.method)
    if order.method == 'bank':
        return payos_request('GET', '/' + str(order.order_code))
    c = settings()
    import uuid
    payload = {'partnerCode': c.momo_partner_code, 'orderId': order.id,
               'requestId': str(uuid.uuid4()), 'lang': 'vi'}
    payload['signature'] = signature({'accessKey': c.momo_access_key, 'orderId': order.id,
                                      'partnerCode': c.momo_partner_code}, c.momo_secret_key)
    data = request_json('POST', MOMO + '/query', json=payload)
    if data.get('requestId') != payload['requestId']:
        raise HTTPException(502, 'Phản hồi tra cứu MoMo không khớp yêu cầu.')
    return data
