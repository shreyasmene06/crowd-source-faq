import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import FAQ from '../models/FAQ.js';
import User from '../models/User.js';
import { generateEmbedding } from '../utils/embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI not found in .env");
  process.exit(1);
}

const seed = async () => {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(MONGODB_URI);

    // --- STEP 1: UPSERT USERS (don't touch existing) ---
    console.log("[1/2] Seeding users...");
    const users = [
      { name: "Test User", email: "user@yaksha.com", password: "password123", role: "user" },
      { name: "Admin User", email: "admin@yaksha.com", password: "admin123", role: "admin" },
    ];
    for (const user of users) {
      await User.findOneAndUpdate(
        { email: user.email },
        user,
        { upsert: true, runValidators: true }
      );
    }
    console.log("  ✓ Upserted users (existing users untouched)");

    // --- STEP 2: UPSERT FAQs (skip if question already exists) ---
    console.log("[2/2] Seeding FAQs...");
    const faqFilePath = path.join(__dirname, '..', '..', 'faqs.json');
    const faqDataRaw = await fs.readFile(faqFilePath, 'utf-8');
    const allFaqs = JSON.parse(faqDataRaw).map(faq => ({
      question: faq.question,
      answer: faq.answer,
      category: faq.category || 'General',
    }));

    console.log(`Found ${allFaqs.length} FAQs in faqs.json`);

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < allFaqs.length; i++) {
      const faq = allFaqs[i];

      // Skip if a FAQ with this exact question already exists
      const existing = await FAQ.findOne({ question: faq.question });
      if (existing) {
        skipped++;
        if ((i + 1) % 10 === 0) console.log(`  Checked ${i + 1} / ${allFaqs.length} (${skipped} skipped)`);
        continue;
      }

      const embedding = await generateEmbedding(`Section: ${faq.category}. Question: ${faq.question}. Answer: ${faq.answer}`);

      await FAQ.create({
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        embedding,
        searchCount: 0,
      });

      inserted++;
      if ((i + 1) % 10 === 0) {
        console.log(`  Processed ${i + 1} / ${allFaqs.length} (${inserted} inserted, ${skipped} skipped)`);
      }
    }

    console.log(`  ✓ Inserted ${inserted} new FAQs, skipped ${skipped} existing`);
    console.log("Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
};

seed();