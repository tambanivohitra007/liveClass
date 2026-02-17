import logo from '../assets/logo.png';

export default function Footer() {
  return (
    <footer className="bg-surface-dark text-white/50 py-6">
      <div className="max-w-6xl mx-auto px-4 flex flex-col items-center gap-3 text-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
          <div className="flex items-center gap-2">
            <img src={logo} alt="LiveClass" className="w-5 h-5 rounded" />
            <span>LiveClass</span>
          </div>
          <p className="text-white/30 text-xs">
            Designed & developed by Rindra Razafinjatovo
          </p>
        </div>
      </div>
    </footer>
  );
}
