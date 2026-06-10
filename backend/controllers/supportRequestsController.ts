/**
 * supportRequestsController.ts — Session Support ticket CRUD.
 *
 * Routes (from routes/support.ts):
 *   GET  /api/support/troubleshoot/:issueType    (user, gated by flag)
 *   POST /api/support/requests                    (user, gated by flag, rate-limited)
 *   GET  /api/support/requests                   (user/admin, gated by flag)
 *   GET  /api/support/requests/:id               (user/admin, gated by flag)
 *
 * Follow-up messages and status changes are in supportFollowUpController.ts.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import SupportRequest, {
  ISSUE_CONFIGS,
  getIssueConfig,
  type SupportIssueType,
  type SupportStatus,
  type ISupportFollowUp,
} from '../models/SupportRequest.js';
import SupportCategory, { type IContextField } from '../models/SupportCategory.js';
import { logger } from '../utils/http/logger.js';
import {
  VALID_STATUSES,
  getAuthedUserId,
  getAuthedUserRole,
  escapeRegex,
  coerceContextFieldValue,
  isEmptyContextValue,
  stripAdminOnlyFields,
  fanOutToAdmins,
  requireFeatureOn,
} from './supportCore.js';

function asStringParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

// ─── Troubleshoot (read) ──────────────────────────────────────────────────

/**
 * GET /api/support/troubleshoot/:issueType
 * Returns the checklist + custom context-field schema for an issue
 * type. Reads from SupportCategory (the new admin-editable model).
 * Falls back to the hardcoded ISSUE_CONFIGS defaults if no row
 * exists yet (covers the case where the seed script hasn't been run
 * — e.g. fresh dev environment). Gated by flag.
 */
export async function getTroubleshootSteps(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  try {
    const issueType = String(req.params.issueType || '').trim() as SupportIssueType;
    const config = getIssueConfig(issueType);

    // Prefer the admin-editable SupportCategory
    let cat = await SupportCategory.findOne({ issueType, isActive: true }).lean();
    if (!cat) {
      // Fall back to the in-code defaults + an empty field list
      cat = await SupportCategory.findOneAndUpdate(
        { issueType },
        {
          $setOnInsert: {
            issueType,
            label: config.label,
            shortLabel: config.shortLabel,
            steps: config.steps,
            fields: [],
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
    }

    res.json({
      issueType,
      label: cat?.label ?? config.label,
      shortLabel: cat?.shortLabel ?? config.shortLabel,
      steps: cat?.steps ?? config.steps,
      // Only return non-archived fields — the user form doesn't render
      // archived ones. The admin ticket view looks these up from the
      // stored triples (the ticket knows its own label snapshot).
      fields: (cat?.fields ?? []).filter((f) => !f.archived),
    });
  } catch (err) {
    logger.error(`[support] getTroubleshootSteps failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load troubleshooting steps.' });
  }
}

// ─── Create request ───────────────────────────────────────────────────────

/**
 * POST /api/support/requests
 * Submit a new request. Gated by flag.
 */
export async function createSupportRequest(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const body = (req.body ?? {}) as {
    issueType?: string;
    title?: string;
    details?: string;
    attemptedSteps?: string[];
    documents?: { name?: string; url?: string; type?: string }[];
    guidanceShownAt?: string;
    contextFields?: Record<string, unknown>;
  };

  const rawIssueType = String(body.issueType || '').trim();
  if (!(rawIssueType in ISSUE_CONFIGS)) {
    res.status(400).json({ message: 'Please choose a valid issue type.' });
    return;
  }
  const issueType = rawIssueType as SupportIssueType;
  const config = ISSUE_CONFIGS[issueType];

  const details = String(body.details || '').trim();
  if (!details) {
    res.status(400).json({ message: 'Please describe the issue before submitting.' });
    return;
  }

  const title = String(body.title || '').trim().slice(0, 180)
    || `${config.label} — Unable to attend session`;

  const attemptedSteps = Array.isArray(body.attemptedSteps)
    ? body.attemptedSteps.map((s) => String(s).trim()).filter(Boolean).slice(0, 10)
    : [];

  const documents = Array.isArray(body.documents)
    ? body.documents
        .filter((d) => d && typeof d.url === 'string' && d.url)
        .map((d) => ({
          name: String(d.name || '').slice(0, 200),
          url:  String(d.url || '').slice(0, 1000),
          type: String(d.type || '').slice(0, 60),
        }))
        .slice(0, 4)
    : [];

  const guidanceShownAt = body.guidanceShownAt
    ? new Date(body.guidanceShownAt)
    : null;
  if (guidanceShownAt && isNaN(guidanceShownAt.getTime())) {
    res.status(400).json({ message: 'Invalid guidanceShownAt.' });
    return;
  }

  // ── Validate + coerce contextFields against the live category schema ─
  // Look up the active category so we honour admin-edits without a
  // deploy. Defaults to the hardcoded fallback if no row exists yet.
  const activeCategory = await SupportCategory.findOne({ issueType, isActive: true }).lean();
  const schemaFields: IContextField[] = (activeCategory?.fields ?? []).filter((f) => !f.archived);
  const contextFieldsInput = (body.contextFields ?? {}) as Record<string, unknown>;

  const contextFields: { key: string; label: string; value: string | number | boolean | null }[] = [];
  for (const field of schemaFields) {
    const raw = contextFieldsInput[field.key];
    const coerced = coerceContextFieldValue(field, raw);
    if (!coerced.ok) {
      res.status(400).json({ message: `Field "${field.label}": ${coerced.error}` });
      return;
    }
    if (field.required && isEmptyContextValue(coerced.value)) {
      res.status(400).json({ message: `Field "${field.label}" is required.` });
      return;
    }
    if (!isEmptyContextValue(coerced.value)) {
      contextFields.push({ key: field.key, label: field.label, value: coerced.value });
    }
  }

  try {
    // Fetch the requester's user record for denormalised name/email
    const { default: User } = await import('../models/User.js');
    const requester = await User.findById(userId).select('name email').lean();
    if (!requester) {
      res.status(401).json({ message: 'User not found.' });
      return;
    }

    const request = await SupportRequest.create({
      userId,
      userName: requester.name,
      userEmail: requester.email,
      issueType,
      issueLabel: activeCategory?.label ?? config.label,
      title,
      details,
      attemptedSteps,
      status: 'Pending',
      statusHistory: [{
        status: 'Pending',
        note: 'Request submitted.',
        updatedBy: userId,
        updatedByName: requester.name,
        timestamp: new Date(),
      }],
      guidanceShownAt,
      contextFields,
    });

    // Attach the documents (if any) as the first follow-up, so the
    // student can attach proof at submit time without the admin
    // having to request it.
    if (documents.length > 0) {
      const initialFollowUp: Partial<ISupportFollowUp> = {
        senderRole: 'student',
        senderId: userId,
        senderName: requester.name,
        message: documents.length === 1 ? 'Attached proof:' : 'Attached proofs:',
        requestProof: false,
        documents: documents as ISupportFollowUp['documents'],
      };
      request.followUps.push(initialFollowUp as ISupportFollowUp);
      await request.save();
    }

    // Notify all admins
    await fanOutToAdmins({
      title: 'New session support request',
      message: `${requester.name} reported ${config.label.toLowerCase()} and needs help attending a session.`,
      link: '/admin/support',
      metadata: {
        supportRequestId: request._id.toString(),
        issueType,
        status: 'Pending',
      },
    });

    res.status(201).json({ request: stripAdminOnlyFields(request.toObject(), false) });
  } catch (err) {
    logger.error(`[support] createSupportRequest failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to submit support request.' });
  }
}

// ─── List + get requests ──────────────────────────────────────────────────

/**
 * GET /api/support/requests
 * List own requests; admin/moderator sees all with filters.
 * Gated by flag.
 */
export async function listSupportRequests(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const isAdmin = getAuthedUserRole(req) === 'admin' || getAuthedUserRole(req) === 'moderator';

  try {
    const { status, issueType, q, userName, email, from, to } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = isAdmin ? {} : { userId };
    const page = Math.max(1, parseInt(String(req.query.page ?? '1')) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? (isAdmin ? '25' : '20'))) || (isAdmin ? 25 : 20)));
    const skip = (page - 1) * limit;

    if (status && VALID_STATUSES.includes(status as SupportStatus)) {
      filter.status = status;
    }
    if (issueType && issueType in ISSUE_CONFIGS) {
      filter.issueType = issueType;
    }
    if (isAdmin && q) {
      const regex = new RegExp(escapeRegex(q).slice(0, 120), 'i');
      filter.$or = [
        { userName: regex },
        { userEmail: regex },
        { title: regex },
        { details: regex },
        { adminNote: regex },
        { resolutionSummary: regex },
      ];
    }
    if (isAdmin && userName) {
      filter.userName = new RegExp(escapeRegex(userName).slice(0, 80), 'i');
    }
    if (isAdmin && email) {
      filter.userEmail = new RegExp(escapeRegex(email).slice(0, 120), 'i');
    }
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if (fromDate && !isNaN(fromDate.getTime())) createdAt.$gte = fromDate;
      if (toDate && !isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        createdAt.$lte = toDate;
      }
      if (Object.keys(createdAt).length) filter.createdAt = createdAt;
    }

    const [total, requests, statusRows, issueRows, recentRows] = await Promise.all([
      SupportRequest.countDocuments(filter),
      SupportRequest.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')
        .lean(),
      SupportRequest.aggregate([
        { $match: filter },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      SupportRequest.aggregate([
        { $match: filter },
        { $group: { _id: '$issueType', count: { $sum: 1 } } },
      ]),
      SupportRequest.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(5)
        .select('userId userName issueType status createdAt updatedAt')
        .lean(),
    ]);

    const statusCounts = statusRows.reduce<Record<string, number>>((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});
    const issueTypeCounts = issueRows.reduce<Record<string, number>>((acc, r) => {
      acc[r._id] = r.count;
      return acc;
    }, {});

    const byStatus = VALID_STATUSES.reduce<Record<string, number>>((acc, s) => {
      acc[s] = statusCounts[s] ?? 0;
      return acc;
    }, {});
    const byIssueType = Object.keys(ISSUE_CONFIGS).reduce<Record<string, number>>((acc, k) => {
      acc[k] = issueTypeCounts[k] ?? 0;
      return acc;
    }, {});

    const unresolved = (byStatus['Pending'] ?? 0) + (byStatus['In Review'] ?? 0) + (byStatus['Rejected'] ?? 0);

    res.json({
      requests: requests.map((r) => stripAdminOnlyFields(r, isAdmin)),
      summary: {
        total,
        unresolvedCount: unresolved,
        byStatus,
        byIssueType,
        recent: recentRows,
      },
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
      issueOptions: Object.entries(ISSUE_CONFIGS).map(([key, value]) => ({
        key,
        label: value.label,
        shortLabel: value.shortLabel,
      })),
    });
  } catch (err) {
    logger.error(`[support] listSupportRequests failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support requests.' });
  }
}

/**
 * GET /api/support/requests/:id
 * Get one. Students see only their own. Admin sees any.
 * Gated by flag.
 */
export async function getSupportRequest(req: Request, res: Response): Promise<void> {
  if (!(await requireFeatureOn(req, res))) return;
  const userId = getAuthedUserId(req);
  if (!userId) { res.status(401).json({ message: 'Authentication required.' }); return; }

  const role = getAuthedUserRole(req);
  const isAdmin = role === 'admin' || role === 'moderator';

  const id = asStringParam(req.params.id);
  if (!id || !Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid request id.' });
    return;
  }

  try {
    const request = await SupportRequest.findById(id).lean();
    if (!request) {
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    if (!isAdmin && request.userId.toString() !== userId.toString()) {
      // Don't leak existence — return 404, not 403
      res.status(404).json({ message: 'Support request not found.' });
      return;
    }
    res.json({ request: stripAdminOnlyFields(request, isAdmin) });
  } catch (err) {
    logger.error(`[support] getSupportRequest failed: ${(err as Error).message}`);
    res.status(500).json({ message: 'Failed to load support request.' });
  }
}
