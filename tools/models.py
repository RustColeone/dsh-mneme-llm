"""A chat model and an embedder made of rules, the same as tools/models.js: what the compatibility tests give
mneme-llm in place of a real model, so both sides are asked the same and answer the same, with no network.

    model(asked)   complete(system, user): each call is added to `asked`, and answered by what the system prompt asks
                   for (a judge's verdict, notes, a profile card, a summary, glosses, a translation)
    toy(texts)     an embedding: a direction for each of a few topics, in English or Chinese, one for each pair of the
                   floor's bundled set, and a little of each text
"""

from __future__ import annotations

import hashlib
import json

from mneme_llm.meaning.calibrate import TOPICS

KINDS = ["fact", "preference", "episode", "plan", "reflection", "thing"]
CONCEPTS = [["cat", 0], ["猫", 0], ["年糕", 0], ["mochi", 0], ["exam", 1], ["考试", 1], ["math", 1], ["数学", 1],
            ["tea", 2], ["茶", 2], ["coffee", 3], ["咖啡", 3], ["trip", 4], ["旅行", 4], ["shanghai", 4], ["上海", 4],
            ["cello", 5], ["大提琴", 5]]
ENGLISH = [["猫", "cat"], ["年糕", "mochi"], ["考试", "exam"], ["数学", "math"], ["茶", "tea"], ["咖啡", "coffee"],
           ["旅行", "trip"], ["上海", "shanghai"], ["大提琴", "cello"]]


def digest(text: str) -> int:
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16)


def two(number: int) -> str:
    return f"0.{number % 100:02d}"


def judge(user: str) -> str:
    found = []
    for line in user.split("\n"):
        if not line.startswith('- "'):
            continue
        name = line[3:line.index('"', 3)]
        d = digest(user + name)
        if "(yes/no)" in line:
            found.append(f'"{name}": {{"probability": {two(d)}}}')
            continue
        listed = line.split(" Values: " if "(choice)" in line else " Labels: ", 1)[1]
        labels = [part.split(" = ")[0] for part in listed.split("; ")]
        label = json.dumps(labels[d % len(labels)], ensure_ascii=False)
        if d % 13 == 0:
            label = '"nope"'
        elif d % 5 == 0 and "(score" in line:
            label = labels[d % len(labels)] + (".0" if d % 2 else "")
        field = "choice" if "(choice)" in line else "level"
        reason = f', "reason": "{"they said so" if d % 2 else "心里一动"}"' if d % 3 == 0 else ""
        found.append(f'"{name}": {{"{field}": {label}, "confidence": {two(d // 7)}{reason}}}')
    return "Here you go: {" + ", ".join(found) + "} (that is all)"


def writer(user: str) -> str:
    items = []
    for line in user.split("\n"):
        d = digest(line)
        if d % 3 == 0 or len(items) >= 2 or ": " not in line:
            continue
        text = line.split(": ", 1)[1]
        kind = KINDS[d % 6]
        feeling = d // 8 % 21 - 10
        fields = [f'"text": {json.dumps(text, ensure_ascii=False)}', f'"kind": "{kind}"',
                  f'"importance": "{1 + d % 5}"' if d % 19 == 0 else f'"importance": {1 + d % 5}',
                  f'"feeling": {"-" if feeling < 0 else ""}{abs(feeling) // 10}.{abs(feeling) % 10}']
        if d % 4 == 0:
            fields.append(f'"key": "topic.k{d % 3}"')
        if kind in ("plan", "episode") and d % 2 == 0:
            fields.append(f'"date": "2026-01-{1 + d % 28:02d}"')
        if d % 2:
            fields.append(f'"gloss": {json.dumps("EN " + text, ensure_ascii=False)}')
        items.append("{" + ", ".join(fields) + "}")
    return "[" + ", ".join(items) + "]"


def glosses(user: str) -> str:
    notes = [line.split(". ", 1)[1] for line in user.split("\n") if ". " in line]
    if digest(user) % 5 == 0:
        notes = notes[:-1]
    return json.dumps(["EN " + translate(note) for note in notes], ensure_ascii=False, separators=(",", ":"))


def translate(user: str) -> str:
    return " ".join(english for word, english in ENGLISH if word in user) or "nothing"


def reply(system: str, user: str) -> str:
    if system.startswith("You judge"):
        return judge(user)
    if system.startswith("From the exchange below"):
        return writer(user)
    if system.startswith("Write a short impression"):
        return f"Card {digest(system) % 1000}: " + system.split("\n")[-1]
    if system.startswith("Below is the older part"):
        return f"Summary {digest(system) % 1000}."
    if system.startswith("Rewrite each numbered note"):
        return glosses(user)
    if system.startswith("Translate the text"):
        return translate(user)
    return ""


def model(asked: list):
    async def complete(system: str, user: str) -> str:
        asked.append([system, user])
        return reply(system, user)
    return complete


def toy(texts):
    vectors = []
    for text in texts:
        vector = [0.0] * (12 + len(TOPICS))
        vector[11] = 0.2
        low = text.lower()
        for word, axis in CONCEPTS:
            if word in low:
                vector[axis] += 1.0
        for axis, (_, said, note) in enumerate(TOPICS, 12):
            if text in (said, note):
                vector[axis] += 1.0
        for character in text:
            vector[6 + ord(character) % 5] += 0.01
        vectors.append(vector)
    return vectors
