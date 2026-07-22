import { useCallback, useEffect, useState } from 'react';
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

// Default topics shown when there's no popularity data yet
const DEFAULT_TOPICS: { slug: string; label: string }[] = [
    { slug: 'data_structures', label: 'Data structures' },
    { slug: 'system_design', label: 'System design' },
    { slug: 'network_security', label: 'Network security' },
    { slug: 'sql_databases', label: 'SQL and databases' },
    { slug: 'algorithms', label: 'Algorithms' },
    { slug: 'operating_systems', label: 'Operating systems' },
];
// Broader list of topics for autocomplete
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
    // Turn "react hooks" or "react_hooks" → "React hooks"
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

function saveRecentTopics(topics: string[]) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(RECENT_TOPICS_KEY, JSON.stringify(topics));
    } catch {
        // Ignore localStorage errors.
    }
}

function normalizeTopic(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

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
// Sign in / Sign up
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
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
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

    const title =
        mode === 'signin'
            ? 'Welcome back'
            : mode === 'signup'
                ? 'Create your account'
                : 'Reset your password';
    const subtitle =
        mode === 'signin'
            ? 'Sign in to keep your streak going'
            : mode === 'signup'
                ? 'Start practicing in under a minute'
                : "We'll email you a reset link";
    const cta =
        mode === 'signin'
            ? 'Sign in'
            : mode === 'signup'
                ? 'Create account'
                : 'Send reset link';

    return (
        <div className="min-h-screen bg-[#f4efe4]">
            <header className="border-b border-stone-200">
                <div className="mx-auto max-w-3xl px-6 py-4">
                    <span className="text-base font-semibold tracking-tight">
                        Interview prep
                    </span>
                </div>
            </header>

            <main className="mx-auto mt-12 max-w-sm px-6">
                <form
                    onSubmit={submit}
                    className="rounded-2xl border border-stone-200 bg-white p-8"
                >
                    <div className="text-center">
                        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
                        <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                            {error}
                        </div>
                    )}
                    {info && (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                            {info}
                        </div>
                    )}

                    <div className="mt-6 space-y-4">
                        {mode === 'signup' && (
                            <Field
                                label="Display name (optional)"
                                value={displayName}
                                onChange={setDisplayName}
                                placeholder="your name"
                            />
                        )}
                        <Field
                            label="Email"
                            type="email"
                            value={email}
                            onChange={setEmail}
                            placeholder="you@example.com"
                            required
                        />
                        {mode !== 'forgot' && (
                            <Field
                                label="Password"
                                type="password"
                                value={password}
                                onChange={setPassword}
                                minLength={6}
                                required
                            />
                        )}
                        <button
                            type="submit"
                            disabled={busy}
                            className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
                        >
                            {busy ? 'Working…' : cta}
                        </button>
                    </div>

                    <div className="mt-6 space-y-2 text-center text-xs text-stone-500">
                        {mode === 'signin' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('forgot');
                                        setError(null);
                                        setInfo(null);
                                    }}
                                    className="font-medium text-stone-700 underline underline-offset-2"
                                >
                                    Forgot password?
                                </button>
                                <p>
                                    Don't have an account?{' '}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMode('signup');
                                            setError(null);
                                            setInfo(null);
                                        }}
                                        className="font-medium text-stone-800 underline underline-offset-2"
                                    >
                                        Sign up
                                    </button>
                                </p>
                            </>
                        )}
                        {mode === 'signup' && (
                            <p>
                                Already have one?{' '}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('signin');
                                        setError(null);
                                        setInfo(null);
                                    }}
                                    className="font-medium text-stone-800 underline underline-offset-2"
                                >
                                    Sign in
                                </button>
                            </p>
                        )}
                        {mode === 'forgot' && (
                            <p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode('signin');
                                        setError(null);
                                        setInfo(null);
                                    }}
                                    className="font-medium text-stone-800 underline underline-offset-2"
                                >
                                    Back to sign in
                                </button>
                            </p>
                        )}
                    </div>
                </form>
            </main>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    type = 'text',
    placeholder,
    required,
    minLength,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
    required?: boolean;
    minLength?: number;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-600">
                {label}
            </label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                minLength={minLength}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:outline-none"
            />
        </div>
    );
}

// ============================================================
// Password recovery (arrived via email link)
// ============================================================

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
                    <span className="text-base font-semibold tracking-tight">
                        Interview prep
                    </span>
                </div>
            </header>
            <main className="mx-auto mt-12 max-w-sm px-6">
                <form
                    onSubmit={submit}
                    className="rounded-2xl border border-stone-200 bg-white p-8"
                >
                    <h1 className="text-center text-xl font-semibold tracking-tight">
                        Set a new password
                    </h1>
                    <p className="mt-1 text-center text-sm text-stone-500">
                        You'll be signed in after this
                    </p>
                    {error && (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                            {error}
                        </div>
                    )}
                    {ok && (
                        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                            Password updated. Redirecting…
                        </div>
                    )}
                    <div className="mt-6">
                        <Field
                            label="New password"
                            type="password"
                            value={pw}
                            onChange={setPw}
                            minLength={6}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={busy}
                        className="mt-6 w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
                    >
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

type Screen = 'dashboard' | 'question' | 'feedback' | 'profile';

function AuthedApp({ session }: { session: Session }) {
    const user = session.user;
    const [screen, setScreen] = useState<Screen>('dashboard');
    const [profile, setProfile] = useState<Profile | null>(null);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [stats, setStats] = useState<Stats>(computeStats([]));
    const [popularTopics, setPopularTopics] = useState<
        { slug: string; attempts: number }[]
    >([]);
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

    const loadAll = useCallback(async () => {
        const [{ data: p }, { data: a }, { data: pop }] = await Promise.all([
            supabase.from('profiles').select('*').eq('user_id', user.id).single(),
            supabase
                .from('attempts')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(500),
            supabase.rpc('get_popular_topics', { limit_count: 6 }),
        ]);
        if (p) {
            setProfile(p as Profile);
            setDifficulty((p as Profile).preferred_difficulty);
        }
        if (a) {
            setAttempts(a as Attempt[]);
            setStats(computeStats(a as Attempt[]));
        }
        if (pop && Array.isArray(pop)) {
            setPopularTopics(
                pop.map((row: any) => ({
                    slug: row.topic as string,
                    attempts: Number(row.attempts) || 0,
                }))
            );
        }
    }, [user.id]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

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
        try {
            const q = await api.generateQuestion(clean, difficulty, []);
            setRecentQuestions([q.question_text]);
            setQuestion(q);
            setScreen('question');
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
            const result = await api.gradeAnswer(
                question.id,
                question.question_text,
                answer,
                hintsUsed
            );
            setFeedback(result);
            setScreen('feedback');
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
                const query = focus
                    ? `${question.topic} ${focus} programming tutorial`
                    : `${question.topic} programming tutorial for developers`;
                const v = await api.getVideos(query);
                setVideos(v.videos);
            } catch {
                /* videos optional */
            }
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
    }

    const displayName =
        profile?.display_name || user.email?.split('@')[0] || 'there';

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
                        onDifficulty={async (d) => {
                            setDifficulty(d);
                            await supabase
                                .from('profiles')
                                .update({ preferred_difficulty: d })
                                .eq('user_id', user.id);
                        }}
                        onStart={startSession}
                        loading={loading}
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
                        onExit={goDashboard}
                        loading={loading}
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
            </main>
        </div>
    );
}

// ============================================================
// Nav — no email displayed
// ============================================================

function TopNav({
    current,
    onNavigate,
}: {
    current: Screen;
    onNavigate: (s: Screen) => void;
}) {
    const link = (label: string, target: Screen) => (
        <button
            onClick={() => onNavigate(target)}
            className={`text-sm transition ${current === target
                ? 'font-semibold text-stone-900'
                : 'text-stone-500 hover:text-stone-800'
                }`}
        >
            {label}
        </button>
    );
    return (
        <header className="border-b border-stone-200 bg-[#f4efe4]">
            <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
                <button
                    onClick={() => onNavigate('dashboard')}
                    className="text-base font-semibold tracking-tight"
                >
                    Interview prep
                </button>
                <nav className="flex items-center gap-5">
                    {link('Dashboard', 'dashboard')}
                    {link('Profile', 'profile')}
                </nav>
            </div>
        </header>
    );
}

// ============================================================
// Dashboard — with search + popular topics
// ============================================================

function Dashboard({
    displayName,
    stats,
    difficulty,
    popularTopics,
    attempts,
    onDifficulty,
    onStart,
    loading,
}: {
    displayName: string;
    stats: Stats;
    difficulty: Difficulty;
    popularTopics: { slug: string; attempts: number }[];
    attempts: Attempt[];
    onDifficulty: (d: Difficulty) => void;
    onStart: (t: Topic) => void;
    loading: boolean;
}) {
    const [search, setSearch] = useState('');
    const [showCalendar, setShowCalendar] = useState(false);
    const [recent, setRecent] = useState<string[]>(loadRecentTopics());

    const query = search.trim().toLowerCase();

    // Popular OR default topics as base list
    const basePopular = popularTopics.length > 0
        ? popularTopics.map((p) => ({ slug: p.slug, attempts: p.attempts }))
        : DEFAULT_TOPICS.map((t) => ({ slug: t.slug, attempts: 0 }));

    // Build a de-duplicated pool of every topic we could show
    const pool = Array.from(
        new Set([
            ...TOPIC_SUGGESTIONS.map((s) => normalizeTopic(s)),
            ...recent,
            ...basePopular.map((p) => p.slug),
        ])
    );

    // When user has typed something, filter the pool
    const filtered = query
        ? pool.filter((slug) => slug.includes(query)).slice(0, 12)
        : [];

    function submitSearch(e: React.FormEvent) {
        e.preventDefault();
        const q = search.trim();
        if (!q) return;
        setRecent([q.toLowerCase(), ...recent.filter((r) => r !== q.toLowerCase())].slice(0, 5));
        onStart(q);
    }

    function pickTopic(slug: string) {
        setRecent([slug, ...recent.filter((r) => r !== slug)].slice(0, 5));
        setSearch('');
        onStart(slug);
    }

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="mb-1 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            Welcome back, {displayName}
                        </h1>
                        <p className="mt-1 text-sm text-stone-500">
                            Level {stats.level} · Practice track
                        </p>
                    </div>
                    <button
                        onClick={() => setShowCalendar(true)}
                        className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-white"
                    >
                        🔥 {stats.streak} day streak
                    </button>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Solved" value={stats.solved.toString()} />
                    <Stat label="Accuracy" value={`${stats.accuracy}%`} />
                    <Stat label="Hints" value={stats.hints.toString()} />
                    <Stat label="XP" value={`${stats.xp}/${stats.xpForNext}`} />
                </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <h2 className="text-lg font-semibold tracking-tight">
                    Start today's session
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                    Search any topic or pick one below · typed answers · hints available
                </p>

                <form onSubmit={submitSearch} className="mt-4 flex gap-2">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="e.g. Web design, React hooks, Kubernetes…"
                        className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm placeholder-stone-400 focus:border-stone-400 focus:outline-none"
                    />
                    <button
                        type="submit"
                        disabled={loading || !search.trim()}
                        className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
                    >
                        {loading ? 'Searching…' : 'Search'}
                    </button>
                </form>

                <div className="mt-4 flex flex-wrap gap-2">
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                        <button
                            key={d}
                            onClick={() => onDifficulty(d)}
                            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${difficulty === d
                                ? 'bg-stone-900 text-white'
                                : 'border border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                                }`}
                        >
                            {d}
                        </button>
                    ))}
                </div>
            </section>

            {query ? (
                <section className="rounded-2xl border border-stone-200 bg-white p-6">
                    <div className="mb-4 flex items-baseline justify-between">
                        <h2 className="text-lg font-semibold tracking-tight">
                            Results for "{search}"
                        </h2>
                        <span className="text-xs text-stone-500">
                            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
                        </span>
                    </div>
                    {filtered.length > 0 ? (
                        <div className="space-y-2">
                            {filtered.map((slug) => (
                                <button
                                    key={slug}
                                    onClick={() => pickTopic(slug)}
                                    disabled={loading}
                                    className="group flex w-full items-center justify-between rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-left transition hover:border-stone-300 hover:bg-white disabled:opacity-50"
                                >
                                    <div>
                                        <div className="text-sm font-medium text-stone-900">
                                            {labelFor(slug)}
                                        </div>
                                        <div className="text-xs text-stone-500">
                                            {recent.includes(slug) ? 'Recently searched' : 'Suggested'}
                                        </div>
                                    </div>
                                    <span className="text-xs text-stone-400 group-hover:text-stone-700">
                                        Practice →
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-stone-600">
                            No matching topics — click <b>Search</b> to try "{search}" anyway.
                        </p>
                    )}
                </section>
            ) : (
                <>
                    {recent.length > 0 && (
                        <section className="rounded-2xl border border-stone-200 bg-white p-6">
                            <div className="mb-4 flex items-baseline justify-between">
                                <h2 className="text-lg font-semibold tracking-tight">
                                    Your recent topics
                                </h2>
                                <span className="text-xs text-stone-500">Just for you</span>
                            </div>
                            <div className="space-y-2">
                                {recent.map((slug) => (
                                    <button
                                        key={slug}
                                        onClick={() => pickTopic(slug)}
                                        disabled={loading}
                                        className="group flex w-full items-center justify-between rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-left transition hover:border-stone-300 hover:bg-white disabled:opacity-50"
                                    >
                                        <div>
                                            <div className="text-sm font-medium text-stone-900">
                                                {labelFor(slug)}
                                            </div>
                                            <div className="text-xs text-stone-500">Recently searched</div>
                                        </div>
                                        <span className="text-xs text-stone-400 group-hover:text-stone-700">
                                            Practice →
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="rounded-2xl border border-stone-200 bg-white p-6">
                        <div className="mb-4 flex items-baseline justify-between">
                            <h2 className="text-lg font-semibold tracking-tight">
                                {popularTopics.length > 0 ? 'Popular topics' : 'Suggested topics'}
                            </h2>
                            <span className="text-xs text-stone-500">
                                {popularTopics.length > 0
                                    ? 'Trending across all users'
                                    : 'Get started with these'}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {basePopular
                                .filter((t) => !recent.includes(t.slug))
                                .map((t) => (
                                    <button
                                        key={t.slug}
                                        onClick={() => pickTopic(t.slug)}
                                        disabled={loading}
                                        className="group flex w-full items-center justify-between rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-left transition hover:border-stone-300 hover:bg-white disabled:opacity-50"
                                    >
                                        <div>
                                            <div className="text-sm font-medium text-stone-900">
                                                {labelFor(t.slug)}
                                            </div>
                                            <div className="text-xs text-stone-500">
                                                {t.attempts > 0
                                                    ? `${t.attempts} attempt${t.attempts === 1 ? '' : 's'} by users`
                                                    : 'No attempts yet'}
                                            </div>
                                        </div>
                                        <span className="text-xs text-stone-400 group-hover:text-stone-700">
                                            Start →
                                        </span>
                                    </button>
                                ))}
                        </div>
                    </section>
                </>
            )}

            {showCalendar && (
                <StreakCalendar
                    attempts={attempts}
                    stats={stats}
                    onClose={() => setShowCalendar(false)}
                />
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
            <div className="text-xs uppercase tracking-wide text-stone-500">
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold tracking-tight">{value}</div>
        </div>
    );
}

// ============================================================
// Question / Feedback (unchanged from previous batch)
// ============================================================
function StreakCalendar({
    attempts,
    stats,
    onClose,
}: {
    attempts: Attempt[];
    stats: Stats;
    onClose: () => void;
}) {
    // Build a set of dates (YYYY-MM-DD) with at least one attempt
    const activeDays = new Set(
        attempts.map((a) => new Date(a.created_at).toISOString().slice(0, 10))
    );

    // Show the last 84 days (12 weeks) in a GitHub-style heatmap
    const days = 84;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cells: { date: Date; key: string; active: boolean; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const count = attempts.filter(
            (a) => new Date(a.created_at).toISOString().slice(0, 10) === key
        ).length;
        cells.push({ date: d, key, active: activeDays.has(key), count });
    }

    // Chunk into weeks (7-day rows)
    const weeks: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    const monthLabel = today.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-semibold">Your streak</h3>
                        <p className="text-xs text-stone-500">Last 12 weeks · {monthLabel}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-stone-500 hover:text-stone-800"
                    >
                        ✕
                    </button>
                </div>

                <div className="mb-4 grid grid-cols-3 gap-3">
                    <Stat label="Current" value={`${stats.streak} d`} />
                    <Stat label="Solved" value={stats.solved.toString()} />
                    <Stat label="Days active" value={activeDays.size.toString()} />
                </div>

                <div className="flex gap-1">
                    {weeks.map((week, wi) => (
                        <div key={wi} className="flex flex-col gap-1">
                            {week.map((cell) => (
                                <div
                                    key={cell.key}
                                    title={`${cell.key}${cell.active ? ` · ${cell.count} attempt${cell.count === 1 ? '' : 's'}` : ' · no activity'}`}
                                    className={`h-3 w-3 rounded-sm ${cell.count === 0
                                        ? 'bg-stone-100'
                                        : cell.count < 3
                                            ? 'bg-emerald-200'
                                            : cell.count < 6
                                                ? 'bg-emerald-400'
                                                : 'bg-emerald-600'
                                        }`}
                                />
                            ))}
                        </div>
                    ))}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 text-xs text-stone-500">
                    <span>Less</span>
                    <div className="h-3 w-3 rounded-sm bg-stone-100" />
                    <div className="h-3 w-3 rounded-sm bg-emerald-200" />
                    <div className="h-3 w-3 rounded-sm bg-emerald-400" />
                    <div className="h-3 w-3 rounded-sm bg-emerald-600" />
                    <span>More</span>
                </div>
            </div>
        </div>
    );
}
function QuestionScreen({
    question,
    answer,
    onAnswer,
    hint,
    loading,
    questionIndex,
    sessionLength,
    onSubmit,
    onHint,
    onBack,
}: {
    question: Question;
    answer: string;
    onAnswer: (s: string) => void;
    hint: string | null;
    loading: boolean;
    questionIndex: number;
    sessionLength: number;
    onSubmit: () => void;
    onHint: () => void;
    onBack: () => void;
}) {
    return (
        <div className="space-y-4">
            <button
                onClick={onBack}
                className="inline-flex items-center gap-1 text-sm text-stone-500 transition hover:text-stone-900"
            >
                ← Back to dashboard
            </button>

            <div className="flex items-center justify-between">
                <div className="text-sm text-stone-500">
                    Question {questionIndex} of {sessionLength} ·{' '}
                    <span className="capitalize">{labelFor(question.topic)}</span>
                </div>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium capitalize text-stone-700">
                    {question.difficulty}
                </span>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <p className="text-base leading-relaxed">{question.question_text}</p>
            </div>

            <textarea
                value={answer}
                onChange={(e) => onAnswer(e.target.value)}
                placeholder="Type your answer here — explain it like you would to an interviewer."
                rows={7}
                className="w-full resize-none rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-stone-900 placeholder-stone-400 focus:border-stone-400 focus:outline-none"
            />

            {hint && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
                        Hint
                    </div>
                    {hint}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    onClick={onHint}
                    disabled={loading || hint !== null}
                    className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-300 disabled:opacity-50"
                >
                    {hint ? 'Hint used' : 'Use a hint (−5 pts)'}
                </button>
                <button
                    onClick={onSubmit}
                    disabled={loading || !answer.trim()}
                    className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
                >
                    {loading ? 'Grading…' : 'Submit answer'}
                </button>
            </div>
        </div>
    );
}

function FeedbackScreen({
    question,
    answer,
    feedback,
    videos,
    questionIndex,
    sessionLength,
    onNext,
    onExit,
    loading,
}: {
    question: Question;
    answer: string;
    feedback: GradeResult;
    videos: Video[];
    questionIndex: number;
    sessionLength: number;
    onNext: () => void;
    onExit: () => void;
    loading: boolean;
}) {
    const verdictLabel =
        feedback.verdict === 'correct'
            ? 'Correct'
            : feedback.verdict === 'partial'
                ? 'Partially correct'
                : 'Incorrect';
    const verdictStyles =
        feedback.verdict === 'correct'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : feedback.verdict === 'partial'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-800';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-sm text-stone-500">
                    Question {questionIndex} of {sessionLength} ·{' '}
                    <span className="capitalize">{labelFor(question.topic)}</span>
                </div>
                <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${verdictStyles}`}
                >
                    {verdictLabel}
                </span>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Your answer
                </div>
                <p className="mt-2 text-sm italic leading-relaxed text-stone-700">
                    "{answer}"
                </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Feedback
                    </div>
                    <div className="text-lg font-semibold tabular-nums">
                        {feedback.score}/10
                    </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-stone-800">
                    {feedback.feedback}
                </p>

                {feedback.strong_concepts.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            Strong concepts
                        </div>
                        <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                            {feedback.strong_concepts.map((c) => (
                                <li key={c}>· {c}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {feedback.missed_concepts.length > 0 && (
                    <div className="mt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-stone-600">
                            Missed concepts
                        </div>
                        <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                            {feedback.missed_concepts.map((c) => (
                                <li key={c}>· {c}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {feedback.xp_earned > 0 && (
                    <div className="mt-4 text-xs text-stone-500">
                        +{feedback.xp_earned} XP earned
                    </div>
                )}
            </div>

            {videos.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                        Recommended videos
                    </div>
                    {videos.slice(0, 3).map((v) => (
                        <a
                            key={v.video_id}
                            href={v.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-3 transition hover:border-stone-300"
                        >
                            <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                                <img
                                    src={`https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg`}
                                    alt=""
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src =
                                            `https://img.youtube.com/vi/${v.video_id}/hqdefault.jpg`;
                                    }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white">
                                        <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-3.5 w-3.5">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-stone-900">
                                    {v.title}
                                </div>
                                <div className="mt-0.5 truncate text-xs text-stone-500">
                                    {v.channel}
                                </div>
                            </div>
                            <span className="shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 transition group-hover:border-stone-300">
                                Watch
                            </span>
                        </a>
                    ))}
                </div>
            )}

            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={onExit}
                    className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-300"
                >
                    Exit session
                </button>
                <button
                    onClick={onNext}
                    disabled={loading}
                    className="ml-auto rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
                >
                    {loading ? 'Loading…' : 'Next question'}
                </button>
            </div>
        </div>
    );
}

// ============================================================
// Profile — password change now sends reset email
// ============================================================

type Modal =
    | null
    | 'email'
    | 'password'
    | 'display_name'
    | 'notifications'
    | 'difficulty';

function ProfileScreen({
    profile,
    email,
    stats,
    attemptsCount,
    onProfileChange,
}: {
    profile: Profile;
    email: string;
    stats: Stats;
    attemptsCount: number;
    onProfileChange: () => void;
}) {
    const [modal, setModal] = useState<Modal>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const initial =
        profile.display_name?.[0]?.toUpperCase() ||
        email[0]?.toUpperCase() ||
        '?';

    async function signOut() {
        await supabase.auth.signOut();
    }

    return (
        <div className="space-y-6">
            {msg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    {msg}
                </div>
            )}

            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-200 text-lg font-semibold text-stone-700">
                        {initial}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-lg font-semibold tracking-tight">
                            {profile.display_name || email.split('@')[0]}
                        </div>
                        <div className="truncate text-sm text-stone-500">{email}</div>
                        <div className="mt-0.5 text-xs text-stone-500">
                            Level {stats.level} · {attemptsCount} attempts total
                        </div>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-3">
                    <Stat label="Streak" value={`${stats.streak} d`} />
                    <Stat label="Solved" value={stats.solved.toString()} />
                    <Stat label="Accuracy" value={`${stats.accuracy}%`} />
                </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-6">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
                    Account
                </h2>
                <SettingRow
                    label="Display name"
                    value={profile.display_name || '—'}
                    onClick={() => setModal('display_name')}
                />
                <SettingRow label="Email" value={email} onClick={() => setModal('email')} />
                <SettingRow
                    label="Change password"
                    value=""
                    onClick={() => setModal('password')}
                />
                <SettingRow
                    label="Notification preferences"
                    value={profile.email_notifications ? 'On' : 'Off'}
                    onClick={() => setModal('notifications')}
                />
                <SettingRow
                    label="Preferred difficulty"
                    value={profile.preferred_difficulty}
                    onClick={() => setModal('difficulty')}
                />
            </section>

            <button
                onClick={signOut}
                className="w-full rounded-2xl border border-stone-200 bg-white py-3 text-sm font-medium text-stone-700 transition hover:border-stone-300"
            >
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

function SettingRow({
    label,
    value,
    onClick,
}: {
    label: string;
    value: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="flex w-full items-center justify-between border-b border-stone-100 py-3 text-left text-sm last:border-b-0"
        >
            <span className="text-stone-800">{label}</span>
            <span className="flex items-center gap-2 text-stone-500">
                <span className="max-w-[180px] truncate text-xs">{value}</span>
                <span>›</span>
            </span>
        </button>
    );
}

function SettingModal({
    modal,
    profile,
    email,
    busy,
    setBusy,
    onClose,
    onDone,
}: {
    modal: Exclude<Modal, null>;
    profile: Profile;
    email: string;
    busy: boolean;
    setBusy: (b: boolean) => void;
    onClose: () => void;
    onDone: (msg: string) => void;
}) {
    const [displayName, setDisplayName] = useState(profile.display_name || '');
    const [newEmail, setNewEmail] = useState(email);
    const [notifOn, setNotifOn] = useState(profile.email_notifications);
    const [diff, setDiff] = useState<Difficulty>(profile.preferred_difficulty);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setError(null);
        setBusy(true);
        try {
            if (modal === 'display_name') {
                const { error } = await supabase
                    .from('profiles')
                    .update({ display_name: displayName || null })
                    .eq('user_id', profile.user_id);
                if (error) throw error;
                onDone('Display name updated');
            } else if (modal === 'email') {
                const { error } = await supabase.auth.updateUser({ email: newEmail });
                if (error) throw error;
                onDone('Check both inboxes to confirm the change');
            } else if (modal === 'password') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                });
                if (error) throw error;
                onDone(
                    `Password reset link sent to ${email}. Check your inbox and click the link to set a new password.`
                );
            } else if (modal === 'notifications') {
                const { error } = await supabase
                    .from('profiles')
                    .update({ email_notifications: notifOn })
                    .eq('user_id', profile.user_id);
                if (error) throw error;
                onDone('Notification preferences saved');
            } else if (modal === 'difficulty') {
                const { error } = await supabase
                    .from('profiles')
                    .update({ preferred_difficulty: diff })
                    .eq('user_id', profile.user_id);
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
        notifications: 'Email notifications',
        difficulty: 'Preferred difficulty',
    };

    const ctaLabel = modal === 'password' ? 'Send reset link' : 'Save';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold">{titles[modal]}</h3>
                    <button
                        onClick={onClose}
                        className="text-stone-500 hover:text-stone-800"
                    >
                        ✕
                    </button>
                </div>

                {error && (
                    <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                        {error}
                    </div>
                )}

                {modal === 'display_name' && (
                    <Field label="Display name" value={displayName} onChange={setDisplayName} />
                )}
                {modal === 'email' && (
                    <Field label="New email" type="email" value={newEmail} onChange={setNewEmail} />
                )}
                {modal === 'password' && (
                    <p className="text-sm leading-relaxed text-stone-700">
                        We'll email a secure password reset link to <b>{email}</b>. Click it to set a
                        new password.
                    </p>
                )}
                {modal === 'notifications' && (
                    <label className="flex items-center gap-3 text-sm">
                        <input
                            type="checkbox"
                            checked={notifOn}
                            onChange={(e) => setNotifOn(e.target.checked)}
                            className="h-4 w-4"
                        />
                        Receive practice reminders by email
                    </label>
                )}
                {modal === 'difficulty' && (
                    <div className="flex gap-2">
                        {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                            <button
                                key={d}
                                onClick={() => setDiff(d)}
                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${diff === d
                                    ? 'bg-stone-900 text-white'
                                    : 'border border-stone-200 bg-white text-stone-600'
                                    }`}
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                )}

                <div className="mt-6 flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 hover:border-stone-300"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={save}
                        disabled={busy}
                        className="flex-1 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
                    >
                        {busy ? 'Working…' : ctaLabel}
                    </button>

                </div>

            </div>

        </div>
    );
}