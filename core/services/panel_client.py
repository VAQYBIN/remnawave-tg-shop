"""
Panel API client — pure HTTP client for Remnawave Panel.
Extracted from bot/services/panel_api_service.py.
No Aiogram/Bot dependencies.
"""
import httpx
import logging
import json
import re
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
import asyncio
from urllib.parse import urlencode
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from core.dal import panel_sync_dal
from db.models import PanelSyncStatus


class PanelApiService:

    def __init__(self, settings: Settings):
        self.settings = settings
        self.base_url = settings.PANEL_API_URL
        self.api_key = settings.PANEL_API_KEY
        self._session: Optional[httpx.AsyncClient] = None
        self.default_client_ip = "127.0.0.1"

    async def __aenter__(self):
        """Context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - automatically close session"""
        await self.close_session()

    async def _get_session(self) -> httpx.AsyncClient:
        if self._session is None or self._session.is_closed:
            self._session = httpx.AsyncClient(timeout=httpx.Timeout(30.0))
        return self._session

    async def close_session(self):
        if self._session and not self._session.is_closed:
            await self._session.aclose()
            self._session = None
            logging.debug("Panel API service HTTP session closed.")

    async def close(self):
        """Alias for close_session for API consistency."""
        await self.close_session()

    async def _prepare_headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-For": self.default_client_ip,
            "X-Real-IP": self.default_client_ip,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @staticmethod
    def _sanitize_payload_for_log(payload: Any) -> Any:
        if isinstance(payload, dict):
            redacted: Dict[str, Any] = {}
            for key, value in payload.items():
                lowered = str(key).lower()
                if any(mask_key in lowered for mask_key in (
                    "token",
                    "secret",
                    "password",
                    "authorization",
                    "api_key",
                    "apikey",
                    "key",
                )):
                    redacted[key] = "***"
                else:
                    redacted[key] = PanelApiService._sanitize_payload_for_log(value)
            return redacted
        if isinstance(payload, list):
            return [PanelApiService._sanitize_payload_for_log(item) for item in payload]
        return payload

    async def _request(self,
                       method: str,
                       endpoint: str,
                       log_full_response: bool = False,
                       **kwargs) -> Optional[Dict[str, Any]]:
        if not self.base_url:
            logging.error(
                "Panel API URL (PANEL_API_URL) not configured in settings.")
            return {
                "error": True,
                "status_code": 0,
                "message": "Panel API URL not configured."
            }

        client = await self._get_session()
        headers = await self._prepare_headers()

        url_for_request = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"

        current_params = kwargs.get("params")
        url_with_params_for_log = url_for_request
        if current_params:
            try:
                url_with_params_for_log += "?" + urlencode(current_params)
            except Exception as exc:
                logging.debug("Failed to encode params for panel API log URL: %s", exc)

        json_payload_for_log = kwargs.get('json') if method.upper() in [
            "POST", "PATCH", "PUT"
        ] else None
        log_prefix = f"Panel API Req: {method.upper()} {url_with_params_for_log}"
        if json_payload_for_log:
            try:
                sanitized_payload = self._sanitize_payload_for_log(json_payload_for_log)
                payload_str = json.dumps(sanitized_payload)
                log_prefix += f" | Payload: {payload_str[:300]}{'...' if len(payload_str) > 300 else ''}"
            except Exception:
                log_prefix += " | Payload: <unavailable>"
        try:
            response = await client.request(
                method.upper(),
                url_for_request,
                headers=headers,
                **kwargs,
            )
            response_status = response.status_code
            response_text = response.text

            log_suffix = f"| Status: {response_status}"

            should_log_full_body = bool(log_full_response and self.settings.LOG_LEVEL == "DEBUG")
            if should_log_full_body or not (200 <= response_status < 300):
                try:
                    parsed_json_for_log = json.loads(response_text)
                    pretty_response_text = json.dumps(parsed_json_for_log,
                                                      indent=2,
                                                      ensure_ascii=False)
                    logging.info(
                        f"{log_prefix} {log_suffix} | Full Response Body:\n{pretty_response_text}"
                    )
                except json.JSONDecodeError:
                    logging.info(
                        f"{log_prefix} {log_suffix} | Full Response Text (not JSON):\n{response_text[:2000]}{'...' if len(response_text) > 2000 else ''}"
                    )
            else:
                logging.debug(
                    f"{log_prefix} {log_suffix} | OK. Response Body Preview: {response_text[:200]}{'...' if len(response_text) > 200 else ''}"
                )

            if 200 <= response_status < 300:
                try:
                    if 'application/json' in response.headers.get(
                            'content-type', '').lower():
                        data = json.loads(response_text)
                        return data
                    else:
                        return {
                            "status": "success",
                            "code": response_status,
                            "data_text": response_text
                        }
                except json.JSONDecodeError as e_json_ok:
                    logging.error(
                        f"{log_prefix} {log_suffix} | OK but JSON Parse Error. Error: {e_json_ok}. Body was logged above."
                    )
                    return {
                        "status": "success_parse_error",
                        "code": response_status,
                        "data_text": response_text
                    }
            else:
                error_details = {
                    "message":
                    f"Request failed with status {response_status}",
                    "raw_response_text": response_text
                }
                try:
                    if 'application/json' in response.headers.get(
                            'content-type', '').lower():
                        error_json_data = json.loads(response_text)
                        error_details.update(error_json_data)
                except json.JSONDecodeError:
                    pass
                return {
                    "error": True,
                    "status_code": response_status,
                    "details": error_details
                }

        except httpx.ConnectError as e:
            logging.error(
                f"Panel API ConnectError to {url_for_request}: {e}")
            # Keep exception detail in logs only; never surface it in the returned
            # payload (it can reach the cabinet API — see py/stack-trace-exposure).
            return {
                "error": True,
                "status_code": -1,
                "message": "Connection error"
            }
        except httpx.HTTPError as e:
            logging.error(f"Panel API HTTPError to {url_for_request}: {e}")
            return {
                "error": True,
                "status_code": -2,
                "message": "Client error"
            }
        except httpx.TimeoutException:
            logging.error(f"Panel API request to {url_for_request} timed out.")
            return {
                "error": True,
                "status_code": -3,
                "message": "Request timed out"
            }
        except Exception as e:
            logging.error(
                f"Unexpected Panel API request error to {url_for_request}: {e}",
                exc_info=True)
            return {
                "error": True,
                "status_code": -4,
                "message": "Unexpected error"
            }

    async def get_all_panel_users(
            self,
            page_size: int = 100,
            log_responses: bool = False) -> Optional[List[Dict[str, Any]]]:
        all_users = []
        start_offset = 0
        while True:
            params = {"size": page_size, "start": start_offset}
            response_data = await self._request(
                "GET",
                "/users",
                params=params,
                log_full_response=log_responses)

            if not response_data or response_data.get("error"):
                logging.error(
                    f"Failed to fetch panel users batch (start: {start_offset}). Response: {response_data}"
                )
                return None
            users_batch = response_data.get("response", {}).get("users", [])
            if not users_batch: break
            all_users.extend(users_batch)
            if len(users_batch) < page_size: break
            start_offset += page_size
            await asyncio.sleep(0.1)
        logging.info(f"Fetched {len(all_users)} users from panel API.")
        return all_users

    async def get_user_by_id(
            self,
            user_id: int,
            log_response: bool = True) -> Optional[Dict[str, Any]]:
        endpoint = f"/users/{user_id}"
        full_response = await self._request("GET",
                                            endpoint,
                                            log_full_response=log_response)
        if full_response and not full_response.get(
                "error") and "response" in full_response:
            return full_response.get("response")

        return None

    async def get_user(
        self,
        *,
        user_id: Optional[int] = None,
        telegram_id: Optional[int] = None,
        username: Optional[str] = None,
        email: Optional[str] = None,
        log_response: bool = True,
    ) -> Optional[Dict[str, Any]]:
        if user_id is not None:
            return await self.get_user_by_id(user_id, log_response=log_response)

        users = await self.get_users_by_filter(
            telegram_id=telegram_id,
            username=username,
            email=email,
            log_response=log_response,
        )
        if users:
            return users[0]
        return None

    @staticmethod
    def _error_code(response_data: Optional[Dict[str, Any]]) -> Optional[str]:
        if not response_data:
            return None
        details = response_data.get("details") or {}
        return details.get("errorCode") or response_data.get("errorCode")

    async def _stream_users_by(
            self,
            param: str,
            value: Any,
            log_response: bool = True) -> Optional[List[Dict[str, Any]]]:
        """Remnawave 3.x убрал /users/by-telegram-id и /users/by-email.

        Их роль перешла к /users/stream, который принимает те же значения как
        query-параметры и всегда отдаёт список.
        """
        response_data = await self._request(
            "GET",
            "/users/stream",
            params={param: str(value)},
            log_full_response=log_response,
        )
        if response_data and not response_data.get("error"):
            inner = response_data.get("response")
            if isinstance(inner, dict) and isinstance(inner.get("users"), list):
                return inner["users"]
            if isinstance(inner, list):
                return inner
        logging.error(
            "Failed to stream panel users by %s. Response: %s",
            param,
            response_data if not log_response else "(logged above)",
        )
        return None

    async def get_users_by_filter(
            self,
            telegram_id: Optional[int] = None,
            username: Optional[str] = None,
            email: Optional[str] = None,
            log_response: bool = True) -> Optional[List[Dict[str, Any]]]:

        if telegram_id is not None:
            return await self._stream_users_by(
                "telegramId", telegram_id, log_response=log_response)

        if email is not None:
            return await self._stream_users_by(
                "email", email, log_response=log_response)

        if username is not None:
            endpoint = f"/users/by-username/{username}"
            response_data = await self._request("GET",
                                                endpoint,
                                                log_full_response=log_response)

            if response_data and not response_data.get(
                    "error") and isinstance(response_data.get("response"), dict):
                return [response_data["response"]]
            if self._error_code(response_data) == "A062":
                logging.info("Panel API: user not found for username=%s", username)
                return []
            logging.error(
                "Failed to fetch panel user by username=%s. Response: %s",
                username,
                response_data if not log_response else "(logged above)",
            )
            return None

        logging.warning(
            "get_users_by_filter called without any specific filter criteria."
        )
        return []

    async def create_panel_user(
            self,
            username_on_panel: str,
            telegram_id: Optional[int] = None,
            email: Optional[str] = None,
            default_expire_days: int = 1,
            default_traffic_limit_bytes: int = 0,
            default_traffic_limit_strategy: str = "NO_RESET",
            hwid_device_limit: Optional[int] = None,
            specific_squad_uuids: Optional[List[str]] = None,
            external_squad_uuid: Optional[str] = None,
            description: Optional[str] = None,
            tag: Optional[str] = None,
            status: str = "ACTIVE",
            log_response: bool = True) -> Optional[Dict[str, Any]]:

        username_is_valid = (
            3 <= len(username_on_panel) <= 36
            and re.match(r"^[A-Za-z0-9_-]+$", username_on_panel) is not None
        )
        if not username_is_valid:
            msg = f"Panel username '{username_on_panel}' does not meet panel requirements."
            logging.error(msg)
            return {
                "error": True,
                "status_code": 400,
                "message": msg,
                "errorCode": "VALIDATION_ERROR_USERNAME"
            }

        now = datetime.now(timezone.utc)
        expire_at_dt = now + timedelta(days=default_expire_days)
        expire_at_iso = expire_at_dt.isoformat(
            timespec='milliseconds').replace('+00:00', 'Z')

        payload: Dict[str, Any] = {
            "username": username_on_panel,
            "status": status.upper(),
            "expireAt": expire_at_iso,
            "trafficLimitStrategy": default_traffic_limit_strategy.upper(),
            "trafficLimitBytes": default_traffic_limit_bytes,
        }
        hwid_limit_value = hwid_device_limit
        if hwid_limit_value is None:
            hwid_limit_value = self.settings.USER_HWID_DEVICE_LIMIT
        if hwid_limit_value is not None:
            try:
                hwid_limit_int = int(hwid_limit_value)
                if hwid_limit_int >= 0:
                    payload["hwidDeviceLimit"] = hwid_limit_int
            except (TypeError, ValueError):
                logging.warning(
                    f"Ignoring invalid HWID device limit '{hwid_limit_value}' while creating panel user '{username_on_panel}'."
                )
        if specific_squad_uuids:
            payload["activeInternalSquads"] = specific_squad_uuids
        if external_squad_uuid:
            payload["externalSquadUuid"] = external_squad_uuid
        if telegram_id is not None: payload["telegramId"] = telegram_id
        if email: payload["email"] = email
        if description: payload["description"] = description
        if tag: payload["tag"] = tag

        response = await self._request("POST",
                                       "/users",
                                       json=payload,
                                       log_full_response=log_response)
        if response and not response.get("error") and "response" in response:
            logging.info(
                f"Panel user '{username_on_panel}' created successfully (id: {response.get('response',{}).get('id')})."
            )
            return response

        logging.error(
            "Failed to create panel user '%s'. Payload: %s, Response: %s",
            username_on_panel,
            self._sanitize_payload_for_log(payload),
            response if not log_response else "(full response logged above)",
        )
        return response

    async def update_user_details_on_panel(
            self,
            user_id: int,
            update_payload: Dict[str, Any],
            log_response: bool = True) -> Optional[Dict[str, Any]]:
        # v3 идентифицирует пользователя в PATCH /users по числовому id.
        update_payload = {**update_payload, "id": user_id}
        update_payload.pop("uuid", None)

        full_response = await self._request("PATCH",
                                            "/users",
                                            json=update_payload,
                                            log_full_response=log_response)
        if full_response and not full_response.get(
                "error") and "response" in full_response:
            logging.info(f"User {user_id} details updated on panel.")
            return full_response.get("response")

        logging.error(
            "Failed to update user %s details on panel. Payload: %s, Response: %s",
            user_id,
            self._sanitize_payload_for_log(update_payload),
            full_response if not log_response else "(logged above)",
        )
        return None

    async def update_user_status_on_panel(self,
                                          user_id: int,
                                          enable: bool,
                                          log_response: bool = True) -> bool:
        action = "enable" if enable else "disable"
        endpoint = f"/users/{user_id}/actions/{action}"
        response_data = await self._request("POST",
                                            endpoint,
                                            log_full_response=log_response)

        if response_data and not response_data.get(
                "error") and "response" in response_data:
            actual_status = response_data.get("response", {}).get("status")
            expected_status = "ACTIVE" if enable else "DISABLED"
            if actual_status == expected_status:
                logging.info(
                    f"User {user_id} status on panel successfully set to {action} (Actual: {actual_status})."
                )
                return True
            else:
                logging.warning(
                    f"User {user_id} status on panel action '{action}' called, but final status is '{actual_status}'."
                )
                return False

        logging.error(
            f"Failed to {action} user {user_id} on panel. Response: {response_data if not log_response else '(logged above)'}"
        )
        return False

    async def delete_user_from_panel(self,
                                     user_id: int,
                                     log_response: bool = True) -> bool:
        """Delete a user from the panel. Treat not-found as already deleted.

        v3 отвечает 204 No Content без тела — успехом считается отсутствие ошибки.
        """
        endpoint = f"/users/{user_id}"
        response_data = await self._request(
            "DELETE", endpoint, log_full_response=log_response
        )

        if not response_data:
            logging.error(
                f"Panel API delete_user_from_panel returned no data for user {user_id}."
            )
            return False

        if response_data.get("error"):
            details = response_data.get("details") or {}
            error_code = details.get("errorCode") or response_data.get("errorCode")
            if error_code in {"A062", "A040"}:
                logging.info(
                    f"Panel user {user_id} already absent (errorCode {error_code}). Treating as deleted."
                )
                return True
            logging.error(
                f"Failed to delete user {user_id} on panel. Response: {response_data}"
            )
            return False

        logging.info(f"Panel user {user_id} deleted successfully.")
        return True

    async def get_subscription_link(
            self,
            short_uuid_or_sub_uuid: str,
            client_type: Optional[str] = None) -> Optional[str]:
        if not self.settings.PANEL_API_URL:
            logging.error(
                "PANEL_API_URL not set, cannot generate subscription link.")
            return None
        base_sub_url = f"{self.settings.PANEL_API_URL.rstrip('/')}/sub/{short_uuid_or_sub_uuid}"
        if client_type:
            return f"{base_sub_url}/{client_type.lower()}"
        return base_sub_url

    async def get_user_devices(self, user_id: int) -> Optional[List[Dict[str, Any]]]:
        endpoint = f"/hwid/devices/{user_id}"
        response_data = await self._request("GET", endpoint, log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            inner = response_data.get("response")
            if isinstance(inner, dict):
                return inner.get("devices", [])
            if isinstance(inner, list):
                return inner
        logging.error(
            f"Failed to get user devices for user {user_id}. Response: {response_data}"
        )
        return None

    async def disconnect_device(self, user_id: int, hwid: str) -> bool:
        endpoint = "/hwid/devices/delete"
        payload = {
            "userId": user_id,
            "hwid": hwid
        }
        response_data = await self._request("POST", endpoint, json=payload, log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            return True
        logging.error(
            f"Failed to disconnect device {hwid} for user {user_id}. Payload: {payload}, Response: {response_data}"
        )
        return False

    async def get_subscription_page_configs(self) -> Optional[List[Dict[str, Any]]]:
        """List the Subscription Page configs stored in the panel.

        Each item has ``uuid``, ``name``, ``viewPosition`` (the full ``config`` is
        null in the list view — fetch it with get_subscription_page_config).
        """
        response_data = await self._request(
            "GET", "/subscription-page-configs", log_full_response=False
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            resp = response_data.get("response")
            if isinstance(resp, dict):
                return resp.get("configs") or []
            if isinstance(resp, list):
                return resp
        return None

    async def get_subscription_page_config(self, uuid: str) -> Optional[Dict[str, Any]]:
        """Fetch one Subscription Page config (the v2 app config) by UUID.

        Returns the ``config`` payload (platforms/apps/blocks/svgLibrary/...), or None.
        """
        response_data = await self._request(
            "GET", f"/subscription-page-configs/{uuid}", log_full_response=False
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            resp = response_data.get("response")
            if isinstance(resp, dict):
                return resp.get("config")
        return None

    async def update_bot_db_sync_status(self,
                                        session: AsyncSession,
                                        status: str,
                                        details: str,
                                        users_processed: int = 0,
                                        subs_synced: int = 0):
        await panel_sync_dal.update_panel_sync_status(session, status, details,
                                                      users_processed,
                                                      subs_synced)

    async def get_bot_db_last_sync_status(
            self, session: AsyncSession) -> Optional[PanelSyncStatus]:
        return await panel_sync_dal.get_panel_sync_status(session)

    async def get_system_stats(self) -> Optional[Dict[str, Any]]:
        """Get system statistics (CPU, memory, users counts)"""
        response_data = await self._request("GET", "/system/stats", log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def get_system_metadata(self) -> Optional[Dict[str, Any]]:
        """Get panel metadata (version, build and git details)."""
        response_data = await self._request("GET", "/system/metadata", log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def get_bandwidth_stats(self) -> Optional[Dict[str, Any]]:
        """Get bandwidth statistics"""
        response_data = await self._request("GET", "/system/stats/bandwidth", log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def get_nodes_stats(self) -> Optional[Dict[str, Any]]:
        """Get last-seven-days nodes traffic statistics."""
        return await self.get_nodes_statistics()

    async def get_nodes_statistics(self) -> Optional[Dict[str, Any]]:
        """Get nodes statistics"""
        response_data = await self._request("GET", "/system/stats/nodes", log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def get_nodes_bandwidth(
            self,
            date_from: date | str,
            date_to: date | str,
            top_nodes_limit: int = 10) -> Optional[Dict[str, Any]]:
        """Get nodes bandwidth chart for a date range."""
        params = {
            "start": date_from.isoformat() if isinstance(date_from, date) else date_from,
            "end": date_to.isoformat() if isinstance(date_to, date) else date_to,
            "topNodesLimit": top_nodes_limit,
        }
        response_data = await self._request(
            "GET", "/bandwidth-stats/nodes", params=params, log_full_response=False
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def get_nodes_realtime(self) -> Optional[Dict[str, Any]]:
        """Get current node interface throughput.

        Remnawave removed /bandwidth-stats/nodes/realtime in 2.7.0. Current
        node throughput is exposed on /nodes under system.stats.interface.
        """
        nodes = await self.get_all_nodes()
        if nodes is None:
            return None

        realtime_nodes: List[Dict[str, Any]] = []
        total_rx = 0.0
        total_tx = 0.0

        for node in nodes:
            system = node.get("system") if isinstance(node, dict) else None
            stats = system.get("stats") if isinstance(system, dict) else None
            interface = stats.get("interface") if isinstance(stats, dict) else None
            if not isinstance(interface, dict):
                interface = {}

            rx = interface.get("rxBytesPerSec") or 0
            tx = interface.get("txBytesPerSec") or 0
            try:
                rx_value = float(rx)
            except (TypeError, ValueError):
                rx_value = 0.0
            try:
                tx_value = float(tx)
            except (TypeError, ValueError):
                tx_value = 0.0

            total_rx += rx_value
            total_tx += tx_value
            realtime_nodes.append({
                "uuid": node.get("uuid"),
                "name": node.get("name"),
                "countryCode": node.get("countryCode"),
                "isConnected": node.get("isConnected"),
                "isDisabled": node.get("isDisabled"),
                "usersOnline": node.get("usersOnline"),
                "interface": interface.get("interface"),
                "rxBytesPerSec": rx_value,
                "txBytesPerSec": tx_value,
                "totalBytesPerSec": rx_value + tx_value,
            })

        return {
            "nodes": realtime_nodes,
            "totalRxBytesPerSec": total_rx,
            "totalTxBytesPerSec": total_tx,
            "totalBytesPerSec": total_rx + total_tx,
        }

    async def get_all_nodes(self) -> Optional[List[Dict[str, Any]]]:
        """Get all Remnawave nodes."""
        response_data = await self._request("GET", "/nodes", log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            response = response_data.get("response")
            if isinstance(response, dict):
                nodes = response.get("nodes")
                if isinstance(nodes, list):
                    return nodes
            if isinstance(response, list):
                return response
        return None

    async def get_node_by_uuid(self, node_uuid: str) -> Optional[Dict[str, Any]]:
        """Get one Remnawave node by UUID."""
        response_data = await self._request(
            "GET", f"/nodes/{node_uuid}", log_full_response=False
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def _node_action(
            self,
            node_uuid: str,
            action: str,
            json_body: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        response_data = await self._request(
            "POST",
            f"/nodes/{node_uuid}/actions/{action}",
            json=json_body,
            log_full_response=False,
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def enable_node(self, node_uuid: str) -> Optional[Dict[str, Any]]:
        return await self._node_action(node_uuid, "enable")

    async def disable_node(self, node_uuid: str) -> Optional[Dict[str, Any]]:
        return await self._node_action(node_uuid, "disable")

    async def restart_node(
            self, node_uuid: str, force_restart: bool = False) -> Optional[Dict[str, Any]]:
        # Remnawave >= 2.8.0 requires forceRestart in the restart action body.
        return await self._node_action(
            node_uuid, "restart", json_body={"forceRestart": force_restart}
        )

    async def restart_all_nodes(self, force_restart: bool = False) -> bool:
        # Remnawave >= 2.8.0 requires forceRestart in the restart-all body.
        response_data = await self._request(
            "POST",
            "/nodes/actions/restart-all",
            json={"forceRestart": force_restart},
            log_full_response=False,
        )
        return bool(response_data and not response_data.get("error"))

    async def get_node_users_bandwidth(
            self,
            node_uuid: str,
            date_from: date | str,
            date_to: date | str,
            top_users_limit: int = 10) -> Optional[Dict[str, Any]]:
        """Get top users bandwidth for a node and date range."""
        params = {
            "start": date_from.isoformat() if isinstance(date_from, date) else date_from,
            "end": date_to.isoformat() if isinstance(date_to, date) else date_to,
            "topUsersLimit": top_users_limit,
        }
        response_data = await self._request(
            "GET",
            f"/bandwidth-stats/nodes/{node_uuid}/users",
            params=params,
            log_full_response=False,
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def get_hwid_stats(self) -> Optional[Dict[str, Any]]:
        """Get HWID devices statistics."""
        response_data = await self._request("GET", "/hwid/devices/stats", log_full_response=False)
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def get_panel_users_page(
            self,
            start: int = 0,
            size: int = 20) -> Optional[Dict[str, Any]]:
        """Get one paginated page of panel users."""
        response_data = await self._request(
            "GET",
            "/users",
            params={"start": start, "size": size},
            log_full_response=False,
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def extend_user_subscription(self, user_uuid: str, days: int) -> bool:
        """Extend user subscription by adding N days to current expireAt."""
        user_data = await self.get_user_by_uuid(user_uuid)
        if not user_data:
            logging.error(f"extend_user_subscription: user {user_uuid} not found on panel.")
            return False

        current_expire_str = user_data.get("expireAt")
        now = datetime.now(timezone.utc)
        if current_expire_str:
            try:
                expire_dt = datetime.fromisoformat(current_expire_str.replace("Z", "+00:00"))
                base = max(expire_dt, now)
            except (ValueError, AttributeError):
                base = now
        else:
            base = now

        new_expire = base + timedelta(days=days)
        new_expire_iso = new_expire.isoformat(timespec="milliseconds").replace("+00:00", "Z")

        result = await self.update_user_details_on_panel(
            user_uuid,
            {"uuid": user_uuid, "expireAt": new_expire_iso},
        )
        return result is not None

    async def add_user_traffic(self, user_id: int, bytes_to_add: int) -> bool:
        """Add bytes to user's traffic limit (sets trafficLimitBytes += bytes_to_add)."""
        user_data = await self.get_user_by_id(user_id)
        if not user_data:
            logging.error(f"add_user_traffic: user {user_id} not found on panel.")
            return False

        current_limit = int(user_data.get("trafficLimitBytes") or 0)
        new_limit = current_limit + bytes_to_add

        result = await self.update_user_details_on_panel(
            user_id,
            {"trafficLimitBytes": new_limit},
        )
        return result is not None

    async def reset_user_traffic_on_panel(self, user_id: int) -> bool:
        """Reset user's used traffic counter via panel action endpoint."""
        endpoint = f"/users/{user_id}/actions/reset-traffic"
        response_data = await self._request("POST", endpoint, log_full_response=False)
        if response_data and not response_data.get("error"):
            logging.info(f"Traffic reset for panel user {user_id}.")
            return True
        logging.error(f"Failed to reset traffic for panel user {user_id}. Response: {response_data}")
        return False

    async def get_internal_squads(self) -> Optional[List[Dict[str, Any]]]:
        """Get all Internal Squads from Remnawave."""
        response_data = await self._request("GET", "/internal-squads", log_full_response=False)
        if not response_data or response_data.get("error"):
            return None
        response = response_data.get("response")
        if isinstance(response, list):
            return response
        if isinstance(response, dict):
            return response.get("internalSquads") or response.get("squads") or []
        return None

    async def get_internal_squad(self, squad_uuid: str) -> Optional[Dict[str, Any]]:
        """Get a single Internal Squad by UUID from Remnawave."""
        response_data = await self._request(
            "GET", f"/internal-squads/{squad_uuid}", log_full_response=False
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response")
        return None

    async def validate_internal_squad(
        self, squad_uuid: str
    ) -> tuple[bool, Optional[str], Optional[str]]:
        """Check that squad_uuid exists in Remnawave.

        Returns (is_valid, squad_name, error_message).
        error_message is set both when Remnawave is unavailable and when the UUID is not found.
        """
        squad = await self.get_internal_squad(squad_uuid)
        if squad is None:
            return False, None, f"Squad {squad_uuid!r} не найден или Remnawave недоступен."
        name: Optional[str] = squad.get("name") or squad.get("squadName")
        return True, name, None

    async def encrypt_happ_link(self, link_to_encrypt: str) -> Optional[str]:
        """Encrypt a subscription link using the panel's happ crypt4 API.

        Returns the encrypted link string or None if encryption failed.
        """
        payload = {"linkToEncrypt": link_to_encrypt}
        response_data = await self._request(
            "POST",
            "/system/tools/happ/encrypt",
            json=payload,
            log_full_response=False
        )
        if response_data and not response_data.get("error") and "response" in response_data:
            return response_data.get("response", {}).get("encryptedLink")
        logging.error(f"Failed to encrypt happ link. Response: {response_data}")
        return None
