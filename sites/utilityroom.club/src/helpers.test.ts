import { describe, it, expect } from 'vitest'
import { Miniflare } from 'miniflare'
import bcrypt from 'bcryptjs'
import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function buildProject(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'index.tsx')],
    outfile: path.resolve(__dirname, '../dist/index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
  })
}

export async function getAuthenticatedHeaders(
  mf: Miniflare,
): Promise<Record<string, unknown>> {
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

  if (loginResponse.status !== 302) {
    throw new Error('Login failed')
  }

  const setCookie = loginResponse.headers.get('set-cookie')!
  if (
    !setCookie ||
    !setCookie.includes('username=') ||
    !setCookie.includes('loggedInAt=')
  ) {
    throw new Error('Invalid login response')
  }

  return {
    headers: { cookie: setCookie, Origin: 'http://localhost:8787' },
    redirect: 'manual',
  }
}

export async function setupMiniflare(): Promise<Miniflare> {
  return new Miniflare({
    compatibilityDate: '2025-04-02',
    modules: [{ type: 'ESModule', path: 'dist/index.js' }],
    kvNamespaces: ['PROJECTS', 'USERS'],
    r2Buckets: ['ASSETS'],
  })
}

export async function seedTestData(mf: Miniflare): Promise<void> {
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
}

export async function teardownMiniflare(mf: Miniflare): Promise<void> {
  if (mf) {
    await mf.dispose()
  }
}

describe('Helpers', () => {
  it('dummy test to avoid "no test suite found"', async () => {
    expect(true).toEqual(true)
  })
})
