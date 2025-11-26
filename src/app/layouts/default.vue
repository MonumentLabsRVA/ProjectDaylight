<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { TimelineEvent, EvidenceItem } from '~/types'

const route = useRoute()
const toast = useToast()

const open = ref(false)

interface SearchItem {
  id?: string
  label: string
  description?: string
  suffix?: string
  icon?: string
  to?: string
  onSelect?: () => void
}

interface SearchGroup {
  id: string
  label: string
  items: SearchItem[]
}

const links = [[{
  label: 'Home',
  icon: 'i-lucide-house',
  to: '/home',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Case',
  icon: 'i-lucide-briefcase',
  to: '/case',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Journal',
  icon: 'i-lucide-book-open',
  to: '/journal',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Capture',
  icon: 'i-lucide-mic',
  to: '/capture',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Timeline',
  icon: 'i-lucide-calendar-clock',
  to: '/timeline',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Evidence',
  icon: 'i-lucide-folder-open',
  to: '/evidence',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Export',
  icon: 'i-lucide-file-down',
  to: '/export',
  onSelect: () => {
    open.value = false
  }
}]] satisfies NavigationMenuItem[][]

const searchGroups = ref<SearchGroup[]>([{
  id: 'links',
  label: 'Go to',
  items: links.flat()
}])

const searchLoading = ref(false)

function mapEventToSearchItem(event: TimelineEvent): SearchItem {
  const typeIcon: Record<TimelineEvent['type'], string> = {
    incident: 'i-lucide-alert-triangle',
    positive: 'i-lucide-smile-plus',
    medical: 'i-lucide-stethoscope',
    school: 'i-lucide-school',
    communication: 'i-lucide-message-circle',
    legal: 'i-lucide-gavel'
  }

  return {
    id: `event-${event.id}`,
    label: event.title,
    description: event.description,
    suffix: 'Event',
    icon: typeIcon[event.type],
    to: `/event/${event.id}`
  }
}

function mapEvidenceToSearchItem(evidence: EvidenceItem): SearchItem {
  const sourceIcon: Record<EvidenceItem['sourceType'], string> = {
    text: 'i-lucide-message-square',
    email: 'i-lucide-mail',
    photo: 'i-lucide-image',
    document: 'i-lucide-file-text'
  }

  return {
    id: `evidence-${evidence.id}`,
    label: evidence.originalName,
    description: evidence.summary,
    suffix: 'Evidence',
    icon: sourceIcon[evidence.sourceType] ?? 'i-lucide-file',
    to: `/evidence/${evidence.id}`
  }
}

async function loadSearchData() {
  searchLoading.value = true

  try {
    const supabase = useSupabaseClient()
    const session = useSupabaseSession()

    const accessToken =
      session.value?.access_token ||
      (await supabase.auth.getSession()).data.session?.access_token

    const headers: Record<string, string> = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : {}

    const [events, evidence] = await Promise.all([
      $fetch<TimelineEvent[]>('/api/timeline', { headers }).catch(() => []),
      $fetch<EvidenceItem[]>('/api/evidence', { headers }).catch(() => [])
    ])

    const eventItems = (events ?? []).slice(0, 20).map(mapEventToSearchItem)
    const evidenceItems = (evidence ?? []).slice(0, 20).map(mapEvidenceToSearchItem)

    const groups: SearchGroup[] = [{
      id: 'links',
      label: 'Go to',
      items: links.flat()
    }]

    if (eventItems.length) {
      groups.push({
        id: 'recent-events',
        label: 'Recent events',
        items: eventItems
      })
    }

    if (evidenceItems.length) {
      groups.push({
        id: 'recent-evidence',
        label: 'Recent evidence',
        items: evidenceItems
      })
    }

    searchGroups.value = groups
  } finally {
    searchLoading.value = false
  }
}

onMounted(async () => {
  const cookie = useCookie('cookie-consent')
  if (cookie.value === 'accepted') {
    loadSearchData()
    return
  }


  loadSearchData()
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink 
          to="/home" 
          class="flex items-center gap-2.5 py-3"
          :class="collapsed ? 'justify-center px-2' : 'px-3'"
        >
          <AppLogoIcon :size="collapsed ? 24 : 20" class="shrink-0" />
          <div v-if="!collapsed" class="flex flex-col text-sm font-medium leading-tight text-highlighted">
            <span>Daylight</span>
          </div>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      :groups="searchGroups"
      :loading="searchLoading"
      placeholder="Search pages, events, and evidence..."
    />

    <slot />
  </UDashboardGroup>
</template>


