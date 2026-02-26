import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, ArrowRight,
  ClipboardList, Trophy, Share2
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import WaveBackground from '../components/ui/WaveBackground';
import boy2 from '../assets/optimized/boy_2.png';
import boy3 from '../assets/optimized/boy_3.png';

const ShaderBackground = lazy(() => import('../components/ui/ShaderBackground'));


export default function Home() {
  const navigate = useNavigate();
  const { firebaseUser, user } = useAuthStore();
  const [pin, setPin] = useState('');

  const dashboardPath = user?.role === 'student' ? '/student/dashboard' : '/dashboard';

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
      <section className="relative min-h-[calc(100vh-4rem)] flex items-center overflow-hidden gradient-hero">
        {/* Neural network CPPN shader background */}
        <Suspense fallback={<div className="absolute inset-0 gradient-hero" />}>
          <ShaderBackground />
        </Suspense>

        <img
          src={boy2}
          alt="Student learning"
          className="hidden md:block absolute -left-14 md:top-[48%] lg:top-[42%] -translate-y-1/2 w-[18rem] h-[18rem] lg:w-[28rem] lg:h-[28rem] xl:w-[32rem] xl:h-[32rem] object-contain pointer-events-none z-0"
        />

        <div className="relative z-10 max-w-6xl mx-auto px-4 py-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left - Join Game Card */}
          <div className="card-night p-8 md:p-12 animate-fade-in">
            <div className="mb-8">
              <h2 className="text-3xl md:text-4xl text-gray-900 dark:text-white mb-2">Join a Game</h2>
              <p className="text-gray-500 dark:text-white/60">Enter the Game PIN provided by your host to start competing!</p>
            </div>

            <form onSubmit={handlePinSubmit} className="space-y-6">
              <input
                type="text"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000 000"
                maxLength={6}
                className="w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full py-5 px-6 text-3xl font-bold tracking-[0.5em] text-center text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-white/20 focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/20 transition-all"
              />
              <button
                type="submit"
                disabled={pin.length < 4}
                className="btn-3d-cyan btn-3d-lg w-full text-xl flex items-center justify-center gap-3 disabled:opacity-40"
              >
                Enter Game
                <Play className="w-6 h-6" fill="currentColor" />
              </button>

              <div className="flex items-center gap-4 py-2">
                <hr className="grow border-gray-200 dark:border-white/10" />
                <span className="text-gray-400 dark:text-white/40 text-xs font-bold uppercase tracking-widest whitespace-nowrap">Or access more</span>
                <hr className="grow border-gray-200 dark:border-white/10" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => navigate(firebaseUser ? dashboardPath : '/login')}
                  className="btn-3d-ghost py-3 text-sm"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/discover')}
                  className="btn-3d-ghost py-3 text-sm"
                >
                  Browse Quizzes
                </button>
              </div>
            </form>
          </div>

          {/* Right - Hero Text */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-100 dark:bg-white/10 backdrop-blur-sm border border-gray-300 dark:border-white/20 text-sm font-medium text-gray-900 dark:text-white">
              Free for educators — no credit card required
            </div>

            <h1 className="text-3xl md:text-5xl tracking-tight text-gray-900 dark:text-white leading-[1.1]">
              Make Learning
                <span className="block text-5xl md:text-8xl p-2 bg-gradient-to-r from-red-500 via-pink-500 to-red-500 bg-clip-text text-transparent drop-shadow-lg">
                  Unforgettable
                </span>
            </h1>

            <p className="text-lg text-gray-500 dark:text-white/60 max-w-md leading-relaxed">
              Host live quizzes that spark engagement. Track understanding in real-time.
              Works on any device.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <button
                onClick={() => navigate(firebaseUser ? dashboardPath : '/signup')}
                className="btn-3d-gold btn-3d-lg group flex items-center justify-center gap-2"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            {/* Inline Stats */}
            <div className="grid grid-cols-3 gap-8 pt-6 w-full max-w-sm">
              {[
                { value: '50+', label: 'Quizzes' },
                { value: '100+', label: 'Students' },
                { value: '99%', label: 'Uptime' },
              ].map((s) => (
                <div key={s.label} className="text-center lg:text-left">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                  <p className="text-gray-400 dark:text-white/40 text-xs mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <WaveBackground variant="dark" position="bottom" />
      </section>

      {/* How it Works */}
      <section className="py-24 relative overflow-hidden bg-surface">
        <WaveBackground variant="dark" position="bottom" />
        <div className="absolute inset-0 pattern-stars pointer-events-none" />
        <img
          src={boy3}
          alt="Student learning"
          className="hidden md:block absolute -right-12 md:-bottom-4 lg:-right-14 lg:-bottom-10 w-[18rem] h-[18rem] lg:w-[28rem] lg:h-[28rem] xl:w-[32rem] xl:h-[32rem] object-contain pointer-events-none z-0"
        />
        <div className="max-w-6xl mx-auto px-4 relative z-10">
          {/* Section header */}
          <div className="text-center space-y-4 mb-20">
            <div className="text-lg text-brand font-bold">
              Simple as 1-2-3
            </div>
            <div className="relative inline-block">
              <h2 className="text-3xl md:text-5xl text-gray-900 dark:text-white">
                How it Works
                <span className="absolute -right-10 top-0 rotate-12 text-2xl select-none animate-star-twinkle">✨</span>
              </h2>
            </div>
            <p className="mt-6 text-gray-500 dark:text-white/50 max-w-xl mx-auto font-medium">
              Get your game live in under 60 seconds. Simple, fast, and incredibly fun.
            </p>
          </div>

          {/* Step cards */}
          <div className="grid md:grid-cols-3 gap-10 lg:gap-14 pt-4">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="relative card-night card-night-hover p-8 pt-10"
              >
                {/* Number badge */}
                <div className="absolute -top-4 -right-3 bg-brand text-white w-11 h-11 rounded-full flex items-center justify-center text-lg">
                  {i + 1}
                </div>

                {/* Icon */}
                <div className="w-14 h-14 rounded-full border border-brand/30 flex items-center justify-center text-brand mb-5 bg-brand/10 group-hover:scale-110 transition-transform">
                  {step.icon}
                </div>

                <h3 className="text-xl text-gray-900 dark:text-white mb-3">{step.title}</h3>
                <p className="text-gray-500 dark:text-white/50 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* CTA Footer */}
      <section className="relative overflow-hidden text-gray-900 dark:text-white py-20 md:py-28 gradient-hero">
        <div className="absolute inset-0 pattern-stars pointer-events-none" />
        <div className="absolute top-10 right-20 w-64 h-64 bg-accent/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-20 w-80 h-80 bg-brand/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <div className="card-night px-8 py-14 md:px-16 md:py-16">
            <div className="relative inline-block mb-6">
              <h2 className="text-3xl md:text-5xl text-gray-900 dark:text-white">
                Ready to transform your classroom?
              </h2>
            </div>
            <p className="text-lg text-gray-600 dark:text-white/70 mb-10 max-w-xl mx-auto">
              Join thousands of educators using LiveClass to make learning interactive, measurable, and fun.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate(firebaseUser ? dashboardPath : '/signup')}
                className="btn-3d-gold btn-3d-lg group flex items-center justify-center gap-2"
              >
                Start for Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/join')}
                className="btn-3d-ghost btn-3d-lg"
              >
                Join a Game
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
