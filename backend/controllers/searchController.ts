import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import SearchLog from '../models/SearchLog.js';
import { generateEmbedding } from '../utils/embeddings.js';
import { LRUCache } from 'lru-cache';
import { logger } from '../utils/logger.js';
import { getCachedResults, setCachedResults } from '../utils/cache.js';
import {
  computeRRF,
  applySearchThreshold,
  type SearchResultItem,
  type ResultSource,
} from '../utils/search.js';

// Cache configuration: Store up to 500 recent queries for 1 hour to reduce DB/AI loads
const searchCache = new LRUCache<string, SearchResultItem[]>({
  max: 500,
  ttl: 1000 * 60 * 60,
});

// Helper: Executes traditional MongoDB keyword search
const runTextSearch = async (collectionName: string, queryStr: string, limit = 5): Promise<SearchResultItem[]> => {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];
    const collection = db.collection(collectionName);
    
    // Find documents matching text index, sort by native textScore
    return await collection.find(
      { $text: { $search: queryStr } },
      { projection: { score: { $meta: 'textScore' } } }
    )
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .toArray() as SearchResultItem[];
  } catch (error) {
    // Fail gracefully if the text index hasn't been built yet
    console.warn(`Text search on '${collectionName}' failed: ${(error as Error).message}`);
    return [];
  }
};

// Helper: Executes MongoDB Atlas Vector Search (Semantic Search)
const runVectorSearch = async (collectionName: string, queryEmbedding: number[], limit = 5): Promise<SearchResultItem[]> => {
  try {
    const db = mongoose.connection.db;
    if (!db) return [];
    const collection = db.collection(collectionName);

    const pipeline = [
      {
        $vectorSearch: {
          index: 'vector_index',
          path: 'embedding',
          queryVector: queryEmbedding,
          numCandidates: limit * 10, // Over-fetch for better accuracy before limiting
          limit,
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          question: 1,
          answer: 1,
          body: 1,
          status: 1,
          category: 1,
          score: { $meta: 'vectorSearchScore' }, // Expose similarity score
        },
      },
    ];

    return await collection.aggregate(pipeline).toArray() as SearchResultItem[];
  } catch (error) {
    console.warn(`Vector search on '${collectionName}' failed: ${(error as Error).message}`);
    return [];
  }
};

/**
 * POST /api/search
 * Main Hybrid Search Controller
 */
export const semanticSearch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { query } = req.body as { query?: string };

    if (!query) {
      res.status(400).json({ message: 'query string is required.' });
      return;
    }
    
    const normalizedQuery = query.trim().toLowerCase();

    // 1. Check Redis semantic cache first (shared across all serverless instances)
    const redisCached = await getCachedResults(normalizedQuery);
    if (redisCached) {
      res.json({ results: redisCached.results, total: redisCached.results.length, cached: true });
      return;
    }

    // 2. Check LRU Cache for immediate response (process-local fallback)
    if (searchCache.has(normalizedQuery)) {
      const cachedResults = searchCache.get(normalizedQuery)!;
      await setCachedResults(normalizedQuery, cachedResults);
      res.json({ results: cachedResults, total: cachedResults.length, cached: true });
      return;
    }

    // 2. Compute AI Embedding for the search term
    const embedding = await generateEmbedding(query);

    // 3. Execute Vector and Text searches in parallel across both collections for maximum speed
    const [faqVec, commVec, faqTxt, commTxt] = await Promise.all([
      runVectorSearch('yaksha_faq_faqs', embedding, 5),
      runVectorSearch('yaksha_faq_communityposts', embedding, 5),
      runTextSearch('yaksha_faq_faqs', query, 5),
      runTextSearch('yaksha_faq_communityposts', query, 5)
    ]);
    
    // Tag results with their origin source (FAQ vs Community)
    const processResults = (results: SearchResultItem[], source: ResultSource): SearchResultItem[] => 
      results.map(r => ({ ...r, source }));
    const allVec = [...processResults(faqVec, 'faq'), ...processResults(commVec, 'community')];
    const allTxt = [...processResults(faqTxt, 'faq'), ...processResults(commTxt, 'community')];

    // 4. Merge results using Reciprocal Rank Fusion
    const merged = computeRRF(allVec, allTxt);

    // 5. Apply threshold filters to remove irrelevant garbage results
    const filtered = applySearchThreshold(merged).slice(0, 5); // Return only the absolute top 5 results

    // 6. Save to both Redis (shared) and LRU (process-local)
    searchCache.set(normalizedQuery, filtered);
    await setCachedResults(normalizedQuery, filtered);

    // 7. Fire-and-forget: Log search analytics asynchronously (does not block response)
    const topResult = filtered[0] || null;
    SearchLog.create({
      query,
      resultsCount: filtered.length,
      topResultId: topResult?._id || null,
      topResultSource: topResult?.source || null,
    }).catch(() => {});

    res.json({ results: filtered, total: filtered.length, cached: false });
  } catch (error) {
    logger.error('Search error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Search failed', error: (error as Error).message });
  }
};

// GET /api/search/trending
// Aggregates search logs to find the top 6 most popular queries
export const getTrending = async (req: Request, res: Response): Promise<void> => {
  try {
    const trending = await SearchLog.aggregate([
      {
        $group: {
          _id: { $toLower: '$query' },
          count: { $sum: 1 },
          lastSearched: { $max: '$createdAt' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 6 },
      {
        $project: {
          _id: 0,
          query: '$_id',
          count: 1,
          lastSearched: 1,
        },
      },
    ]);

    res.json({ trending });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: (error as Error).message });
  }
};

// GET /api/search/suggest?q=<query>
// Lightweight text-only FAQ suggestion for SearchBar dropdown — no auth required
export const getSuggest = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q || q.length < 2) {
      res.json({ suggestions: [] });
      return;
    }

    const db = mongoose.connection.db;
    if (!db) {
      res.json({ suggestions: [] });
      return;
    }

    // Escape special regex chars to prevent injection
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const results = await db
      .collection('yaksha_faq_faqs')
      .find(
        {
          question: { $regex: escaped, $options: 'i' },
          status: 'approved',
        },
        { projection: { _id: 1, question: 1, category: 1 } }
      )
      .limit(5)
      .toArray();

    res.json({ suggestions: results });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
