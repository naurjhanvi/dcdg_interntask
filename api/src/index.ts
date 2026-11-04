import type { Context } from 'hono'
import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

type AppEnv = { Bindings: Env }
type HomeRow = { id: string; name: string }
type MemberRow = { id: string }
type BillShare = { id: string; memberId: string; amountCents: number; paidAt: null }
const app = new Hono<AppEnv>()

function errorResponse(c: Context<AppEnv>, status: ContentfulStatusCode, message: string) {
  return c.json({ error: message }, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

async function findHome(db: D1Database, homeId: string): Promise<HomeRow | null> {
  return db.prepare('SELECT id, name FROM homes WHERE id = ?').bind(homeId).first<HomeRow>()
}

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.post('/api/homes', async (c) => {
  const body = await readJson(c)
  if (!isRecord(body) || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return errorResponse(c, 422, 'A non-empty home name is required')
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()
  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()
  return c.json({ id, name }, 201)
})

app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const body = await readJson(c)
  if (!isRecord(body) || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return errorResponse(c, 422, 'A non-empty member name is required')
  }

  const home = await findHome(c.env.DB, homeId)
  if (!home) return errorResponse(c, 404, 'Home not found')

  const id = crypto.randomUUID()
  const name = body.name.trim()
  await c.env.DB.prepare(
    'INSERT INTO members (id, home_id, name, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM members WHERE home_id = ?))',
  )
    .bind(id, homeId, name, homeId)
    .run()

  return c.json({ id, homeId, name }, 201)
})

app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const body = await readJson(c)
  if (
    !isRecord(body) ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0 ||
    typeof body.totalCents !== 'number' ||
    !Number.isSafeInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return errorResponse(c, 422, 'A non-empty title and positive whole-cent total are required')
  }

  const home = await findHome(c.env.DB, homeId)
  if (!home) return errorResponse(c, 404, 'Home not found')

  const members = await c.env.DB.prepare(
    'SELECT id FROM members WHERE home_id = ? ORDER BY position ASC',
  )
    .bind(homeId)
    .all<MemberRow>()

  if (members.results.length === 0) {
    return errorResponse(c, 422, 'A bill requires at least one home member')
  }

  const id = crypto.randomUUID()
  const title = body.title.trim()
  const totalCents = body.totalCents
  const baseAmount = Math.floor(totalCents / members.results.length)
  const remainder = totalCents % members.results.length
  const shares: BillShare[] = members.results.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: baseAmount + (index < remainder ? 1 : 0),
    paidAt: null,
  }))

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(id, homeId, title, totalCents),
    ...shares.map((share) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, home_id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?, ?)',
      ).bind(share.id, homeId, id, share.memberId, share.amountCents),
    ),
  ])

  return c.json({ id, homeId, title, totalCents, shares }, 201)
})

app.notFound((c) => errorResponse(c, 404, 'Not found'))
app.onError((_error, c) => errorResponse(c, 500, 'Internal server error'))

export default app
