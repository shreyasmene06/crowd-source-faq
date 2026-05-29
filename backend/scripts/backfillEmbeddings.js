/**
 * backfillEmbeddings — Regenerate all FAQ and CommunityPost embeddings
 * using @xenova/transformers (local, no API key needed).
 *
 * Required env vars:
 *   MONGODB_URI — MongoDB connection string
 *
 * Usage:
 *   npm run backfill:embeddings
 *
 * IMPORTANT: After changing the embedding model in backend/utils/embeddings.ts, you MUST:
 *   1. Run this script to regenerate all stored embeddings
 *   2. Update numDimensions in your MongoDB Atlas vector index to match
 *
 * Current model: Xenova/multi-qa-mpnet-base-dot-v1 → 768 dimensions
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { generateEmbedding } from '../utils/embeddings.js';

const FAQ_COLLECTION = 'yaksha_faq_faqs';
const COMM_COLLECTION = 'yaksha_faq_communityposts';

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Add it to your .env file.');
    process.exit(1);
  }

  console.log('Model: Xenova/multi-qa-mpnet-base-dot-v1 (768-dim)');
  console.log('Connecting to MongoDB...\n');

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const faqColl = db.collection(FAQ_COLLECTION);
  const commColl = db.collection(COMM_COLLECTION);

  // ── Backfill FAQs ───────────────────────────────────────────────────────────
  console.log('[1/2] Backfilling FAQ embeddings...');
  let faqProcessed = 0;
  let faqErrors = 0;

  const faqCursor = faqColl.find({ embedding: { $exists: true, $ne: null } }).lean().cursor();
  for await (const faq of faqCursor) {
    try {
      const embedding = await generateEmbedding(
        `Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`
      );
      await faqColl.updateOne({ _id: faq._id }, { $set: { embedding } });
      faqProcessed++;
      process.stdout.write(`\r    ${faqProcessed} FAQs updated   `);
    } catch (e) {
      faqErrors++;
      console.warn(`\n  Error on FAQ ${faq._id}: ${e.message}`);
    }
  }
  console.log(`\n    ✓ ${faqProcessed} FAQs updated${faqErrors ? `, ${faqErrors} errors` : ''}`);

  // ── Backfill Community Posts ────────────────────────────────────────────────
  console.log('[2/2] Backfilling Community Post embeddings...');
  let commProcessed = 0;
  let commErrors = 0;

  const commCursor = commColl.find({ embedding: { $exists: true, $ne: null } }).lean().cursor();
  for await (const post of commCursor) {
    try {
      const embedding = await generateEmbedding(
        `Question: ${post.title}. Description: ${post.body}`
      );
      await commColl.updateOne({ _id: post._id }, { $set: { embedding } });
      commProcessed++;
      process.stdout.write(`\r    ${commProcessed} posts updated   `);
    } catch (e) {
      commErrors++;
      console.warn(`\n  Error on post ${post._id}: ${e.message}`);
    }
  }
  console.log(`\n    ✓ ${commProcessed} posts updated${commErrors ? `, ${commErrors} errors` : ''}`);

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log('\n✅ Backfill complete!');
  console.log(`   FAQs:       ${faqProcessed} success${faqErrors ? `, ${faqErrors} errors` : ''}`);
  console.log(`   Community:  ${commProcessed} success${commErrors ? `, ${commErrors} errors` : ''}`);
  console.log('\n⚠️  No Atlas index update needed — model unchanged (768-dim).');

  await mongoose.disconnect();
  process.exit(faqErrors + commErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
