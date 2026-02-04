<script setup lang="ts">
definePageMeta({
  layout: 'landing'
})

useSeoMeta({
  title: 'Data Security',
  description: 'Learn how Daylight protects your sensitive custody documentation with enterprise-grade encryption and security measures.'
})

const securityFeatures = [
  {
    icon: 'i-lucide-lock',
    title: 'Encryption at Rest',
    description: 'All your data—voice recordings, screenshots, timeline entries—is encrypted using AES-256 encryption before it touches our servers. Even if someone accessed our storage directly, your files would be unreadable.'
  },
  {
    icon: 'i-lucide-shield',
    title: 'Encryption in Transit',
    description: 'Every connection to Daylight uses TLS 1.3, the same encryption standard banks use. Your data is protected from the moment it leaves your device until it reaches our servers.'
  },
  {
    icon: 'i-lucide-user-check',
    title: 'Strict Access Controls',
    description: 'Your data is isolated and accessible only to you. Our database enforces row-level security, meaning even our own systems can only access your data when you\'re authenticated.'
  },
  {
    icon: 'i-lucide-key',
    title: 'Secure Authentication',
    description: 'We use PKCE (Proof Key for Code Exchange), a modern authentication standard that protects against interception attacks. Sessions are short-lived and automatically refreshed.'
  },
  {
    icon: 'i-lucide-database-backup',
    title: 'Automatic Backups',
    description: 'Your data is automatically backed up daily with point-in-time recovery available. If something goes wrong, we can restore your evidence without data loss.'
  },
  {
    icon: 'i-lucide-globe',
    title: 'Global Edge Network',
    description: 'Your data is served from the nearest secure edge location, protected by enterprise-grade DDoS mitigation. Fast access without compromising security.'
  }
]

const dataPromises = [
  {
    icon: 'i-lucide-ban',
    title: 'We never sell your data',
    description: 'Your evidence is yours. We don\'t monetize it, share it, or use it for anything other than providing you the service.'
  },
  {
    icon: 'i-lucide-eye-off',
    title: 'Minimal access policy',
    description: 'Our team can\'t access your files. We\'ve built the system so your data stays private, even from us.'
  },
  {
    icon: 'i-lucide-download',
    title: 'You own your data',
    description: 'Export your data anytime. If you leave, you can take everything with you. No lock-in, no hostage situations.'
  },
  {
    icon: 'i-lucide-trash-2',
    title: 'Right to deletion',
    description: 'Request deletion and we\'ll remove your data from all our systems. No copies, no archives, no exceptions.'
  }
]
</script>

<template>
  <UContainer class="py-16">
    <div class="mx-auto max-w-4xl space-y-12">
      <!-- Header -->
      <div class="text-center space-y-4">
        <div class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <UIcon name="i-lucide-shield-check" class="size-4" />
          Enterprise-Grade Protection
        </div>
        <h1 class="text-4xl font-bold text-highlighted sm:text-5xl">
          Your evidence is protected
        </h1>
        <p class="text-lg text-muted max-w-2xl mx-auto">
          You're dealing with sensitive documentation. We built Daylight with the same security standards that protect financial data, so you can focus on your case instead of worrying about your data.
        </p>
      </div>

      <USeparator />

      <!-- Security Features Grid -->
      <section class="space-y-6">
        <h2 class="text-2xl font-semibold text-highlighted">
          How we protect your data
        </h2>
        
        <div class="grid gap-6 md:grid-cols-2">
          <div
            v-for="feature in securityFeatures"
            :key="feature.title"
            class="rounded-xl border border-default bg-elevated/30 p-6 space-y-3"
          >
            <div class="flex items-center gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon :name="feature.icon" class="size-5" />
              </div>
              <h3 class="font-semibold text-highlighted">{{ feature.title }}</h3>
            </div>
            <p class="text-sm text-muted leading-relaxed">{{ feature.description }}</p>
          </div>
        </div>
      </section>

      <USeparator />

      <!-- Our Promises -->
      <section class="space-y-6">
        <h2 class="text-2xl font-semibold text-highlighted">
          Our promises to you
        </h2>
        
        <div class="grid gap-6 sm:grid-cols-2">
          <div
            v-for="promise in dataPromises"
            :key="promise.title"
            class="flex gap-4"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <UIcon :name="promise.icon" class="size-5" />
            </div>
            <div>
              <h3 class="font-semibold text-highlighted">{{ promise.title }}</h3>
              <p class="mt-1 text-sm text-muted">{{ promise.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Transparency Note -->
      <p class="text-muted leading-relaxed text-center max-w-2xl mx-auto">
        We're a small team, and we're improving our security practices every day. We've built Daylight using modern security best practices from day one, and we use the same infrastructure trusted by thousands of companies handling sensitive data.
      </p>

      <!-- Contact -->
      <section class="space-y-4">
        <h2 class="text-2xl font-semibold text-highlighted">
          Questions?
        </h2>
        <p class="text-muted leading-relaxed">
          If you have specific security questions or concerns, we're happy to discuss them. 
          Reach out at <a href="mailto:hello@monumentlabs.io" class="text-primary hover:underline">hello@monumentlabs.io</a>.
        </p>
      </section>

      <!-- CTA -->
      <div class="text-center pt-8">
        <UButton
          to="/auth/signup"
          size="lg"
          color="primary"
          class="px-8"
        >
          Start documenting securely
          <template #trailing>
            <UIcon name="i-lucide-arrow-right" class="size-4" />
          </template>
        </UButton>
      </div>
    </div>
  </UContainer>
</template>

