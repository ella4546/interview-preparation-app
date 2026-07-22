"""LLM client (Groq) for question generation and answer grading.

File is still named gemini_client.py to avoid touching all the imports —
under the hood it now calls Groq's Llama models.
"""
import json
import logging
from typing import Any

from groq import Groq

from app.config import get_settings

logger = logging.getLogger(__name__)


def _client() -> Groq:
    settings = get_settings()
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not set in .env")
    return Groq(api_key=settings.groq_api_key)


def _chat(prompt: str, json_mode: bool = False) -> str:
    settings = get_settings()
    client = _client()
    kwargs: dict[str, Any] = {
        "model": settings.groq_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content.strip()


def generate_question(topic: str, difficulty: str, avoid: list[str] | None = None) -> str:
    avoid_block = ""
    if avoid:
        joined = "\n".join(f"- {q}" for q in avoid[:5])
        avoid_block = f"\n\nThe candidate has already been asked these questions — DO NOT repeat or rephrase them:\n{joined}"

    prompt = f"""You are an interviewer generating a technical interview question.

Topic: {topic.replace('_', ' ')}
Difficulty: {difficulty}{avoid_block}

Generate exactly ONE interview question on this topic at this difficulty.
Rules:
- Return ONLY the question text, no preamble, no numbering, no markdown.
- The question should be answerable in 3-8 sentences of prose.
- Explore a DIFFERENT angle or subtopic than any listed above.
- Do not include the answer.
"""
    return _chat(prompt)


def grade_answer(question: str, answer: str) -> dict[str, Any]:
    prompt = f"""You are a strict but fair technical interviewer grading a candidate's answer.

QUESTION:
{question}

CANDIDATE'S ANSWER:
{answer}

Grade the answer and return ONLY valid JSON matching this exact schema:
{{
  "score": <integer 0-10>,
  "correct": <true if score >= 8, else false>,
  "verdict": "<'correct' if score >= 8, 'partial' if 4-7, 'incorrect' if 0-3>",
  "feedback": "<2-4 sentences of specific, actionable feedback>",
  "missed_concepts": [<list of key concepts the answer failed to cover, max 5 strings>],
  "strong_concepts": [<list of concepts the answer handled well, max 5 strings>]
}}

Return ONLY the JSON object, no markdown fences, no explanation.
"""
    text = _chat(prompt, json_mode=True)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.exception("LLM returned malformed JSON: %s", text)
        return {
            "score": 0,
            "correct": False,
            "verdict": "incorrect",
            "feedback": "We couldn't grade your answer this time. Please try again.",
            "missed_concepts": [],
            "strong_concepts": [],
        }


def generate_hint(question: str) -> str:
    prompt = f"""You are a helpful tutor. Give a SHORT hint (1-2 sentences) for this question.
The hint should nudge the candidate toward the right direction WITHOUT revealing the answer.

QUESTION:
{question}

Return ONLY the hint text.
"""
    return _chat(prompt)


def follow_up_question(history: list[dict[str, str]], topic: str) -> str:
    formatted = "\n\n".join(
        f"{turn['role'].upper()}: {turn['content']}" for turn in history
    )
    prompt = f"""You are conducting a mock technical interview on '{topic.replace('_', ' ')}'.

Prior conversation:
{formatted}

Ask the next question. If the candidate's last answer was weak, drill deeper into that weakness.
If it was strong, move to a related but different concept.
Return ONLY the next question, no preamble.
"""


# ============================================================
# Mock Interview functions
# ============================================================

def interview_opener(focus: str, display_name: str | None = None) -> str:
    """First message of the interview — greeting + first question."""
    name_part = f", {display_name}" if display_name else ""
    prompt = f"""You are a friendly but professional senior software engineer conducting a technical mock interview.

The candidate wants to practice for a: {focus}

Write your OPENING message to the candidate. It must:
1. Greet them warmly by name (Hi{name_part})
2. Briefly state what the interview will cover (1 sentence)
3. Ask your FIRST question — a solid opener that's not too hard, not too easy

Keep it conversational, like you would actually speak. 3-5 short sentences total.
Return ONLY the message text — no quotes, no preamble, no formatting.
"""
    return _chat(prompt)


def interview_next_turn(focus: str, transcript: list[dict[str, str]]) -> str:
    """Given the conversation so far, generate the interviewer's next message."""
    formatted = "\n\n".join(
        f"{'INTERVIEWER' if t['role'] == 'interviewer' else 'CANDIDATE'}: {t['content']}"
        for t in transcript
    )
    prompt = f"""You are a friendly but professional senior software engineer conducting a technical mock interview.

Focus area: {focus}

CONVERSATION SO FAR:
{formatted}

Generate your NEXT message as the interviewer. Rules:
- React specifically to what the candidate just said (acknowledge good points briefly, note if something was unclear).
- If their last answer was weak or missed key concepts, ask a follow-up that probes deeper on that specific weakness.
- If their last answer was strong, move to a related but different concept.
- Do NOT reveal correct answers or grade them numerically. This is a natural conversation, not feedback yet.
- Keep it to 2-4 sentences, like a real person speaking.
- Do NOT number your questions.

Return ONLY your next message, no formatting or preamble.
"""
    return _chat(prompt)


def interview_evaluate(focus: str, transcript: list[dict[str, str]]) -> dict:
    """After the interview ends, produce a structured evaluation."""
    formatted = "\n\n".join(
        f"{'INTERVIEWER' if t['role'] == 'interviewer' else 'CANDIDATE'}: {t['content']}"
        for t in transcript
    )
    prompt = f"""You are a senior engineering hiring manager who just finished conducting a technical mock interview.

Focus area: {focus}

FULL TRANSCRIPT:
{formatted}

Produce a structured evaluation as JSON with EXACTLY this schema:
{{
  "overall_score": <integer 0-10>,
  "hire_recommendation": "<'strong hire' | 'hire' | 'lean no hire' | 'no hire'>",
  "technical_depth": <integer 0-10>,
  "communication": <integer 0-10>,
  "problem_solving": <integer 0-10>,
  "summary": "<2-3 sentence overall assessment>",
  "strengths": [<up to 3 specific strength bullets, each 1 sentence>],
  "weaknesses": [<up to 3 specific weakness bullets, each 1 sentence>],
  "study_recommendations": [<up to 3 specific topics to study next, each 1 short phrase>]
}}

Be honest and specific. Reference what the candidate actually said. Return ONLY the JSON object, no fences, no explanation.
"""
    text = _chat(prompt, json_mode=True)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.exception(
            "Interview evaluation returned malformed JSON: %s", text)
        return {
            "overall_score": 0,
            "hire_recommendation": "no hire",
            "technical_depth": 0,
            "communication": 0,
            "problem_solving": 0,
            "summary": "We couldn't fully evaluate this interview due to a system error. Please try again.",
            "strengths": [],
            "weaknesses": [],
            "study_recommendations": [],
        }
    return _chat(prompt)
