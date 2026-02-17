import { Link } from 'react-router-dom';
import { Github, Heart } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Footer() {
  return (
    <footer className="bg-surface-dark text-white/50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="LiveClass" className="w-6 h-6 rounded" />
            <span className="font-bold text-white/70">LiveClass</span>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link to="/join" className="hover:text-white transition-colors no-underline">Join Game</Link>
            <Link to="/dashboard" className="hover:text-white transition-colors no-underline">Dashboard</Link>
            <Link to="/history" className="hover:text-white transition-colors no-underline">History</Link>
          </div>

          {/* Social */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="border-t border-white/10 mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/30">
          <p>&copy; {new Date().getFullYear()} LiveClass. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-brand" /> by Rindra Razafinjatovo
          </p>
        </div>
      </div>
    </footer>
  );
}
