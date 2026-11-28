from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.api.deps import _is_trusted_origin, get_client_ip, verify_cookie_csrf
from app.main import app


def _make_fake_request(
    *,
    method: str = "POST",
    client_host: str = "198.51.100.10",
    headers: dict[str, str] | None = None,
):
    return SimpleNamespace(
        method=method,
        client=SimpleNamespace(host=client_host) if client_host else None,
        headers=headers or {},
    )


def test_get_client_ip_ignores_xff_from_untrusted_peer():
    req = _make_fake_request(
        client_host="198.51.100.10",
        headers={"X-Forwarded-For": "203.0.113.99"},
    )
    assert get_client_ip(req) == "198.51.100.10"


def test_get_client_ip_trusts_xff_from_configured_local_proxy():
    req = _make_fake_request(
        client_host="127.0.0.1",
        headers={"X-Forwarded-For": "203.0.113.99, 127.0.0.1"},
    )
    assert get_client_ip(req) == "203.0.113.99"


def test_is_trusted_origin_ignores_x_forwarded_host_from_untrusted_peer():
    req = _make_fake_request(
        client_host="198.51.100.10",
        headers={"Host": "zaychick.local", "X-Forwarded-Host": "evil.example.com"},
    )
    assert _is_trusted_origin("https://evil.example.com", req) is False
    assert _is_trusted_origin("https://zaychick.local", req) is True


def test_verify_cookie_csrf_requires_x_requested_with_without_origin_or_referer():
    req_missing = _make_fake_request(method="POST", headers={})
    with pytest.raises(HTTPException) as exc_info:
        verify_cookie_csrf(req_missing)
    assert exc_info.value.status_code == 403

    req_with_xhr = _make_fake_request(
        method="POST",
        headers={"X-Requested-With": "XMLHttpRequest"},
    )
    verify_cookie_csrf(req_with_xhr)


@pytest.mark.asyncio
async def test_security_response_headers_present():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.get("/")
        assert resp.headers.get("x-content-type-options") == "nosniff"
        assert resp.headers.get("x-frame-options") == "DENY"
        assert resp.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
        assert "geolocation=()" in (resp.headers.get("permissions-policy") or "")
