import { Outlet, Link, useLocation } from 'react-router-dom';
import { Shield, Users, FileText, GraduationCap } from 'lucide-react';

const tabs = [
  { path: '/admin', label: 'Users', icon: Users, exact: true },
  { path: '/admin/quizzes', label: 'Quizzes', icon: FileText },
  { path: '/admin/classes', label: 'Classes', icon: GraduationCap },
];

export default function AdminLayout() {
  const location = useLocation();

  const isTabActive = (tab: typeof tabs[number]) => {
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
          <p className="text-sm text-gray-500 dark:text-white/50">Manage users, quizzes, and classes</p>
        </div>
      </div>

      {/* Top Nav Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-white/10 pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isTabActive(tab);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all no-underline ${
                active
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-white dark:bg-white/5 text-gray-600 dark:text-white/70 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Page Content */}
      <Outlet />
    </div>
  );
}
