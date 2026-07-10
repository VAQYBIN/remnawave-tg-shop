import pytest
from pydantic import ValidationError

from web.schemas.auth import EmailSendCodeRequest, EmailVerifyRequest


def test_send_code_lowercases_email():
    req = EmailSendCodeRequest(email="User@Mail.COM")
    assert req.email == "user@mail.com"


def test_verify_defaults_ref_code_none_and_lowercases():
    req = EmailVerifyRequest(email="A@B.io", code="123456")
    assert req.email == "a@b.io"
    assert req.code == "123456"
    assert req.ref_code is None


def test_verify_accepts_ref_code():
    req = EmailVerifyRequest(email="a@b.io", code="000000", ref_code="ref123")
    assert req.ref_code == "ref123"


def test_send_code_rejects_bad_email():
    with pytest.raises(ValidationError):
        EmailSendCodeRequest(email="not-an-email")
