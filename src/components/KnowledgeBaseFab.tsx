import { useState, useMemo } from 'react';
import {
  BookOpen,
  Rocket,
  FileQuestion,
  Radio,
  ClipboardList,
  Award,
  Users,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Search,
} from 'lucide-react';
import SlidePanel from './SlidePanel';
import { knowledgeBase, type KBArticle, type KBCategory } from '../data/knowledgeBase';

const categoryIcons: Record<string, typeof Rocket> = {
  'getting-started': Rocket,
  'quizzes': FileQuestion,
  'live-sessions': Radio,
  'assignments': ClipboardList,
  'rubrics': Award,
  'classes': Users,
  'for-students': GraduationCap,
};

export default function KnowledgeBaseFab() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [activeArticle, setActiveArticle] = useState<{ category: KBCategory; article: KBArticle } | null>(null);

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return knowledgeBase;
    const q = search.toLowerCase();
    return knowledgeBase
      .map((cat) => ({
        ...cat,
        articles: cat.articles.filter((a) => a.title.toLowerCase().includes(q)),
      }))
      .filter((cat) => cat.articles.length > 0);
  }, [search]);

  const handleArticleClick = (category: KBCategory, article: KBArticle) => {
    setActiveArticle({ category, article });
  };

  const handleBack = () => {
    setActiveArticle(null);
  };

  const handleClose = () => {
    setOpen(false);
    setActiveArticle(null);
    setSearch('');
    setExpandedCategories(new Set());
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        title="Help & Knowledge Base"
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full bg-[#DC143C] hover:bg-[#B01030] text-white flex items-center justify-center shadow-lg transition-colors"
      >
        <span className="text-xl font-bold">?</span>
      </button>

      {/* Panel */}
      <SlidePanel
        open={open}
        onClose={handleClose}
        title="Knowledge Base"
        icon={<BookOpen className="w-5 h-5" />}
      >
        {activeArticle ? (
          /* Article View */
          <div>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-sm text-brand hover:text-brand/80 transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to articles
            </button>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              {activeArticle.article.title}
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-white/70 leading-relaxed">
              {activeArticle.article.body.split('\n\n').map((paragraph, i) => {
                // Numbered step (e.g., "1. Do something")
                const stepMatch = paragraph.match(/^(\d+)\.\s(.*)/s);
                if (stepMatch) {
                  return (
                    <p key={i}>
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand/15 text-brand text-xs font-bold mr-1.5 align-text-bottom">
                        {stepMatch[1]}
                      </span>
                      {stepMatch[2]}
                    </p>
                  );
                }

                // Bullet list items separated by \n
                if (paragraph.startsWith('- ')) {
                  return (
                    <ul key={i} className="space-y-1.5">
                      {paragraph.split('\n').map((line, j) => (
                        <li key={j} className="flex gap-2">
                          <span className="text-brand shrink-0 mt-px">•</span>
                          <span>{line.replace(/^-\s/, '')}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }

                return <p key={i}>{paragraph}</p>;
              })}
            </div>
          </div>
        ) : (
          /* List View */
          <div>
            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-white/30" />
              <input
                type="text"
                placeholder="Search articles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
            </div>

            {/* Categories */}
            {filteredCategories.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-white/40 text-center py-8">
                No articles found for "{search}"
              </p>
            ) : (
              <div className="space-y-1">
                {filteredCategories.map((category) => {
                  const Icon = categoryIcons[category.id] || BookOpen;
                  const isExpanded = expandedCategories.has(category.id) || search.trim().length > 0;

                  return (
                    <div key={category.id}>
                      {/* Category header */}
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                      >
                        <Icon className="w-5 h-5 text-brand flex-shrink-0" />
                        <span className="flex-1 text-left text-sm font-medium text-gray-900 dark:text-white">
                          {category.title}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-white/30 mr-1">
                          {category.articles.length}
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-white/30" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400 dark:text-white/30" />
                        )}
                      </button>

                      {/* Articles */}
                      {isExpanded && (
                        <div className="ml-8 mb-2 space-y-0.5">
                          {category.articles.map((article) => (
                            <button
                              key={article.id}
                              onClick={() => handleArticleClick(category, article)}
                              className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                              {article.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </SlidePanel>
    </>
  );
}
