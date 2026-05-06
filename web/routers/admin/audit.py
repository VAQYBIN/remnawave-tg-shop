import json
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Account, MessageLog


async def add_admin_audit_log(
    db: AsyncSession,
    admin: Account,
    event_type: str,
    *,
    target_user_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> None:
    log = MessageLog(
        user_id=None,
        target_user_id=target_user_id,
        telegram_username=None,
        telegram_first_name=f"admin:{admin.telegram_user_id}",
        event_type=event_type,
        content=json.dumps({"admin_id": str(admin.id), **(details or {})}, default=str),
        is_admin_event=True,
    )
    db.add(log)
