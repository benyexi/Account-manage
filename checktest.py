#!/usr/bin/env python3
"""Bounded TCP connectivity checker used by the web task panel."""

import argparse
import ipaddress
import json
import socket
import time
from datetime import datetime, timezone


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def parse_args():
    parser = argparse.ArgumentParser(description="TCP connectivity checker")
    parser.add_argument("ip")
    parser.add_argument("port", type=int)
    parser.add_argument("duration", type=int)
    args = parser.parse_args()
    ipaddress.ip_address(args.ip)
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if not 1 <= args.duration <= 320:
        parser.error("duration must be between 1 and 320 seconds")
    return args


def main():
    args = parse_args()
    deadline = time.monotonic() + args.duration

    while True:
        started = time.monotonic()
        reachable = False
        error = ""
        try:
            with socket.create_connection((args.ip, args.port), timeout=3):
                reachable = True
        except OSError as exc:
            error = str(exc)[:200]

        emit(
            {
                "event": "check",
                "checkedAt": iso_now(),
                "reachable": reachable,
                "latencyMs": round((time.monotonic() - started) * 1000),
                "error": error,
            }
        )

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        time.sleep(min(5, remaining))

    emit({"event": "complete", "finishedAt": iso_now()})


if __name__ == "__main__":
    main()
