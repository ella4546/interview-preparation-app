const API_URL = ((import.meta.env as any).VITE_API_URL || 'http://localhost:8000') as string;

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Topic = string;


export interface Question {
    id: string;
    topic: Topic;
    difficulty: Difficulty;
    question_text: string;
}

export interface GradeResult {
    score: number;
    correct: boolean;
    verdict: string;
    feedback: string;
    missed_concepts: string[];
    strong_concepts: string[];
    xp_earned: number;
}

export interface Video {
    video_id: string;
    title: string;
    channel: string;
    thumbnail_url: string;
    url: string;
}

export interface TopicProgress {
    topic: string;
    mastery_percent: number;
    attempts: number;
}

export interface ProgressStats {
    user_id: string;
    total_solved: number;
    accuracy_percent: number;
    hints_used: number;
    current_xp: number;
    xp_for_next_level: number;
    current_level: number;
    current_streak: number;
    longest_streak: number;
    topics: TopicProgress[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${res.status}: ${text}`);
    }
    return res.json();
}

export const api = {
    generateQuestion(topic: Topic, difficulty: Difficulty = 'medium', avoid: string[] = []): Promise<Question> {
        return request('/questions/generate', {
            method: 'POST',
            body: JSON.stringify({ topic, difficulty, avoid }),
        });
    },
    gradeAnswer(
        questionId: string,
        questionText: string,
        answerText: string,
        hintsUsed = 0
    ): Promise<GradeResult> {
        return request('/answers/grade', {
            method: 'POST',
            body: JSON.stringify({
                question_id: questionId,
                question_text: questionText,
                answer_text: answerText,
                hints_used: hintsUsed,
            }),
        });
    },
    getHint(questionId: string, questionText: string): Promise<{ hint: string; xp_cost: number }> {
        return request('/questions/hint', {
            method: 'POST',
            body: JSON.stringify({ question_id: questionId, question_text: questionText }),
        });
    },
    getVideos(concept: string): Promise<{ concept: string; videos: Video[] }> {
        return request(`/videos/for-concept?concept=${encodeURIComponent(concept)}`);
    },
    getProgress(userId: string): Promise<ProgressStats> {
        return request(`/progress/${encodeURIComponent(userId)}`);
    },

    startInterview(focus: string, displayName?: string): Promise<{ opening_message: string }> {
        return request('/interview/start', {
            method: 'POST',
            body: JSON.stringify({ focus, display_name: displayName ?? null }),
        });
    },
    nextInterviewTurn(
        focus: string,
        transcript: { role: 'interviewer' | 'candidate'; content: string }[]
    ): Promise<{ interviewer_message: string }> {
        return request('/interview/next-turn', {
            method: 'POST',
            body: JSON.stringify({ focus, transcript }),
        });
    },
    evaluateInterview(
        focus: string,
        transcript: { role: 'interviewer' | 'candidate'; content: string }[]
    ): Promise<any> {
        return request('/interview/evaluate', {
            method: 'POST',
            body: JSON.stringify({ focus, transcript }),
        });
    },
};
