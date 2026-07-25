import { describe, it, expect, vi } from 'vitest'

const singleMock = vi.fn().mockResolvedValue({ data: { id: 'job-1', status: 'pending', raw_json: { lesson: { lessonNo: 1 } } }, error: null })
const eqUpdateMock = vi.fn().mockResolvedValue({ error: null })
const updateMock = vi.fn().mockReturnValue({ eq: eqUpdateMock })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: singleMock }) }),
      update: updateMock,
    }),
  }),
}))

import { GET, PATCH } from '@/app/api/jobs/[jobId]/route'

describe('/api/jobs/[jobId]', () => {
  it('GET returns the job', async () => {
    const res = await GET(new Request('http://localhost') as any, { params: { jobId: 'job-1' } as any })
    const json = await res.json()
    expect(json.id).toBe('job-1')
  })

  it('PATCH saves edited raw_json and marks the job reviewed', async () => {
    const req = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify({ raw_json: { lesson: { lessonNo: 1, titleZh: 'edited' } } }),
    })
    const res = await PATCH(req as any, { params: { jobId: 'job-1' } as any })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'reviewed' })
    )
  })
})
