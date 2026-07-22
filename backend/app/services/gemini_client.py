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
    return _chat(prompt)
