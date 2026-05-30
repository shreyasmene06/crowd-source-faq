import React, { useEffect, useRef, useState } from 'react';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import api from '../../utils/api';
import type { Post } from '../../types/ui';

const formatDate = (d: string | undefined) =>
  new Date(d ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

interface Comment {
  _id: string;
  author?: { name?: string };
  body: string;
  createdAt?: string;
  upvotes?: unknown[];
  downvotes?: unknown[];
  verified?: boolean;
}

interface PostDetailDialogProps {
  post: Post;
  onClose: () => void;
  currentUserId: string;
  userRole: string;
}

export default function PostDetailDialog({ post: initialPost, onClose, currentUserId, userRole }: PostDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [post, setPost] = useState<Post>(initialPost);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [upvoteLoading, setUpvoteLoading] = useState(false);
  const [resolveText, setResolveText] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [expertHelpLoading, setExpertHelpLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAnswered = post.status === 'answered';
  const upvoteCount = (post.upvotes?.length ?? 0);
  const hasUpvoted = post.upvotes?.some(
    (id) => (typeof id === 'object' ? (id as { _id?: string })._id || id : id)?.toString() === currentUserId
  );
  const canResolve = userRole === 'admin' || userRole === 'moderator';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (e: MouseEvent) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isContent =
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
        if (!isContent) dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('click', handleBackdropClick);
      };
    }

    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const handleUpvote = async () => {
    if (upvoteLoading) return;
    setUpvoteLoading(true);
    try {
      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/upvote`);
      setPost((prev) => ({
        ...prev,
        upvotes: res.data.upvotedByMe
          ? [...(prev.upvotes || []), currentUserId]
          : (prev.upvotes || []).filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId),
      }));
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upvote failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setUpvoteLoading(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || commentLoading) return;
    setCommentLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(`/community/${post._id}/comments`, { body: commentText });
      setPost((prev) => ({ ...prev, comments: [...(prev.comments || []), res.data.comment] }));
      setCommentText('');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Comment failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveText.trim() || resolveLoading) return;
    setResolveLoading(true);
    try {
      await api.patch(`/community/${post._id}/resolve`, { answer: resolveText });
      setPost((prev) => ({ ...prev, status: 'answered', answer: resolveText.trim() }));
      setShowResolveForm(false);
      setResolveText('');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Could not mark as resolved. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setResolveLoading(false);
    }
  };

  const handleRequestExpertHelp = async () => {
    if (expertHelpLoading) return;
    setExpertHelpLoading(true);
    try {
      await api.post(`/community/${post._id}/request-expert`);
      setPost((prev) => ({ ...prev, _expertHelpRequested: true } as any));
    } catch (e) {
      console.error(e);
    } finally {
      setExpertHelpLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="post-dialog-title"
      className="m-auto w-full max-w-2xl rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
      style={{ maxHeight: '90vh' }}
    >
      {/* Action error banner */}
      {actionError && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger font-bold text-sm leading-none">✕</button>
        </div>
      )}
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-border">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5
              ${isAnswered ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
              {isAnswered ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3.5 9L7.5 13L14.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M9 6V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  <circle cx="9" cy="12.5" r="0.9" fill="currentColor"/>
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <h2 id="post-dialog-title" className="text-base font-semibold text-ink leading-snug">
                {post.title}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant={isAnswered ? 'success' : 'warning'}>
                  {isAnswered ? '✓ Answered' : '○ Open'}
                </Badge>
                <span className="text-xs text-ink-soft">by {post.author?.name || 'Student'}</span>
                <span className="text-xs text-ink-faint">·</span>
                <span className="text-xs text-ink-soft">{formatDate(post.createdAt)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-mist flex items-center justify-center text-ink-soft hover:text-ink hover:bg-border transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="px-6 py-4">
            <p className="text-sm text-ink/70 leading-relaxed">{post.body}</p>
          </div>

          <div className="px-6 pb-4 flex items-center gap-3">
            <button
              onClick={handleUpvote}
              disabled={upvoteLoading}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200
                ${hasUpvoted
                  ? 'bg-accent-light text-accent hover:bg-accent/15'
                  : 'bg-mist text-ink-soft hover:bg-border hover:text-ink'
                } disabled:opacity-50`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill={hasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M7 1L8.8 4.8H13L9.8 7.6L11 12L7 9.2L3 12L4.2 7.6L1 4.8H5.2L7 1Z" strokeLinejoin="round"/>
              </svg>
              {hasUpvoted ? 'Upvoted' : 'Upvote'}
              <span className="font-semibold">{upvoteCount}</span>
            </button>
            <span className="text-xs text-ink-faint flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 2.5C1 1.67 1.67 1 2.5 1h7C10.33 1 11 1.67 11 2.5v5C11 8.33 10.33 9 9.5 9H7L4.5 11V9H2.5C1.67 9 1 8.33 1 7.5v-5z" strokeLinejoin="round"/>
              </svg>
              {post.comments?.length ?? 0} comments
            </span>

            {canResolve && !isAnswered && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowResolveForm((v) => !v)}
                className="ml-auto"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 6L5 9L10 3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mark as Resolved
              </Button>
            )}

            {!canResolve && !isAnswered && currentUserId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRequestExpertHelp}
                loading={expertHelpLoading}
                className="ml-auto"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1L7.5 4.5H11.5L8.5 7.5L9.5 11L6 8.5L2.5 11L3.5 7.5L0.5 4.5H4.5L6 1Z"/>
                </svg>
                Request Expert Help
              </Button>
            )}
          </div>

          {isAnswered && post.answer && (
            <div className={`mx-6 mb-4 rounded-xl border p-4 ${
              post.answerIsExpert
                ? 'bg-amber-light border-amber/20'
                : 'bg-success-light border-success/20'
            }`}>
              <p className={`text-xs font-semibold mb-2 uppercase tracking-wide flex items-center gap-1.5 ${
                post.answerIsExpert ? 'text-amber' : 'text-success'
              }`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 0L7.5 4.5H12L8.5 7L9.8 11.5L6 8.5L2.2 11.5L3.5 7L0 4.5H4.5L6 0Z"/>
                </svg>
                {post.answerIsExpert ? '⭐ Expert Mentor Answer' : 'Official Answer'}
              </p>
              <p className="text-sm text-ink/75 leading-relaxed">{post.answer}</p>
            </div>
          )}

          {showResolveForm && (
            <form onSubmit={handleResolve} className="mx-6 mb-4 rounded-xl border border-accent/20 bg-accent-light p-4">
              <label className="block text-xs font-medium text-accent mb-2">Write the official answer</label>
              <textarea
                value={resolveText}
                onChange={(e) => setResolveText(e.target.value)}
                rows={3}
                placeholder="Provide a clear, helpful answer…"
                className="w-full rounded-xl border border-accent/20 bg-card px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              />
              <div className="flex gap-2 mt-2">
                <Button type="submit" size="sm" loading={resolveLoading} disabled={!resolveText.trim()}>
                  Save Answer
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowResolveForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div className="px-6 pb-2">
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">
              Comments ({post.comments?.length ?? 0})
            </h3>

            {!post.comments || post.comments.length === 0 ? (
              <p className="text-sm text-ink-faint py-2">No comments yet. Be the first to comment!</p>
            ) : (
              <div className="space-y-3">
                {post.comments.map((c, i) => {
                  const comment = c as Comment;
                  const cUpvotes = comment.upvotes?.length ?? 0;
                  const cDownvotes = comment.downvotes?.length ?? 0;
                  const netScore = cUpvotes - cDownvotes;
                  const hasUpvotedComment = comment.upvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
                  const hasDownvotedComment = comment.downvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
                  const commentOpacity = netScore >= 0 ? 1 : Math.max(0.15, 1 - (Math.abs(netScore) * 0.2));

                  const handleCommentUpvote = async () => {
                    try {
                      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/comments/${comment._id}/upvote`);
                      setPost(prev => ({
                        ...prev,
                        comments: (prev.comments as Comment[]).map(cm =>
                          cm._id === comment._id ? { ...cm, upvotes: res.data.upvotedByMe ? [...(cm.upvotes || []), currentUserId] : (cm.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId), downvotes: (cm.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId) } : cm
                        )
                      }));
                    } catch (e) { console.error(e); }
                  };

                  const handleCommentDownvote = async () => {
                    try {
                      const res = await api.post<{ deleted?: boolean; downvotedByMe: boolean }>(`/community/${post._id}/comments/${comment._id}/downvote`);
                      if (res.data.deleted) {
                        try { new Audio('/fahhhhh.mp3').play(); } catch (_) {}
                        const el = document.getElementById(`comment-${comment._id}`);
                        if (el) {
                          el.style.setProperty('--current-opacity', String(commentOpacity));
                          el.classList.add('comment-dying');
                          setTimeout(() => {
                            setPost(prev => ({ ...prev, comments: (prev.comments as Comment[]).filter(cm => cm._id !== comment._id) }));
                          }, 800);
                        } else {
                          setPost(prev => ({ ...prev, comments: (prev.comments as Comment[]).filter(cm => cm._id !== comment._id) }));
                        }
                        return;
                      }
                      setPost(prev => ({
                        ...prev,
                        comments: (prev.comments as Comment[]).map(cm =>
                          cm._id === comment._id ? { ...cm, downvotes: res.data.downvotedByMe ? [...(cm.downvotes || []), currentUserId] : (cm.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId), upvotes: (cm.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId) } : cm
                        )
                      }));
                    } catch (e) { console.error(e); }
                  };

                  return (
                    <div
                      key={comment._id || i}
                      id={`comment-${comment._id}`}
                      className="flex items-start gap-2.5 transition-opacity duration-300 relative"
                      style={{ opacity: commentOpacity }}
                    >
                      <Avatar name={comment.author?.name} size="sm" />
                      <div className="flex-1 bg-mist rounded-xl px-3 py-2.5 relative overflow-hidden">
                        <div className={`comment-fire-glow ${netScore > 2 ? 'active' : ''}`} />
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-ink">{comment.author?.name || 'User'}</span>
                            {comment.verified && <span className="verified-badge">✅ Verified</span>}
                            <span className="text-xs text-ink-faint">{formatDate(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-ink/75 leading-relaxed">{comment.body}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={handleCommentUpvote}
                              className={`comment-vote-btn ${hasUpvotedComment ? 'upvoted' : ''}`}
                              title="Upvote"
                            >
                              <span className="emoji-upvote">{hasUpvotedComment ? '🔥' : '🤌'}</span>
                              <span className="text-xs font-semibold">{cUpvotes > 0 ? cUpvotes : ''}</span>
                            </button>
                            <button
                              onClick={handleCommentDownvote}
                              className={`comment-vote-btn ${hasDownvotedComment ? 'downvoted' : ''}`}
                              title="Downvote"
                            >
                              <span className="emoji-downvote">🥀</span>
                              <span className="text-xs font-semibold">{cDownvotes > 0 ? cDownvotes : ''}</span>
                            </button>
                            {netScore < 0 && (
                              <span className="text-[10px] text-ink-faint ml-1 melting-text">🧊 melting...</span>
                            )}
                            {canResolve && (
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await api.patch<{ verified: boolean }>(`/community/${post._id}/comments/${comment._id}/verify`);
                                    setPost(prev => ({
                                      ...prev,
                                      comments: (prev.comments as Comment[]).map(cm =>
                                        cm._id === comment._id ? { ...cm, verified: res.data.verified } : cm
                                      )
                                    }));
                                  } catch (e) { console.error(e); }
                                }}
                                className="ml-auto text-[10px] text-ink-faint hover:text-accent transition-colors"
                                title={comment.verified ? 'Unverify answer' : 'Mark as verified answer'}
                              >
                                {comment.verified ? 'Unverify' : '✅ Verify'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleComment} className="px-6 pt-3 pb-6">
            <div className="flex gap-2 items-start">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                placeholder="Write a comment…"
                className="flex-1 rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!commentLoading) handleComment(e as unknown as React.FormEvent);
                  }
                }}
              />
              <Button
                type="submit"
                size="md"
                disabled={!commentText.trim()}
                loading={commentLoading}
                className="flex-shrink-0 mt-0.5"
              >
                Post
              </Button>
            </div>
            <p className="text-xs text-ink-faint mt-1.5 ml-1">Press Enter to post, Shift+Enter for newline</p>
          </form>
        </div>
      </div>
    </dialog>
  );
}
