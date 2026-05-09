"""Legal document proxy — fetches content from external URLs (telegra.ph or plain Markdown)."""
import re
from typing import Any, Union
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()

_TELEGRAPH_HOSTS = {"telegra.ph", "te.legra.ph", "graph.org"}
_TELEGRAPH_API = "https://api.telegra.ph/getPage/{}?return_content=true"


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
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Не удалось загрузить документ")
    return resp.text


@router.get("/legal/content", response_model=LegalContentResponse)
async def get_legal_content(url: str = Query(..., description="URL документа (telegra.ph или прямая ссылка)")):
    """Proxy-эндпоинт: загружает текст юридического документа, конвертирует в Markdown."""
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
