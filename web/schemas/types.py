from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, PlainSerializer


def _ensure_utc(v: datetime) -> datetime:
    """Ensure datetime is UTC-aware.

    AfterValidator receives a datetime already parsed by Pydantic, so we
    never see strings here. Works for both naive (add UTC) and aware
    (return as-is) datetimes.
    """
    if v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v


def _serialize_utc(v: datetime) -> str:
    """Serialize datetime to ISO 8601 string with Z suffix.

    PlainSerializer(when_used='json') is called by model_dump(mode='json')
    and model_dump_json(), which FastAPI uses for JSON responses. The result
    is always a UTC string ending with 'Z' so JavaScript Date.parse()
    treats it as UTC regardless of the user's timezone.
    """
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


UTCDatetime = Annotated[
    datetime,
    AfterValidator(_ensure_utc),
    PlainSerializer(_serialize_utc, when_used='json'),
]
