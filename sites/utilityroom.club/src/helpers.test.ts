import { File as NodeFile } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { Miniflare } from 'miniflare'
import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'
import { issuePayload, signAuthToken } from '@tobys/auth-client'

// Node 18 (and some test runners) have no global File / Web Crypto.
const g = globalThis as typeof globalThis & { File?: typeof NodeFile }
if (typeof g.crypto?.subtle === 'undefined') {
  Object.defineProperty(g, 'crypto', { value: webcrypto, configurable: true })
}
if (typeof g.File === 'undefined') {
  g.File = NodeFile
}

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const TEST_JWT_SECRET = 'test-jwt-secret-at-least-32-chars!!'

export async function buildProject(): Promise<void> {
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, 'index.tsx')],
    outfile: path.resolve(__dirname, '../dist/index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    nodePaths: [path.resolve(__dirname, '../node_modules')],
  })
}

export async function getAuthenticatedHeaders(): Promise<
  Record<string, unknown>
> {
  const jwt = await signAuthToken(
    TEST_JWT_SECRET,
    issuePayload(
      'admin@utilityroom.club',
      'utilityroom',
      ['utilityroom:admin'],
      'session',
      3600,
    ),
  )
  return {
    headers: {
      cookie: `auth_session=${jwt}`,
      Origin: 'http://localhost:8787',
    },
    redirect: 'manual',
  }
}

export async function setupMiniflare(): Promise<Miniflare> {
  return new Miniflare({
    compatibilityDate: '2025-04-02',
    modules: [{ type: 'ESModule', path: 'dist/index.js' }],
    kvNamespaces: ['PROJECTS'],
    r2Buckets: ['ASSETS'],
    bindings: {
      AUTH_JWT_SECRET: TEST_JWT_SECRET,
      AUTH_ISSUER: 'https://auth.tobys.cloud',
    },
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
