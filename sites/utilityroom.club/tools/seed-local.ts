import { spawn, execSync } from 'child_process'
import bcrypt from 'bcryptjs'

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

async function checkReady(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8787/ready')
    return response.ok
  } catch {
    return false
  }
}

async function main() {
  console.log('Starting wrangler dev server...')

  const wrangler = spawn('wrangler', ['dev'], { stdio: 'pipe' })

  // Wait for /ready endpoint
  console.log('Waiting for app to be ready...')
  let ready = false
  for (let i = 0; i < 60; i++) {
    // 30 seconds timeout
    if (await checkReady()) {
      ready = true
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (!ready) {
    console.error('App did not start within 30 seconds. Killing wrangler...')
    wrangler.kill('SIGTERM')
    process.exit(1)
  }

  console.log('App ready! Seeding local KV...')

  try {
    // Seed projects
    for (const project of sampleProjects) {
      const value = JSON.stringify({
        content: project.content,
        createdAt: project.createdAt,
        tags: project.tags,
        visible: project.visible,
      })
      execSync(
        `wrangler kv key put --local --binding=PROJECTS "${project.slug}" '${value}'`,
        { stdio: 'inherit' },
      )
    }

    // Seed admin user
    const hashedPassword = await bcrypt.hash('secret', 10)
    const userData = JSON.stringify({ username: 'admin', hashedPassword })
    execSync(
      `wrangler kv key put --local --binding=USERS "admin" '${userData}'`,
      { stdio: 'inherit' },
    )

    console.log('Local KV seeded successfully!')
  } catch (error) {
    console.error('Seeding failed:', error.message)
    wrangler.kill('SIGTERM')
    process.exit(1)
  }

  console.log('Stopping wrangler dev server...')
  wrangler.kill('SIGTERM')

  console.log(
    'Setup complete! Run "npm run dev" to start development with seeded data.',
  )
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
