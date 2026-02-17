import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-purple-900 text-white">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-accent rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-brand-light rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 py-24 md:py-32 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 animate-fade-in">
            Make Learning
            <span className="block text-accent">Unforgettable</span>
          </h1>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-10 animate-fade-in">
            Host live quizzes, engage students in real-time, and track understanding
            — all from the browser. No downloads needed.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
            <button
              onClick={() => navigate('/signup')}
              className="px-8 py-4 bg-white text-brand font-bold rounded-xl text-lg hover:bg-gray-100 transition-all hover:scale-105 shadow-lg"
            >
              Get Started Free
            </button>
            <button
              onClick={() => navigate('/join')}
              className="px-8 py-4 bg-white/10 backdrop-blur text-white font-bold rounded-xl text-lg border-2 border-white/30 hover:bg-white/20 transition-all hover:scale-105"
            >
              Join a Game
            </button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
          Everything you need for engaging quizzes
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: '&#9889;',
              title: 'Real-Time Play',
              desc: 'Students answer live with instant feedback, speed bonuses, and streak rewards.',
              color: 'bg-answer-red/10 text-answer-red',
            },
            {
              icon: '&#128202;',
              title: 'Analytics & Export',
              desc: 'See per-question stats, correctness rates, and export results as CSV.',
              color: 'bg-answer-blue/10 text-answer-blue',
            },
            {
              icon: '&#128247;',
              title: 'Works Offline',
              desc: 'Assignment mode with offline caching — answers sync automatically on reconnect.',
              color: 'bg-answer-green/10 text-answer-green',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div
                className={`w-12 h-12 rounded-xl ${f.color} flex items-center justify-center text-2xl mb-4`}
                dangerouslySetInnerHTML={{ __html: f.icon }}
              />
              <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
