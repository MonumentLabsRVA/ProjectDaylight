import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'

interface CasePayload {
  id?: string
  title: string
  caseNumbers?: string[]
  jurisdictionState?: string | null
  jurisdictionCounty?: string | null
  courtName?: string | null
  caseType?: string | null
  stage?: string | null
  yourRole?: string | null
  opposingPartyName?: string | null
  opposingPartyRole?: string | null
  childrenCount?: number | null
  childrenSummary?: string | null
  parentingSchedule?: string | null
  goalsSummary?: string | null
  riskFlags?: string[] | null
  notes?: string | null
  nextCourtDate?: string | null
  lawyerName?: string | null
  lawyerEmail?: string | null
}

export default defineEventHandler(async (event) => {
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

  const body = await readBody<CasePayload>(event)

  if (!body?.title || !body.title.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Title is required for a case.'
    })
  }

  const payload = {
    user_id: userId,
    title: body.title.trim(),
    case_numbers: body.caseNumbers ?? [],
    jurisdiction_state: body.jurisdictionState ?? null,
    jurisdiction_county: body.jurisdictionCounty ?? null,
    court_name: body.courtName ?? null,
    case_type: body.caseType ?? null,
    stage: body.stage ?? null,
    your_role: body.yourRole ?? null,
    opposing_party_name: body.opposingPartyName ?? null,
    opposing_party_role: body.opposingPartyRole ?? null,
    children_count: body.childrenCount ?? null,
    children_summary: body.childrenSummary ?? null,
    parenting_schedule: body.parentingSchedule ?? null,
    goals_summary: body.goalsSummary ?? null,
    risk_flags: body.riskFlags ?? [],
    notes: body.notes ?? null,
    next_court_date: body.nextCourtDate ?? null,
    lawyer_name: body.lawyerName ?? null,
    lawyer_email: body.lawyerEmail ?? null
  }

  let result

  if (body.id) {
    const { data, error } = await supabase
      .from('cases')
      .update(payload)
      .eq('id', body.id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Supabase update case error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update case.'
      })
    }

    result = data
  } else {
    const { data, error } = await supabase
      .from('cases')
      .insert(payload)
      .select('*')
      .maybeSingle()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Supabase insert case error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to create case.'
      })
    }

    result = data
  }

  return {
    case: result
  }
})



