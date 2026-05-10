from __future__ import annotations

import json
from pathlib import Path


BANK_PATH = Path("data/question-bank.json")
VALID_DIFFICULTIES = {"easy", "medium", "hard"}


def main() -> None:
    bank = json.loads(BANK_PATH.read_text(encoding="utf-8"))
    seen_ids = set()
    errors = []

    for subject in bank.get("subjects", []):
        topic_ids = {topic["id"] for topic in subject.get("topics", [])}
        for question in subject.get("questions", []):
            prefix = question.get("id", "<missing id>")
            if prefix in seen_ids:
                errors.append(f"{prefix}: duplicated id")
            seen_ids.add(prefix)
            if question.get("topicId") not in topic_ids:
                errors.append(f"{prefix}: unknown topicId {question.get('topicId')}")
            options = question.get("options", [])
            if len(options) != 4:
                errors.append(f"{prefix}: expected 4 options")
            correct = question.get("correctIndex")
            if not isinstance(correct, int) or correct < 0 or correct >= len(options):
                errors.append(f"{prefix}: invalid correctIndex")
            if question.get("difficulty", "medium") not in VALID_DIFFICULTIES:
                errors.append(f"{prefix}: invalid difficulty")
            for field in ("prompt", "explanation", "source"):
                if not question.get(field):
                    errors.append(f"{prefix}: missing {field}")

    if errors:
        print("Invalid bank:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)

    total = sum(len(subject.get("questions", [])) for subject in bank.get("subjects", []))
    print(f"OK: {total} questions validated.")


if __name__ == "__main__":
    main()
