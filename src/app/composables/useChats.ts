import { isToday, isYesterday, subMonths } from 'date-fns'

export interface UIChat {
  id: string
  label: string
  to: string
  icon: string
  preview: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export function useChats(chats: Ref<UIChat[] | undefined>) {
  const groups = computed(() => {
    const today: UIChat[] = []
    const yesterday: UIChat[] = []
    const lastWeek: UIChat[] = []
    const lastMonth: UIChat[] = []
    const older: Record<string, UIChat[]> = {}

    const oneWeekAgo = subMonths(new Date(), 0.25)
    const oneMonthAgo = subMonths(new Date(), 1)

    chats.value?.forEach((chat) => {
      const ts = new Date(chat.updatedAt || chat.createdAt)
      if (isToday(ts)) today.push(chat)
      else if (isYesterday(ts)) yesterday.push(chat)
      else if (ts >= oneWeekAgo) lastWeek.push(chat)
      else if (ts >= oneMonthAgo) lastMonth.push(chat)
      else {
        const monthYear = ts.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        if (!older[monthYear]) older[monthYear] = []
        older[monthYear].push(chat)
      }
    })

    const sortedMonthYears = Object.keys(older).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    const formatted: Array<{ id: string, label: string, items: UIChat[] }> = []
    if (today.length) formatted.push({ id: 'today', label: 'Today', items: today })
    if (yesterday.length) formatted.push({ id: 'yesterday', label: 'Yesterday', items: yesterday })
    if (lastWeek.length) formatted.push({ id: 'last-week', label: 'Last week', items: lastWeek })
    if (lastMonth.length) formatted.push({ id: 'last-month', label: 'Last month', items: lastMonth })
    sortedMonthYears.forEach((my) => {
      if (older[my]?.length) formatted.push({ id: my, label: my, items: older[my] })
    })
    return formatted
  })

  return { groups }
}
