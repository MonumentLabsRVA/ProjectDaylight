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

  app: {
    head: {
      htmlAttrs: {
        lang: 'en'
      },
      title: 'Daylight',
      titleTemplate: (titleChunk: string) => {
        return titleChunk && titleChunk !== 'Daylight' ? `${titleChunk} | Daylight` : 'Daylight'
      },
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
        { rel: 'canonical', href: 'https://www.daylight.legal' }
      ],
      meta: [
        // Basic SEO
        { name: 'theme-color', content: '#ffffff' },
        { name: 'description', content: 'Stop carrying custody documentation in your head. Daylight turns voice notes into organized timelines your lawyer can actually use.' },
        { name: 'author', content: 'Daylight' },
        { name: 'robots', content: 'index, follow' },
        { name: 'keywords', content: 'custody documentation, family court, evidence management, legal timeline, co-parenting, voice notes, court-ready documentation' },

        // Open Graph
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Daylight' },
        { property: 'og:title', content: 'Daylight – Just talk. We handle the rest.' },
        { property: 'og:description', content: 'Stop carrying custody documentation in your head. Daylight turns voice notes into organized timelines your lawyer can actually use.' },
        { property: 'og:locale', content: 'en_US' },
        { property: 'og:url', content: 'https://www.daylight.legal' },
        { property: 'og:image', content: 'https://www.daylight.legal/og-image-card.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: 'Daylight – AI-powered custody documentation' },

        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Daylight – Just talk. We handle the rest.' },
        { name: 'twitter:description', content: 'Stop carrying custody documentation in your head. Daylight turns voice notes into organized timelines your lawyer can actually use.' },
        { name: 'twitter:image', content: 'https://www.daylight.legal/og-image-card.png' },
        { name: 'twitter:image:alt', content: 'Daylight – AI-powered custody documentation' },
        { name: 'twitter:domain', content: 'daylight.legal' },

        // App-specific
        { name: 'application-name', content: 'Daylight' },
        { name: 'apple-mobile-web-app-title', content: 'Daylight' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'format-detection', content: 'telephone=no' }
      ],
      script: [
        // Schema.org structured data
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            'name': 'Daylight',
            'url': 'https://www.daylight.legal',
            'applicationCategory': 'LegalApplication',
            'operatingSystem': 'Web',
            'description': 'AI-powered evidence and timeline platform for parents navigating family court. Transform voice notes and screenshots into court-ready documentation.',
            'image': 'https://www.daylight.legal/og-image-card.png',
            'offers': {
              '@type': 'Offer',
              'price': '0',
              'priceCurrency': 'USD',
              'description': 'Free trial available'
            },
            'featureList': [
              'Voice note transcription',
              'Screenshot OCR and parsing',
              'Automatic timeline generation',
              'Court-ready PDF exports',
              'Evidence organization',
              'Pattern detection'
            ],
            'publisher': {
              '@type': 'Organization',
              'name': 'Daylight',
              'url': 'https://www.daylight.legal'
            }
          })
        }
      ]
    }
  },

  // Private runtime configuration (only available on the server)
  runtimeConfig: {
    openai: {
      // Will be overridden by NUXT_OPENAI_API_KEY environment variable at runtime
      apiKey: process.env.OPENAI_API_KEY || ''
    },
    // Server-only secrets
    supabaseServiceKey: process.env.SUPABASE_SECRET_KEY || '',
    public: {
      baseUrl: process.env.PUBLIC_BASE_URL || 'https://www.daylight.legal'
    }
  },

  routeRules: {
    // Prerender public pages that don't need auth
    '/': { prerender: true },
    '/auth/login': { prerender: true },
    '/auth/signup': { prerender: true },
    '/auth/confirm': { prerender: true },
    '/privacy': { prerender: true },
    '/terms': { prerender: true },
    '/security': { prerender: true },
    // API routes
    '/api/**': {
      cors: true
    },
    // Stripe webhook needs raw body for signature verification
    '/api/billing/webhook': {
      cors: false
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
      exclude: ['/', '/auth/**', '/privacy', '/terms', '/security']
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

  // Ensure tslib helpers are bundled with the server for Vercel runtime
  nitro: {
    externals: {
      inline: ['tslib']
    }
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