import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import adminApi from '../utils/adminApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import { TableSkeleton } from '../components/common/SkeletonLoader';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

interface CommunityPost {
  _id: string;
  title: string;
  body: string;
  status: 'answered' | 'unanswered';
  author: { _id: string; name: string; email: string };
  comments: Array<{ _id: string; body: string; author: { name: string }; upvotes: string[]; verified: boolean }>;
  upvotes: string[];
  createdAt: string;
  answer?: string;
}

interface Toast {
  msg: string;
  type: 'success' | 'warn' | 'error';
}

interface CommunityPostsResponse {
  posts: CommunityPost[];
  total: number;
  page: number;
  pages: number;
}

const INPUT = "w-full px-3 py-2 rounded-lg text-sm text-white/80 placeholder-white/20 outline-none transition-all";
const inputStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' } as const;
const focusStyle = { borderColor: 'rgba(139,92,246,0.5)' } as const;

export default function AdminCommunity() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  const [toast, setToast] = useState<Toast | null>(null);
  const [viewPost, setViewPost] = useState<CommunityPost | null>(null);

  const showToast = (msg: string, type: Toast['type'] = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPosts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '10' });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);

    adminApi.get<CommunityPostsResponse>(`/admin/community/posts?${params}`)
      .then(r => {
        setPosts(r.data.posts);
        setTotal(r.data.total);
        setPages(r.data.pages);
      })
      .catch((err: unknown) => {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to load posts';
        console.error(msg, err);
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this community post?')) return;
    try {
      await adminApi.delete(`/admin/community/${id}`);
      showToast('Post deleted', 'error');
      fetchPosts();
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  const cardStyle = { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' } as const;
  const rowStyle = { borderColor: 'rgba(255,255,255,0.04)' } as const;

  return (
    <div className="space-y-5 pb-8">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-sm font-medium border"
            style={{
              background: toast.type === 'error' ? 'rgba(239,68,68,0.15)' : toast.type === 'warn' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
              borderColor: toast.type === 'error' ? 'rgba(239,68,68,0.3)' : toast.type === 'warn' ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)',
              color: toast.type === 'error' ? '#f87171' : toast.type === 'warn' ? '#fbbf24' : '#34d399',
            }}
          >{toast.msg}</motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-white/90">Community Posts</h2>
        <p className="text-xs text-white/30 mt-0.5">{total} total posts</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text" placeholder="Search posts…" value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${INPUT} pl-8`} style={inputStyle}
            onFocus={e => Object.assign(e.target.style, focusStyle)}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className={INPUT} style={{ ...inputStyle, maxWidth: 160 }}>
          <option value="">All Status</option>
          <option value="unanswered">Unanswered</option>
          <option value="answered">Answered</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={cardStyle}>
        {/* Table header */}
        <div className="grid grid-cols-[1fr_130px_80px_80px_110px_100px] gap-2 px-4 py-3 border-b text-[11px] font-semibold text-white/25 uppercase tracking-wider"
          style={rowStyle}>
          <span>Title</span>
          <span>Author</span>
          <span>Status</span>
          <span className="text-right">Comments</span>
          <span className="text-right">Upvotes</span>
          <span>Date</span>
          <span className="text-right">Actions</span>
        </div>

        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} /></div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(139,92,246,0.1)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.7)" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p className="text-sm text-white/40 font-medium">No posts found</p>
            <p className="text-xs text-white/20 mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div>
            {posts.map((post, i) => (
              <motion.div
                key={post._id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="grid grid-cols-[1fr_130px_80px_80px_110px_100px_80px] gap-2 px-4 py-3 border-b items-center hover:bg-white/[0.02] transition-colors"
                style={rowStyle}
              >
                <button
                  onClick={() => setViewPost(post)}
                  className="text-xs text-white/70 truncate pr-2 text-left hover:text-violet-300 transition-colors"
                  title={post.title}
                >{post.title}</button>
                <p className="text-xs text-white/40 truncate">{post.author?.name ?? 'Unknown'}</p>
                <div>
                  <Badge
                    status={post.status === 'answered' ? 'approved' : 'pending'}
                    label={post.status}
                    showDot={false}
                  />
                </div>
                <p className="text-xs text-white/40 text-right tabular-nums">{post.comments?.length ?? 0}</p>
                <p className="text-xs text-white/40 text-right tabular-nums">{post.upvotes?.length ?? 0}</p>
                <p className="text-[10px] text-white/30">{new Date(post.createdAt).toLocaleDateString('en-IN')}</p>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => setViewPost(post)}
                    className="w-6 h-6 flex items-center justify-center rounded text-violet-400 hover:bg-violet-500/10 transition-colors" title="View">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button onClick={() => handleDelete(post._id)}
                    className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-white/30" style={rowStyle}>
            <span>Page {page} of {pages} · {total} results</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg hover:bg-white/[0.05] disabled:opacity-30 transition-colors">← Prev</button>
              {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2 + i, pages - 4 + i));
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded-lg text-xs transition-colors ${p === page ? 'text-violet-300 bg-violet-500/15' : 'hover:bg-white/[0.05]'}`}>
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                className="px-3 py-1.5 rounded-lg hover:bg-white/[0.05] disabled:opacity-30 transition-colors">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* View Post Modal */}
      <Modal open={!!viewPost} onClose={() => setViewPost(null)} title="Post Details" maxWidth="max-w-2xl">
        {viewPost && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Title</p>
              <p className="text-sm text-white/80">{viewPost.title}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Author</p>
              <p className="text-sm text-white/60">{viewPost.author?.name} ({viewPost.author?.email})</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Body</p>
              <p className="text-sm text-white/80 whitespace-pre-wrap">{viewPost.body}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Status</p>
              <Badge status={viewPost.status === 'answered' ? 'approved' : 'pending'} label={viewPost.status} showDot={false} />
            </div>
            {viewPost.answer && (
              <div>
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">Official Answer</p>
                <p className="text-sm text-emerald-400/80 whitespace-pre-wrap border-l-2 border-emerald-500/30 pl-3">{viewPost.answer}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">
                Comments ({viewPost.comments?.length ?? 0})
              </p>
              {viewPost.comments?.length ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {viewPost.comments.map(c => (
                    <div key={c._id} className="text-xs text-white/60 bg-white/[0.03] rounded-lg p-2.5 border border-white/[0.05]">
                      <span className="text-violet-300 font-medium">{c.author?.name ?? 'Unknown'}: </span>
                      {c.body}
                      {c.verified && <span className="ml-2 text-emerald-400">✓ verified</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/30">No comments yet</p>
              )}
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-xs text-white/30">{new Date(viewPost.createdAt).toLocaleString('en-IN')}</span>
              <div className="flex gap-2">
                <button onClick={() => { handleDelete(viewPost._id); setViewPost(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors">
                  Delete Post
                </button>
                <button onClick={() => setViewPost(null)}
                  className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:bg-white/[0.04] transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}