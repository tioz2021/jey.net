# Load test and instance decision (T202)

Harness: `scripts/load-test.py` (Python stdlib, no k6/oha dependency).

## VPS preview: 100 active users

26 ноября 2026. Цель — не loopback, а реальный VPS с 1 vCPU / 1.9 GB.

```text
target:   preview API 127.0.0.1:8094 через SSH tunnel
schema:   jey_preview
user:     один preview-аккаунт
paths:    /items, /stats, /me
think:    500 ms на запрос
duration: 30 s
```

| VUs | RPS | p50 | p95 | p99 | Errors |
|---:|---:|---:|---:|---:|---:|
| 10 | 17.7 | 76.0 ms | 120.5 ms | 133.4 ms | 0 |
| 50 | 91.9 | 42.4 ms | 80.5 ms | 132.9 ms | 0 |
| 100 | 185.3 | 42.1 ms | 77.4 ms | 115.2 ms | 0 |

Во время прогона:

```text
CPU user:   5.6%
CPU sys:    2.7%
CPU idle:  83.8%
DB conns:  12 / 30
RAM used:  ~420 MB
```

Вывод: **100 активных пользователей проходят с запасом** для
authenticated read API. 100 VUs с think 500 ms — это ~185 req/s, более
интенсивный режим, чем обычные 100 людей в интерфейсе.

### Connection headroom

До теста preview использовал pool 10, production — ещё 10, и на VPS было
29/30 соединений. Добавлен `DB_POOL_MAX`; production оставлен 10, preview
получил 4. После изменения:

```text
DB connections: 12 / 30
```

Это важно: CPU был свободен, а connection headroom был почти нулевым.

### Ограничения теста

- target — API через SSH tunnel, без Caddy/TLS;
- один пользователь, read-only paths;
- feed, запись, SSE и media не входят в этот прогон;
- external preview с basic auth под длинной конкурентной нагрузкой
  показывает нестабильные 401 — это ограничение preview, не production.

## Local isolated API


Environment: loopback, isolated `jey_e2e` schema, PostgreSQL on the same machine.
This measures application overhead, not production network/database capacity.

| Scenario | VUs | Duration | RPS | p50 | p95 | p99 | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| auth: items/stats/me | 10 | 10 s | 6 737 | 1.4 ms | 2.5 ms | 3.3 ms | 0 |
| auth: items/stats/me | 50 | 10 s | 6 893 | 5.7 ms | 18.0 ms | 25.8 ms | 0 |
| public: health/users | 2 | 5 s | 327 | 5.7 ms | 7.4 ms | 10.5 ms | 1 341×429 |
| SSE notifications | 20 | 5 s | — | — | — | — | 20/20 connected |

Public 429s are expected: the public surface is capped at 300 requests/minute
per IP. SSE connections stayed open without failures.

## Production health probe

```text
ab -n 200 -c 10 https://j3ynet.site/health
48 req/s, mean 208 ms, 0 failed
```

This is network/TLS and health only, not authenticated catalogue load.

## Decision

**Stay on one API instance for now.**

Reasons:

- 100 active users проверены на VPS: p95 77 ms, CPU idle 84%;
- one VPS and one PostgreSQL are already the availability boundary;
- a second process on the same VPS does not remove that boundary;
- current personal traffic is far below the measured local ceiling;
- the operational cost of T190, shared media and worker ownership is not
  justified yet.

## Triggers to revisit

Move to two instances when any of these is true:

1. p95 authenticated API latency stays above 200 ms at peak;
2. API CPU or PostgreSQL connections stay above 70% at peak;
3. zero-downtime deploys become required;
4. sustained SSE concurrency approaches the current comfortable range;
5. a second VPS with shared/managed PostgreSQL and media is funded.

Before two instances: implement T190 (cross-instance notifications), move
background jobs to one owner, and share media storage.

## Связанный план

Практический план роста: [scaling.md](scaling.md).
