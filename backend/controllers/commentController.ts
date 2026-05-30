import { Request, Response } from 'express';
import { Types } from 'mongoose';
import CommunityPost from '../models/CommunityPost.js';
import User, { IUser } from '../models/User.js';

// Extend Express Request to include user (same pattern as auth middleware)
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

// GET /api/community/answers/list — Paginated list of posts with an official expert answer
export const getAnswersList = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(0, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter = { status: 'answered' };

    const total = await CommunityPost.countDocuments(filter);

    const posts = await CommunityPost.find(filter)
      .select('-embedding')
      .populate('author', 'name')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      posts,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasMore: skip + posts.length < total,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// POST /api/community/:id/comments — Add a comment or reply to another comment
// Query param: ?parentId=<commentId> to reply to a specific comment
export const addComment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const { body } = req.body as { body?: string };
    const { parentId } = req.query as { parentId?: string };

    if (!body || !body.trim()) {
      res.status(400).json({ message: 'Comment body is required.' });
      return;
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    // Resolve parent comment if this is a reply
    let resolvedParent: any = null;
    if (parentId) {
      resolvedParent = (post.comments as any).id(parentId);
      if (!resolvedParent) {
        res.status(404).json({ message: 'Parent comment not found.' });
        return;
      }
      if (resolvedParent.depth >= 3) {
        res.status(400).json({ message: 'Maximum reply depth (3) reached. Cannot nest deeper.' });
        return;
      }
    }

    // Build comment object with parentId and depth for replies
    const commentObj: Record<string, unknown> = { author: req.user!._id, body: body.trim() };
    if (resolvedParent) {
      commentObj.parentId = new Types.ObjectId(parentId);
      commentObj.depth = resolvedParent.depth + 1;
    } else {
      commentObj.parentId = null;
      commentObj.depth = 0;
    }

    post.comments.push(commentObj as any);
    await post.save();

    await post.populate('comments.author', 'name');
    const newComment = post.comments[post.comments.length - 1];

    // Notify post author
    if (post.author.toString() !== req.user!._id.toString()) {
      import('./notificationController.js').then(n =>
        n.createNotification({
          recipient: post.author,
          type: 'comment_replied',
          title: 'New comment on your post',
          message: `${req.user!.name} commented on "${post.title}": "${body.trim().slice(0, 80)}${body.trim().length > 80 ? '…' : ''}"`,
          link: `/community?post=${post._id}`,
        })
      ).catch(() => {});
    }

    // Notify parent comment author
    if (resolvedParent && resolvedParent.author.toString() !== req.user!._id.toString()) {
      import('./notificationController.js').then(n =>
        n.createNotification({
          recipient: resolvedParent.author,
          type: 'comment_replied',
          title: 'Someone replied to your comment',
          message: `${req.user!.name} replied: "${body.trim().slice(0, 80)}${body.trim().length > 80 ? '…' : ''}"`,
          link: `/community?post=${post._id}`,
        })
      ).catch(() => {});
    }

    res.status(201).json({ comment: newComment, total: post.comments.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// POST /api/community/:id/comments/:commentId/upvote — Toggle upvote on a comment
export const toggleCommentUpvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    const userId = req.user!._id.toString();
    const alreadyUpvoted = comment.upvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    if (alreadyUpvoted) {
      comment.upvotes = comment.upvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    } else {
      comment.upvotes.push(req.user!._id);
      comment.downvotes = comment.downvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    }

    await post.save();

    const netScore = comment.upvotes.length - comment.downvotes.length;
    res.json({
      upvotes: comment.upvotes.length,
      downvotes: comment.downvotes.length,
      netScore,
      upvotedByMe: !alreadyUpvoted,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// POST /api/community/:id/comments/:commentId/downvote — Toggle downvote on a comment
export const toggleCommentDownvote = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    const userId = req.user!._id.toString();
    const alreadyDownvoted = comment.downvotes.map((u: Types.ObjectId) => u.toString()).includes(userId);

    if (alreadyDownvoted) {
      comment.downvotes = comment.downvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    } else {
      comment.downvotes.push(req.user!._id);
      comment.upvotes = comment.upvotes.filter((u: Types.ObjectId) => u.toString() !== userId);
    }

    const netScore = comment.upvotes.length - comment.downvotes.length;

    if (netScore <= -5) {
      comment.deleteOne();
      await post.save();
      res.json({
        deleted: true,
        message: 'Comment obliterated.',
      });
      return;
    }

    await post.save();

    res.json({
      upvotes: comment.upvotes.length,
      downvotes: comment.downvotes.length,
      netScore,
      downvotedByMe: !alreadyDownvoted,
      deleted: false,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// PATCH /api/community/:id/comments/:commentId/verify — Mark a comment as verified top answer
export const verifyComment = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) { res.status(401).json({ message: "Not authorized" }); return; }
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: 'Post not found.' });
      return;
    }

    const comment = (post.comments as any).id(req.params.commentId);
    if (!comment) {
      res.status(404).json({ message: 'Comment not found.' });
      return;
    }

    comment.verified = !comment.verified;
    await post.save();

    res.json({ verified: comment.verified, commentId: req.params.commentId });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};
