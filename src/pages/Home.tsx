import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  Zap, BarChart3, WifiOff, Users, BookOpen, Shield,
  Play, ClipboardList, Trophy, ArrowRight, Sparkles,
  GraduationCap, Globe
} from 'lucide-react';
import logo from '../assets/logo.png';

function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let current = 0;
          const step = Math.ceil(target / 40);
          const timer = setInterval(() => {
            current += step;
            if (current >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(current);
            }
          }, 30);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="animate-count-up">
      <span className="text-3xl md:text-4xl font-black text-white">
        {count.toLocaleString()}{suffix}
      </span>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Real-Time Play',
      desc: 'Students answer live with instant feedback, speed bonuses, and streak rewards that keep everyone engaged.',
      color: 'bg-answer-red/10 text-answer-red',
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: 'Rich Analytics',
      desc: 'Per-question accuracy, average response time, and exportable CSV reports for data-driven teaching.',
      color: 'bg-answer-blue/10 text-answer-blue',
    },
    {
      icon: <WifiOff className="w-6 h-6" />,
      title: 'Works Offline',
      desc: 'Assignment mode with offline caching. Answers sync automatically when students reconnect.',
      color: 'bg-answer-green/10 text-answer-green',
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: 'Anti-Cheat Built In',
      desc: 'Session tokens, server-authoritative scoring, and duplicate detection keep games fair.',
      color: 'bg-brand/10 text-brand',
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: 'Scales to 1000s',
      desc: 'Sharded leaderboards and optimized Cloud Functions handle large classrooms with ease.',
      color: 'bg-answer-yellow/10 text-answer-yellow',
    },
    {
      icon: <BookOpen className="w-6 h-6" />,
      title: 'Multiple Question Types',
      desc: 'MCQ, True/False, Short Answer with image support. Build varied assessments in minutes.',
      color: 'bg-accent/10 text-accent-dark',
    },
  ];

  const steps = [
    { icon: <ClipboardList className="w-7 h-7" />, title: 'Create a Quiz', desc: 'Add questions with images, set time limits, and choose question types.' },
    { icon: <Play className="w-7 h-7" />, title: 'Host Live', desc: 'Share the 6-digit PIN. Students join from any device — no account needed.' },
    { icon: <Trophy className="w-7 h-7" />, title: 'See Results', desc: 'View the leaderboard, per-question analytics, and export data.' },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-surface-dark text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-brand-light rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-warning/30 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-24 md:py-36">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-sm font-medium mb-8 animate-fade-in">
              <Sparkles className="w-4 h-4 text-warning" />
              Free for teachers — no credit card required
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in leading-[1.1]">
              Make Learning
              <span className="block bg-gradient-to-r from-accent via-success to-accent bg-clip-text text-transparent">Unforgettable</span>
            </h1>
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto mb-10 animate-fade-in leading-relaxed">
              Host live quizzes that spark engagement. Track understanding in real-time.
              Works on any device, even offline.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
              <button
                onClick={() => navigate('/signup')}
                className="group px-8 py-4 bg-white text-brand font-bold rounded-xl text-lg hover:bg-gray-50 transition-all hover:scale-[1.02] shadow-lg shadow-black/20 flex items-center justify-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/join')}
                className="px-8 py-4 bg-white/10 backdrop-blur text-white font-bold rounded-xl text-lg border border-white/20 hover:bg-white/20 transition-all hover:scale-[1.02]"
              >
                Join a Game
              </button>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" className="w-full" preserveAspectRatio="none">
            <path d="M0 80L60 73.3C120 66.7 240 53.3 360 48C480 42.7 600 45.3 720 50.7C840 56 960 64 1080 64C1200 64 1320 56 1380 52L1440 48V80H0Z" fill="#F8F9FA"/>
          </svg>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative -mt-8 z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-gradient-to-r from-brand-dark to-brand rounded-2xl shadow-xl p-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {[
                { value: 50000, suffix: '+', label: 'Quizzes Created' },
                { value: 200, suffix: 'K+', label: 'Students Engaged' },
                { value: 150, suffix: '+', label: 'Countries' },
                { value: 99, suffix: '%', label: 'Uptime' },
              ].map((stat) => (
                <div key={stat.label}>
                  <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                  <p className="text-white/60 text-sm mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-4 py-20 md:py-28">
        <div className="text-center mb-16">
          <span className="text-sm font-semibold text-brand uppercase tracking-wider">How it Works</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">
            Three steps to an engaging classroom
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 stagger-children">
          {steps.map((step, i) => (
            <div key={step.title} className="text-center animate-fade-in">
              <div className="relative inline-flex mb-6">
                <div className="w-16 h-16 bg-brand/10 rounded-2xl flex items-center justify-center text-brand">
                  {step.icon}
                </div>
                <span className="absolute -top-2 -right-2 w-7 h-7 bg-brand text-white text-sm font-bold rounded-full flex items-center justify-center shadow-md">
                  {i + 1}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
              <p className="text-gray-500 leading-relaxed max-w-xs mx-auto">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-brand uppercase tracking-wider">Features</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">
              Everything you need for engaging quizzes
            </h2>
            <p className="text-gray-500 mt-4 max-w-2xl mx-auto">
              Built for real classrooms with real constraints. Fast, reliable, and works everywhere.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {features.map((f) => (
              <div
                key={f.title}
                className="group bg-surface rounded-2xl p-7 border border-gray-100 hover:border-brand/20 hover:shadow-lg transition-all duration-300 animate-fade-in"
              >
                <div className={`w-12 h-12 rounded-xl ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 leading-relaxed text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / Social Proof */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <span className="text-sm font-semibold text-brand uppercase tracking-wider">Trusted Platform</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mt-3">
              Built for educators, loved by students
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "My students actually look forward to review days now. The live leaderboard creates healthy competition that keeps everyone engaged.",
                name: "Sarah M.",
                role: "High School Biology Teacher",
                icon: <GraduationCap className="w-5 h-5" />,
              },
              {
                quote: "The offline assignment mode is a lifesaver. Many of my students have unreliable internet at home, and this just works.",
                name: "David K.",
                role: "Middle School Math Teacher",
                icon: <Globe className="w-5 h-5" />,
              },
              {
                quote: "Setting up a quiz and going live takes less than 5 minutes. The analytics afterwards help me adjust my lessons instantly.",
                name: "Maria L.",
                role: "Elementary Teacher",
                icon: <Sparkles className="w-5 h-5" />,
              },
            ].map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm">
                <div className="flex items-center gap-2 text-brand mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg key={i} className="w-4 h-4 fill-warning" viewBox="0 0 20 20">
                      <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-600 leading-relaxed mb-6 text-sm">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand/10 rounded-full flex items-center justify-center text-brand">
                    {t.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-dark text-white py-20 md:py-28">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-20 w-64 h-64 bg-accent rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-20 w-80 h-80 bg-warning rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6">
            Ready to transform your classroom?
          </h2>
          <p className="text-lg text-white/70 mb-10 max-w-xl mx-auto">
            Join thousands of educators using LiveClass to make learning interactive, measurable, and fun.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/signup')}
              className="group px-8 py-4 bg-white text-brand font-bold rounded-xl text-lg hover:bg-gray-50 transition-all hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2"
            >
              Start for Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/join')}
              className="px-8 py-4 bg-white/10 backdrop-blur text-white font-bold rounded-xl text-lg border border-white/20 hover:bg-white/20 transition-all"
            >
              Join a Game
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white/50 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2">
            <img src={logo} alt="LiveClass" className="w-6 h-6 rounded" />
            <span>LiveClass</span>
          </div>
          <p>Built with care for educators everywhere.</p>
        </div>
      </footer>
    </div>
  );
}
