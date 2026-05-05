import { Outlet, Link, useLocation } from 'react-router-dom';
import { Shield, Users, FileText, GraduationCap, BarChart3, Radio, ClipboardList } from 'lucide-react';

interface AdminTab {
  path: string;
  label: string;
  icon: typeof BarChart3;
  exact?: boolean;
}

const tabs: AdminTab[] = [
  { path: '/admin', label: 'Overview', icon: BarChart3, exact: true },
  { path: '/admin/users', label: 'Users', icon: Users },
  { path: '/admin/quizzes', label: 'Quizzes', icon: FileText },
  { path: '/admin/classes', label: 'Classes', icon: GraduationCap },
  { path: '/admin/sessions', label: 'Sessions', icon: Radio },
  { path: '/admin/assignments', label: 'Assign.', icon: ClipboardList },
];

export default function AdminLayout() {
  const location = useLocation();

  const isTabActive = (tab: AdminTab) => {
    if (tab.exact) return location.pathname === tab.path;
    return location.pathname.startsWith(tab.path);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 text-gray-900 dark:text-white">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-brand" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
          <p className="text-sm text-gray-500 dark:text-white/50">Manage users, quizzes, classes, sessions, and assignments</p>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="flex border-b border-white/10 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              title={tab.label}
              className={`relative flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-2 sm:px-4 py-2.5 text-sm font-medium transition-all no-underline whitespace-nowrap ${
                active
                  ? 'text-brand'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand rounded-full" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Page Content */}
      <Outlet />
    </div>
  );
}
