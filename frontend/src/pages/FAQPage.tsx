import React, { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import SearchBar from '../components/ui/SearchBar';
import WordCloud from '../components/ui/WordCloud';
import { FAQDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import type { TrendingQuery } from '../types/ui';

// Modular components
import {
  FAQItem,
  getCategoryIcon,
  getCategoryDescription,
  formatCategoryName,
  getCategoryTone,
  IconGrid,
  getQuestionTitle,
} from '../components/faq/faqUtils';
import SearchDropdown from '../components/faq/SearchDropdown';
import SearchFeedback from '../components/faq/SearchFeedback';
import CategoryGrid from '../components/faq/CategoryGrid';
import QuestionList from '../components/faq/QuestionList';
import QuestionDetail from '../components/faq/QuestionDetail';

// Sub-component props interfaces
interface CategoryPillsProps {
  categories: string[];
  activeCategory: string;
  onSelect: (name: string) => void;
}

// Sub-components
function CategoryPills({ categories, activeCategory, onSelect }: CategoryPillsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: number) => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollBy({ left: direction * 240, behavior: 'smooth' });
  };

  const allActive = !activeCategory;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          Browse categories
        </p>
        <span className="text-xs text-ink-soft">{categories.length} categories</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleScroll(-1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div
          ref={scrollerRef}
          className="flex-1 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        >
          <button
            onClick={() => onSelect('')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
              ${allActive
                ? 'bg-ink text-white border-ink'
                : 'bg-white/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
              }`}
          >
            <span className={allActive ? 'text-white' : 'text-ink-faint'}>
              <IconGrid />
            </span>
            All
          </button>

          {categories.map((name) => {
            const isActive = activeCategory?.toLowerCase() === name.toLowerCase();
            const tone = getCategoryTone(name);
            return (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0
                  ${isActive
                    ? 'bg-accent text-white border-accent/60 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                    : 'bg-white/80 text-ink border-border/70 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                  }`}
              >
                <span className={isActive ? 'text-white' : tone.accent}>
                  {getCategoryIcon(name)}
                </span>
                {formatCategoryName(name)}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => handleScroll(1)}
          className="shrink-0 w-8 h-8 rounded-full border border-border/80 bg-white/90 shadow-subtle flex items-center justify-center text-ink-faint hover:text-ink hover:border-ink/20 hover:bg-cream transition-all"
          aria-label="Scroll categories right"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}



export default function FAQPage() {
  const [grouped, setGrouped] = useState<Record<string, FAQItem[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeQuestion, setActiveQuestion] = useState<FAQItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FAQItem[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortOption, setSortOption] = useState('relevant');
  const [visibleCount, setVisibleCount] = useState(8);
  const searchBarRef = useRef<HTMLInputElement>(null);
  const [trendingWords, setTrendingWords] = useState<TrendingQuery[]>([]);

  const [resultFaqId, setResultFaqId] = useState<string | undefined>(undefined);

  // Track top result FAQ ID when search results arrive
  useEffect(() => {
    if (Array.isArray(searchResults) && searchResults.length > 0) {
      setResultFaqId((searchResults[0] as FAQItem)._id);
    }
  }, [searchResults]);

  useEffect(() => {
    api.get('/faq')
      .then((res) => {
        setGrouped(res.data.grouped || {});
        setTotal(res.data.total || 0);
      })
      .catch((err: unknown) => {
        const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs. Please try again.';
        setError(message);
      })
      .finally(() => setLoading(false));

    // Fetch trending queries for the word cloud
    api.get('/search/trending')
      .then((res) => setTrendingWords((res.data.trending || []).map((t: { query: string; count: number }) => ({ query: t.query, count: t.count }))))
      .catch((err: unknown) => {
        console.error('Failed to load trending queries:', err);
      });
  }, []);

  const categories = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const flatQuestions = useMemo(() => (
    categories.flatMap((name) => (grouped[name] || []).map((item) => ({
      ...item,
      category: item.category || name,
      source: item.source || 'faq',
    })))
  ), [categories, grouped]);

  useEffect(() => {
    // Check for pre-selected FAQ from HomePage search navigation
    // Guard: only run once grouped data is actually available (race condition fix)
    if (!grouped || Object.keys(grouped).length === 0) return;

    const highlightStr = sessionStorage.getItem('yaksha_faq_highlight');
    if (highlightStr) {
      try {
        const highlight = JSON.parse(highlightStr) as FAQItem;
        sessionStorage.removeItem('yaksha_faq_highlight');
        const category = highlight.category || '';
        if (category && grouped[category]) {
          const found = grouped[category].find((item) => item._id === highlight._id);
          if (found) {
            setActiveQuestion({ ...found, category });
            setActiveCategory(category);
          }
        }
      } catch {
        sessionStorage.removeItem('yaksha_faq_highlight');
      }
    }
  }, [grouped]);

  useEffect(() => {
    setVisibleCount(8);
  }, [activeCategory, searchResults, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults(null);
      setSearchLoading(false);
    }
  }, [searchQuery]);

  const activeCategoryItems = activeCategory ? (grouped[activeCategory] || []) : [];
  const activeCategoryMeta = getCategoryDescription(activeCategoryItems);

  const searchActive = searchQuery.trim().length >= 3 && Array.isArray(searchResults);
  const showDropdown = searchQuery.trim().length > 0 && !searchActive;

  const dropdownItems = useMemo(() => {
    if (Array.isArray(searchResults) && searchQuery.trim().length >= 3) {
      return searchResults;
    }
    if (!searchQuery.trim()) {
      return flatQuestions.slice(0, 5);
    }
    const normalized = searchQuery.trim().toLowerCase();
    return flatQuestions.filter((item) => (
      getQuestionTitle(item).toLowerCase().includes(normalized)
    )).slice(0, 5);
  }, [flatQuestions, searchResults, searchQuery]);

  const relatedItems = useMemo(() => {
    if (!activeQuestion?.category) return [];
    const pool = grouped[activeQuestion.category] || [];
    return pool.filter((item) => item._id !== activeQuestion._id).slice(0, 5);
  }, [activeQuestion, grouped]);

  const handleCategoryOpen = (name: string) => {
    setActiveCategory(name);
    setActiveQuestion(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
  };

  const handleQuestionOpen = (item: FAQItem) => {
    setActiveQuestion(item);
  };

  const handleBackToCategories = () => {
    setActiveCategory('');
    setActiveQuestion(null);
  };

  const handleBackFromDetail = () => {
    setActiveQuestion(null);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setActiveCategory('');
      setActiveQuestion(null);
      setSearchResults(null);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setSearchLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <FAQDoodles />
      <Navbar />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-10 relative z-10">
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-serif text-ink tracking-tight">
            Frequently Asked Questions
          </h1>
          {total > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              {total} questions across {categories.length} categories
            </p>
          )}
        </div>

        {/* Backdrop blur overlay when search is active */}
        {showDropdown && (
          <div
            className="fixed inset-0 z-30 bg-ink/20 backdrop-blur-sm transition-opacity duration-300"
            onClick={handleClearSearch}
            aria-hidden="true"
          />
        )}

        <section className="relative mb-10 sm:mb-12">
          <div className={`relative max-w-3xl mx-auto ${showDropdown ? 'z-40' : 'z-20'}`}>
            <SearchBar
              ref={searchBarRef}
              value={searchQuery}
              onQueryChange={handleSearchChange}
              onResults={(res) => setSearchResults(res as unknown as FAQItem[])}
              onLoading={setSearchLoading}
              placeholder="Search for topics, keywords, or questions..."
              disableSuggestions={true}
            />

            {showDropdown && (
              <SearchDropdown
                query={searchQuery}
                items={dropdownItems}
                categories={categories}
                onSelectQuestion={handleQuestionOpen}
                onSelectCategory={handleCategoryOpen}
                onClear={handleClearSearch}
                loading={searchLoading}
              />
            )}
          </div>

          <div className={`mt-5 sm:mt-6 transition-all duration-300 ${
            showDropdown ? 'opacity-70 translate-y-1' : 'opacity-100'
          }`}>
            <CategoryPills
              categories={categories}
              activeCategory={activeCategory}
              onSelect={handleCategoryOpen}
            />
          </div>

          {/* Trending Queries Word Cloud */}
          {trendingWords.length > 0 && !showDropdown && !activeCategory && !activeQuestion && !searchActive && (
            <div className="mt-5 transition-all duration-300">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Trending searches</p>
              <div className="bg-card/60 rounded-2xl border border-border/50 shadow-subtle">
                <WordCloud
                  words={trendingWords}
                  onWordClick={(query: string) => {
                    setSearchQuery(query);
                    handleSearchChange(query);
                  }}
                  maxWords={20}
                />
              </div>
            </div>
          )}
        </section>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-[220px] rounded-2xl border border-border bg-white/70 animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl bg-danger-light border border-danger/15 p-6 text-center space-y-3">
            <p className="text-sm text-danger font-medium">{error}</p>
            <button
              onClick={() => { setError(''); setLoading(true); api.get('/faq').then(res => { setGrouped(res.data.grouped || {}); setTotal(res.data.total || 0); }).catch((err: unknown) => { const m = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to load FAQs.'; setError(m); }).finally(() => setLoading(false)); }}
              className="px-5 py-2 text-sm font-medium bg-danger text-white rounded-full hover:bg-danger/90 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && activeQuestion && (
          <QuestionDetail
            item={activeQuestion}
            relatedItems={relatedItems}
            onBack={handleBackFromDetail}
            onSelectRelated={handleQuestionOpen}
          />
        )}

        {!loading && !error && !activeQuestion && searchActive && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Search results</p>
                <h2 className="text-lg font-semibold text-ink">Results for "{searchQuery}"</h2>
              </div>
              <button
                onClick={handleClearSearch}
                className="text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
              >
                Clear search
              </button>
            </div>

            <QuestionList
              items={searchResults || []}
              loading={searchLoading}
              sortOption={sortOption}
              onSortChange={setSortOption}
              onSelect={handleQuestionOpen}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No results yet. Try another keyword or browse a category."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && activeCategory && (
          <section className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <button
                  onClick={handleBackToCategories}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back to categories
                </button>
                <h2 className="mt-3 text-xl font-semibold text-ink flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl bg-mist flex items-center justify-center text-ink-faint">
                    {getCategoryIcon(activeCategory)}
                  </span>
                  {formatCategoryName(activeCategory)}
                </h2>
                {activeCategoryMeta && (
                  <p className="mt-2 text-sm text-ink-soft max-w-2xl">
                    {activeCategoryMeta}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <span>{activeCategoryItems.length} questions</span>
              </div>
            </div>

            <QuestionList
              items={activeCategoryItems.map((item) => ({
                ...item,
                category: activeCategory,
                source: item.source || 'faq',
              }))}
              loading={false}
              sortOption={sortOption}
              onSortChange={setSortOption}
              onSelect={handleQuestionOpen}
              visibleCount={visibleCount}
              onLoadMore={() => setVisibleCount((prev) => prev + 6)}
              emptyMessage="No questions in this category yet."
            />
          </section>
        )}

        {!loading && !error && !activeQuestion && !searchActive && !activeCategory && (
          <CategoryGrid
            categories={categories}
            grouped={grouped}
            onOpen={handleCategoryOpen}
          />
        )}
      </main>

      <Footer />

      {searchActive && (
        <SearchFeedback searchQuery={searchQuery} resultFaqId={resultFaqId} />
      )}
    </div>
  );
}