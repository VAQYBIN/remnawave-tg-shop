"""Backwards-compatible re-export.

Клиент панели живёт в core/services/panel_client.py — он общий для бота и
web-кабинета. Этот модуль оставлен, чтобы не переписывать 12 импортов в боте
(тот же приём, что db/dal/ → core/dal/).
"""
from core.services.panel_client import PanelApiService  # noqa: F401

__all__ = ["PanelApiService"]
