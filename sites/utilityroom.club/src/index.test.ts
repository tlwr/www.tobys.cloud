import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Miniflare } from 'miniflare'
import bcrypt from 'bcryptjs'
import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mf: Miniflare

async function buildProject() {
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'index.tsx')],
    outfile: path.resolve(__dirname, '../dist/index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
  })
}

async function getAuthenticatedHeaders(): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ username: 'admin', password: 'secret' })
  const loginResponse = await mf.dispatchFetch('http://localhost/login', {
    method: 'POST',
    body: params.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'http://localhost:8787',
    },
    redirect: 'manual',
  })
  expect(loginResponse.status).toBe(302)
  const setCookie = loginResponse.headers.get('set-cookie')!
  expect(setCookie).toContain('username=')
  expect(setCookie).toContain('loggedInAt=')
  return {
    headers: { cookie: setCookie, Origin: 'http://localhost:8787' },
    redirect: 'manual',
  }
}

beforeAll(async () => {
  await buildProject()
  mf = new Miniflare({
    compatibilityDate: '2025-04-02',
    modules: [{ type: 'ESModule', path: 'dist/index.js' }],
    kvNamespaces: ['PROJECTS', 'USERS'],
    r2Buckets: ['ASSETS'],
  })
  // Seed projects for tests
  const sampleProjects = [
    {
      slug: 'residential-heat-pump-installation',
      content: `# Residential Heat Pump Installation

![Heat pump installation](https://pbs.twimg.com/media/GzxFgYFWEAAXcez?format=jpg&name=medium)

This project showcases a meticulously installed heat pump system in a modern residential utility room.

## Key Features
- High-efficiency variable speed compressor
- Smart thermostat integration
- Proper ductwork sealing
- Energy monitoring system

## Installation Details
- Location: Utility room
- Equipment: Variable speed heat pump
- Controls: Smart thermostat
- Monitoring: Energy usage tracking`,
      createdAt: new Date().toISOString(),
      tags: ['hvac', 'heat-pump'],
      visible: true,
    },
    {
      slug: 'commercial-hvac-retrofit',
      content: `# Commercial HVAC Retrofit

This project involved retrofitting an existing commercial building with modern VRF (Variable Refrigerant Flow) system.

## System Overview
- VRF technology for efficient cooling and heating
- Modular design for scalability
- Advanced controls for zone management

## Benefits
- 30% energy savings
- Improved comfort control
- Reduced maintenance costs
- Future-proof design`,
      createdAt: new Date().toISOString(),
      tags: ['hvac', 'commercial', 'retrofit'],
      visible: false,
    },
  ]

  const projectsKV = await mf.getKVNamespace('PROJECTS')
  for (const project of sampleProjects) {
    await projectsKV.put(
      project.slug,
      JSON.stringify({
        content: project.content,
        createdAt: project.createdAt,
        tags: project.tags,
        visible: project.visible,
      }),
    )
  }
  // Seed admin user for tests
  const hashedPassword = await bcrypt.hash('secret', 10)
  const usersKV = await mf.getKVNamespace('USERS')
  await usersKV.put(
    'admin',
    JSON.stringify({ username: 'admin', hashedPassword }),
  )
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
        await getAuthenticatedHeaders(),
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
              ...(await getAuthenticatedHeaders()),
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
              ...(await getAuthenticatedHeaders()),
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
            ...(await getAuthenticatedHeaders()),
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
