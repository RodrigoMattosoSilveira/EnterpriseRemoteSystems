#!/usr/bin/env python3
"""Prompt on the controlling terminal; emit exactly one JSON input document to stdout.

Pipe directly to enroll-human-admins; never redirect stdout to disk or capture it in
shell history/logs. Passwords are never supplied as command-line arguments.
"""
import getpass
import json
import re
import sys

ACTOR = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@-]{0,119}$")


def read_visible(label):
    print(label, end="", file=sys.stderr, flush=True)
    return input()


def prepare(prompt=None, secret=getpass.getpass):
    if prompt is None:
        prompt = read_visible
    people = []
    for number in (1, 2):
        print(f"Human administrator {number} (new identity only)", file=sys.stderr)
        actor = prompt("Actor key: ").strip()
        name = prompt("Display name: ").strip()
        login = prompt("Login: ").strip().lower()
        password = secret("Initial password (12–72 UTF-8 bytes): ")
        repeat = secret("Repeat initial password: ")
        if not ACTOR.fullmatch(actor) or not name or len(name) > 120 or any(c in name for c in '\r\n\0'):
            raise ValueError(f"administrator {number}: invalid actor key or display name")
        if not login or len(login) > 254 or any(c in login for c in '\r\n\0'):
            raise ValueError(f"administrator {number}: invalid login")
        if password != repeat or len(password) < 12 or len(password.encode("utf-8")) > 72 or any(c in password for c in '\r\n\0'):
            raise ValueError(f"administrator {number}: invalid or mismatched password")
        people.append({"actorKey": actor, "displayName": name, "login": login, "password": password})
    if (people[0]["actorKey"].lower() == people[1]["actorKey"].lower()
            or people[0]["login"] == people[1]["login"]
            or people[0]["password"] == people[1]["password"]):
        raise ValueError("both administrators must have different actor keys, logins and initial passwords")
    return {"administrators": people}


def main():
    try:
        data = prepare()
    except (ValueError, EOFError, KeyboardInterrupt) as exc:
        # No contents of the entered fields are included in errors.
        print(f"Credential input cancelled or invalid: {type(exc).__name__}", file=sys.stderr)
        return 1
    json.dump(data, sys.stdout, separators=(",", ":"))
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
