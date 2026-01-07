# Strike Prep V2 - Development Guide

## Architecture Overview

Strike Prep V2 is a healthcare staffing application using:
- **Frontend**: Next.js 16 (App Router, React, TypeScript)
- **Backend**: Convex (real-time database, serverless functions)
- **Authentication**: Clerk (handles sign-in/sign-up, session management)
- **Styling**: Tailwind CSS

---

## Authentication & Authorization Layers

**CRITICAL**: When debugging auth/permission issues, check ALL three layers:

### 1. Middleware Layer (src/middleware.ts)
- **Purpose**: Route protection at the edge
- **What it does**: Redirects unauthenticated users to sign-in for protected routes
- **Public routes**: `/`, `/sign-in(.*)`, `/sign-up(.*)`
- **All other routes**: Require Clerk authentication

```typescript
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});
```

### 2. Backend Authorization Layer (convex/users.ts)
- **Purpose**: Role-based access control (RBAC) for data operations
- **Where**: `validateCanCreateUser()` and similar functions in Convex mutations
- **Role Hierarchy**:
  ```
  super_admin > health_system_admin > hospital_admin > departmental_admin
  ```

**Role Permissions Matrix**:
| Creator Role | Can Create |
|--------------|------------|
| super_admin | Any role |
| health_system_admin | hospital_admin, departmental_admin (within their health system) |
| hospital_admin | departmental_admin (within their hospital) |
| departmental_admin | departmental_admin (within their department) |

### 3. Frontend Authorization Layer (UI Components)
- **Purpose**: Hide/show UI elements based on user role
- **Where**: Page components (e.g., `src/app/dashboard/users/page.tsx`)
- **Pattern**: Use `currentUser?.role` to determine available options

**IMPORTANT**: Frontend must sync with backend validation:
- Available roles dropdown must match what backend allows
- Form default values must be valid for the current user's role
- Scope fields (healthSystemId, hospitalId, departmentId) must be populated

---

## User Creation Flow

### The "Invite" Pattern
1. Admin creates user record with email + role + scope (clerkId = "")
2. User receives invite email (manual for now)
3. User signs up via Clerk
4. `syncUser` mutation links Clerk account to existing record

### Scope Inheritance
- **healthSystemId**: Always required for roles below super_admin
- **hospitalId**: Required for hospital_admin and departmental_admin
- **departmentId**: Required for departmental_admin

When a lower-level admin creates users:
- Their scope is automatically inherited
- UI should auto-fill scope fields from `currentUser`

---

## Common Bugs & Solutions

### Bug: "Hospital admins can only create departmental admins"
**Symptom**: Hospital admin tries to create departmental admin but gets permission error
**Root Cause**: Form defaults to wrong role OR scope not being passed
**Fix Checklist**:
1. Check form default role matches available roles for current user
2. Ensure hospitalId is auto-filled from currentUser
3. Verify backend receives correct role and hospitalId

### Bug: Login redirect loop
**Symptom**: User keeps getting redirected to sign-in
**Root Cause**: Multiple possible causes
**Fix Checklist**:
1. Check middleware.ts public routes
2. Check if localStorage access is SSR-safe (use `typeof window !== "undefined"`)
3. Verify Clerk session is valid

### Bug: "Access denied. You must be invited"
**Symptom**: New user can't sign up
**Root Cause**: User email not pre-registered by admin
**Fix**: Admin must create user record first, then user can sign up

---

## Testing

### Playwright E2E Tests
- **Auth Setup**: Uses `@clerk/testing/playwright` with email-based ticket strategy
- **Key Pattern**: `clerk.signIn({ page, emailAddress: ... })` bypasses password/device verification
- **Load State**: Use `domcontentloaded` not `networkidle` (Clerk keeps WebSocket open)

```typescript
// tests/auth.setup.ts
import { clerk, clerkSetup } from "@clerk/testing/playwright";

setup("authenticate", async ({ page }) => {
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: SUPER_ADMIN.email });
  await page.goto("/dashboard");
});
```

### Test User Roles
- Super Admin: notifications@providerloop.com (hardcoded in convex/users.ts)
- Other roles: Must be created via admin UI first

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/middleware.ts` | Route protection (Clerk middleware) |
| `convex/users.ts` | User CRUD, role validation, permission checks |
| `convex/schema.ts` | Database schema definitions |
| `src/app/dashboard/users/page.tsx` | User management UI |
| `tests/auth.setup.ts` | Playwright authentication setup |
| `tests/fixtures/test-users.ts` | Test user credentials and data |

---

## Development Commands

```bash
# Start dev server
npm run dev

# Run Playwright tests
npx playwright test

# Run specific test file
npx playwright test tests/01-super-admin.spec.ts

# Convex dev (backend)
npx convex dev

# Push Convex changes once (without watching)
npx convex dev --once
```

---

## CI/CD & Deployment

This project uses **automated CI/CD** with GitHub and Vercel:

### Deployment Flow
1. **Push to GitHub** → Triggers automatic deployment
2. **Vercel** builds and deploys the Next.js frontend
3. **Convex** backend is deployed automatically via Vercel integration

### Environments
| Environment | Convex Instance | Controlled By |
|-------------|-----------------|---------------|
| Development | `dev:amiable-frog-863` | Local `.env.local` |
| Production | Separate prod instance | Vercel env variables |

**Environment variables on Vercel** control which Convex database is used:
- `CONVEX_DEPLOYMENT` - Points to dev or prod Convex instance
- `NEXT_PUBLIC_CONVEX_URL` - Public Convex endpoint

### Local Development
For local testing, you may need to sync Convex schema changes:
```bash
npx convex dev --once  # Push schema/function changes to dev instance
```

This is only needed locally. Production deploys happen automatically on push.

**TypeScript Errors Block Deployment:**
If there are TypeScript errors anywhere in the `convex/` directory, the deployment will fail. Fix ALL TypeScript errors before pushing.

---

## Security Best Practices

### Backend Security (Convex)

1. **Always use `requireAuth()` or `requireDepartmentAccess()`** in mutations/queries that modify or access sensitive data:
   ```typescript
   // In convex/services.ts
   const user = await requireDepartmentAccess(ctx, departmentId);
   ```

2. **Role-based authorization is enforced in the BACKEND**, not just frontend. Never trust the client.

3. **Scope validation**: Users should only access data within their scope:
   - `super_admin`: All data
   - `health_system_admin`: Only their health system's data
   - `hospital_admin`: Only their hospital's data
   - `departmental_admin`: Only their department's data

4. **Audit logging**: All significant actions should be logged:
   ```typescript
   await auditLog(ctx, user, "ACTION_TYPE", "RESOURCE_TYPE", resourceId, { details });
   ```

5. **Soft delete pattern**: Use `isActive: false` instead of hard deletes to maintain audit trails and allow recovery.

### Frontend Security

1. **SSR Safety**: Always check `typeof window !== "undefined"` before accessing:
   - `localStorage`
   - `sessionStorage`
   - `window` object

2. **Role checks in UI**: Hide admin-only features based on `currentUser?.role`, but remember the backend enforces the actual security.

3. **Input validation**: Validate all user inputs on both frontend (for UX) and backend (for security).

### Data Integrity

1. **Cascade operations**: When deactivating parent entities, cascade to children using `convex/lib/cascade.ts`

2. **Active filtering**: Matching and statistics should only count `isActive: true` positions/shifts:
   ```typescript
   .filter((q) => q.and(
     q.eq(q.field("status"), "Open"),
     q.eq(q.field("isActive"), true)
   ))
   ```

3. **Referential integrity**: Check that referenced entities exist before creating/updating records.

---

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT`

For testing:
- `CLERK_TESTING_SECRET_KEY` (for Playwright bot detection bypass)
