"""XP, level, and streak calculations."""

HINT_COST_XP = 3


def xp_for_answer(score: int, hints_used: int = 0) -> int:
    """Compute XP awarded for a single graded answer."""
    if score >= 8:
        base = 10
    elif score >= 5:
        base = 3
    else:
        base = 0
    return max(0, base - hints_used * HINT_COST_XP)


def xp_for_next_level(current_level: int) -> int:
    """Total XP needed to reach the next level from the current one."""
    return 100 * current_level


def level_for_total_xp(total_xp: int) -> tuple[int, int, int]:
    """
    Given cumulative XP, return (level, xp_into_current_level, xp_for_next_level).
    Uses a linear-per-level curve: level n requires 100*n XP.
    """
    level = 1
    remaining = total_xp
    while remaining >= xp_for_next_level(level):
        remaining -= xp_for_next_level(level)
        level += 1
    return level, remaining, xp_for_next_level(level)


def verdict_for_score(score: int) -> str:
    if score >= 8:
        return "correct"
    if score >= 4:
        return "partial"
    return "incorrect"