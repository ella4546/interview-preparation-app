import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Attempt,
    computeStats,
    Profile,
    Session,
    Stats,
    supabase,
} from './lib/supabase';
import {
    api,
    Difficulty,
    GradeResult,
    Question,
    Topic,
    Video,
} from './lib/api';
// ============================================================
// Required Supabase schema additions:
//
// Table: notebook_entries
//   id: uuid primary key default gen_random_uuid()
//   user_id: uuid references auth.users(id)
//   question_text: text
//   topic: text
//   my_answer: text
//   correct_concept: text
//   personal_note: text
//   missed_concepts: text[] (array of strings)
//   score: integer
//   reviewed: boolean default false
//   created_at: timestamptz default now()
//
// RLS policies:
//   SELECT: auth.uid() = user_id
//   INSERT: auth.uid() = user_id
//   UPDATE: auth.uid() = user_id
//   DELETE: auth.uid() = user_id
//
// Also ensure the 'attempts' table has a 'missed_concepts' column (text[])
// for the weakness analysis to work properly.
// ============================================================

import { createPortal } from "react-dom";

// ============================================================
// Constants + helpers
// ============================================================

const DEFAULT_TOPICS: { slug: string; label: string }[] = [
    { slug: 'data_structures', label: 'Data structures' },
    { slug: 'system_design', label: 'System design' },
    { slug: 'network_security', label: 'Network security' },
    { slug: 'sql_databases', label: 'SQL and databases' },
    { slug: 'algorithms', label: 'Algorithms' },
    { slug: 'operating_systems', label: 'Operating systems' },
];

const TOPIC_SUGGESTIONS: string[] = [
    'Data structures', 'Algorithms', 'System design', 'Network security',
    'SQL and databases', 'Operating systems',
    'Web design', 'Web development', 'Frontend development', 'Backend development',
    'Mobile development', 'iOS development', 'Android development',
    'React', 'React hooks', 'React Native', 'Next.js', 'Vue', 'Angular', 'Svelte',
    'Node.js', 'Express', 'Django', 'FastAPI', 'Flask', 'Spring Boot', 'Rails',
    'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C sharp', 'Go', 'Rust',
    'HTML and CSS', 'Tailwind CSS', 'Accessibility', 'Web performance',
    'REST APIs', 'GraphQL', 'WebSockets', 'gRPC',
    'Docker', 'Kubernetes', 'CI/CD', 'DevOps', 'Git', 'Linux',
    'AWS', 'Azure', 'GCP', 'Cloud computing', 'Serverless',
    'Testing', 'Unit testing', 'Integration testing', 'TDD',
    'Design patterns', 'Object oriented programming', 'Functional programming',
    'Concurrency', 'Multithreading', 'Distributed systems', 'Microservices',
    'Message queues', 'Kafka', 'RabbitMQ', 'Caching', 'Redis', 'CDN', 'Load balancing',
    'PostgreSQL', 'MongoDB', 'MySQL', 'DynamoDB', 'NoSQL',
    'TCP handshake', 'HTTP and HTTPS', 'TLS handshake', 'DNS',
    'Cryptography', 'Authentication', 'OAuth', 'JWT', 'SAML',
    'Machine learning', 'Deep learning', 'Neural networks', 'Data science',
    'Big data', 'Hadoop', 'Spark', 'Data engineering', 'ETL',
    'Product design', 'UX design', 'UI design', 'Figma',
    'Agile', 'Scrum', 'Project management', 'Career and interview prep',
];

function labelFor(slug: string): string {
    const preset = DEFAULT_TOPICS.find((t) => t.slug === slug);
    if (preset) return preset.label;
    const cleaned = slug.replace(/_/g, ' ').trim();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const RECENT_TOPICS_KEY = 'recentTopics';

function loadRecentTopics(): string[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(RECENT_TOPICS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
        return [];
    }
}

function saveRecentTopics(list: string[]) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(RECENT_TOPICS_KEY, JSON.stringify(list.slice(0, 8)));
    } catch { /* ignore */ }
}

function normalizeTopic(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ============================================================
// Notebook helpers
// ============================================================

function computeWeaknesses(attempts: Attempt[]): WeaknessAnalysis[] {
    const conceptMap = new Map<string, { topic: string; dates: string[]; suggested: string }>();

    attempts.forEach((a) => {
        if (a.verdict === 'correct') return;
        const missed = (a as any).missed_concepts || [];
        missed.forEach((concept: string) => {
            const key = concept.toLowerCase();
            const existing = conceptMap.get(key);
            if (existing) {
                existing.dates.push(a.created_at);
            } else {
                conceptMap.set(key, {
                    topic: a.topic,
                    dates: [a.created_at],
                    suggested: deriveSuggestedTopic(concept, a.topic),
                });
            }
        });
    });

    return [...conceptMap.entries()]
        .map(([concept, data]) => ({
            concept,
            topic: data.topic,
            times_missed: data.dates.length,
            last_missed: data.dates.sort().reverse()[0],
            suggested_topic: data.suggested,
        }))
        .sort((a, b) => b.times_missed - a.times_missed)
        .slice(0, 10);
}

function deriveSuggestedTopic(concept: string, originalTopic: string): string {
    const conceptLower = concept.toLowerCase();
    const topicLower = originalTopic.toLowerCase();

    // React-specific mappings
    if (topicLower.includes('react')) {
        if (conceptLower.includes('hook')) return 'React hooks';
        if (conceptLower.includes('state')) return 'React state management';
        if (conceptLower.includes('lifecycle') || conceptLower.includes('effect')) return 'React useEffect';
        if (conceptLower.includes('context')) return 'React Context API';
        if (conceptLower.includes('memo')) return 'React performance optimization';
        if (conceptLower.includes('ref')) return 'React useRef';
        if (conceptLower.includes('reducer')) return 'React useReducer';
        if (conceptLower.includes('router')) return 'React Router';
        return 'React fundamentals';
    }

    // System design
    if (topicLower.includes('system design') || conceptLower.includes('scal') || conceptLower.includes('load')) {
        if (conceptLower.includes('cache')) return 'Caching strategies';
        if (conceptLower.includes('database') || conceptLower.includes('db')) return 'Database design';
        if (conceptLower.includes('load')) return 'Load balancing';
        if (conceptLower.includes('queue')) return 'Message queues';
        if (conceptLower.includes('micro')) return 'Microservices';
        return 'System design fundamentals';
    }

    // Data structures
    if (conceptLower.includes('tree') || conceptLower.includes('bst')) return 'Binary trees';
    if (conceptLower.includes('graph')) return 'Graph algorithms';
    if (conceptLower.includes('hash')) return 'Hash tables';
    if (conceptLower.includes('heap')) return 'Heaps and priority queues';
    if (conceptLower.includes('linked')) return 'Linked lists';
    if (conceptLower.includes('stack') || conceptLower.includes('queue')) return 'Stacks and queues';

    // Algorithms
    if (conceptLower.includes('sort')) return 'Sorting algorithms';
    if (conceptLower.includes('search')) return 'Search algorithms';
    if (conceptLower.includes('dynamic') || conceptLower.includes('dp')) return 'Dynamic programming';
    if (conceptLower.includes('recursion')) return 'Recursion';
    if (conceptLower.includes('greedy')) return 'Greedy algorithms';

    // Networks
    if (conceptLower.includes('tcp') || conceptLower.includes('handshake')) return 'TCP/IP';
    if (conceptLower.includes('http')) return 'HTTP and HTTPS';
    if (conceptLower.includes('dns')) return 'DNS';
    if (conceptLower.includes('tls') || conceptLower.includes('ssl')) return 'TLS/SSL';

    // Databases
    if (conceptLower.includes('index')) return 'Database indexing';
    if (conceptLower.includes('join')) return 'SQL joins';
    if (conceptLower.includes('normal')) return 'Database normalization';
    if (conceptLower.includes('transaction')) return 'ACID transactions';
    if (conceptLower.includes('shard')) return 'Database sharding';

    // General fallback
    return originalTopic;
}

async function loadNotebook(userId: string): Promise<NotebookEntry[]> {
    const { data } = await supabase
        .from('notebook_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    return (data as NotebookEntry[]) || [];
}

async function addToNotebook(entry: Omit<NotebookEntry, 'id' | 'created_at'>): Promise<void> {
    await supabase.from('notebook_entries').insert(entry);
}

async function updateNotebookEntry(id: string, updates: Partial<NotebookEntry>): Promise<void> {
    await supabase.from('notebook_entries').update(updates).eq('id', id);
}

async function deleteNotebookEntry(id: string): Promise<void> {
    await supabase.from('notebook_entries').delete().eq('id', id);
}

// ============================================================
// Types
// ============================================================

type Screen =
    | 'dashboard'
    | 'question'
    | 'feedback'
    | 'profile'
    | 'interview'
    | 'interview-eval'
    | 'session-summary'
    | 'notebook';

type SessionResult = {
    question_text: string;
    topic: string;
    score: number;
    verdict: 'correct' | 'partial' | 'incorrect';
    hints_used: number;
    missed_concepts: string[];
    strong_concepts: string[];
};

type InterviewTurn = { role: 'interviewer' | 'candidate'; content: string };

type InterviewEvaluation = {
    overall_score?: number;
    verdict?: string;
    summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    recommendations?: string[];
    topic_scores?: Record<string, number>;
    [key: string]: any;
};

type InterviewSessionRow = {
    id: string;
    focus: string;
    transcript: InterviewTurn[];
    evaluation: InterviewEvaluation | null;
    status: string;
    turns_completed: number;
    created_at: string;
};

type Modal = null | 'email' | 'password' | 'display_name' | 'difficulty';

// ============================================================
// Mistake Notebook Types
// ============================================================

type NotebookEntry = {
    id: string;
    user_id: string;
    question_text: string;
    topic: string;
    my_answer: string;
    correct_concept: string;
    personal_note: string;
    missed_concepts: string[];
    score: number;
    reviewed: boolean;
    created_at: string;
};

type WeaknessAnalysis = {
    concept: string;
    topic: string;
    times_missed: number;
    last_missed: string;
    suggested_topic: string;
};

// ============================================================
// Root
// ============================================================

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [checking, setChecking] = useState(true);
    const [recoveryMode, setRecoveryMode] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setChecking(false);
        });
        const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
            if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
            setSession(s);
        });
        return () => sub.subscription.unsubscribe();
    }, []);

    if (checking) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#f4efe4] text-sm text-stone-500">
                Loading…
            </div>
        );
    }

    if (recoveryMode) {
        return <PasswordRecoveryScreen onDone={() => setRecoveryMode(false)} />;
    }

    return session ? <AuthedApp session={session} /> : <AuthScreens />;
}

// ============================================================
// Auth screens
// ============================================================

function AuthScreens() {
    const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setInfo(null);
        setBusy(true);
        try {
            if (mode === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { display_name: displayName || null } },
                });
                if (error) throw error;
            } else if (mode === 'signin') {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${appUrl}/auth/callback`,
                });
                if (error) throw error;
                setInfo('Check your inbox for a password reset link.');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    }

    const title = mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password';
    const subtitle = mode === 'signin' ? 'Sign in to keep your streak going' : mode === 'signup' ? 'Start practicing in under a minute' : "We'll email you a reset link";
    const cta = mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';

    return (
        <div className="min-h-screen bg-[#f4efe4]">
            <header className="border-b border-stone-200">
                <div className="mx-auto flex max-w-3xl items-center justify-center px-6 py-4">
                    <span className="text-base font-semibold tracking-tight">Interview prep</span>
                </div>
            </header>
            <main className="mx-auto mt-12 max-w-sm px-6">
                <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-8">
                    <div className="text-center">
                        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                        <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
                    </div>
                    {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>}
                    {info && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{info}</div>}
                    <div className="mt-6 space-y-4">
                        {mode === 'signup' && (
                            <Field label="Display name (optional)" value={displayName} onChange={setDisplayName} placeholder="your name" />
                        )}
                        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
                        {mode !== 'forgot' && (
                            <Field label="Password" type="password" value={password} onChange={setPassword} minLength={6} required />
                        )}
                        <button type="submit" disabled={busy} className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">
                            {busy ? 'Working…' : cta}
                        </button>
                    </div>
                    <div className="mt-6 space-y-2 text-center text-xs text-stone-500">
                        {mode === 'signin' && (
                            <>
                                <button type="button" onClick={() => { setMode('forgot'); setError(null); setInfo(null); }} className="font-medium text-stone-700 underline underline-offset-2">Forgot password?</button>
                                <p>Don't have an account? <button type="button" onClick={() => { setMode('signup'); setError(null); setInfo(null); }} className="font-medium text-stone-800 underline underline-offset-2">Sign up</button></p>
                            </>
                        )}
                        {mode === 'signup' && (
                            <p>Already have one? <button type="button" onClick={() => { setMode('signin'); setError(null); setInfo(null); }} className="font-medium text-stone-800 underline underline-offset-2">Sign in</button></p>
                        )}
                        {mode === 'forgot' && (
                            <p><button type="button" onClick={() => { setMode('signin'); setError(null); setInfo(null); }} className="font-medium text-stone-800 underline underline-offset-2">Back to sign in</button></p>
                        )}
                    </div>
                </form>
            </main>
        </div>
    );
}

function Field({ label, value, onChange, type = 'text', placeholder, required, minLength }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; minLength?: number; }) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-600">{label}</label>
            <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} minLength={minLength} className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:outline-none" />
        </div>
    );
}

function PasswordRecoveryScreen({ onDone }: { onDone: () => void }) {
    const [pw, setPw] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [ok, setOk] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            if (pw.length < 6) throw new Error('Password must be at least 6 characters');
            const { error } = await supabase.auth.updateUser({ password: pw });
            if (error) throw error;
            setOk(true);
            setTimeout(onDone, 1500);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-[#f4efe4]">
            <header className="border-b border-stone-200">
                <div className="mx-auto max-w-3xl px-6 py-4">
                    <span className="text-base font-semibold tracking-tight">Interview prep</span>
                </div>
            </header>
            <main className="mx-auto mt-12 max-w-sm px-6">
                <form onSubmit={submit} className="rounded-2xl border border-stone-200 bg-white p-8">
                    <h1 className="text-center text-xl font-semibold tracking-tight">Set a new password</h1>
                    <p className="mt-1 text-center text-sm text-stone-500">You'll be signed in after this</p>
                    {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>}
                    {ok && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">Password updated. Redirecting…</div>}
                    <div className="mt-6">
                        <Field label="New password" type="password" value={pw} onChange={setPw} minLength={6} required />
                    </div>
                    <button type="submit" disabled={busy} className="mt-6 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">
                        {busy ? 'Saving…' : 'Save password'}
                    </button>
                </form>
            </main>
        </div>
    );
}

// ============================================================
// Authenticated app
// ============================================================

function AuthedApp({ session }: { session: Session }) {
    const user = session.user;
    const [screen, setScreen] = useState<Screen>('dashboard');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [stats, setStats] = useState<Stats>(computeStats([]));
    const [popularTopics, setPopularTopics] = useState<{ slug: string; attempts: number }[]>([]);
    const [recentQuestions, setRecentQuestions] = useState<string[]>([]);

    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const [sessionTopic, setSessionTopic] = useState<Topic>('network_security');
    const [questionIndex, setQuestionIndex] = useState(1);
    const sessionLength = 8;

    const [question, setQuestion] = useState<Question | null>(null);
    const [answer, setAnswer] = useState('');
    const [hint, setHint] = useState<string | null>(null);
    const [hintsUsed, setHintsUsed] = useState(0);
    const [feedback, setFeedback] = useState<GradeResult | null>(null);
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessionResults, setSessionResults] = useState<SessionResult[]>([]);

    const [interviewFocus, setInterviewFocus] = useState<string>('');
    const [interviewTranscript, setInterviewTranscript] = useState<InterviewTurn[]>([]);
    const [interviewLoading, setInterviewLoading] = useState(false);
    const [showInterviewPicker, setShowInterviewPicker] = useState(false);
    const [interviewEvaluation, setInterviewEvaluation] = useState<InterviewEvaluation | null>(null);
    const [evaluatingInterview, setEvaluatingInterview] = useState(false);
    const [pastInterviews, setPastInterviews] = useState<InterviewSessionRow[]>([]);
    const [viewingSession, setViewingSession] = useState<InterviewSessionRow | null>(null);
    const [notebookEntries, setNotebookEntries] = useState<NotebookEntry[]>([]);
    const [weaknesses, setWeaknesses] = useState<WeaknessAnalysis[]>([]);
    const [showNotebookAdder, setShowNotebookAdder] = useState(false);
    const [notebookDraft, setNotebookDraft] = useState({ question_text: '', topic: '', my_answer: '', correct_concept: '', personal_note: '', missed_concepts: [] as string[], score: 0 });

    const loadAll = useCallback(async () => {
        const [{ data: p }, { data: a }, { data: pop }, { data: sessions }, { data: nb }] = await Promise.all([
            supabase.from('profiles').select('*').eq('user_id', user.id).single(),
            supabase.from('attempts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500),
            supabase.rpc('get_popular_topics', { limit_count: 6 }),
            supabase.from('interview_sessions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
            supabase.from('notebook_entries').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        ]);
        if (p) {
            setProfile(p as Profile);
            setDifficulty((p as Profile).preferred_difficulty);
        }
        if (a) {
            setAttempts(a as Attempt[]);
            setStats(computeStats(a as Attempt[]));
            setWeaknesses(computeWeaknesses(a as Attempt[]));
        }
        if (pop && Array.isArray(pop)) {
            setPopularTopics(pop.map((row: any) => ({ slug: row.topic as string, attempts: Number(row.attempts) || 0 })));
        }
        if (sessions) setPastInterviews(sessions as InterviewSessionRow[]);
        if (nb) setNotebookEntries(nb as NotebookEntry[]);
    }, [user.id]);

    useEffect(() => { loadAll(); }, [loadAll]);

    async function startSession(topic: Topic) {
        const clean = normalizeTopic(topic);
        if (!clean) return;
        setError(null);
        setLoading(true);
        setHint(null);
        setHintsUsed(0);
        setAnswer('');
        setVideos([]);
        setFeedback(null);
        setSessionTopic(clean);
        setQuestionIndex(1);
        setSessionResults([]);
        try {
            const q = await api.generateQuestion(clean, difficulty, []);
            setRecentQuestions([q.question_text]);
            setQuestion(q);
            setScreen('question');
            const recent = loadRecentTopics();
            const next = [clean, ...recent.filter((t) => t !== clean)];
            saveRecentTopics(next);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    async function nextQuestion() {
        setError(null);
        setLoading(true);
        setHint(null);
        setHintsUsed(0);
        setAnswer('');
        setVideos([]);
        setFeedback(null);
        try {
            const q = await api.generateQuestion(sessionTopic, difficulty, recentQuestions);
            setRecentQuestions((prev) => [q.question_text, ...prev].slice(0, 5));
            setQuestion(q);
            setQuestionIndex((n) => Math.min(n + 1, sessionLength));
            setScreen('question');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    async function submitAnswer() {
        if (!question) return;
        setError(null);
        setLoading(true);
        try {
            const result = await api.gradeAnswer(question.id, question.question_text, answer, hintsUsed);
            setFeedback(result);
            setScreen('feedback');
            setSessionResults((prev) => [...prev, {
                question_text: question.question_text,
                topic: question.topic,
                score: result.score,
                verdict: result.verdict,
                hints_used: hintsUsed,
                missed_concepts: result.missed_concepts ?? [],
                strong_concepts: result.strong_concepts ?? [],
            }]);
            await supabase.from('attempts').insert({
                user_id: user.id,
                topic: normalizeTopic(question.topic),
                difficulty: question.difficulty,
                question_id: question.id,
                question_text: question.question_text,
                answer_text: answer,
                score: result.score,
                verdict: result.verdict,
                hints_used: hintsUsed,
                xp_earned: result.xp_earned,
            });
            loadAll();
            try {
                const missed = result.missed_concepts?.[0];
                const strong = result.strong_concepts?.[0];
                const focus = missed || strong || '';
                const query = focus ? `${question.topic} ${focus} programming tutorial` : `${question.topic} programming tutorial for developers`;
                const v = await api.getVideos(query);
                setVideos(v.videos);
            } catch { /* videos optional */ }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    async function askForHint() {
        if (!question) return;
        setError(null);
        setLoading(true);
        try {
            const h = await api.getHint(question.id, question.question_text);
            setHint(h.hint);
            setHintsUsed((n) => n + 1);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }

    function goDashboard() {
        setScreen('dashboard');
        setQuestion(null);
        setAnswer('');
        setFeedback(null);
        setVideos([]);
        setHint(null);
        setHintsUsed(0);
        setError(null);
        setQuestionIndex(1);
        setSessionResults([]);
    }

    function finishSession() {
        setScreen('session-summary');
    }

    const displayName = profile?.display_name || user.email?.split('@')[0] || 'there';

    async function beginInterview(focus: string) {
        setInterviewFocus(focus);
        setInterviewTranscript([]);
        setInterviewLoading(true);
        setShowInterviewPicker(false);
        setScreen('interview');
        try {
            const r = await api.startInterview(focus, displayName);
            setInterviewTranscript([{ role: 'interviewer', content: r.opening_message }]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to start interview');
            setScreen('dashboard');
        } finally {
            setInterviewLoading(false);
        }
    }

    async function sendInterviewMessage(message: string) {
        const trimmed = message.trim();
        if (!trimmed) return;
        const updated: InterviewTurn[] = [...interviewTranscript, { role: 'candidate', content: trimmed }];
        setInterviewTranscript(updated);
        setInterviewLoading(true);
        try {
            const r = await api.nextInterviewTurn(interviewFocus, updated);
            setInterviewTranscript([...updated, { role: 'interviewer', content: r.interviewer_message }]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to continue interview');
        } finally {
            setInterviewLoading(false);
        }
    }

    async function endInterview() {
        const hasAnswered = interviewTranscript.some((t) => t.role === 'candidate');
        if (!hasAnswered) {
            setScreen('dashboard');
            setInterviewTranscript([]);
            setInterviewFocus('');
            return;
        }
        setEvaluatingInterview(true);
        setInterviewEvaluation(null);
        setScreen('interview-eval');
        let evaluation: InterviewEvaluation | null = null;
        try {
            evaluation = await api.evaluateInterview(interviewFocus, interviewTranscript);
            setInterviewEvaluation(evaluation);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to evaluate interview');
        } finally {
            setEvaluatingInterview(false);
        }
        try {
            await supabase.from('interview_sessions').insert({
                user_id: user.id,
                focus: interviewFocus,
                transcript: interviewTranscript,
                evaluation,
                status: 'completed',
                turns_completed: Math.floor(interviewTranscript.length / 2),
            });
            loadAll();
        } catch { /* non-blocking */ }
    }

    function returnFromEvaluation() {
        setScreen('dashboard');
        setInterviewTranscript([]);
        setInterviewFocus('');
        setInterviewEvaluation(null);
    }

    async function saveToNotebook(entry: Omit<NotebookEntry, 'id' | 'created_at' | 'user_id'>) {
        await addToNotebook({ ...entry, user_id: user.id });
        loadAll();
    }

    async function toggleReviewed(id: string, current: boolean) {
        await updateNotebookEntry(id, { reviewed: !current });
        loadAll();
    }

    async function removeFromNotebook(id: string) {
        await deleteNotebookEntry(id);
        loadAll();
    }

    function openNotebook() {
        setScreen('notebook');
    }

    function prepareNotebookEntry(question: Question, answer: string, feedback: GradeResult) {
        setNotebookDraft({
            question_text: question.question_text,
            topic: question.topic,
            my_answer: answer,
            correct_concept: feedback.missed_concepts.join(', ') || feedback.strong_concepts.join(', ') || '',
            personal_note: '',
            missed_concepts: feedback.missed_concepts,
            score: feedback.score,
        });
        setShowNotebookAdder(true);
    }

    return (
        <div className="min-h-screen bg-[#f4efe4] text-stone-900">
            <TopNav current={screen} onNavigate={setScreen} />
            <main className="mx-auto max-w-3xl px-6 pb-20 pt-8">
                {error && (
                    <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                        {error}
                    </div>
                )}

                {screen === 'dashboard' && (
                    <Dashboard
                        displayName={displayName}
                        stats={stats}
                        difficulty={difficulty}
                        popularTopics={popularTopics}
                        attempts={attempts}
                        weaknesses={weaknesses}
                        onDifficulty={async (d) => {
                            setDifficulty(d);
                            await supabase.from('profiles').update({ preferred_difficulty: d }).eq('user_id', user.id);
                        }}
                        onStart={startSession}
                        onStartInterview={() => setShowInterviewPicker(true)}
                        pastInterviews={pastInterviews}
                        onOpenPastInterview={setViewingSession}
                        loading={loading}
                        onOpenNotebook={openNotebook}
                    />
                )}

                {screen === 'question' && question && (
                    <QuestionScreen
                        question={question}
                        answer={answer}
                        onAnswer={setAnswer}
                        hint={hint}
                        loading={loading}
                        questionIndex={questionIndex}
                        sessionLength={sessionLength}
                        onSubmit={submitAnswer}
                        onHint={askForHint}
                        onBack={goDashboard}
                    />
                )}

                {screen === 'feedback' && feedback && question && (
                    <FeedbackScreen
                        question={question}
                        answer={answer}
                        feedback={feedback}
                        videos={videos}
                        questionIndex={questionIndex}
                        sessionLength={sessionLength}
                        onNext={nextQuestion}
                        onFinish={finishSession}
                        onExit={goDashboard}
                        loading={loading}
                        onAddToNotebook={() => prepareNotebookEntry(question, answer, feedback)}
                    />
                )}

                {screen === 'session-summary' && (
                    <SessionSummaryScreen
                        topic={sessionTopic}
                        results={sessionResults}
                        onDone={goDashboard}
                    />
                )}

                {screen === 'interview' && (
                    <InterviewScreen
                        focus={interviewFocus}
                        transcript={interviewTranscript}
                        loading={interviewLoading}
                        onSend={sendInterviewMessage}
                        onEnd={endInterview}
                    />
                )}

                {screen === 'interview-eval' && (
                    <InterviewEvaluationScreen
                        focus={interviewFocus}
                        transcript={interviewTranscript}
                        evaluation={interviewEvaluation}
                        loading={evaluatingInterview}
                        onDone={returnFromEvaluation}
                    />
                )}

                {screen === 'profile' && profile && (
                    <ProfileScreen
                        profile={profile}
                        email={user.email ?? ''}
                        stats={stats}
                        attemptsCount={attempts.length}
                        onProfileChange={loadAll}
                    />
                )}

                {screen === 'notebook' && (
                    <NotebookScreen
                        entries={notebookEntries}
                        weaknesses={weaknesses}
                        onToggleReviewed={toggleReviewed}
                        onDelete={removeFromNotebook}
                        onPractice={(topic) => { setScreen('dashboard'); startSession(topic); }}
                        onBack={() => setScreen('dashboard')}
                    />
                )}
            </main>

            {showInterviewPicker && (
                <InterviewPicker
                    onCancel={() => setShowInterviewPicker(false)}
                    onPick={beginInterview}
                />
            )}

            {showNotebookAdder && (
                <NotebookAdder
                    draft={notebookDraft}
                    onChange={setNotebookDraft}
                    onSave={async () => {
                        await saveToNotebook(notebookDraft);
                        setShowNotebookAdder(false);
                        setNotebookDraft({ question_text: '', topic: '', my_answer: '', correct_concept: '', personal_note: '', missed_concepts: [], score: 0 });
                    }}
                    onCancel={() => {
                        setShowNotebookAdder(false);
                        setNotebookDraft({ question_text: '', topic: '', my_answer: '', correct_concept: '', personal_note: '', missed_concepts: [], score: 0 });
                    }}
                />
            )}

            {viewingSession && (
                <PastInterviewViewer
                    session={viewingSession}
                    onClose={() => setViewingSession(null)}
                />
            )}
        </div>
    );
}

// ============================================================
// Nav
// ============================================================

function TopNav({ current, onNavigate }: { current: Screen; onNavigate: (s: Screen) => void; }) {
    const link = (label: string, target: Screen) => (
        <button
            onClick={() => onNavigate(target)}
            className={`text-sm transition ${current === target ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-800'}`}
        >
            {label}
        </button>
    );
    return (
        <header className="border-b border-stone-200 bg-[#f4efe4]">
            <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
                <button onClick={() => onNavigate('dashboard')} className="text-base font-semibold tracking-tight">
                    Interview prep
                </button>
                <nav className="flex items-center gap-5">
                    {link('Dashboard', 'dashboard')}
                    {link('Notebook', 'notebook')}
                    {link('Profile', 'profile')}
                </nav>
            </div>
        </header>
    );
}

// ============================================================
// Dashboard
// ============================================================

function Dashboard({
    displayName, stats, difficulty, popularTopics, attempts, weaknesses,
    onDifficulty, onStart, onStartInterview, pastInterviews, onOpenPastInterview, loading, onOpenNotebook,
}: {
    displayName: string;
    stats: Stats;
    difficulty: Difficulty;
    popularTopics: { slug: string; attempts: number }[];
    attempts: Attempt[];
    weaknesses: WeaknessAnalysis[];
    onDifficulty: (d: Difficulty) => void;
    onStart: (topic: Topic) => void;
    onStartInterview: () => void;
    pastInterviews: InterviewSessionRow[];
    onOpenPastInterview: (s: InterviewSessionRow) => void;
    loading: boolean;
    onOpenNotebook: () => void;
}) {
    const [customTopic, setCustomTopic] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showStreak, setShowStreak] = useState(false);
    const recent = useMemo(() => loadRecentTopics(), []);

    const topicsToShow = useMemo(() => {
        if (popularTopics.length >= 6) {
            return popularTopics.slice(0, 6).map((t) => ({ slug: t.slug, label: labelFor(t.slug) }));
        }
        return DEFAULT_TOPICS;
    }, [popularTopics]);

    const filteredSuggestions = useMemo(() => {
        const q = customTopic.trim().toLowerCase();
        if (!q) return TOPIC_SUGGESTIONS.slice(0, 8);
        return TOPIC_SUGGESTIONS.filter((s) => s.toLowerCase().includes(q)).slice(0, 8);
    }, [customTopic]);

    function submitCustom(e: React.FormEvent) {
        e.preventDefault();
        const clean = normalizeTopic(customTopic);
        if (!clean) return;
        onStart(clean);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-xs uppercase tracking-wide text-stone-500">Welcome back</div>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hi, {displayName}</h1>
                </div>
                <button
                    onClick={() => setShowStreak(true)}
                    className="group flex shrink-0 items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-900 transition hover:border-orange-300 hover:bg-orange-100"
                    title="View your streak calendar"
                >
                    <span className="text-lg leading-none">🔥</span>
                    <span className="tabular-nums">{stats.streak}</span>
                    <span className="text-xs font-medium text-orange-700">
                        {stats.streak === 1 ? 'day' : 'days'}
                    </span>
                </button>
            </div>

            <div className="grid w-full grid-cols-2 gap-3">
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-wide text-stone-500">Solved</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">{stats.solved}</div>
                </div>
                <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-wide text-stone-500">Accuracy</div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight">{stats.accuracy}%</div>
                </div>
            </div>

            {weaknesses.length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">Focus areas</h2>
                            <p className="mt-1 text-xs text-amber-700">Based on your missed concepts</p>
                        </div>
                        <button onClick={onOpenNotebook} className="text-xs font-medium text-amber-900 underline underline-offset-2">
                            View notebook →
                        </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {weaknesses.slice(0, 5).map((w) => (
                            <button
                                key={w.concept}
                                onClick={() => onStart(w.suggested_topic)}
                                disabled={loading}
                                className="rounded-full border border-amber-200 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 transition hover:border-amber-300 disabled:opacity-50"
                            >
                                {w.suggested_topic}
                                <span className="ml-1.5 text-amber-600">({w.times_missed}×)</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Practice a topic</h2>
                    <div className="flex gap-1 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                            <button
                                key={d}
                                onClick={() => onDifficulty(d)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${difficulty === d ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {topicsToShow.map((t) => (
                        <button
                            key={t.slug}
                            onClick={() => onStart(t.slug)}
                            disabled={loading}
                            className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-left text-sm font-medium text-stone-800 transition hover:border-stone-300 hover:bg-white disabled:opacity-50"
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {recent.length > 0 && (
                    <div className="mt-4">
                        <div className="mb-2 text-xs font-medium text-stone-500">Recent</div>
                        <div className="flex flex-wrap gap-2">
                            {recent.slice(0, 6).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => onStart(t)}
                                    disabled={loading}
                                    className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-700 transition hover:border-stone-300 disabled:opacity-50"
                                >
                                    {labelFor(t)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <form onSubmit={submitCustom} className="mt-4">
                    <div className="mb-1 text-xs font-medium text-stone-500">Or any topic</div>
                    <div className="relative flex gap-2">
                        <input
                            value={customTopic}
                            onChange={(e) => { setCustomTopic(e.target.value); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            placeholder="e.g. React hooks, Kubernetes, TLS handshake"
                            className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
                        />
                        <button
                            type="submit"
                            disabled={loading || !customTopic.trim()}
                            className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
                        >
                            {loading ? '…' : 'Start'}
                        </button>
                        {showSuggestions && filteredSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-sm">
                                {filteredSuggestions.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => { setCustomTopic(s); setShowSuggestions(false); onStart(s); }}
                                        className="block w-full px-3 py-1.5 text-left text-sm text-stone-800 hover:bg-stone-50"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </form>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Mock interview</h2>
                        <p className="mt-1 text-sm text-stone-700">Practice with an AI interviewer. Speak or type.</p>
                    </div>
                    <button
                        onClick={onStartInterview}
                        className="shrink-0 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                    >
                        Start
                    </button>
                </div>

                {pastInterviews.length > 0 && (
                    <div className="mt-4 border-t border-stone-100 pt-4">
                        <div className="mb-2 text-xs font-medium text-stone-500">Past sessions</div>
                        <div className="space-y-1">
                            {pastInterviews.slice(0, 5).map((s) => {
                                const date = new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                const score = s.evaluation?.overall_score;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => onOpenPastInterview(s)}
                                        className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition hover:bg-stone-50"
                                    >
                                        <span className="min-w-0 flex-1 truncate text-stone-800">{s.focus}</span>
                                        <span className="ml-2 shrink-0 text-xs text-stone-500">{date}</span>
                                        {typeof score === 'number' && (
                                            <span className="ml-3 shrink-0 tabular-nums text-xs font-medium text-stone-900">{score}/10</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </section>

            {showStreak && (
                <StreakCalendar attempts={attempts} stats={stats} onClose={() => setShowStreak(false)} />
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
            <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
            <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
        </div>
    );
}

function StreakCalendar({ attempts, stats, onClose }: { attempts: Attempt[]; stats: Stats; onClose: () => void; }) {
    const activeDays = new Set(attempts.map((a) => new Date(a.created_at).toISOString().slice(0, 10)));
    const days = 84;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cells: { date: Date; key: string; active: boolean; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const count = attempts.filter((a) => new Date(a.created_at).toISOString().slice(0, 10) === key).length;
        cells.push({ date: d, key, active: activeDays.has(key), count });
    }
    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="w-full max-w-[20rem] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-semibold">Your streak</h3>
                        <p className="text-[10px] text-stone-500">Last 12 weeks · {monthLabel}</p>
                    </div>
                    <button onClick={onClose} className="text-stone-500 hover:text-stone-800 text-xs">✕</button>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                    <Stat label="Current" value={`${stats.streak} d`} />
                    <Stat label="Solved" value={stats.solved.toString()} />
                    <Stat label="Days active" value={activeDays.size.toString()} />
                </div>
                <div className="flex gap-[3px] justify-center">
                    {weeks.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-[3px]">
                            {week.map((cell) => (
                                <div key={cell.key} title={`${cell.key}${cell.active ? ` · ${cell.count} attempt${cell.count === 1 ? '' : 's'}` : ' · no activity'}`} className={`h-2.5 w-2.5 rounded-[2px] ${cell.count === 0 ? 'bg-stone-100' : cell.count < 3 ? 'bg-emerald-200' : cell.count < 6 ? 'bg-emerald-400' : 'bg-emerald-600'}`} />
                            ))}
                        </div>
                    ))}
                </div>
                <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-stone-500">
                    <span>Less</span>
                    <div className="h-2.5 w-2.5 rounded-[2px] bg-stone-100" />
                    <div className="h-2.5 w-2.5 rounded-[2px] bg-emerald-200" />
                    <div className="h-2.5 w-2.5 rounded-[2px] bg-emerald-400" />
                    <div className="h-2.5 w-2.5 rounded-[2px] bg-emerald-600" />
                    <span>More</span>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ============================================================
// Question / Feedback screens
// ============================================================

function QuestionScreen({ question, answer, onAnswer, hint, loading, questionIndex, sessionLength, onSubmit, onHint, onBack }: { question: Question; answer: string; onAnswer: (s: string) => void; hint: string | null; loading: boolean; questionIndex: number; sessionLength: number; onSubmit: () => void; onHint: () => void; onBack: () => void; }) {
    return (
        <div className="space-y-4">
            <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-stone-500 transition hover:text-stone-900">← Back to dashboard</button>
            <div className="flex items-center justify-between">
                <div className="text-sm text-stone-500">Question {questionIndex} of {sessionLength} · <span className="capitalize">{labelFor(question.topic)}</span></div>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium capitalize text-stone-700">{question.difficulty}</span>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <p className="text-base leading-relaxed">{question.question_text}</p>
            </div>
            <textarea value={answer} onChange={(e) => onAnswer(e.target.value)} placeholder="Type your answer here — explain it like you would to an interviewer." rows={7} className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-900 placeholder-stone-400 focus:border-stone-400 focus:outline-none" />
            {hint && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide">Hint</div>
                    {hint}
                </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <button onClick={onHint} disabled={loading || hint !== null} className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-300 disabled:opacity-50">
                    {hint ? 'Hint used' : 'Use a hint (−5 pts)'}
                </button>
                <button onClick={onSubmit} disabled={loading || !answer.trim()} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">
                    {loading ? 'Grading…' : 'Submit answer'}
                </button>
            </div>
        </div>
    );
}

function FeedbackScreen({ question, answer, feedback, videos, questionIndex, sessionLength, onNext, onFinish, onExit, loading, onAddToNotebook }: { question: Question; answer: string; feedback: GradeResult; videos: Video[]; questionIndex: number; sessionLength: number; onNext: () => void; onFinish: () => void; onExit: () => void; loading: boolean; onAddToNotebook?: () => void; }) {
    const verdictLabel = feedback.verdict === 'correct' ? 'Correct' : feedback.verdict === 'partial' ? 'Partially correct' : 'Incorrect';
    const verdictStyles = feedback.verdict === 'correct' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : feedback.verdict === 'partial' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800';
    const isLast = questionIndex >= sessionLength;
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm text-stone-500">Question {questionIndex} of {sessionLength} · <span className="capitalize">{labelFor(question.topic)}</span></div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${verdictStyles}`}>{verdictLabel}</span>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Your answer</div>
                <p className="mt-2 text-sm italic leading-relaxed text-stone-700">"{answer}"</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Feedback</div>
                    <div className="text-lg font-semibold tabular-nums">{feedback.score}/10</div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-stone-800">{feedback.feedback}</p>
                {feedback.strong_concepts.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Strong concepts</div>
                        <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                            {feedback.strong_concepts.map((c) => <li key={c}>· {c}</li>)}
                        </ul>
                    </div>
                )}
                {feedback.missed_concepts.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-stone-600">Missed concepts</div>
                        <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                            {feedback.missed_concepts.map((c) => <li key={c}>· {c}</li>)}
                        </ul>
                    </div>
                )}
                {onAddToNotebook && (
                    <button
                        onClick={onAddToNotebook}
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-white"
                    >
                        📝 Add to mistake notebook
                    </button>
                )}
                {feedback.xp_earned > 0 && <div className="mt-4 text-xs text-stone-500">+{feedback.xp_earned} XP earned</div>}
            </div>
            {videos.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recommended videos</div>
                    {videos.slice(0, 3).map((v) => (
                        <a key={v.video_id} href={v.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-3 transition hover:border-stone-300">
                            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                                <img src={`https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg`} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`; }} />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-3.5 w-3.5"><path d="M8 5v14l11-7z" /></svg>
                                    </div>
                                </div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-stone-900">{v.title}</div>
                                <div className="mt-0.5 truncate text-xs text-stone-500">{v.channel}</div>
                            </div>
                            <span className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 transition group-hover:border-stone-300">Watch</span>
                        </a>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-3 pt-2">
                <button onClick={onExit} className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-300">Exit session</button>
                {isLast ? (
                    <button onClick={onFinish} disabled={loading} className="ml-auto rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50">
                        Finish session →
                    </button>
                ) : (
                    <button onClick={onNext} disabled={loading} className="ml-auto rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">
                        {loading ? 'Loading…' : 'Next question'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ============================================================
// Session summary
// ============================================================

function SessionSummaryScreen({ topic, results, onDone }: { topic: string; results: SessionResult[]; onDone: () => void; }) {
    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const maxScore = results.length * 10;
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const correctCount = results.filter((r) => r.verdict === 'correct').length;
    const partialCount = results.filter((r) => r.verdict === 'partial').length;
    const incorrectCount = results.filter((r) => r.verdict === 'incorrect').length;
    const hintsUsed = results.reduce((sum, r) => sum + r.hints_used, 0);

    const missedTally = new Map<string, number>();
    results.forEach((r) => r.missed_concepts.forEach((c) => missedTally.set(c, (missedTally.get(c) ?? 0) + 1)));
    const topWeaknesses = [...missedTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const strongTally = new Map<string, number>();
    results.forEach((r) => r.strong_concepts.forEach((c) => strongTally.set(c, (strongTally.get(c) ?? 0) + 1)));
    const topStrengths = [...strongTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const weakest = [...results].sort((a, b) => a.score - b.score)[0];

    const scoreColor = percentage >= 80 ? 'text-emerald-700' : percentage >= 60 ? 'text-amber-700' : 'text-red-700';
    const headline = percentage >= 80 ? 'Great session!' : percentage >= 60 ? 'Solid session.' : "Keep practicing — you're getting there.";

    return (
        <div className="space-y-4">
            <div>
                <div className="text-xs uppercase tracking-wide text-stone-500">Session complete</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{labelFor(topic)}</h1>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Your total</div>
                        <div className="mt-1 text-base font-semibold text-stone-900">{headline}</div>
                    </div>
                    <div className={`text-3xl font-semibold tabular-nums ${scoreColor}`}>{totalScore}/{maxScore}</div>
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                    <div className={`h-full ${percentage >= 80 ? 'bg-emerald-600' : percentage >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${percentage}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                        <div className="text-xs uppercase tracking-wide text-stone-500">Correct</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-700">{correctCount}</div>
                    </div>
                    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                        <div className="text-xs uppercase tracking-wide text-stone-500">Partial</div>
                        <div className="mt-1 text-lg font-semibold text-amber-700">{partialCount}</div>
                    </div>
                    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                        <div className="text-xs uppercase tracking-wide text-stone-500">Missed</div>
                        <div className="mt-1 text-lg font-semibold text-red-700">{incorrectCount}</div>
                    </div>
                    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                        <div className="text-xs uppercase tracking-wide text-stone-500">Hints</div>
                        <div className="mt-1 text-lg font-semibold text-stone-800">{hintsUsed}</div>
                    </div>
                </div>
            </div>

            {topWeaknesses.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Focus on these next</div>
                    <p className="mt-1 text-xs text-amber-800">Concepts you missed most often in this session</p>
                    <ul className="mt-3 space-y-1 text-sm text-amber-900">
                        {topWeaknesses.map(([concept, count]) => (
                            <li key={concept} className="flex items-center justify-between">
                                <span>· {concept}</span>
                                <span className="text-xs text-amber-700">{count}× missed</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {topStrengths.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">You nailed these</div>
                    <ul className="mt-2 space-y-1 text-sm text-emerald-900">
                        {topStrengths.map(([concept, count]) => (
                            <li key={concept} className="flex items-center justify-between">
                                <span>· {concept}</span>
                                <span className="text-xs text-emerald-700">{count}× strong</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {weakest && weakest.score < 7 && (
                <div className="rounded-2xl border border-stone-200 bg-white p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Toughest question</div>
                    <p className="mt-2 text-sm text-stone-800">"{weakest.question_text}"</p>
                    <div className="mt-2 text-xs text-stone-500">Scored {weakest.score}/10</div>
                </div>
            )}

            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">All questions</div>
                <div className="mt-3 space-y-2">
                    {results.map((r, i) => {
                        const color = r.verdict === 'correct' ? 'bg-emerald-500' : r.verdict === 'partial' ? 'bg-amber-500' : 'bg-red-500';
                        return (
                            <div key={i} className="flex items-center gap-3 text-sm">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
                                <span className="flex-1 truncate text-stone-700">Q{i + 1}. {r.question_text}</span>
                                <span className="shrink-0 tabular-nums font-medium text-stone-900">{r.score}/10</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex justify-end pt-2">
                <button onClick={onDone} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800">
                    Back to dashboard
                </button>
            </div>
        </div>
    );
}

// ============================================================
// Notebook Adder Modal
// ============================================================

function NotebookAdder({
    draft, onChange, onSave, onCancel,
}: {
    draft: { question_text: string; topic: string; my_answer: string; correct_concept: string; personal_note: string; missed_concepts: string[]; score: number };
    onChange: (d: typeof draft) => void;
    onSave: () => void;
    onCancel: () => void;
}) {
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4" onClick={onCancel}>
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-semibold">Add to mistake notebook</h3>
                        <p className="text-xs text-stone-500">Write down what you learned so you don't forget.</p>
                    </div>
                    <button onClick={onCancel} className="text-stone-500 hover:text-stone-800">✕</button>
                </div>

                <div className="space-y-4">
                    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Question</div>
                        <p className="mt-1 text-sm text-stone-800">{draft.question_text}</p>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-600">My answer</label>
                        <textarea
                            value={draft.my_answer}
                            onChange={(e) => onChange({ ...draft, my_answer: e.target.value })}
                            rows={3}
                            className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-stone-400 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-600">Correct concept / What I missed</label>
                        <textarea
                            value={draft.correct_concept}
                            onChange={(e) => onChange({ ...draft, correct_concept: e.target.value })}
                            placeholder="e.g. useEffect cleanup runs before re-render or unmount"
                            rows={2}
                            className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-stone-400 focus:outline-none"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-600">Personal note</label>
                        <textarea
                            value={draft.personal_note}
                            onChange={(e) => onChange({ ...draft, personal_note: e.target.value })}
                            placeholder="e.g. I always forget the dependency array. Need to practice this pattern."
                            rows={2}
                            className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-stone-400 focus:outline-none"
                        />
                    </div>

                    {draft.missed_concepts.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {draft.missed_concepts.map((c) => (
                                <span key={c} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                    {c}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex gap-2">
                    <button onClick={onCancel} className="flex-1 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-300">Cancel</button>
                    <button onClick={onSave} className="flex-1 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800">
                        Save entry
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ============================================================
// Interview picker + screen
// ============================================================

function InterviewPicker({ onCancel, onPick }: { onCancel: () => void; onPick: (focus: string) => void; }) {
    const [customFocus, setCustomFocus] = useState('');
    const presets = [
        { label: 'Frontend', value: 'Frontend developer interview', description: 'React, CSS, accessibility, browser internals' },
        { label: 'Backend', value: 'Backend developer interview', description: 'APIs, databases, auth, caching' },
        { label: 'System design', value: 'System design interview', description: 'Architecture, scaling, tradeoffs' },
        { label: 'Coding fundamentals', value: 'Coding fundamentals interview', description: 'Data structures, algorithms, complexity' },
    ];

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4" onClick={onCancel}>
            <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-semibold">Start a mock interview</h3>
                        <p className="text-xs text-stone-500">Pick a focus — you can answer by typing.</p>
                    </div>
                    <button onClick={onCancel} className="text-stone-500 hover:text-stone-800">✕</button>
                </div>

                <div className="space-y-2">
                    {presets.map((p) => (
                        <button key={p.value} onClick={() => onPick(p.value)} className="group flex w-full items-center justify-between rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-left transition hover:border-stone-300 hover:bg-white">
                            <div>
                                <div className="text-sm font-medium text-stone-900">{p.label}</div>
                                <div className="text-xs text-stone-500">{p.description}</div>
                            </div>
                            <span className="text-xs text-stone-400 group-hover:text-stone-700">Start →</span>
                        </button>
                    ))}
                </div>

                <div className="mt-4 border-t border-stone-100 pt-4">
                    <label className="text-xs font-medium text-stone-600">Or custom focus</label>
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const q = customFocus.trim();
                            if (q) onPick(`${q} interview`);
                        }}
                        className="mt-2 flex gap-2"
                    >
                        <input value={customFocus} onChange={(e) => setCustomFocus(e.target.value)} placeholder="e.g. DevOps, Data engineering, iOS" className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none" />
                        <button type="submit" disabled={!customFocus.trim()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">
                            Start
                        </button>
                    </form>
                </div>
            </div>
        </div>,
        document.body
    );
}

function InterviewScreen({ focus, transcript, loading, onSend, onEnd }: { focus: string; transcript: InterviewTurn[]; loading: boolean; onSend: (message: string) => void; onEnd: () => void; }) {
    const [draft, setDraft] = useState('');
    const [voiceOn, setVoiceOn] = useState(true);
    const [listening, setListening] = useState(false);
    const [interimText, setInterimText] = useState('');
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const recognitionRef = useRef<any>(null);
    const spokenIndexRef = useRef<number>(-1);

    const SR: any =
        typeof window !== 'undefined'
            ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
            : null;
    const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const micAvailable = !!SR;

    useEffect(() => {
        if (!voiceOn || !speechAvailable) return;
        for (let i = spokenIndexRef.current + 1; i < transcript.length; i++) {
            const turn = transcript[i];
            if (turn.role === 'interviewer') {
                const u = new SpeechSynthesisUtterance(turn.content);
                u.rate = 1.0;
                u.pitch = 1.0;
                const voices = window.speechSynthesis.getVoices();
                const preferred =
                    voices.find((v) => /en-US/i.test(v.lang) && /Google|Samantha|Natural/i.test(v.name)) ||
                    voices.find((v) => /en-US/i.test(v.lang)) ||
                    voices[0];
                if (preferred) u.voice = preferred;
                window.speechSynthesis.speak(u);
            }
            spokenIndexRef.current = i;
        }
    }, [transcript, voiceOn, speechAvailable]);

    useEffect(() => {
        return () => {
            if (speechAvailable) window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch { /* ignore */ }
            }
        };
    }, [speechAvailable]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [transcript, loading, interimText]);

    function toggleVoice() {
        const next = !voiceOn;
        setVoiceOn(next);
        if (!next && speechAvailable) window.speechSynthesis.cancel();
    }

    function startListening() {
        if (!micAvailable || loading) return;
        if (speechAvailable) window.speechSynthesis.cancel();

        const rec = new SR();
        rec.lang = 'en-US';
        rec.continuous = true;
        rec.interimResults = true;

        let finalText = '';

        rec.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const chunk = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalText += chunk + ' ';
                else interim += chunk;
            }
            setInterimText((finalText + interim).trim());
        };
        rec.onerror = () => { setListening(false); };
        rec.onend = () => {
            setListening(false);
            const toSend = finalText.trim();
            setInterimText('');
            if (toSend) onSend(toSend);
        };

        recognitionRef.current = rec;
        setInterimText('');
        setListening(true);
        rec.start();
    }

    function stopListening() {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch { /* ignore */ }
        }
    }

    function submitTyped(e: React.FormEvent) {
        e.preventDefault();
        if (loading || listening) return;
        const t = draft.trim();
        if (!t) return;
        setDraft('');
        onSend(t);
    }

    function handleEnd() {
        if (speechAvailable) window.speechSynthesis.cancel();
        stopListening();
        onEnd();
    }

    return (
        <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs uppercase tracking-wide text-stone-500">Mock interview</div>
                    <div className="text-sm font-medium text-stone-900">{focus}</div>
                </div>
                <div className="flex items-center gap-2">
                    {speechAvailable && (
                        <button
                            onClick={toggleVoice}
                            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300"
                            title={voiceOn ? 'Mute interviewer voice' : 'Unmute interviewer voice'}
                        >
                            {voiceOn ? '🔊 Voice on' : '🔇 Voice off'}
                        </button>
                    )}
                    <button
                        onClick={handleEnd}
                        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300"
                    >
                        End interview
                    </button>
                </div>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-4">
                {transcript.map((turn, i) => (
                    <div key={i} className={`flex ${turn.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${turn.role === 'candidate' ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-900'}`}>
                            {turn.content}
                        </div>
                    </div>
                ))}
                {listening && interimText && (
                    <div className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl border border-dashed border-stone-400 bg-stone-100 px-4 py-2 text-sm italic text-stone-600">
                            {interimText}…
                        </div>
                    </div>
                )}
                {loading && (
                    <div className="flex justify-start">
                        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-500">
                            <span className="inline-flex gap-1">
                                <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
                                <span className="h-2 w-2 animate-bounce rounded-full bg-stone-400" />
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                {micAvailable ? (
                    <button
                        onClick={listening ? stopListening : startListening}
                        disabled={loading}
                        className={`flex w-full items-center justify-center gap-3 rounded-2xl px-4 py-4 text-sm font-medium transition disabled:opacity-50 ${listening ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-stone-900 text-white hover:bg-stone-800'}`}
                    >
                        {listening ? (
                            <>
                                <span className="relative flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
                                </span>
                                Listening… tap to send
                            </>
                        ) : (
                            <>🎤 Tap to speak your answer</>
                        )}
                    </button>
                ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        Voice input isn't supported in this browser. Chrome or Edge work best. You can still type below.
                    </div>
                )}

                <form onSubmit={submitTyped} className="flex gap-2">
                    <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={loading ? 'Interviewer is thinking…' : listening ? 'Listening via mic…' : 'Or type your answer…'}
                        disabled={loading || listening}
                        className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none disabled:opacity-50"
                    />
                    <button type="submit" disabled={loading || listening || !draft.trim()} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50">
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
}

// ============================================================
// Interview evaluation + past viewer
// ============================================================

function InterviewEvaluationScreen({ focus, transcript, evaluation, loading, onDone }: { focus: string; transcript: InterviewTurn[]; evaluation: InterviewEvaluation | null; loading: boolean; onDone: () => void; }) {
    if (loading && !evaluation) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
                <div className="inline-flex gap-1">
                    <span className="h-3 w-3 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.3s]" />
                    <span className="h-3 w-3 animate-bounce rounded-full bg-stone-400 [animation-delay:-0.15s]" />
                    <span className="h-3 w-3 animate-bounce rounded-full bg-stone-400" />
                </div>
                <div className="text-sm text-stone-600">Evaluating your interview…</div>
                <div className="text-xs text-stone-500">Reviewing {transcript.length} messages</div>
            </div>
        );
    }

    if (!evaluation) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
                    Couldn't generate an evaluation for this interview. Your transcript was still saved and you can view it from the dashboard.
                </div>
                <button onClick={onDone} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800">
                    Back to dashboard
                </button>
            </div>
        );
    }

    const score = evaluation.overall_score;
    const scoreColor = typeof score === 'number' && score >= 8 ? 'text-emerald-700' : typeof score === 'number' && score >= 6 ? 'text-amber-700' : 'text-red-700';
    const strengths = evaluation.strengths ?? [];
    const weaknesses = evaluation.weaknesses ?? [];
    const recommendations = evaluation.recommendations ?? [];
    const topicScores = evaluation.topic_scores ?? {};

    return (
        <div className="space-y-4">
            <div>
                <div className="text-xs uppercase tracking-wide text-stone-500">Interview results</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{focus}</h1>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Overall</div>
                        {evaluation.verdict && (
                            <div className="mt-1 text-base font-semibold text-stone-900">{evaluation.verdict}</div>
                        )}
                    </div>
                    {typeof score === 'number' && (
                        <div className={`text-3xl font-semibold tabular-nums ${scoreColor}`}>{score}/10</div>
                    )}
                </div>
                {evaluation.summary && (
                    <p className="mt-4 text-sm leading-relaxed text-stone-800">{evaluation.summary}</p>
                )}
            </div>

            {Object.keys(topicScores).length > 0 && (
                <div className="rounded-2xl border border-stone-200 bg-white p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Topic scores</div>
                    <div className="mt-3 space-y-2">
                        {Object.entries(topicScores).map(([topic, s]) => (
                            <div key={topic} className="flex items-center justify-between text-sm">
                                <span className="text-stone-800">{topic}</span>
                                <span className="tabular-nums font-medium text-stone-900">{s}/10</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {strengths.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Strengths</div>
                    <ul className="mt-2 space-y-1 text-sm text-emerald-900">
                        {strengths.map((s, i) => <li key={i}>· {s}</li>)}
                    </ul>
                </div>
            )}

            {weaknesses.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Areas to improve</div>
                    <ul className="mt-2 space-y-1 text-sm text-amber-900">
                        {weaknesses.map((w, i) => <li key={i}>· {w}</li>)}
                    </ul>
                </div>
            )}

            {recommendations.length > 0 && (
                <div className="rounded-2xl border border-stone-200 bg-white p-6">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recommended next steps</div>
                    <ul className="mt-2 space-y-1 text-sm text-stone-800">
                        {recommendations.map((r, i) => <li key={i}>· {r}</li>)}
                    </ul>
                </div>
            )}

            <div className="flex justify-end pt-2">
                <button onClick={onDone} className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800">
                    Done
                </button>
            </div>
        </div>
    );
}

function PastInterviewViewer({ session, onClose }: { session: InterviewSessionRow; onClose: () => void; }) {
    const date = new Date(session.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const evaluation = session.evaluation;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-base font-semibold">{session.focus}</h3>
                        <p className="text-xs text-stone-500">{date} · {session.turns_completed} turns</p>
                    </div>
                    <button onClick={onClose} className="text-stone-500 hover:text-stone-800">✕</button>
                </div>

                {evaluation && (
                    <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 p-4">
                        <div className="flex items-start justify-between">
                            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Evaluation</div>
                            {typeof evaluation.overall_score === 'number' && (
                                <div className="text-lg font-semibold tabular-nums">{evaluation.overall_score}/10</div>
                            )}
                        </div>
                        {evaluation.verdict && <div className="mt-1 text-sm font-medium text-stone-900">{evaluation.verdict}</div>}
                        {evaluation.summary && <p className="mt-2 text-sm text-stone-700">{evaluation.summary}</p>}
                        {evaluation.strengths && evaluation.strengths.length > 0 && (
                            <div className="mt-3">
                                <div className="text-xs font-semibold text-emerald-700">Strengths</div>
                                <ul className="mt-1 text-xs text-stone-700">
                                    {evaluation.strengths.map((s, i) => <li key={i}>· {s}</li>)}
                                </ul>
                            </div>
                        )}
                        {evaluation.weaknesses && evaluation.weaknesses.length > 0 && (
                            <div className="mt-2">
                                <div className="text-xs font-semibold text-amber-700">Areas to improve</div>
                                <ul className="mt-1 text-xs text-stone-700">
                                    {evaluation.weaknesses.map((w, i) => <li key={i}>· {w}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Transcript</div>
                <div className="mt-2 space-y-2">
                    {session.transcript.map((turn, i) => (
                        <div key={i} className={`flex ${turn.role === 'candidate' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${turn.role === 'candidate' ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-stone-50 text-stone-900'}`}>
                                {turn.content}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
}

// ============================================================
// Notebook Screen
// ============================================================

function NotebookScreen({
    entries, weaknesses, onToggleReviewed, onDelete, onPractice, onBack,
}: {
    entries: NotebookEntry[];
    weaknesses: WeaknessAnalysis[];
    onToggleReviewed: (id: string, current: boolean) => void;
    onDelete: (id: string) => void;
    onPractice: (topic: string) => void;
    onBack: () => void;
}) {
    const [filter, setFilter] = useState<'all' | 'reviewed' | 'pending'>('all');
    const [expanded, setExpanded] = useState<string | null>(null);

    const filtered = entries.filter((e) => {
        if (filter === 'reviewed') return e.reviewed;
        if (filter === 'pending') return !e.reviewed;
        return true;
    });

    const topics = useMemo(() => {
        const map = new Map<string, number>();
        entries.forEach((e) => {
            map.set(e.topic, (map.get(e.topic) || 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }, [entries]);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-stone-500 transition hover:text-stone-900">← Back</button>
            </div>

            <div>
                <div className="text-xs uppercase tracking-wide text-stone-500">Mistake notebook</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Learn from mistakes</h1>
                <p className="mt-1 text-sm text-stone-500">Review what you got wrong and practice weak areas.</p>
            </div>

            {/* Weakness overview */}
            {weaknesses.length > 0 && (
                <section className="rounded-2xl border border-stone-200 bg-white p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Weakest concepts</h2>
                    <p className="mt-1 text-xs text-stone-500">Concepts you miss most often across all sessions</p>
                    <div className="mt-4 space-y-3">
                        {weaknesses.slice(0, 6).map((w) => (
                            <div key={w.concept} className="flex items-center justify-between rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-stone-900 capitalize">{w.concept}</div>
                                    <div className="text-xs text-stone-500">from {labelFor(w.topic)} · missed {w.times_missed}×</div>
                                </div>
                                <button
                                    onClick={() => onPractice(w.suggested_topic)}
                                    className="shrink-0 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800"
                                >
                                    Practice
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Topic breakdown */}
            {topics.length > 0 && (
                <section className="rounded-2xl border border-stone-200 bg-white p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">By topic</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {topics.map(([topic, count]) => (
                            <button
                                key={topic}
                                onClick={() => onPractice(topic)}
                                className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-700 transition hover:border-stone-300"
                            >
                                {labelFor(topic)} <span className="text-stone-400">({count})</span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {/* Entries list */}
            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Your entries</h2>
                    <div className="flex gap-1 rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                        {(['all', 'pending', 'reviewed'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${filter === f ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {filtered.length === 0 ? (
                    <div className="mt-6 text-center">
                        <div className="text-sm text-stone-500">No entries yet.</div>
                        <p className="mt-1 text-xs text-stone-400">Answer questions and click "Add to mistake notebook" to build your personal study guide.</p>
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        {filtered.map((entry) => {
                            const isOpen = expanded === entry.id;
                            return (
                                <div
                                    key={entry.id}
                                    className={`rounded-xl border p-4 transition ${entry.reviewed ? 'border-stone-100 bg-stone-50/50' : 'border-stone-200 bg-white'}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className={`h-2 w-2 shrink-0 rounded-full ${entry.reviewed ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                                <span className="truncate text-sm font-medium text-stone-900">{entry.question_text}</span>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                                                <span className="capitalize">{labelFor(entry.topic)}</span>
                                                <span>·</span>
                                                <span>Scored {entry.score}/10</span>
                                                {entry.missed_concepts.length > 0 && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="text-amber-600">{entry.missed_concepts.join(', ')}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <button
                                                onClick={() => onToggleReviewed(entry.id, entry.reviewed)}
                                                title={entry.reviewed ? 'Mark as not reviewed' : 'Mark as reviewed'}
                                                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                                            >
                                                {entry.reviewed ? '✓' : '○'}
                                            </button>
                                            <button
                                                onClick={() => setExpanded(isOpen ? null : entry.id)}
                                                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                                            >
                                                {isOpen ? '▲' : '▼'}
                                            </button>
                                            <button
                                                onClick={() => onDelete(entry.id)}
                                                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    </div>

                                    {isOpen && (
                                        <div className="mt-3 space-y-3 border-t border-stone-100 pt-3">
                                            <div>
                                                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">My answer</div>
                                                <p className="mt-1 text-sm italic text-stone-700">"{entry.my_answer}"</p>
                                            </div>
                                            {entry.correct_concept && (
                                                <div>
                                                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Correct concept</div>
                                                    <p className="mt-1 text-sm text-stone-800">{entry.correct_concept}</p>
                                                </div>
                                            )}
                                            {entry.personal_note && (
                                                <div>
                                                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">My note</div>
                                                    <p className="mt-1 text-sm text-stone-800">{entry.personal_note}</p>
                                                </div>
                                            )}
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    onClick={() => onPractice(entry.topic)}
                                                    className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800"
                                                >
                                                    Practice this topic
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}

// ============================================================
// Profile
// ============================================================

function ProfileScreen({ profile, email, stats, attemptsCount, onProfileChange }: { profile: Profile; email: string; stats: Stats; attemptsCount: number; onProfileChange: () => void; }) {
    const [modal, setModal] = useState<Modal>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const initial = profile.display_name?.[0]?.toUpperCase() || email[0]?.toUpperCase() || '?';

    async function signOut() { await supabase.auth.signOut(); }

    return (
        <div className="space-y-6">
            {msg && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-200 text-lg font-semibold text-stone-700">{initial}</div>
                    <div className="min-w-0">
                        <div className="truncate text-lg font-semibold tracking-tight">{profile.display_name || email.split('@')[0]}</div>
                        <div className="truncate text-sm text-stone-500">{email}</div>
                        <div className="mt-0.5 text-xs text-stone-500">Level {stats.level} · {attemptsCount} attempts total</div>
                    </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3">
                    <Stat label="Streak" value={`${stats.streak} d`} />
                    <Stat label="Solved" value={stats.solved.toString()} />
                    <Stat label="Accuracy" value={`${stats.accuracy}%`} />
                </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">Account</h2>
                <SettingRow label="Display name" value={profile.display_name || '—'} onClick={() => setModal('display_name')} />
                <SettingRow label="Email" value={email} onClick={() => setModal('email')} />
                <SettingRow label="Change password" value="" onClick={() => setModal('password')} />
                <SettingRow label="Preferred difficulty" value={profile.preferred_difficulty} onClick={() => setModal('difficulty')} />
            </section>

            <button onClick={signOut} className="w-full rounded-2xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-700 transition hover:border-stone-300">
                Sign out
            </button>

            {modal && (
                <SettingModal
                    modal={modal}
                    profile={profile}
                    email={email}
                    busy={busy}
                    setBusy={setBusy}
                    onClose={() => setModal(null)}
                    onDone={(m) => {
                        setModal(null);
                        setMsg(m);
                        onProfileChange();
                        setTimeout(() => setMsg(null), 4000);
                    }}
                />
            )}
        </div>
    );
}

function SettingRow({ label, value, onClick }: { label: string; value: string; onClick: () => void; }) {
    return (
        <button onClick={onClick} className="flex w-full items-center justify-between border-b border-stone-100 py-3 text-left text-sm last:border-b-0">
            <span className="text-stone-800">{label}</span>
            <span className="flex items-center gap-2 text-stone-500">
                <span className="max-w-[180px] truncate text-xs">{value}</span>
                <span>›</span>
            </span>
        </button>
    );
}

function SettingModal({ modal, profile, email, busy, setBusy, onClose, onDone }: { modal: Exclude<Modal, null>; profile: Profile; email: string; busy: boolean; setBusy: (b: boolean) => void; onClose: () => void; onDone: (msg: string) => void; }) {
    const [displayName, setDisplayName] = useState(profile.display_name || '');
    const [newEmail, setNewEmail] = useState(email);
    const [diff, setDiff] = useState<Difficulty>(profile.preferred_difficulty);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setError(null);
        setBusy(true);
        try {
            if (modal === 'display_name') {
                const { error } = await supabase.from('profiles').update({ display_name: displayName || null }).eq('user_id', profile.user_id);
                if (error) throw error;
                onDone('Display name updated');
            } else if (modal === 'email') {
                const { error } = await supabase.auth.updateUser({ email: newEmail });
                if (error) throw error;
                onDone('Check both inboxes to confirm the change');
            } else if (modal === 'password') {
                const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/auth/callback` });
                if (error) throw error;
                onDone(`Password reset link sent to ${email}. Check your inbox and click the link to set a new password.`);
            } else if (modal === 'difficulty') {
                const { error } = await supabase.from('profiles').update({ preferred_difficulty: diff }).eq('user_id', profile.user_id);
                if (error) throw error;
                onDone('Preferred difficulty saved');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    }

    const titles: Record<Exclude<Modal, null>, string> = {
        display_name: 'Change display name',
        email: 'Change email',
        password: 'Change password',
        difficulty: 'Preferred difficulty',
    };
    const ctaLabel = modal === 'password' ? 'Send reset link' : 'Save';

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold">{titles[modal]}</h3>
                    <button onClick={onClose} className="text-stone-500 hover:text-stone-800">✕</button>
                </div>
                {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</div>}
                {modal === 'display_name' && <Field label="Display name" value={displayName} onChange={setDisplayName} />}
                {modal === 'email' && <Field label="New email" type="email" value={newEmail} onChange={setNewEmail} />}
                {modal === 'password' && (
                    <p className="text-sm leading-relaxed text-stone-700">
                        We'll email a secure password reset link to <b>{email}</b>. Click it to set a new password.
                    </p>
                )}
                {modal === 'difficulty' && (
                    <div className="flex gap-2">
                        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                            <button key={d} onClick={() => setDiff(d)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${diff === d ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600'}`}>
                                {d}
                            </button>
                        ))}
                    </div>
                )}
                <div className="mt-6 flex gap-2">
                    <button onClick={onClose} className="flex-1 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-300">Cancel</button>
                    <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50">
                        {busy ? 'Working…' : ctaLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
