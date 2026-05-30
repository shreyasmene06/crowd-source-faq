# Refactoring Progress — Monolith to Modular Components

We are auditing the codebase and dividing monolithic files into smaller, simpler, and more focused sub-components.

## 1. Backend Controllers Refactoring (Phase 1)

| File | Proposed Change | Status |
|------|-----------------|--------|
| `backend/controllers/postController.ts` | Create new post controller for post actions | ✅ Completed |
| `backend/controllers/commentController.ts` | Create new comment controller for comment actions | ✅ Completed |
| `backend/routes/community.ts` | Point routes to the new split controllers | ✅ Completed |
| `backend/controllers/communityController.ts` | Remove once splitting is verified | ✅ Completed |

---

## 2. Frontend FAQPage Decomposition (Phase 2)

| File / Component | Proposed Change | Status |
|------------------|-----------------|--------|
| `frontend/src/components/faq/SearchDropdown.tsx` | Extract dropdown suggestions UI | ✅ Completed |
| `frontend/src/components/faq/SearchFeedback.tsx` | Extract inline/modal search feedback form | ✅ Completed |
| `frontend/src/components/faq/ReportFAQButton.tsx` | Extract reporting button & dialog | ✅ Completed |
| `frontend/src/components/faq/CategoryGrid.tsx` | Extract `CategoryCard` & `CategoryGrid` | ✅ Completed |
| `frontend/src/components/faq/QuestionList.tsx` | Extract `QuestionItem` & `QuestionList` | ✅ Completed |
| `frontend/src/components/faq/QuestionDetail.tsx` | Extract detailed FAQ view with related queries | ✅ Completed |
| `frontend/src/pages/FAQPage.tsx` | Refactor to import new sub-components | ✅ Completed |

---

## 3. Frontend CommunityPage Decomposition (Phase 3)

| File / Component | Proposed Change | Status |
|------------------|-----------------|--------|
| `frontend/src/components/community/PostDetailDialog.tsx` | Extract full post details & comments dialog | ✅ Completed |
| `frontend/src/components/community/CreatePostDialog.tsx` | Extract post submission dialog | ✅ Completed |
| `frontend/src/pages/CommunityPage.tsx` | Refactor to import new dialog components | ✅ Completed |
