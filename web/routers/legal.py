"""Legal document proxy — fetches content from external URLs (telegra.ph or plain Markdown)."""
import ipaddress
import re
import socket
from typing import Any, Union
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from core.dal.site_settings_dal import get_site_settings
from web.dependencies import get_db, get_settings_dep

router = APIRouter()


async def _configured_legal_urls(db: AsyncSession, settings: Settings) -> set[str]:
    """The exact set of legal-document URLs the operator has configured.

    The /legal/content proxy must only fetch one of these — never an
    arbitrary client-supplied URL — otherwise it is an SSRF primitive.
    Mirrors the site-settings-over-env precedence used by /config/branding.
    """
    site = await get_site_settings(db)
    pairs = (
        (site.terms_of_service_url, settings.TERMS_OF_SERVICE_URL),
        (site.privacy_policy_url, settings.PRIVACY_POLICY_URL),
        (site.personal_data_url, settings.PERSONAL_DATA_URL),
        (site.refund_policy_url, settings.REFUND_POLICY_URL),
    )
    return {(stored or env) for stored, env in pairs if (stored or env)}

_TELEGRAPH_HOSTS = {"telegra.ph", "te.legra.ph", "graph.org"}
_TELEGRAPH_API = "https://api.telegra.ph/getPage/{}?return_content=true"


def _validate_external_url(url: str) -> None:
    """Reject URLs that could be used for SSRF attacks."""
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Только HTTPS-ссылки допустимы")
    host = parsed.hostname or ""
    if not host:
        raise HTTPException(status_code=400, detail="Некорректная ссылка")
    # Block loopback and link-local hostnames
    _blocked_names = {"localhost", "0.0.0.0", "metadata", "169.254.169.254"}
    if host.lower() in _blocked_names:
        raise HTTPException(status_code=400, detail="Недопустимый хост")
    # If host looks like an IP address, reject private/loopback ranges
    try:
        addr = ipaddress.ip_address(host)
        if not addr.is_global:
            raise HTTPException(status_code=400, detail="Недопустимый хост")
    except ValueError:
        # Not an IP — hostname. Resolve and check the resulting address.
        try:
            resolved_ip = socket.gethostbyname(host)
            addr = ipaddress.ip_address(resolved_ip)
            if not addr.is_global:
                raise HTTPException(status_code=400, detail="Недопустимый хост")
        except socket.gaierror:
            raise HTTPException(status_code=400, detail="Не удалось разрешить хост")


class LegalContentResponse(BaseModel):
    content: str


def _node_to_md(node: Union[str, dict], depth: int = 0) -> str:
    if isinstance(node, str):
        return node

    tag = node.get("tag", "")
    children = node.get("children") or []
    inner = "".join(_node_to_md(c, depth) for c in children)

    if tag in ("h3",):
        return f"\n### {inner}\n"
    if tag in ("h4",):
        return f"\n#### {inner}\n"
    if tag == "p":
        return f"\n{inner}\n"
    if tag == "br":
        return "  \n"
    if tag == "strong" or tag == "b":
        return f"**{inner}**"
    if tag == "em" or tag == "i":
        return f"*{inner}*"
    if tag == "s":
        return f"~~{inner}~~"
    if tag == "u":
        return f"<u>{inner}</u>"
    if tag == "code":
        return f"`{inner}`"
    if tag == "pre":
        return f"\n```\n{inner}\n```\n"
    if tag == "blockquote":
        lines = inner.strip().splitlines()
        return "\n" + "\n".join(f"> {l}" for l in lines) + "\n"
    if tag == "ul":
        items = []
        for c in children:
            if isinstance(c, dict) and c.get("tag") == "li":
                li_inner = "".join(_node_to_md(x, depth) for x in (c.get("children") or []))
                items.append(f"- {li_inner.strip()}")
        return "\n" + "\n".join(items) + "\n"
    if tag == "ol":
        items = []
        for i, c in enumerate(children, 1):
            if isinstance(c, dict) and c.get("tag") == "li":
                li_inner = "".join(_node_to_md(x, depth) for x in (c.get("children") or []))
                items.append(f"{i}. {li_inner.strip()}")
        return "\n" + "\n".join(items) + "\n"
    if tag == "li":
        return inner
    if tag == "a":
        href = node.get("attrs", {}).get("href", "")
        return f"[{inner}]({href})"
    if tag in ("figure", "figcaption"):
        return inner
    if tag == "img":
        src = node.get("attrs", {}).get("src", "")
        return f"![image]({src})\n"
    if tag == "hr":
        return "\n---\n"
    return inner


async def _fetch_telegraph(path: str) -> str:
    url = _TELEGRAPH_API.format(path)
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Не удалось загрузить документ с telegra.ph")
    data = resp.json()
    if not data.get("ok"):
        raise HTTPException(status_code=502, detail="Ошибка API telegra.ph")

    result = data.get("result", {})
    title = result.get("title", "")
    nodes: list[Any] = result.get("content", [])

    parts = []
    if title:
        parts.append(f"# {title}\n")
    for node in nodes:
        parts.append(_node_to_md(node))

    return "".join(parts)


async def _fetch_raw(url: str) -> str:
    _validate_external_url(url)
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Не удалось загрузить документ")
    return resp.text


@router.get("/legal/content", response_model=LegalContentResponse)
async def get_legal_content(
    url: str = Query(..., description="URL документа (telegra.ph или прямая ссылка)"),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    """Proxy-эндпоинт: загружает текст юридического документа, конвертирует в Markdown."""
    # SSRF guard: only proxy URLs the operator has actually configured as a
    # legal document. Without this, an unauthenticated caller could point the
    # server at arbitrary internal endpoints.
    if url not in await _configured_legal_urls(db, settings):
        raise HTTPException(status_code=400, detail="Недопустимая ссылка")

    parsed = urlparse(url)
    host = parsed.netloc.lstrip("www.")

    if host in _TELEGRAPH_HOSTS:
        path = parsed.path.lstrip("/")
        if not path:
            raise HTTPException(status_code=400, detail="Некорректная ссылка telegra.ph")
        content = await _fetch_telegraph(path)
    else:
        content = await _fetch_raw(url)

    return LegalContentResponse(content=content)
