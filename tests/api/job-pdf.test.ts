import { describe, it, expect, vi } from 'vitest'

const singleMock = vi.fn()
const createSignedUrlMock = vi.fn()

vi.mock('@/lib/supabase/requireAdmin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ authorized: true }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: singleMock }) }) }),
    storage: { from: () => ({ createSignedUrl: createSignedUrlMock }) },
  }),
}))

import { GET } from '@/app/api/jobs/[jobId]/pdf/route'

describe('GET /api/jobs/[jobId]/pdf', () => {
  it('returns a signed url when the job and its sliced pdf exist', async () => {
    singleMock.mockResolvedValue({ data: { sliced_pdf_path: 'jobs/job-1.pdf' }, error: null })
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: 'https://example.com/signed' }, error: null })

    const res = await GET(new Request('http://localhost') as any, { params: Promise.resolve({ jobId: 'job-1' }) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.signedUrl).toBe('https://example.com/signed')
    expect(createSignedUrlMock).toHaveBeenCalledWith('jobs/job-1.pdf', 60 * 10)
  })

  it('returns 404 when the job is missing', async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await GET(new Request('http://localhost') as any, { params: Promise.resolve({ jobId: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the job has no sliced_pdf_path yet', async () => {
    singleMock.mockResolvedValue({ data: { sliced_pdf_path: null }, error: null })

    const res = await GET(new Request('http://localhost') as any, { params: Promise.resolve({ jobId: 'job-1' }) })
    expect(res.status).toBe(404)
  })
})
