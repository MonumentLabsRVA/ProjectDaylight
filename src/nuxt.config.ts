// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxtjs/supabase',
    '@vueuse/nuxt',
    '@nuxtjs/mdc'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Private runtime configuration (only available on the server)
  runtimeConfig: {
    openai: {
      // Will be overridden by NUXT_OPENAI_API_KEY environment variable at runtime
      apiKey: process.env.OPENAI_API_KEY || ''
    },
    // Server-only secrets
    supabaseServiceKey: process.env.SUPABASE_SECRET_KEY || '',
    public: {
      baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
    }
  },

  routeRules: {
    '/': { prerender: true },
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2025-01-15',


  // Supabase configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY,
    serviceRole: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    redirect: false,
    redirectOptions: {
      login: '/auth/login',
      callback: '/auth/confirm',
      exclude: ['/', '/auth/**', '/privacy-policy', '/terms-and-conditions']
    },
    // Cookie configuration for serverless environments
    cookieOptions: {
      name: 'sb',
      lifetime: 60 * 60 * 8, // 8 hours
      domain: '',
      path: '/',
      sameSite: 'lax'
    },
    // Use cookie-based auth for better serverless compatibility
    clientOptions: {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
        storage: undefined // Let the module handle storage via cookies
      }
    }
  },

  // Ensure Supabase modules are transpiled correctly for ESM / prerender
  build: {
    transpile: [
      '@supabase/supabase-js',
      '@supabase/auth-js',
      '@supabase/functions-js',
      '@supabase/postgrest-js',
      '@supabase/realtime-js',
      '@supabase/storage-js'
    ]
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})