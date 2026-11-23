#!/usr/bin/env python3
"""Small stdlib load harness for T202.

Scenarios:
  public  GET /health and /public/users
  auth    authenticated /items, /feed, /stats, /me
  sse     authenticated notification streams

Usage:
  python3 scripts/load-test.py --base-url http://127.0.0.1:8091 --scenario auth --vus 20 --seconds 15
  python3 scripts/load-test.py --base-url https://j3ynet.site --scenario public --vus 5 --seconds 10
"""
from __future__ import annotations

import argparse
import http.client
import json
import statistics
import threading
import time
import uuid
from dataclasses import dataclass
from urllib.parse import urlparse

PATHS = {
    "auth": [
        "/api/v1/items?limit=20",
        "/api/v1/stats",
        "/api/v1/me",
    ],
    "public": ["/api/v1/health", "/api/v1/public/users?limit=10"],
}


@dataclass
class Result:
    status: int
    ms: float


class Client:
    def __init__(self, base: str, cookie: str | None = None) -> None:
        parsed = urlparse(base)
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or (443 if parsed.scheme == "https" else 80)
        self.https = parsed.scheme == "https"
        self.cookie = cookie
        self.conn: http.client.HTTPConnection | None = None
        self.origin = base.rstrip("/")
        self.last_set_cookie: str | None = None

    def _connection(self) -> http.client.HTTPConnection:
        if self.conn is None:
            factory = http.client.HTTPSConnection if self.https else http.client.HTTPConnection
            self.conn = factory(self.host, self.port, timeout=10)
        return self.conn

    def request(self, method: str, path: str, body: dict | None = None) -> Result:
        started = time.perf_counter()
        headers = {"Origin": self.origin, "Accept": "application/json"}
        if self.cookie:
            headers["Cookie"] = self.cookie
        payload = None
        if body is not None:
            payload = json.dumps(body)
            headers["Content-Type"] = "application/json"
        status = 0
        for attempt in range(2):
            try:
                conn = self._connection()
                conn.request(method, path, body=payload, headers=headers)
                response = conn.getresponse()
                self.last_set_cookie = response.getheader("Set-Cookie")
                response.read()
                status = response.status
                break
            except (OSError, http.client.HTTPException):
                if self.conn:
                    self.conn.close()
                self.conn = None
                status = 0
                if attempt == 0:
                    time.sleep(0.05)
        return Result(status, (time.perf_counter() - started) * 1000)

    def close(self) -> None:
        if self.conn:
            self.conn.close()


def register(base: str) -> Client:
    client = Client(base)
    email = f"load-{uuid.uuid4().hex[:12]}@example.test"
    response = client.request("POST", "/api/v1/auth/register", {
        "email": email,
        "password": "correct horse battery",
        "display_name": "Load Tester",
    })
    if response.status != 201:
        raise SystemExit(f"register failed: {response.status}")
    if not client.last_set_cookie:
        raise SystemExit("registration did not set a session cookie")
    client.cookie = client.last_set_cookie.split(";", 1)[0]
    return client

def seed_items(client: Client, count: int) -> None:
    for index in range(count):
        response = client.request("POST", "/api/v1/items", {
            "kind": "movie",
            "title": f"Load item {index}",
            "status": "done",
            "rating": 8,
            "review": "load test",
        })
        if response.status != 201:
            raise SystemExit(f"seed item failed: {response.status}")


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * fraction))]


def run_http(base: str, scenario: str, vus: int, seconds: int, cookie: str | None) -> dict:
    results: list[Result] = []
    lock = threading.Lock()
    stop = threading.Event()

    def worker(worker_id: int) -> None:
        client = Client(base, cookie)
        paths = PATHS[scenario]
        index = worker_id
        local: list[Result] = []
        while not stop.is_set():
            result = client.request("GET", paths[index % len(paths)])
            index += 1
            local.append(result)
        client.close()
        with lock:
            results.extend(local)

    threads = [threading.Thread(target=worker, args=(index,)) for index in range(vus)]
    started = time.time()
    for thread in threads:
        thread.start()
    time.sleep(seconds)
    stop.set()
    for thread in threads:
        thread.join(timeout=15)
    elapsed = time.time() - started
    latencies = [result.ms for result in results]
    statuses: dict[str, int] = {}
    for result in results:
        key = str(result.status)
        statuses[key] = statuses.get(key, 0) + 1
    return {
        "scenario": scenario,
        "vus": vus,
        "seconds": round(elapsed, 2),
        "requests": len(results),
        "rps": round(len(results) / elapsed, 1) if elapsed else 0,
        "errors": sum(1 for result in results if result.status == 0 or result.status >= 500),
        "non_2xx": sum(1 for result in results if result.status < 200 or result.status >= 300),
        "statuses": statuses,
        "p50_ms": round(percentile(latencies, 0.50), 1),
        "p95_ms": round(percentile(latencies, 0.95), 1),
        "p99_ms": round(percentile(latencies, 0.99), 1),
    }


def run_sse(base: str, vus: int, seconds: int, cookie: str) -> dict:
    stop = threading.Event()
    connected = []
    lock = threading.Lock()

    def worker() -> None:
        parsed = urlparse(base)
        factory = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        conn = factory(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), timeout=15)
        try:
            conn.request("GET", "/api/v1/notifications/stream", headers={
                "Accept": "text/event-stream",
                "Cookie": cookie,
                "Origin": base.rstrip("/"),
            })
            response = conn.getresponse()
            with lock:
                connected.append(response.status)
            while not stop.is_set():
                line = response.readline()
                if not line:
                    break
        except (OSError, http.client.HTTPException):
            with lock:
                connected.append(0)
        finally:
            conn.close()

    threads = [threading.Thread(target=worker) for _ in range(vus)]
    for thread in threads:
        thread.start()
    time.sleep(seconds)
    stop.set()
    for thread in threads:
        thread.join(timeout=10)
    return {
        "scenario": "sse",
        "vus": vus,
        "seconds": seconds,
        "connected": sum(1 for status in connected if status == 200),
        "failed": sum(1 for status in connected if status != 200),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8091")
    parser.add_argument("--scenario", choices=("public", "auth", "sse"), default="public")
    parser.add_argument("--vus", type=int, default=10)
    parser.add_argument("--seconds", type=int, default=10)
    parser.add_argument("--seed-items", type=int, default=20)
    args = parser.parse_args()

    cookie = None
    if args.scenario in ("auth", "sse"):
        client = register(args.base_url)
        if args.scenario == "auth":
            seed_items(client, args.seed_items)
        cookie = client.cookie
        client.close()

    if args.scenario == "sse":
        result = run_sse(args.base_url, args.vus, args.seconds, cookie or "")
    else:
        result = run_http(args.base_url, args.scenario, args.vus, args.seconds, cookie)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
