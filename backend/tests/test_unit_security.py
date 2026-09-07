import pytest
from fastapi import HTTPException

from app.core.security import (
    DEV_SESSION_TOKEN,
    _dev_identity_from_token,
    issue_dev_token,
)


def test_dev_session_token_accepted():
    identity = _dev_identity_from_token(DEV_SESSION_TOKEN)
    assert identity.email == "ops.lead@routeiq-logistics.com"
    assert identity.role == "Logistics Mission Controller"


def test_issued_dev_token_roundtrip():
    token = issue_dev_token({"email": "dispatch@routeiq.test", "name": "Dispatch Lead"})
    identity = _dev_identity_from_token(token)
    assert identity.email == "dispatch@routeiq.test"
    assert identity.name == "Dispatch Lead"


def test_garbage_token_rejected():
    with pytest.raises(HTTPException) as exc:
        _dev_identity_from_token("not-a-real-token")
    assert exc.value.status_code == 401