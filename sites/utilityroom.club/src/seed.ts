import { Hono } from 'hono'

type Bindings = {
  ARTICLES: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// Seed some sample articles
app.get('/seed', async (c) => {
  const sampleArticles = [
    {
      slug: 'residential-heat-pump-installation',
      content: `# Residential Heat Pump Installation

This project showcases a meticulously installed heat pump system in a modern residential utility room.

## Key Features
- High-efficiency variable speed compressor
- Smart thermostat integration
- Proper ductwork sealing
- Energy monitoring system

## Craftsmanship Highlights
The installation demonstrates exceptional attention to detail in electrical connections and refrigerant line routing.`,
    },
    {
      slug: 'commercial-hvac-retrofit',
      content: `# Commercial HVAC Retrofit

A comprehensive retrofit of an older commercial building's HVAC system.

## Challenges Overcome
- Minimizing disruption to business operations
- Integrating with existing building management system
- Maintaining historical building aesthetics

## Technical Details
Upgraded to modern VRF system with significant energy savings.`,
    },
  ]

  for (const article of sampleArticles) {
    await c.env.ARTICLES.put(article.slug, article.content)
  }

  return c.text('Sample articles seeded successfully')
})

export default app
