<script setup lang="ts">
import type { AccordionItem } from '@nuxt/ui'

definePageMeta({
  layout: 'landing'
})

useHead({
  title: 'Help & FAQ - Daylight'
})

useSeoMeta({
  description: 'Get help with Daylight. Find answers to common questions about voice recording, evidence upload, exports, billing, and more.'
})

// FAQ data organized by category
const gettingStartedFaq: AccordionItem[] = [
  {
    label: 'How do I get started with Daylight?',
    icon: 'i-lucide-circle-help',
    content: 'After signing up, you\'ll go through a quick onboarding wizard that explains how Daylight works. The basic flow is simple: record voice notes about what happened, our AI extracts the events into a timeline, and when you need it, export everything as a professional document for your attorney.'
  },
  {
    label: 'What\'s the difference between Free and Pro plans?',
    icon: 'i-lucide-circle-help',
    content: 'The Free plan gives you 5 journal entries and 10 evidence uploads to try the platform. Pro unlocks unlimited entries and evidence, plus court-ready PDF exports and AI-powered insights. Pro is $49/month or $495/year (save 17%).'
  },
  {
    label: 'Can I use Daylight on my phone?',
    icon: 'i-lucide-circle-help',
    content: 'Yes! Daylight is fully responsive and works great on mobile browsers. You can record voice notes, upload photos, and view your timeline all from your phone. A dedicated mobile app is planned for the future.'
  }
]

const voiceRecordingFaq: AccordionItem[] = [
  {
    label: 'How does voice recording work?',
    icon: 'i-lucide-circle-help',
    content: 'Just tap the record button and speak naturally about what happened. You can mention dates, times, people involved, and any details you remember. When you\'re done, our AI will transcribe your recording and automatically extract events for your timeline.'
  },
  {
    label: 'What should I include in my voice notes?',
    icon: 'i-lucide-circle-help',
    content: 'Be as specific as possible: dates and times, who was involved, what happened, and any relevant context. For example: "Yesterday at 5pm, Marcus was supposed to pick up Emma but didn\'t show until 7:30. He texted at 6:15 saying traffic was bad."'
  },
  {
    label: 'Are my recordings stored?',
    icon: 'i-lucide-circle-help',
    content: 'Yes, your audio recordings are securely stored and encrypted. You can listen to them anytime. The transcript and extracted events are also saved so you can review what the AI found.'
  }
]

const evidenceFaq: AccordionItem[] = [
  {
    label: 'What types of evidence can I upload?',
    icon: 'i-lucide-circle-help',
    content: 'You can upload text message screenshots, emails, photos, documents, and more. Our AI will analyze images using OCR to extract text from screenshots, identify participants, and detect any concerning patterns.'
  },
  {
    label: 'How does evidence get linked to events?',
    icon: 'i-lucide-circle-help',
    content: 'When you upload evidence during a journal entry, our AI automatically links it to the relevant events it extracts. You can also view all evidence associated with any event on the timeline.'
  },
  {
    label: 'What happens when I upload a screenshot?',
    icon: 'i-lucide-circle-help',
    content: 'Our AI reads the screenshot using OCR, extracts all the text, identifies who said what, detects timestamps, and flags anything that might be relevant to your case (like schedule violations or concerning messages).'
  }
]

const exportsFaq: AccordionItem[] = [
  {
    label: 'What is a court-ready export?',
    icon: 'i-lucide-circle-help',
    content: 'Exports are professional documents that compile your timeline events and evidence into a format your attorney can use. They include chronological event summaries, linked evidence, and can focus on specific time periods or incident types.'
  },
  {
    label: 'Can I customize what\'s included in an export?',
    icon: 'i-lucide-circle-help',
    content: 'Yes! When creating an export, you can choose to include all events or filter to specific types (incidents, positive parenting moments, etc.). You can also add case details like court name, case number, and notes for context.'
  },
  {
    label: 'What format are exports in?',
    icon: 'i-lucide-circle-help',
    content: 'Exports are generated as both Markdown (for easy viewing in the app) and PDF (for printing and sharing with your attorney). The PDF is formatted professionally for court use.'
  }
]

const privacySecurityFaq: AccordionItem[] = [
  {
    label: 'How is my data protected?',
    icon: 'i-lucide-circle-help',
    content: 'All your data is encrypted both in transit (using TLS) and at rest. Your recordings, evidence, and personal information are stored securely in isolated databases. Only you can access your data.'
  },
  {
    label: 'Who can see my information?',
    icon: 'i-lucide-circle-help',
    content: 'Only you. We don\'t sell your data or share it with third parties. Our support team may access your account only with your permission to help troubleshoot issues.'
  },
  {
    label: 'Can I delete my data?',
    icon: 'i-lucide-circle-help',
    content: 'Yes, you can request full deletion of your account and all associated data at any time by contacting us at hello@monumentlabs.io. We\'ll process your request within 30 days.'
  },
  {
    label: 'Is Daylight admissible in court?',
    icon: 'i-lucide-circle-help',
    content: 'Daylight is a documentation tool—it helps you organize and present your evidence, but admissibility depends on your jurisdiction and case. Always consult with your attorney about what evidence is appropriate for your situation.'
  }
]

const billingFaq: AccordionItem[] = [
  {
    label: 'How do I upgrade to Pro?',
    icon: 'i-lucide-circle-help',
    content: 'Go to the Billing page from your dashboard and click "Upgrade to Pro." You can choose monthly ($49) or yearly ($495, save 17%). Payment is handled securely through Stripe.'
  },
  {
    label: 'Can I cancel my subscription?',
    icon: 'i-lucide-circle-help',
    content: 'Yes, you can cancel anytime from the Billing page. You\'ll retain access to Pro features until the end of your billing period. Your data is never deleted when you cancel.'
  },
  {
    label: 'What happens to my data if I downgrade?',
    icon: 'i-lucide-circle-help',
    content: 'All your data remains safe and accessible. If you exceed Free tier limits, you won\'t be able to create new entries or upload new evidence until you upgrade again or delete some items.'
  }
]
</script>

<template>
  <div class="min-h-screen">
    <!-- Hero Section -->
    <section class="relative overflow-hidden border-b border-default bg-muted py-16 sm:py-24">
      <div class="absolute top-0 -left-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div class="absolute bottom-0 -right-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      
      <UContainer class="relative z-10">
        <div class="mx-auto max-w-3xl text-center">
          <div class="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <UIcon name="i-lucide-life-buoy" class="size-4" />
            Help & Support
          </div>
          
          <h1 class="text-4xl font-bold tracking-tight text-highlighted sm:text-5xl">
            How can we help?
          </h1>
          
          <p class="mt-6 text-lg leading-relaxed text-muted">
            Find answers to common questions or contact our support team.
          </p>
        </div>
      </UContainer>
    </section>

    <!-- FAQ Section -->
    <section class="py-16 sm:py-24">
      <UContainer>
        <div class="mx-auto max-w-4xl">
          <h2 class="text-2xl font-bold text-highlighted mb-8 flex items-center gap-3">
            <UIcon name="i-lucide-help-circle" class="size-7 text-primary" />
            Frequently Asked Questions
          </h2>

          <div class="space-y-10">
            <!-- Getting Started -->
            <div>
              <h3 class="text-lg font-semibold text-highlighted mb-4 flex items-center gap-2">
                <UIcon name="i-lucide-rocket" class="size-5 text-primary/70" />
                Getting Started
              </h3>
              <UAccordion
                :items="gettingStartedFaq"
                type="multiple"
                :ui="{
                  trigger: 'text-base hover:text-primary transition-colors',
                  body: 'text-base text-muted'
                }"
              />
            </div>

            <!-- Voice Recording -->
            <div>
              <h3 class="text-lg font-semibold text-highlighted mb-4 flex items-center gap-2">
                <UIcon name="i-lucide-mic" class="size-5 text-primary/70" />
                Voice Recording
              </h3>
              <UAccordion
                :items="voiceRecordingFaq"
                type="multiple"
                :ui="{
                  trigger: 'text-base hover:text-primary transition-colors',
                  body: 'text-base text-muted'
                }"
              />
            </div>

            <!-- Evidence -->
            <div>
              <h3 class="text-lg font-semibold text-highlighted mb-4 flex items-center gap-2">
                <UIcon name="i-lucide-image" class="size-5 text-primary/70" />
                Evidence Upload
              </h3>
              <UAccordion
                :items="evidenceFaq"
                type="multiple"
                :ui="{
                  trigger: 'text-base hover:text-primary transition-colors',
                  body: 'text-base text-muted'
                }"
              />
            </div>

            <!-- Exports -->
            <div>
              <h3 class="text-lg font-semibold text-highlighted mb-4 flex items-center gap-2">
                <UIcon name="i-lucide-file-text" class="size-5 text-primary/70" />
                Exports & Documents
              </h3>
              <UAccordion
                :items="exportsFaq"
                type="multiple"
                :ui="{
                  trigger: 'text-base hover:text-primary transition-colors',
                  body: 'text-base text-muted'
                }"
              />
            </div>

            <!-- Privacy & Security -->
            <div>
              <h3 class="text-lg font-semibold text-highlighted mb-4 flex items-center gap-2">
                <UIcon name="i-lucide-shield" class="size-5 text-primary/70" />
                Privacy & Security
              </h3>
              <UAccordion
                :items="privacySecurityFaq"
                type="multiple"
                :ui="{
                  trigger: 'text-base hover:text-primary transition-colors',
                  body: 'text-base text-muted'
                }"
              />
            </div>

            <!-- Billing -->
            <div>
              <h3 class="text-lg font-semibold text-highlighted mb-4 flex items-center gap-2">
                <UIcon name="i-lucide-credit-card" class="size-5 text-primary/70" />
                Billing & Subscriptions
              </h3>
              <UAccordion
                :items="billingFaq"
                type="multiple"
                :ui="{
                  trigger: 'text-base hover:text-primary transition-colors',
                  body: 'text-base text-muted'
                }"
              />
            </div>
          </div>
        </div>
      </UContainer>
    </section>

    <!-- Contact Section -->
    <section class="border-t border-default bg-muted py-16 sm:py-24">
      <UContainer>
        <div class="mx-auto max-w-3xl text-center">
          <h2 class="text-2xl font-bold text-highlighted mb-4">
            Still need help?
          </h2>
          <p class="text-lg text-muted mb-8">
            Our team is here to help. Reach out and we'll get back to you as soon as possible.
          </p>

          <div class="grid gap-6 sm:grid-cols-2">
            <UCard class="text-center">
              <div class="flex flex-col items-center gap-4">
                <div class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <UIcon name="i-lucide-mail" class="size-6" />
                </div>
                <div>
                  <h3 class="font-semibold text-highlighted">Email Support</h3>
                  <p class="text-sm text-muted mt-1 mb-3">
                    Get help via email
                  </p>
                  <a
                    href="mailto:hello@monumentlabs.io"
                    class="text-primary hover:underline font-medium"
                  >
                    hello@monumentlabs.io
                  </a>
                </div>
              </div>
            </UCard>

            <UCard class="text-center">
              <div class="flex flex-col items-center gap-4">
                <div class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <UIcon name="i-lucide-clock" class="size-6" />
                </div>
                <div>
                  <h3 class="font-semibold text-highlighted">Response Time</h3>
                  <p class="text-sm text-muted mt-1 mb-3">
                    We typically respond within
                  </p>
                  <span class="text-primary font-medium">
                    24-48 hours
                  </span>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UContainer>
    </section>
  </div>
</template>
