<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const supabase = useSupabaseClient()
const supabaseUser = useSupabaseUser()
const router = useRouter()

type JwtUser = {
  email?: string
  sub?: string
  user_metadata?: {
    full_name?: string
    name?: string
    preferred_name?: string
    avatar_url?: string
    picture?: string
    [key: string]: any
  }
}

const user = computed(() => {
  const jwtUser = supabaseUser.value as JwtUser | null

  const displayName =
    jwtUser?.user_metadata?.preferred_name ||
    jwtUser?.user_metadata?.full_name ||
    jwtUser?.user_metadata?.name ||
    jwtUser?.email ||
    'Account'

  const email = jwtUser?.email || ''

  const avatarSrc =
    jwtUser?.user_metadata?.avatar_url ||
    jwtUser?.user_metadata?.picture ||
    ''

  return {
    name: displayName,
    email,
    avatar: {
      src: avatarSrc,
      alt: displayName
    }
  }
})

async function handleLogout() {
  await supabase.auth.signOut()
  await router.push('/auth/login')
}

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: user.value.name,
  description: user.value.email || undefined,
  avatar: user.value.avatar
}], [{
  label: 'Profile',
  icon: 'i-lucide-user'
}, {
  label: 'Billing',
  icon: 'i-lucide-credit-card'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings'
}], [{
  label: 'Color Mode',
  icon: 'i-lucide-sun-moon',
  children: [{
    label: 'Light',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.value === 'light',
    onSelect(e: Event) {
      e.preventDefault()

      colorMode.preference = 'light'
    }
  }, {
    label: 'Dark',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onUpdateChecked(checked: boolean) {
      if (checked) {
        colorMode.preference = 'dark'
      }
    },
    onSelect(e: Event) {
      e.preventDefault()
    }
  }]
}], [{
  label: 'Log out',
  icon: 'i-lucide-log-out',
  onSelect: (e: Event) => {
    e.preventDefault()
    handleLogout()
  }
}]]))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="{
        ...user,
        label: collapsed ? undefined : user.name,
        trailingIcon: collapsed ? undefined : 'i-lucide-chevrons-up-down'
      }"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{
        trailingIcon: 'text-dimmed'
      }"
    />

    <template #chip-leading="{ item }">
      <div class="inline-flex items-center justify-center shrink-0 size-5">
        <span
          class="rounded-full ring ring-bg bg-(--chip-light) dark:bg-(--chip-dark) size-2"
          :style="{
            '--chip-light': `var(--color-${(item as any).chip}-500)`,
            '--chip-dark': `var(--color-${(item as any).chip}-400)`
          }"
        />
      </div>
    </template>
  </UDropdownMenu>
</template>
