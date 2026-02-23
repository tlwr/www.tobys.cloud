import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Miniflare } from 'miniflare'

let mf: Miniflare

beforeAll(async () => {
  mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'dist/index.js' }],
    kvNamespaces: ['PROJECTS', 'USERS'],
    r2Buckets: ['ASSETS'],
  })
  // Seed projects for tests
  await mf.dispatchFetch('http://localhost/seed')
})

afterAll(async () => {
  if (mf) {
    await mf.dispose()
  }
})

describe('Utility Room Club', () => {
  describe('Home page', () => {
    it('returns HTML with site header', async () => {
      const response = await mf.dispatchFetch('http://localhost/')
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('utilityroom.club')
      expect(html).toContain('Curating exceptional craftsmanship')
    })
  })

  describe('Project pages', () => {
    it('renders residential project with markdown', async () => {
      const response = await mf.dispatchFetch(
        'http://localhost/project/residential-heat-pump-installation',
        { redirect: 'manual' },
      )
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('utilityroom.club')
      expect(html).toContain('Residential Heat Pump Installation')
      expect(html).toContain('<img')
      expect(html).toContain('High-efficiency variable speed compressor')
    })

    it('renders commercial project', async () => {
      const response = await mf.dispatchFetch(
        'http://localhost/project/commercial-hvac-retrofit',
        { redirect: 'manual', headers: { cookie: 'session=loggedin' } },
      )
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Commercial HVAC Retrofit')
    })

    it('returns 404 for missing project', async () => {
      const response = await mf.dispatchFetch(
        'http://localhost/project/missing-project',
        { redirect: 'manual' },
      )
      expect(response.status).toBe(404)
    })
  })

  describe('Seed endpoint', () => {
    it('seeds projects and user successfully', async () => {
      const response = await mf.dispatchFetch('http://localhost/seed')
      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).toContain('seeded successfully')
    })
  })

  describe('Login page', () => {
    it('shows login form', async () => {
      const response = await mf.dispatchFetch('http://localhost/login')
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Login')
      expect(html).toContain('<form')
    })

    it('rejects invalid credentials', async () => {
      const response = await mf.dispatchFetch('http://localhost/login', {
        method: 'POST',
        body: new URLSearchParams({ username: 'admin', password: 'wrong' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      expect(response.status).toBe(401)
      const text = await response.text()
      expect(text).toContain('Invalid credentials')
    })
  })

  describe('Admin pages', () => {
    const routes = [
      { method: 'GET', url: '/admin' },
      { method: 'GET', url: '/admin/new' },
      {
        method: 'POST',
        url: '/admin/new',
        body: new URLSearchParams({ title: 'Test' }),
      },
      { method: 'GET', url: '/admin/edit/test-slug' },
      {
        method: 'POST',
        url: '/admin/edit/test-slug',
        body: new URLSearchParams({ content: 'Test content' }),
      },
    ]

    routes.forEach((route) => {
      it(`redirect to login if not authenticated: ${route.method} ${route.url}`, async () => {
        const response = await mf.dispatchFetch(
          `http://localhost${route.url}`,
          { method: route.method, body: route.body, redirect: 'manual' },
        )
        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toBe('/login')
      })
    })
  })

  describe('Create new project', () => {
    describe('Create new project', () => {
      it('rejects new project with conflicting slug', async () => {
        const response = await mf.dispatchFetch('http://localhost/admin/new', {
          method: 'POST',
          body: new URLSearchParams({
            title: 'Residential Heat Pump Installation',
          }),
          headers: { cookie: 'session=loggedin' },
          redirect: 'manual',
        })
        expect(response.status).toBe(400)
        const text = await response.text()
        expect(text).toBe('Slug already exists')
      })

      it('creates new project successfully', async () => {
        const response = await mf.dispatchFetch('http://localhost/admin/new', {
          method: 'POST',
          body: new URLSearchParams({ title: 'Test Project' }),
          headers: { cookie: 'session=loggedin' },
          redirect: 'manual',
        })
        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toBe('/project/test-project')
      })
    })
  })
})
