import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

interface CaseRow {
  id: string
  title: string
  case_numbers: string[]
  jurisdiction_state: string | null
  jurisdiction_county: string | null
  court_name: string | null
  case_type: string | null
  stage: string | null
  your_role: string | null
  opposing_party_name: string | null
  opposing_party_role: string | null
  children_count: number | null
  children_summary: string | null
  parenting_schedule: string | null
  goals_summary: string | null
  risk_flags: string[] | null
  notes: string | null
  next_court_date: string | null
  lawyer_name: string | null
  lawyer_email: string | null
  created_at: string
  updated_at: string
}

export default eventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  // Resolve authenticated user from cookies/JWT (SSR and serverless safe)
  const authUser = await serverSupabaseUser(event)
  const userId = authUser?.sub || authUser?.id

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized - Please log in'
    })
  }

  const { data, error } = await supabase
    .from('cases')
    .select(
      [
        'id',
        'title',
        'case_numbers',
        'jurisdiction_state',
        'jurisdiction_county',
        'court_name',
        'case_type',
        'stage',
        'your_role',
        'opposing_party_name',
        'opposing_party_role',
        'children_count',
        'children_summary',
        'parenting_schedule',
        'goals_summary',
        'risk_flags',
        'notes',
        'next_court_date',
        'lawyer_name',
        'lawyer_email',
        'created_at',
        'updated_at'
      ].join(', ')
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    // eslint-disable-next-line no-console
    console.error('Supabase select case error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to load case details.'
    })
  }

  const row = (data ?? null) as CaseRow | null

  return {
    case: row
  }
})



