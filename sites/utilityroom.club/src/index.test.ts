import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Miniflare } from 'miniflare'
import {
  buildProject,
  getAuthenticatedHeaders,
  setupMiniflare,
  seedTestData,
  teardownMiniflare,
} from './helpers.test.js'

let mf: Miniflare

beforeAll(async () => {
  await buildProject()
  mf = await setupMiniflare()
  await seedTestData(mf)
})

afterAll(async () => {
  await teardownMiniflare(mf)
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

    it('renders with light theme by default (no theme cookie)', async () => {
      const response = await mf.dispatchFetch('http://localhost/')
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('--bg-color: #ffffff')
      expect(html).toContain('--text-color: #333333')
      expect(html).toContain('🌙')
    })

    it('renders with light theme when cookie is light', async () => {
      const response = await mf.dispatchFetch('http://localhost/', {
        headers: { Cookie: 'theme=light' },
      })
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('--bg-color: #ffffff')
      expect(html).toContain('--text-color: #333333')
      expect(html).toContain('🌙')
    })

    it('renders with dark theme when cookie is dark', async () => {
      const response = await mf.dispatchFetch('http://localhost/', {
        headers: { Cookie: 'theme=dark' },
      })
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('--bg-color: #1a1a1a')
      expect(html).toContain('--text-color: #f0f0f0')
      expect(html).toContain('☀️')
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
      const authHeaders = await getAuthenticatedHeaders(mf)
      const response = await mf.dispatchFetch(
        'http://localhost/project/commercial-hvac-retrofit',
        {
          headers: authHeaders.headers as Record<string, string>,
          redirect: authHeaders.redirect as RequestRedirect,
        },
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
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'http://localhost:8787',
        },
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
        const extra =
          route.method === 'POST'
            ? {
                headers: {
                  Origin: 'http://localhost:8787',
                },
              }
            : {}
        const response = await mf.dispatchFetch(
          `http://localhost${route.url}`,
          {
            method: route.method,
            body: route.body,
            redirect: 'manual',
            ...extra,
          },
        )
        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toBe('/login')
      })

      describe('Create new project', () => {
        it('rejects new project with conflicting slug', async () => {
          const response = await mf.dispatchFetch(
            'http://localhost/admin/new',
            {
              method: 'POST',
              body: new URLSearchParams({
                title: 'Residential Heat Pump Installation',
              }),
              ...(await getAuthenticatedHeaders(mf)),
            },
          )
          expect(response.status).toBe(400)
          const text = await response.text()
          expect(text).toBe('Slug already exists')
        })

        it('creates new project successfully', async () => {
          const timestamp = Date.now()
          const response = await mf.dispatchFetch(
            'http://localhost/admin/new',
            {
              method: 'POST',
              body: new URLSearchParams({
                title: `Test Project ${timestamp}`,
              }),
              ...(await getAuthenticatedHeaders(mf)),
            },
          )
          expect(response.status).toBe(302)
          expect(response.headers.get('location')).toBe(
            `/project/test-project-${timestamp}`,
          )
        })
      })

      it('logs out successfully', async () => {
        const logoutResponse = await mf.dispatchFetch(
          'http://localhost/logout',
          {
            ...(await getAuthenticatedHeaders(mf)),
          },
        )
        expect(logoutResponse.status).toBe(302)
        expect(logoutResponse.headers.get('location')).toBe('/')
        const setCookie = logoutResponse.headers.get('set-cookie')!
        expect(setCookie).toContain('username=')
        expect(setCookie).toContain('Max-Age=0')
      })
    })
  })
})
