#!/usr/bin/env python3
"""Minimal Tauri/WebKit smoke suite through tauri-driver."""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BINARY = ROOT / "target/release/jey-desktop"
def _tool(name: str, fallback: pathlib.Path) -> pathlib.Path:
    explicit = os.environ.get(name)
    if explicit:
        return pathlib.Path(explicit)
    found = shutil.which(name.lower().replace("tauri_driver", "tauri-driver"))
    if name == "TAURI_DRIVER":
        found = found or shutil.which("tauri-driver")
    if found:
        return pathlib.Path(found)
    return fallback


DRIVER = _tool("TAURI_DRIVER", ROOT / ".toolchain/cargo/bin/tauri-driver")
NATIVE_DRIVER = _tool("WEBKIT_WEBDRIVER", pathlib.Path("/usr/bin/WebKitWebDriver"))
PORT = int(os.environ.get("SMOKE_PORT", "4460"))
NATIVE_PORT = PORT + 1


def http(method: str, path: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        f"http://127.0.0.1:{PORT}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.loads(response.read())


def call(session: str, script: str, args: list | None = None):
    return http("POST", f"/session/{session}/execute/sync", {"script": script, "args": args or []}).get("value")


def text(session: str) -> str:
    return call(session, "return document.body.innerText") or ""


def wait_for(session: str, predicate: str, timeout: float = 25) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if call(session, f"return Boolean({predicate})"):
            return
        time.sleep(0.2)
    raise AssertionError(f"timed out waiting for: {predicate}")


def click_text(session: str, label: str) -> None:
    ok = call(
        session,
        """const label=arguments[0];
        const els=[...document.querySelectorAll('button,a,[role=button]')];
        const el=els.find((e)=>e.textContent.trim().includes(label) && !e.disabled);
        if(!el) return false; el.click(); return true;""",
        [label],
    )
    if not ok:
        raise AssertionError(f"control not found: {label}")


def click_dialog_text(session: str, label: str) -> None:
    ok = call(
        session,
        """const label=arguments[0];
        const dialog=document.querySelector('dialog[open]');
        const el=dialog && [...dialog.querySelectorAll('button')].find((e)=>e.textContent.trim().includes(label));
        if(!el) return false; el.click(); return true;""",
        [label],
    )
    if not ok:
        raise AssertionError(f"dialog control not found: {label}")


def fill_label(session: str, label: str, value: str) -> None:
    ok = call(
        session,
        """const label=arguments[0], value=arguments[1];
        const lab=[...document.querySelectorAll('label')].find((e)=>e.textContent.trim().includes(label));
        const input=lab && (lab.control || document.getElementById(lab.htmlFor));
        if(!input) return false;
        const proto=input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        return true;""",
        [label, value],
    )
    if not ok:
        raise AssertionError(f"field not found: {label}")


def value_of(session: str, label: str) -> str:
    return call(
        session,
        """const label=arguments[0];
        const lab=[...document.querySelectorAll('label')].find((e)=>e.textContent.trim().includes(label));
        const input=lab && (lab.control || document.getElementById(lab.htmlFor));
        return input ? input.value : '';""",
        [label],
    )


def main() -> int:
    if not BINARY.is_file():
        print(f"missing desktop binary: {BINARY}", file=sys.stderr)
        return 2
    if not DRIVER.is_file() or not NATIVE_DRIVER.is_file():
        print("tauri-driver or WebKitWebDriver is missing", file=sys.stderr)
        return 2

    data = pathlib.Path(tempfile.mkdtemp(prefix="jey-desktop-smoke-"))
    env = os.environ.copy()
    env.update({
        "XDG_DATA_HOME": str(data),
        "XDG_CONFIG_HOME": str(data / "config"),
        "GDK_BACKEND": env.get("GDK_BACKEND", "x11"),
    })
    data.mkdir(parents=True, exist_ok=True)
    driver = subprocess.Popen(
        [str(DRIVER), "--port", str(PORT), "--native-port", str(NATIVE_PORT), "--native-driver", str(NATIVE_DRIVER)],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    session = None
    try:
        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                http("GET", "/status")
                break
            except Exception:
                time.sleep(0.2)
        session = http("POST", "/session", {
            "capabilities": {"alwaysMatch": {"tauri:options": {"application": str(BINARY)}}},
        })["value"]["sessionId"]

        # 1. The app launches and renders the public shell.
        wait_for(session, "document.title.includes('jey.net')")
        assert "jey.net" in text(session), "landing page did not render"

        # 2. Local access opens the notebook.
        call(session, "window.__TAURI__.core.invoke('local_bootstrap_access'); window.location.assign('/items'); true")
        wait_for(session, "document.body.innerText.includes('Мои записи')")
        print("ok 1/6 launch and local access")

        # 3. New item form exposes status and the back button immediately.
        call(session, "window.location.assign('/items/new'); true")
        wait_for(session, "document.body.innerText.includes('Добавить запись')")
        wait_for(session, "document.body.innerText.includes('Статус')")
        wait_for(session, "document.body.innerText.includes('Назад')")
        print("ok 2/6 status and back button")

        # 4. The whole form draft survives a webview reload.
        click_text(session, "Дополнительные настройки")
        fill_label(session, "Название", "Desktop smoke record")
        fill_label(session, "Публичная рецензия", "Desktop smoke draft")
        time.sleep(0.8)
        call(session, "window.location.reload(); true")
        wait_for(session, "document.body.innerText.includes('Черновик рецензии восстановлен')")
        assert value_of(session, "Название") == "Desktop smoke record"
        assert value_of(session, "Публичная рецензия") == "Desktop smoke draft"
        print("ok 3/6 draft survives reload")

        # 5. Clear form and draft.
        click_text(session, "Очистить")
        wait_for(session, "document.querySelector('dialog[open]')")
        click_dialog_text(session, "Очистить")
        wait_for(session, "!document.querySelector('dialog[open]')")
        assert value_of(session, "Название") == ""
        print("ok 4/6 clear form")

        # 6. A record saved locally is visible in the notebook.
        call(session, """window.__TAURI__.core.invoke('local_create_item', {
          newItem: {kind: 'movie', title: 'Smoke persisted record', status: 'done'}
        }); true""")
        call(session, "window.location.assign('/items'); true")
        wait_for(session, "document.body.innerText.includes('Smoke persisted record')")
        print("ok 5/6 local record persistence")

        # 6. Local trash screen opens without showing active records.
        call(session, "window.location.assign('/trash'); true")
        wait_for(session, "document.body.innerText.includes('Корзина')")
        print("ok 6/6 local trash and smoke suite complete")
        return 0
    finally:
        if session:
            try:
                http("DELETE", f"/session/{session}")
            except Exception:
                pass
        driver.terminate()
        try:
            driver.wait(timeout=5)
        except subprocess.TimeoutExpired:
            driver.kill()
        shutil.rmtree(data, ignore_errors=True)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"::error title=Desktop smoke::FAIL: {error}")
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
    except Exception as error:
        traceback.print_exc()
        print(f"::error title=Desktop smoke::{type(error).__name__}: {error}")
        raise
