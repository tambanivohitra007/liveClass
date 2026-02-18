import { Link } from 'react-router-dom';
import { Github } from 'lucide-react';
import logo from '../assets/logo.png';

export default function Footer() {
  return (
    <footer className="bg-surface-dark text-white/50 py-8">
      <div className="max-w-7xl mx-auto px-6">
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
            <Link to="/privacy" className="hover:text-white transition-colors no-underline">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors no-underline">Terms</Link>
          </div>

            {/* Social */}
            <div className="flex items-center gap-3">
            <a
              href="https://github.com/tambanivohitra007"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
              aria-label="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="https://www.facebook.com/rindra.it/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Facebook"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <a
              href="https://www.linkedin.com/in/rindrarazafinjatovo"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
              aria-label="LinkedIn"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>

        <div className="border-t border-white/10 mt-6 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/30">
          <p>&copy; {new Date().getFullYear()} LiveClass. All rights reserved.</p>
          <p className="flex items-center gap-1">
            Developed by <a href="https://rindra.org">Rindra Razafinjatovo</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
