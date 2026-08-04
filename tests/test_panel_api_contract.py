"""Сверяет пути, которые дёргает panel_client, с OpenAPI-спекой Remnawave 3.2.1.

Живого стенда с v3 нет, так что это единственная защита от опечатки в URL
и от вызова эндпоинта, удалённого в мажорной версии.
"""
import ast
import json
import pathlib

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
CLIENT = REPO_ROOT / "core" / "services" / "panel_client.py"
SPEC = REPO_ROOT / "docs" / "remnawave-openapi-3.2.1.json"

# PANEL_API_URL уже оканчивается на /api, поэтому пути в клиенте пишутся без него.
API_PREFIX = "/api"

# Два метода собирают последний сегмент пути из переменной. Раскрываем его явно,
# чтобы тест сверял конкретные значения, а не «любой сегмент».
DYNAMIC_EXPANSIONS = {
    ("POST", "/users/{}/actions/{}"): [
        "/users/{}/actions/enable",
        "/users/{}/actions/disable",
    ],
    ("POST", "/nodes/{}/actions/{}"): [
        "/nodes/{}/actions/enable",
        "/nodes/{}/actions/disable",
        "/nodes/{}/actions/restart",
    ],
}


def _literal(node: ast.AST):
    """Строковый литерал или f-строка, где подстановки заменены на '{}'."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        parts = []
        for chunk in node.values:
            if isinstance(chunk, ast.Constant):
                parts.append(str(chunk.value))
            else:
                parts.append("{}")
        return "".join(parts)
    return None


def _local_strings(fn: ast.AST) -> dict:
    """Локальные `name = "..."` / `name = f"..."` внутри одной функции.

    Половина методов клиента кладёт путь в переменную `endpoint` и лишь потом
    передаёт её в _request, поэтому одних литералов в аргументах недостаточно.

    Ограничение: ветвления не разбираются — если функция присваивает `endpoint`
    несколько раз, побеждает последнее значение. Держите в каждом методе клиента
    один путь, иначе часть вызовов останется непроверенной.
    """
    assigned = {}
    for node in ast.walk(fn):
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        value = _literal(node.value)
        if value is not None:
            assigned[target.id] = value
    return assigned


def collect_client_endpoints():
    tree = ast.parse(CLIENT.read_text(encoding="utf-8"))
    found = []
    for fn in ast.walk(tree):
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        assigned = _local_strings(fn)

        def resolve(node):
            direct = _literal(node)
            if direct is not None:
                return direct
            if isinstance(node, ast.Name):
                return assigned.get(node.id)
            return None

        for node in ast.walk(fn):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if not (isinstance(func, ast.Attribute) and func.attr == "_request"):
                continue
            if len(node.args) < 2:
                continue
            method = resolve(node.args[0])
            path = resolve(node.args[1])
            if method is None or path is None:
                pytest.fail(
                    f"panel_client.py:{node.lineno}: _request вызван с невычислимым "
                    "методом или путём — контрактный тест не сможет его проверить"
                )
            found.append((method.upper(), path))
    return found


def expand(method: str, path: str):
    return DYNAMIC_EXPANSIONS.get((method, path), [path])


def spec_index():
    """{ '/api/users/{userId}': {'GET', 'DELETE'} }"""
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    index = {}
    for raw_path, operations in spec["paths"].items():
        index.setdefault(raw_path, set()).update(m.upper() for m in operations)
    return index


def matches(client_path: str, spec_path: str) -> bool:
    left = client_path.strip("/").split("/")
    right = spec_path.strip("/").split("/")
    if len(left) != len(right):
        return False
    for ours, theirs in zip(left, right):
        if ours == "{}":
            if not (theirs.startswith("{") and theirs.endswith("}")):
                return False
        elif ours != theirs:
            return False
    return True


@pytest.mark.parametrize("method,path", collect_client_endpoints())
def test_endpoint_exists_in_spec(method: str, path: str):
    index = spec_index()
    for concrete in expand(method, path):
        full = API_PREFIX + concrete
        hit = [
            spec_path
            for spec_path, methods in index.items()
            if method in methods and matches(full, spec_path)
        ]
        assert hit, (
            f"{method} {full} отсутствует в Remnawave 3.2.1 OpenAPI. "
            "Эндпоинт удалён или переименован в v3."
        )
