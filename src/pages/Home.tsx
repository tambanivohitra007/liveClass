import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, ArrowRight,
  ClipboardList, Trophy, Share2
} from 'lucide-react';

const ShaderBackground = lazy(() => import('../components/ui/ShaderBackground'));

export default function Home() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length >= 4) {
      navigate(`/join?pin=${pin}`);
    }
  };

  const steps = [
    { icon: <ClipboardList className="w-7 h-7" />, title: 'Pick a Quiz', desc: 'Browse our library of public quizzes or create your own custom challenge from scratch.' },
    { icon: <Share2 className="w-7 h-7" />, title: 'Share the PIN', desc: 'Launch your session and invite students with a unique 6-digit PIN — no accounts needed.' },
    { icon: <Trophy className="w-7 h-7" />, title: 'Compete & Learn', desc: 'Answer quickly, climb the real-time leaderboard, and review results with rich analytics.' },
  ];

  return (
    <div>
      {/* Hero Section */}
      <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden bg-surface-dark">
        {/* Neural network CPPN shader background */}
        <Suspense fallback={<div className="absolute inset-0 bg-gradient-to-br from-brand-dark via-surface-dark to-surface-dark" />}>
          <ShaderBackground />
        </Suspense>

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left - Join Game Card (Glass) */}
          <div className="bg-white/10 backdrop-blur-xl p-8 md:p-12 rounded-3xl border border-white/20 shadow-2xl animate-fade-in">
            <div className="mb-8">
              <h2 className="text-3xl md:text-4xl font-black text-white mb-2">Join a Game</h2>
              <p className="text-white/60">Enter the Game PIN provided by your host to start competing!</p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-6">
              <input
                type="text"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000 000"
                maxLength={6}
                className="w-full bg-white/5 border-2 border-white/20 rounded-2xl py-5 px-6 text-3xl font-bold tracking-[0.5em] text-center text-white placeholder:text-white/20 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/20 transition-all"
              />
              <button
                type="submit"
                disabled={pin.length < 4}
                className="w-full bg-brand hover:bg-brand-dark text-white py-5 rounded-2xl text-xl font-bold transition-all active:scale-[0.98] shadow-xl shadow-brand/30 flex items-center justify-center gap-3 disabled:opacity-40"
              >
                Enter Game
                <Play className="w-6 h-6" fill="currentColor" />
              </button>

              <div className="flex items-center gap-4 py-2">
                <hr className="flex-grow border-white/10" />
                <span className="text-white/40 text-xs font-bold uppercase tracking-widest whitespace-nowrap">Or access more</span>
                <hr className="flex-grow border-white/10" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="bg-white/5 hover:bg-white/10 text-white/80 py-3 rounded-xl text-sm font-semibold border border-white/10 transition-colors"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/discover')}
                  className="bg-white/5 hover:bg-white/10 text-white/80 py-3 rounded-xl text-sm font-semibold border border-white/10 transition-colors"
                >
                  Browse Quizzes
                </button>
              </div>
            </form>
          </div>

          {/* Right - Hero Text */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-sm font-medium text-white">
              
              Free for educators — no credit card required
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
              Make Learning
              <span className="block bg-gradient-to-r from-accent via-success to-accent bg-clip-text text-transparent">
                Unforgettable
              </span>
            </h1>

            <p className="text-lg text-white/60 max-w-md leading-relaxed">
              Host live quizzes that spark engagement. Track understanding in real-time.
              Works on any device.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button
                onClick={() => navigate('/signup')}
                className="group px-8 py-4 bg-white text-brand font-bold rounded-xl text-lg hover:bg-gray-50 spring-transition hover:scale-[1.02] shadow-lg shadow-black/20 flex items-center justify-center gap-2 btn-press"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Inline Stats */}
            <div className="grid grid-cols-3 gap-8 pt-6 w-full max-w-sm">
              {[
                { value: '5+', label: 'Quizzes' },
                { value: '100+', label: 'Students' },
                { value: '99%', label: 'Uptime' },
              ].map((s) => (
                <div key={s.label} className="text-center lg:text-left">
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1200 120" fill="none" className="w-full h-12" preserveAspectRatio="none">
            <path d="M321.39,56.44c58-10.79,114.16-30.13,172-41.86,82.39-16.72,168.19-17.73,250.45-.39C823.78,31,906.67,72,985.66,92.83c70.05,18.48,146.53,26.09,214.34,3V120H0V95.83C0,95.83,56.44,116.68,103.5,120c47.06,3.32,217.89,0,217.89,0Z" fill="#F9FAFB" />
          </svg>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4">
          {/* Section header — playful rotation */}
          <div className="text-center space-y-4 mb-20">
            <div className="text-lg text-brand font-bold rotate-[-1deg]">
              Simple as 1-2-3
            </div>
            <div className="relative inline-block">
              <h2 className="text-3xl md:text-5xl font-black text-gray-900 rotate-[-1deg]">
                How it Works
                <span className="absolute -right-10 top-0 rotate-12 text-2xl select-none">✨</span>
              </h2>
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-44 h-3 bg-brand/20 rotate-[-1deg] rounded-full blur-sm" />
            </div>
            <p className="mt-6 text-gray-500 max-w-xl mx-auto font-medium">
              Get your game live in under 60 seconds. Simple, fast, and incredibly fun.
            </p>
          </div>

          {/* Step cards — comic / creative-pricing style */}
          <div className="grid md:grid-cols-3 gap-10 lg:gap-14 pt-4">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className={`relative group transition-all duration-300 ${
                  i === 0 ? 'rotate-[-1deg]' : i === 1 ? 'rotate-[1deg] md:-translate-y-4' : 'rotate-[-2deg]'
                }`}
              >
                {/* Background card with comic offset shadow */}
                <div className="absolute inset-0 bg-white border-2 border-gray-800 dark:border-gray-300 rounded-2xl shadow-[4px_4px_0px_0px_#D4566B] transition-all duration-300 group-hover:shadow-[8px_8px_0px_0px_#D4566B] group-hover:translate-x-[-4px] group-hover:translate-y-[-4px]" />

                {/* Content */}
                <div className="relative p-8 pt-10">
                  {/* Number badge — rotated comic pill */}
                  <div className="absolute -top-4 -right-3 bg-brand text-white w-11 h-11 rounded-full flex items-center justify-center font-black text-lg border-2 border-gray-800 dark:border-gray-300 rotate-12">
                    {i + 1}
                  </div>

                  {/* Icon in bordered circle */}
                  <div className="w-14 h-14 rounded-full border-2 border-gray-800 dark:border-gray-300 flex items-center justify-center text-brand mb-5 bg-brand/5 group-hover:scale-110 transition-transform">
                    {step.icon}
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Decorative pencil marks */}
          <div className="absolute top-40 left-10 text-4xl rotate-12 pointer-events-none opacity-[0.08] hidden lg:block select-none" aria-hidden>✎</div>
          <div className="absolute bottom-40 right-10 text-4xl -rotate-12 pointer-events-none opacity-[0.08] hidden lg:block select-none" aria-hidden>✏️</div>
        </div>
      </section>

      
     
      {/* CTA Footer */}
      <section className="relative overflow-hidden bg-gradient-to-br from-surface-dark via-brand-dark to-surface-dark text-white py-20 md:py-28">
        {/* Floating shapes */}
        <div className="absolute inset-0 pattern-grid pointer-events-none" />
        <div className="absolute top-10 right-20 w-64 h-64 bg-brand-light/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-20 w-80 h-80 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/4 left-[10%] w-16 h-16 border-2 border-white/10 rounded-xl rotate-12 pointer-events-none" />
        <div className="absolute bottom-1/4 right-[15%] w-20 h-20 border-2 border-white/10 rounded-full pointer-events-none" />

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
    </div>
  );
}
