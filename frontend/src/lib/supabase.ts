import { createClient, Session, User } from '@supabase/supabase-js';

declare global {
    interface ImportMetaEnv {
        readonly VITE_SUPABASE_URL: string;
        readonly VITE_SUPABASE_ANON_KEY: string;
    }

    interface ImportMeta {
        readonly env: ImportMetaEnv;
    }
}

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(url, key);
export type { Session, User };

export interface Profile {
    user_id: string;
    display_name: string | null;
    preferred_difficulty: 'easy' | 'medium' | 'hard';
    email_notifications: boolean;
}

export interface Attempt {
    id: string;
    user_id: string;
    topic: string;
    difficulty: string;
    question_id: string;
    question_text: string;
    answer_text: string;
    score: number;
    verdict: string;
    hints_used: number;
    xp_earned: number;
    created_at: string;
}

export interface Stats {
    solved: number;
    accuracy: number;
    hints: number;
    xp: number;
    xpForNext: number;
    level: number;
    streak: number;
    perTopic: Record<string, { mastery: number; attempts: number }>;
}

const XP_PER_LEVEL = 100;

export function computeStats(attempts: Attempt[]): Stats {
    if (attempts.length === 0) {
        return {
            solved: 0,
            accuracy: 0,
            hints: 0,
            xp: 0,
            xpForNext: XP_PER_LEVEL,
            level: 1,
            streak: 0,
            perTopic: {},
        };
    }

    const solved = attempts.filter((a) => a.score >= 8).length;
    const accuracy = Math.round(
        attempts.reduce((s, a) => s + a.score, 0) / attempts.length * 10
    );
    const hints = attempts.reduce((s, a) => s + a.hints_used, 0);
    const xp = attempts.reduce((s, a) => s + a.xp_earned, 0);
    const level = Math.floor(xp / XP_PER_LEVEL) + 1;
    const xpForNext = level * XP_PER_LEVEL;

    const perTopic: Record<string, { mastery: number; attempts: number }> = {};
    const byTopic: Record<string, number[]> = {};
    for (const a of attempts) {
        (byTopic[a.topic] ||= []).push(a.score);
    }
    for (const [t, scores] of Object.entries(byTopic)) {
        const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
        perTopic[t] = { mastery: Math.round(avg * 10), attempts: scores.length };
    }

    // Streak counted in the user's LOCAL timezone (not UTC)
    const localKey = (d: Date): string => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    const days = new Set(attempts.map((a) => localKey(new Date(a.created_at))));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = localKey(d);
        if (days.has(key)) streak++;
        else if (i > 0) break;
    }

    return { solved, accuracy, hints, xp, xpForNext, level, streak, perTopic };
}