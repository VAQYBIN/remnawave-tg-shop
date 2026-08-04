from typing import Optional, Tuple

from config.settings import Settings


async def prepare_config_links(
    settings: Settings, raw_link: Optional[str]
) -> Tuple[Optional[str], Optional[str]]:
    """Ссылка для показа пользователю и ссылка для кнопки «Подключить».

    Remnawave 3.x убрал POST /system/tools/happ/encrypt, поэтому crypt4-шифрование
    больше не поддерживается — обе ссылки совпадают с исходной.
    """
    if not raw_link:
        return None, None

    cleaned = raw_link.strip()
    if not cleaned:
        return None, None

    return cleaned, cleaned
