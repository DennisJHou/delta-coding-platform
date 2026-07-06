#!/usr/bin/env python3
"""
build_data.py  —  Convert the parsed long-tables into the coding platform's
unified JSON format.

Inputs  (from ../../journal_analysis/data/):
    S1_turns_long.csv     285 exchanges, 25 people   (Study 1, turn-level)
    S2_pairs_long.csv     1229 pairs, 120 dialogues  (Study 2, pair-level)

Outputs (to ../data/):
    S1_dialogues.json
    S2_dialogues.json
    manifest.json         index the app loads first

Unified schema (identical for both studies so the UI treats them the same):
    dialogue = {
        session_id, study, pid, meta{...},
        exchanges: [ {index, user_text, bot_text, orig_rating, meta{...}} ]
    }
An "exchange" is one rating unit: a user utterance + the bot's reply to it.
"""

import csv, json, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.normpath(os.path.join(HERE, "..", "..", "journal_analysis", "data"))
OUT  = os.path.normpath(os.path.join(HERE, "..", "data"))


def clean(s):
    """Trim; treat lone-space / 'NA' / '' as None."""
    if s is None:
        return None
    s = s.strip()
    return None if s in ("", "NA", "N/A") else s


def to_num(s):
    s = clean(s)
    if s is None:
        return None
    try:
        f = float(s)
        return int(f) if f.is_integer() else f
    except ValueError:
        return None


def build_s1(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    by_pid = defaultdict(list)
    for r in rows:
        by_pid[r["pID"]].append(r)

    dialogues = []
    for pid, turns in by_pid.items():
        turns.sort(key=lambda r: int(r["turn"]))
        exchanges = []
        for r in turns:
            exchanges.append({
                "index": int(r["turn"]),
                "user_text": clean(r["user_text"]) or "",
                "bot_text": clean(r["bot_text"]) or "",
                "orig_rating": to_num(r.get("human_rating")),
                "meta": {
                    "stage": clean(r.get("stage")),
                    "latency_s": to_num(r.get("bot_latency_s")),
                },
            })
        dialogues.append({
            "session_id": f"S1_p{pid}",
            "study": "S1",
            "pid": pid,
            "meta": {
                "topic": clean(turns[0].get("topic")),
                "n_turns": len(exchanges),
            },
            "exchanges": exchanges,
        })
    dialogues.sort(key=lambda d: int(d["pid"]))
    return dialogues


def build_s2(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    by_sess = defaultdict(list)
    for r in rows:
        by_sess[(r["pID"], r["suffix"])].append(r)

    dialogues = []
    for (pid, suffix), pairs in by_sess.items():
        pairs.sort(key=lambda r: int(r["pair_index"]))
        exchanges = []
        for r in pairs:
            exchanges.append({
                "index": int(r["pair_index"]),
                "user_text": clean(r["user_text"]) or "",
                "bot_text": clean(r["bot_text"]) or "",
                "orig_rating": to_num(r.get("human_rating")),
                "meta": {},
            })
        dialogues.append({
            "session_id": f"S2_{pid}_{suffix}",
            "study": "S2",
            "pid": pid,
            "meta": {
                "suffix": suffix,
                "issue": clean(pairs[0].get("issue")),
                "n_pairs": len(exchanges),
            },
            "exchanges": exchanges,
        })
    dialogues.sort(key=lambda d: d["session_id"])
    return dialogues


def write_json(obj, name):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    kb = os.path.getsize(path) / 1024
    return path, kb


def main():
    os.makedirs(OUT, exist_ok=True)
    s1_path = os.path.join(SRC, "S1_turns_long.csv")
    s2_path = os.path.join(SRC, "S2_pairs_long.csv")
    for p in (s1_path, s2_path):
        if not os.path.exists(p):
            sys.exit(f"ERROR: missing source file {p}")

    s1 = build_s1(s1_path)
    s2 = build_s2(s2_path)

    _, kb1 = write_json({"study": "S1", "dialogues": s1}, "S1_dialogues.json")
    _, kb2 = write_json({"study": "S2", "dialogues": s2}, "S2_dialogues.json")

    manifest = {
        "generated_by": "tools/build_data.py",
        "studies": [
            {"key": "S1", "label": "研究一 — 文字聊天機器人",
             "file": "data/S1_dialogues.json",
             "n_dialogues": len(s1),
             "n_exchanges": sum(len(d["exchanges"]) for d in s1)},
            {"key": "S2", "label": "研究二 — 社交機器人",
             "file": "data/S2_dialogues.json",
             "n_dialogues": len(s2),
             "n_exchanges": sum(len(d["exchanges"]) for d in s2)},
        ],
    }
    write_json(manifest, "manifest.json")

    print("Wrote:")
    for s in manifest["studies"]:
        print(f"  {s['key']}: {s['n_dialogues']:>3} dialogues, "
              f"{s['n_exchanges']:>4} exchanges  -> {s['file']}")
    print(f"  S1_dialogues.json {kb1:6.0f} KB")
    print(f"  S2_dialogues.json {kb2:6.0f} KB")
    print("  manifest.json")


if __name__ == "__main__":
    main()
