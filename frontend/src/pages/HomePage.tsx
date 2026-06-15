// Public FAQ Discovery Page — no auth, no friction.
// Mounted at /. Renders the hero, sticky search, three top
// cards (Popular / Recent / Categories), the full category accordion
// list, and a detail modal for clicked FAQs.
//
// All content is scoped to the active batch from BatchContext. If no
// batch is selected yet, the user is bounced to /explore/select.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Footer from '../components/layout/Footer';
import { BatchSwitcher } from '../components/layout/BatchSwitcher';
import { useBatch } from '../context/BatchContext';
import { useCategories, usePopularFaqs, useRecentFaqs } from '../components/explore/usePublicFaqApi';
import { useCourses } from '../components/explore/useCourses';
import type { Course } from '../types/course';
import InteractiveSearchOverlay from '../components/search/InteractiveSearchOverlay';
import { ExploreHero } from '../components/explore/ExploreHero';
import { ExploreSearchResults } from '../components/explore/ExploreSearchResults';
import { PopularFaqsCard } from '../components/explore/PopularFaqsCard';
import { RecentFaqsCard } from '../components/explore/RecentFaqsCard';
import { CategoriesCard } from '../components/explore/CategoriesCard';
import { CategoryAccordion } from '../components/explore/CategoryAccordion';
import { PublicFaqDetail } from '../components/explore/PublicFaqDetail';
import { CardSkeleton, EmptyState } from '../components/explore/ExploreSkeleton';
import type { PublicFaq } from '../components/explore/types';
import TopSolved from '../components/community/TopSolved';
import TrendingIssues from '../components/search/TrendingIssues';
import FromMeetings from '../components/faq/FromMeetings';
import CTA from '../components/ui/CTA';
import api, { friendlyError } from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { useAuthGate } from '../context/AuthModalContext';
import type { SearchResult, TrendingQuery } from '../types/ui';

export default function ExplorePage(): React.ReactElement {
  // ── Active batch from context ───────────────────────────────────────────
  const { currentBatch, loading: batchLoading } = useBatch();
  const batchId = currentBatch?._id ?? null;

  // ── Course picker (v1.69) ────────────────────────────────────────────────
  // The selected course id lives in the URL as ?course=<id> so deep
  // links are shareable. Reading from the search param on mount +
  // writing back on click keeps the picker URL-driven.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCourseId = searchParams.get('course');
  const setSelectedCourseId = useCallback((id: string | null): void => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('course', id);
      else next.delete('course');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // ── Data: courses for the current batch, plus the chrome data ───────
  const { data: coursesData, loading: coursesLoading } = useCourses(batchId);
  const courses = coursesData?.courses ?? [];
  const selectedCourse: Course | null = useMemo(
    () => courses.find((c) => c._id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );

  const { data: popularData, loading: popularLoading } = usePopularFaqs(batchId, selectedCourseId, 5);
  const { data: recentData, loading: recentLoading } = useRecentFaqs(batchId, selectedCourseId, 5);
  const { data: categoriesData, loading: categoriesLoading } = useCategories(batchId, selectedCourseId, false);

  const categories = categoriesData?.categories ?? [];
  const totalFaqs = useMemo(
    () => categories.reduce((s, c) => s + c.count, 0),
    [categories],
  );

  // ── UI state ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<PublicFaq | null>(null);
  const [openCategoryName, setOpenCategoryName] = useState<string | null>(null);
  const [searchSticky, setSearchSticky] = useState(false);
  const sectionAnchorRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const searchAnchorRef = useRef<HTMLDivElement>(null);

  // Sticky search bar: appears once the user scrolls past the hero.
  useEffect(() => {
    const onScroll = (): void => {
      const anchor = searchAnchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setSearchSticky(rect.bottom < 16);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Ref accessor — lazy-creates a ref for a category name.
  const getSectionRef = useCallback((name: string): React.RefObject<HTMLDivElement> => {
    let ref = sectionAnchorRefs.current.get(name);
    if (!ref) {
      ref = React.createRef<HTMLDivElement>();
      sectionAnchorRefs.current.set(name, ref);
    }
    return ref;
  }, []);

  // Smooth-scroll to a category and auto-open it.
  const handleSelectCategory = useCallback(
    (name: string) => {
      if (!name) {
        document.getElementById('all-categories')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      const ref = sectionAnchorRefs.current.get(name);
      if (ref?.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setOpenCategoryName(name);
      } else {
        setOpenCategoryName(name);
        window.setTimeout(() => {
          sectionAnchorRefs.current.get(name)?.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 50);
      }
    },
    [],
  );

  const isCategoryOpen = (name: string): boolean =>
    openCategoryName === name || (activeCategory === name && query.length === 0);

  const showingSearch = query.length >= 2;

  // ── Guard: no batch picked yet → friendly empty state ──────────────
  // The BatchContext auto-picks a default batch on cold start if one
  // exists. If no batches exist at all (seed never ran) we render
  // an empty state with a hint, instead of bouncing to a picker
  // page that no longer exists at `/explore/select`.
  if (batchLoading && !currentBatch) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <p className="text-sm text-ink-soft">Loading…</p>
      </div>
    );
  }
  if (!currentBatch) {
    return (
      <div className="min-h-screen bg-bg text-ink flex flex-col">
        <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 pt-32 pb-16 text-center">
          <h1 className="font-serif text-3xl text-ink mb-3">No programs yet</h1>
          <p className="text-sm text-ink-soft">
            Programs are managed from{' '}
            <a href="/admin/batches" className="text-accent hover:underline font-medium">/admin/batches</a>.
            Once an admin creates a program, its FAQs will appear here.
          </p>
        </main>
      </div>
    );
  }

  return (
    <>
      {/* Curly bracket doodle — left of hero */}
      <div className="absolute -top-6 -left-16 hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="50" height="100" viewBox="0 0 50 100" fill="none" style={{ opacity: 0.45 }}>
          <path d="M40 8 C26 8, 22 18, 22 28 C22 38, 16 44, 6 46 C16 48, 22 54, 22 64 C22 74, 26 84, 40 84" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* "Let's solve it!" speech bubble */}
      <div className="absolute -top-8 left-[40px] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-6deg)' }} aria-hidden="true">
        <svg width="105" height="80" viewBox="0 0 105 80" fill="none" style={{ opacity: 0.45 }}>
          <ellipse cx="52" cy="28" rx="42" ry="22" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeDasharray="6 4" fill="none"/>
          <path d="M68 46 L80 68 L62 44" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <text x="22" y="25" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--deco-stroke)" opacity="0.85">Let&apos;s</text>
          <text x="18" y="38" fontSize="11" fontFamily="'DM Serif Display', serif" fontStyle="italic" fill="var(--deco-stroke)" opacity="0.85">solve it!</text>
        </svg>
      </div>

          {/* ─── Search results (only when query has content) ───────── */}
          {showingSearch && (
            <ExploreSearchResults
              query={query}
              category={activeCategory}
              batchId={batchId}
              courseId={selectedCourseId}
              onSelectFaq={setOpenFaq}
              onClear={() => setQuery('')}
            />
          )}

          {/* ─── Course picker (v1.69) ─────────────────────────────────── */}
          {/* A horizontal pill bar above the cards. "All courses" is the
              default (no ?course= param). Clicking a course scopes the
              Popular / Recent / Categories cards and the accordion
              to that course's FAQs. */}
          {!showingSearch && courses.length > 0 && (
            <div className="mt-8" data-testid="course-picker">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  Courses
                </p>
                {selectedCourse && (
                  <button
                    type="button"
                    onClick={() => setSelectedCourseId(null)}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    Clear course filter
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCourseId(null)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                    !selectedCourseId
                      ? 'bg-accent text-accent-text border border-accent/50 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                      : 'bg-card/80 text-ink border border-border/60 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                  }`}
                >
                  All courses
                </button>
                {courses.map((c) => {
                  const isActive = selectedCourseId === c._id;
                  return (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => setSelectedCourseId(c._id)}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                        isActive
                          ? 'bg-accent text-accent-text border border-accent/50 shadow-[0_10px_26px_rgba(90,122,90,0.25)]'
                          : 'bg-card/80 text-ink border border-border/60 hover:bg-cream hover:-translate-y-0.5 hover:shadow-subtle'
                      }`}
                      title={c.description || c.name}
                    >
                      {c.name}
                      {c.faqCount > 0 && (
                        <span className="text-[10px] text-ink-faint font-normal">
                          ({c.faqCount})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Top three cards: Popular / Recent / Categories ────── */}
          {!showingSearch && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
              <PopularFaqsCard batchId={batchId} courseId={selectedCourseId} onSelectFaq={setOpenFaq} />
              <RecentFaqsCard batchId={batchId} courseId={selectedCourseId} onSelectFaq={setOpenFaq} />
              <CategoriesCard batchId={batchId} courseId={selectedCourseId} onSelectCategory={handleSelectCategory} />
            </div>
          )}

      {/* Small star — left of hero */}
      <div className="absolute top-[20px] left-[16%] hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ opacity: 0.45 }}>
          <path d="M9 0 L9 18 M0 9 L18 9" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M3 3 L15 15 M15 3 L3 15" stroke="var(--section-icon)" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

              {!showingSearch && (
                <section>
                  {categoriesLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <CardSkeleton key={i} rows={2} />
                      ))}
                    </div>
                  ) : categories.length === 0 ? (
                    <EmptyState
                      title="No categories yet"
                      hint="Check back after the first FAQs are published for this program."
                    />
                  ) : (
                    <div className="space-y-3">
                      {categories.map((cat) => (
                        <CategoryAccordion
                          key={cat.name}
                          category={cat}
                          batchId={batchId}
                          courseId={selectedCourseId}
                          scrollAnchorRef={getSectionRef(cat.name)}
                          openOnMount={isCategoryOpen(cat.name)}
                          onSelectFaq={setOpenFaq}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

      {/* Tick accents — left, under the small star */}
      <div className="absolute top-[64px] left-[20%] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-18deg)' }} aria-hidden="true">
        <svg width="22" height="16" viewBox="0 0 22 16" fill="none" style={{ opacity: 0.40 }}>
          <path d="M3 12 L8 3" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M12 14 L17 5" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Swirl arrow — left side */}
      <div className="absolute top-[120px] -left-10 hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="80" height="70" viewBox="0 0 80 70" fill="none" style={{ opacity: 0.45 }}>
          <path d="M10 14 C2 26, 10 38, 22 36 C34 34, 34 20, 24 18 C14 16, 8 28, 18 38 C30 50, 48 56, 66 56" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M58 50 L66 56 L58 62" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Lightbulb doodle — right of hero */}
      <div className="absolute -top-4 -right-14 hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="55" height="75" viewBox="0 0 55 75" fill="none" style={{ opacity: 0.45 }}>
          <path d="M27 12 C16 12, 10 20, 10 28 C10 36, 16 40, 20 46 L34 46 C38 40, 44 36, 44 28 C44 20, 38 12, 27 12Z" stroke="var(--section-icon)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <line x1="20" y1="50" x2="34" y2="50" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="22" y1="54" x2="32" y2="54" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="27" y1="2" x2="27" y2="7" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="8" y1="12" x2="12" y2="16" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="46" y1="12" x2="42" y2="16" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="2" y1="28" x2="7" y2="28" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="47" y1="28" x2="52" y2="28" stroke="var(--section-icon)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Tick accents — left of the lightbulb */}
      <div className="absolute top-0 right-[8%] hidden lg:block" style={{ pointerEvents: 'none', transform: 'rotate(-14deg)' }} aria-hidden="true">
        <svg width="26" height="18" viewBox="0 0 26 18" fill="none" style={{ opacity: 0.42 }}>
          <path d="M4 14 L10 4" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M14 16 L20 6" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Question mark doodle — right side */}
      <div className="absolute top-[210px] -right-14 hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="40" height="60" viewBox="0 0 40 60" fill="none" style={{ opacity: 0.45 }}>
          <path d="M12 16 C12 6, 28 6, 28 16 C28 24, 20 26, 20 36" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <circle cx="20" cy="44" r="2.5" fill="var(--deco-stroke-soft)"/>
        </svg>
      </div>

      {/* Pencil doodle — left side */}
      <div className="absolute top-[200px] left-[-20px] hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="50" height="50" viewBox="0 0 50 50" fill="none" style={{ opacity: 0.42 }}>
          <path d="M38 5 L12 32 L10 42 L20 40 L46 13 Z" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="30" y1="12" x2="38" y2="20" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Dotted curved trail — sweeps from the search area to the right */}
      <div className="absolute top-[150px] right-[-40px] hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="220" height="240" viewBox="0 0 220 240" fill="none" style={{ opacity: 0.38 }}>
          <path d="M8 16 C70 30, 110 60, 118 100 C126 140, 110 170, 140 196 C160 214, 190 222, 212 224" stroke="var(--section-icon)" strokeWidth="1.5" strokeDasharray="2 7" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Small sparkles — right edge */}
      <div className="absolute top-[260px] right-[-56px] hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="40" height="44" viewBox="0 0 40 44" fill="none" style={{ opacity: 0.45 }}>
          <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
          <path d="M30 24 L31.5 30 L37 31.5 L31.5 33 L30 39 L28.5 33 L23 31.5 L28.5 30 Z" stroke="var(--deco-stroke)" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Code / angle bracket symbol — right side */}
      <div className="absolute top-[330px] right-[-12px] hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="45" height="55" viewBox="0 0 45 55" fill="none" style={{ opacity: 0.42 }}>
          <path d="M16 5 L6 27 L16 49" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M29 5 L39 27 L29 49" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="14" y1="20" x2="31" y2="20" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="14" y1="34" x2="31" y2="34" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Wavy squiggle — right of search */}
      <div className="absolute top-[170px] right-[12%] hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="90" height="16" viewBox="0 0 90 16" fill="none" style={{ opacity: 0.45 }}>
          <path d="M2 8 Q12 2, 22 8 Q32 14, 42 8 Q52 2, 62 8 Q72 14, 82 8" stroke="var(--section-icon)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Bottom curved arrow — dashed swoop under the cards, with a leaf tip */}
      <div className="absolute top-[700px] left-[42%] hidden lg:block" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <svg width="190" height="60" viewBox="0 0 190 60" fill="none" style={{ opacity: 0.42 }}>
          <path d="M6 18 C30 44, 80 52, 130 44 C150 41, 164 34, 174 26" stroke="var(--deco-stroke)" strokeWidth="1.5" strokeDasharray="6 6" fill="none" strokeLinecap="round"/>
          <path d="M166 24 L174 26 L172 34" stroke="var(--deco-stroke)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M176 22 C176 16, 182 12, 188 12 C188 18, 182 22, 176 22 Z" stroke="var(--section-icon)" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
        </svg>
      </div>
    </>
  );
}