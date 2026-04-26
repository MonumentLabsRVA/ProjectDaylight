# Supabase Auth Fix - Implementation Reference

## The Problem (SOLVED ✅)
API routes were failing because:
1. Backend checked `user?.id` but JWT tokens use `user?.sub`
2. Frontend didn't pass cookies during SSR
3. Cookie configuration missing for serverless

---

## The Solution

### Pattern 1: Backend API Routes

**Always use this pattern:**

```typescript
import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

export default defineEventHandler(async (event) => {
  // 1. Get user from cookies (JWT payload)
  const user = await serverSupabaseUser(event)
  
  // 2. Extract user ID from JWT 'sub' field (with fallback for compatibility)
  const userId = user?.sub || user?.id
  
  // 3. Validate authentication
  if (!userId) {
    throw createError({ 
      statusCode: 401, 
      statusMessage: 'Unauthorized - Please log in' 
    })
  }
  
  // 4. Get Supabase client (with user session)
  const supabase = await serverSupabaseClient(event)
  
  // 5. Use userId in your queries
  const { data, error } = await supabase
    .from('your_table')
    .select('*')
    .eq('user_id', userId)
  
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  
  return data
})
```

### Pattern 2: Frontend Pages

**Always use `useFetch` with cookie headers:**

```typescript
// ✅ CORRECT: Passes cookies during SSR
const { data, status, error } = await useFetch('/api/endpoint', {
  headers: useRequestHeaders(['cookie'])
})

// ❌ WRONG: Doesn't pass cookies during SSR
const data = await $fetch('/api/endpoint')
```

**For reactive data with session watching:**

```typescript
const { data, refresh } = await useFetch('/api/endpoint', {
  headers: useRequestHeaders(['cookie'])
})

const session = useSupabaseSession()
watch(session, (newSession) => {
  if (newSession?.access_token) {
    refresh()
  }
})
```

---

## Key Insights

### Why `user.sub` not `user.id`?
- `serverSupabaseUser()` returns the **JWT token payload**
- JWT standard (RFC 7519) uses `sub` (subject) for user identification
- This is not a breaking change - this is how JWTs have always worked
- The `sub` field contains the Supabase user ID

### Why `useRequestHeaders(['cookie'])`?
- During SSR, cookies aren't automatically forwarded to API routes
- `useRequestHeaders(['cookie'])` explicitly passes them
- This makes the session available to `serverSupabaseUser()` on the backend
- Required for serverless environments (Vercel, Netlify, etc.)

### Why `useFetch` not `$fetch`?
- `useFetch` is Nuxt's SSR-aware composable
- Handles both client and server contexts correctly
- `$fetch` is lower-level and doesn't handle SSR cookie forwarding

---

## Configuration Reference

### nuxt.config.ts

```typescript
export default defineNuxtConfig({
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY,
    redirect: false,
    
    // Cookie configuration for serverless
    cookieOptions: {
      name: 'sb',
      lifetime: 60 * 60 * 8, // 8 hours
      domain: '',
      path: '/',
      sameSite: 'lax'
    },
    
    // Client options for auth
    clientOptions: {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: undefined // Let module handle via cookies
      }
    }
  }
})
```

### Environment Variables

**Required in production:**
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJxxx... # anon key
SUPABASE_SECRET_KEY=eyJxxx... # service role key (for admin operations)
```

---

## Migration Checklist

Apply this fix to all API routes:

- [x] `/api/home.ts` - ✅ Fixed
- [x] `/api/capture-events.post.ts`
- [x] `/api/case.post.ts`
- [x] `/api/case.ts`
- [x] `/api/event/[id].ts`
- [x] `/api/evidence/[id].ts`
- [x] `/api/evidence-upload.post.ts`
- [x] `/api/evidence.ts`
- [x] `/api/export-summary.post.ts`
- [x] `/api/exports.ts`
- [x] `/api/timeline.ts`
- [x] `/api/transcribe.post.ts`
- [x] `/api/voice-extraction.post.ts`

And all pages that fetch data:

- [x] `/pages/home.vue` - ✅ Fixed
- [x] `/pages/timeline.vue`
- [x] `/pages/evidence/index.vue`
- [x] `/pages/evidence/[id].vue`
- [x] `/pages/event/[id].vue`
- [x] `/pages/case.vue`
- [x] `/pages/export.vue`

---

## Testing Checklist

**After applying the pattern:**

1. ✅ Test in development
2. ✅ Check browser console for errors
3. ✅ Check server logs for auth errors
4. ✅ Test after page refresh (session persistence)
5. ⏳ Deploy to production
6. ⏳ Test in production environment
7. ⏳ Verify serverless function logs

---

## Common Mistakes to Avoid

### ❌ DON'T: Check for `user.id`
```typescript
if (!user?.id) { // Wrong field!
```

### ✅ DO: Check for `user.sub`
```typescript
const userId = user?.sub || user?.id // Correct!
if (!userId) {
```

### ❌ DON'T: Use $fetch for SSR routes
```typescript
const data = await $fetch('/api/home')
```

### ✅ DO: Use useFetch with cookies
```typescript
const { data } = await useFetch('/api/home', {
  headers: useRequestHeaders(['cookie'])
})
```

### ❌ DON'T: Manually pass Authorization headers
```typescript
headers: { Authorization: `Bearer ${token}` }
```

### ✅ DO: Let the module handle it via cookies
```typescript
headers: useRequestHeaders(['cookie'])
```

---

## References

- [Nuxt Supabase Docs - serverSupabaseClient](https://supabase.nuxtjs.org/services/serversupabaseclient)
- [JWT RFC 7519 - Subject Claim](https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.2)
- [Supabase Auth SSR Guide](https://supabase.com/docs/guides/auth/server-side-rendering)

---

**Last Updated:** November 24, 2024
**Status:** Pattern validated and working in development ✅

