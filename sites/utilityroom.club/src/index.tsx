/** @jsx h */

import { Hono, Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getCookie, setCookie } from 'hono/cookie'
import { marked } from 'marked'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { h, ComponentChildren } from 'preact'
import render from 'preact-render-to-string'
import bcrypt from 'bcryptjs'

type Bindings = {
  PROJECTS: KVNamespace
  USERS: KVNamespace
  ASSETS: R2Bucket
}

function Layout({
  title,
  children,
  isLoggedIn,
  currentPage,
}: {
  title: string
  children: ComponentChildren
  isLoggedIn?: boolean
  currentPage?: string
}) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <style>
          {`
          @font-face {
            font-family: 'Berkeley Mono';
            src: url('/BerkeleyMono-Regular.woff2') format('woff2'),
                 url('/BerkeleyMono-Regular.woff') format('woff');
            font-weight: 400;
            font-style: normal;
          }
          @font-face {
            font-family: 'Berkeley Mono';
            src: url('/BerkeleyMono-Bold.woff2') format('woff2'),
                 url('/BerkeleyMono-Bold.woff') format('woff');
            font-weight: 700;
            font-style: normal;
          }
          @font-face {
            font-family: 'Berkeley Mono';
            src: url('/BerkeleyMono-BoldItalic.woff2') format('woff2'),
                 url('/BerkeleyMono-BoldItalic.woff') format('woff');
            font-weight: 700;
            font-style: italic;
          }
          body { font-family: 'Berkeley Mono', monospace; max-width: 800px; margin: 0 auto; padding: 10px; }
          h1 { color: #333; }
          .project { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 1px; }
          a { text-decoration: none; color: #007bff; }
          a:hover { text-decoration: underline; }
          nav { margin-bottom: 10px; }
          .content { line-height: 1.6; }
          .content h1, .content h2, .content h3 { color: #333; margin-top: 10px; }
          .content ul { padding-left: 10px; }
          .content li { margin: 5px 0; }
          .content img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
          form { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 1px; }
          .login-form { max-width: 300px; margin: 10px auto; }
          label { display: block; margin: 10px 0; font-weight: bold; }
          input { width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 1px; box-sizing: border-box; }
          button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 1px; cursor: pointer; margin-top: 10px; }
          button:hover { background: #0056b3; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }
          th { background: #f4f4f4; }
          textarea { width: 100%; padding: 5px; border: 1px solid #ccc; border-radius: 1px; font-family: 'Berkeley Mono', monospace; box-sizing: border-box; }
        `}
        </style>
      </head>
      <body>
        <header
          style={{
            textAlign: 'left',
            marginBottom: '10px',
            paddingBottom: '10px',
            borderBottom: '1px solid #ddd',
          }}
        >
          <h1 style={{ margin: '0', fontSize: '24px' }}>
            <a href="/" style={{ textDecoration: 'none', color: '#333' }}>
              utilityroom.club
            </a>
          </h1>
        </header>
        <nav
          style={{
            textAlign: 'left',
            borderBottom: '1px solid #ddd',
            paddingBottom: '10px',
            marginBottom: '10px',
          }}
        >
          {currentPage === 'projects' ? (
            <span>projects</span>
          ) : (
            <a href="/">projects</a>
          )}{' '}
          |{' '}
          {currentPage === 'tags' ? (
            <span>tags</span>
          ) : (
            <a href="/tags">tags</a>
          )}
          {isLoggedIn ? (
            <span>
              {' '}
              |{' '}
              {currentPage === 'admin' ? (
                <span>admin</span>
              ) : (
                <a href="/admin">admin</a>
              )}{' '}
              | <a href="/logout">logout</a>
            </span>
          ) : null}
        </nav>
        {children}
      </body>
    </html>
  )
}

Layout.defaultProps = {
  isLoggedIn: false,
  currentPage: '',
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())
app.use('*', logger())

// eslint-disable-next-line consistent-return
const authMiddleware = async (
  c: Context<{ Bindings: Bindings }>,
  next: Next,
) => {
  if (getCookie(c, 'session') !== 'loggedin') {
    return c.redirect('/login')
  }
  // eslint-disable-next-line no-return-await
  return await next()
}

// Home page - list all projects
app.get('/', async (c) => {
  const projects = await c.env.PROJECTS.list()
  const projectList = []
  for (const key of projects.keys) {
    const data = await c.env.PROJECTS.get(key.name)
    if (data) {
      const parsed = JSON.parse(data)
      if (parsed.visible !== false) {
        projectList.push({ slug: key.name, ...parsed })
      }
    }
  }

  const isLoggedIn = getCookie(c, 'session') === 'loggedin'
  const html = render(
    <Layout
      title="utilityroom.club"
      isLoggedIn={isLoggedIn}
      currentPage="projects"
    >
      <p>Curating exceptional craftsmanship in building utility systems.</p>
      <div id="projects">
        {projectList.map((project) => (
          <div className="project" key={project.slug}>
            <h2>
              <a href={`/project/${project.slug}`}>{project.slug}</a>
            </h2>
          </div>
        ))}
      </div>
    </Layout>,
  )

  return c.html(`<!DOCTYPE html>${html}`)
})

// Individual project page
app.get('/project/:slug{[A-Za-z0-9-]*[.]json}', async (c) => {
  const slug = c.req.param('slug').replace(/[.]json$/, '')

  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.notFound()
  }

  const project = JSON.parse(data)
  const isLoggedIn = getCookie(c, 'session') === 'loggedin'
  if (!isLoggedIn && !project.visible) {
    return c.notFound()
  }

  return c.json(project)
})

app.get('/project/:slug', async (c) => {
  const slug = c.req.param('slug')
  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.notFound()
  }

  const project = JSON.parse(data)
  const isLoggedIn = getCookie(c, 'session') === 'loggedin'
  if (!isLoggedIn && !project.visible) {
    return c.notFound()
  }

  const htmlContent = marked(project.content)
  const tagsHtml =
    project.tags && project.tags.length > 0
      ? `<p>${project.tags.map((tag: string) => `<a href="/tag/${tag}">${tag}</a>`).join(', ')}</p>`
      : ''
  const content = `${project.visible ? '' : '<p>[invisible]</p>'}${tagsHtml}${htmlContent}`

  const html = render(
    <Layout
      title={`${project.slug} - utilityroom.club`}
      isLoggedIn={isLoggedIn}
      currentPage="project"
    >
      {/* eslint-disable-next-line react/no-danger */}
      <div className="content" dangerouslySetInnerHTML={{ __html: content }} />
    </Layout>,
  )
  return c.html(html)
})

// Login page
app.get('/login', (c) => {
  const isLoggedIn = getCookie(c, 'session') === 'loggedin'
  const html = render(
    <Layout title="Login - utilityroom.club" isLoggedIn={isLoggedIn}>
      <form className="login-form" method="post" action="/login">
        <label htmlFor="username">
          Username: <input id="username" type="text" name="username" />
        </label>
        <label htmlFor="password">
          Password: <input id="password" type="password" name="password" />
        </label>
        <button type="submit">Login</button>
      </form>
    </Layout>,
  )
  return c.html(`<!DOCTYPE html>${html}`)
})

app.post('/login', async (c) => {
  const body = await c.req.parseBody()
  const { username, password } = body
  if (typeof username === 'string' && typeof password === 'string') {
    const hashedPassword = await c.env.USERS.get(username as string)
    if (hashedPassword && (await bcrypt.compare(password, hashedPassword))) {
      setCookie(c, 'session', 'loggedin')
      return c.redirect('/')
    }
  }
  return c.text('Invalid credentials', 401)
})

// Logout route
app.get('/logout', (c) => {
  setCookie(c, 'session', '', { maxAge: 0 })
  return c.redirect('/')
})

// Protected admin page
app.get('/admin', authMiddleware, async (c) => {
  const projects = await c.env.PROJECTS.list()
  const projectList = []
  const tagCounts: { [key: string]: number } = {}
  for (const key of projects.keys) {
    const data = await c.env.PROJECTS.get(key.name)
    if (data) {
      const parsed = JSON.parse(data)
      projectList.push({ slug: key.name, ...parsed })
      if (parsed.tags) {
        parsed.tags.forEach((tag: string) => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1
        })
      }
    }
  }
  projectList.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
  const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])

  const html = render(
    <Layout title="admin - utilityroom.club" isLoggedIn currentPage="admin">
      <table>
        <thead>
          <tr>
            <th>slug</th>
            <th>created at</th>
            <th>actions</th>
          </tr>
        </thead>
        <tbody>
          {projectList.map((project) => (
            <tr key={project.slug}>
              <td>
                <a href={`/project/${project.slug}`}>{project.slug}</a>
              </td>
              <td>{new Date(project.createdAt).toLocaleString()}</td>
              <td>
                <a href={`/admin/edit/${project.slug}`}>edit</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>
        <a href="/admin/new">create new project</a>
      </p>

      <table>
        <thead>
          <tr>
            <th>tag</th>
            <th>count</th>
          </tr>
        </thead>
        <tbody>
          {tags.map(([tag, count]) => (
            <tr key={tag}>
              <td>
                <a href={`/tag/${tag}`}>{tag}</a>
              </td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>,
  )
  return c.html(`<!DOCTYPE html>${html}`)
})

// Edit project page
app.get('/admin/edit/:slug', authMiddleware, async (c) => {
  const slug = c.req.param('slug')
  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.notFound()
  }

  const project = JSON.parse(data)

  const html = render(
    <Layout title={`edit ${slug} - utilityroom.club`} isLoggedIn>
      <h2>Edit {slug}</h2>
      <form method="post" action={`/admin/edit/${slug}`}>
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label>
          tags (comma-separated, kebab-case):
          <textarea name="tags" rows={2} cols={80}>
            {project.tags ? project.tags.join(', ') : ''}
          </textarea>
        </label>
        <br />
        <label htmlFor="visible" style={{ display: 'inline' }}>
          visible:{' '}
          <input
            id="visible"
            type="checkbox"
            name="visible"
            checked={project.visible !== false}
            style={{ width: 'auto' }}
          />
        </label>
        <br />
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label>
          content:
          <textarea name="content" rows={20} cols={80}>
            {project.content}
          </textarea>
        </label>
        <br />
        <button type="submit">Save</button>
      </form>
    </Layout>,
  )
  return c.html(`<!DOCTYPE html>${html}`)
})

app.post('/admin/edit/:slug', authMiddleware, async (c) => {
  const slug = c.req.param('slug')
  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.notFound()
  }

  const body = await c.req.parseBody()
  const { content } = body
  if (typeof content !== 'string') {
    return c.text('Invalid content', 400)
  }

  const tagsInput = body.tags
  let tags: string[] = []
  if (typeof tagsInput === 'string') {
    tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t)
      .map((t) => {
        // Normalize to kebab-case: lowercase, replace invalid chars with -, collapse multiple -, trim -
        const kebab = t
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
        return kebab
      })
      .filter((t) => t.length > 0)
    // Unique
    tags = [...new Set(tags)]
  }

  const visible = body.visible === 'on'

  const project = JSON.parse(data)
  await c.env.PROJECTS.put(
    slug,
    JSON.stringify({ content, createdAt: project.createdAt, tags, visible }),
  )

  return c.redirect(`/project/${slug}`)
})

app.get('/admin/new', authMiddleware, async (c) => {
  const html = render(
    <Layout title="new project - utilityroom.club" isLoggedIn>
      <h2>new project</h2>
      <form method="post" action="/admin/new">
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label>
          title:
          <input type="text" name="title" required />
        </label>
        <br />
        <button type="submit">Create</button>
      </form>
    </Layout>,
  )
  return c.html(`<!DOCTYPE html>${html}`)
})

app.post('/admin/new', authMiddleware, async (c) => {
  const body = await c.req.parseBody()
  const { title } = body

  if (typeof title !== 'string') {
    return c.text('Invalid title', 400)
  }

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!slug) {
    return c.text('Invalid title', 400)
  }

  // Check if slug already exists
  const existing = await c.env.PROJECTS.get(slug)
  if (existing) {
    return c.text('Slug already exists', 400)
  }

  const content = `# ${title}`
  const tags: string[] = []
  const visible = false

  const createdAt = new Date().toISOString()
  await c.env.PROJECTS.put(
    slug,
    JSON.stringify({ content, createdAt, tags, visible }),
  )

  return c.redirect(`/project/${slug}`)
})

// Tags page
app.get('/tags', async (c) => {
  const projects = await c.env.PROJECTS.list()
  const allTags = new Set<string>()
  for (const key of projects.keys) {
    const data = await c.env.PROJECTS.get(key.name)
    if (data) {
      const parsed = JSON.parse(data)
      if (parsed.visible !== false && parsed.tags) {
        parsed.tags.forEach((tag: string) => allTags.add(tag))
      }
    }
  }
  const tags = Array.from(allTags).sort()
  const isLoggedIn = getCookie(c, 'session') === 'loggedin'
  const html = render(
    <Layout
      title="tags - utilityroom.club"
      isLoggedIn={isLoggedIn}
      currentPage="tags"
    >
      <table>
        <thead>
          <tr>
            <th>tag</th>
          </tr>
        </thead>
        <tbody>
          {tags.map((tag) => (
            <tr key={tag}>
              <td>
                <a href={`/tag/${tag}`}>{tag}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>,
  )
  return c.html(`<!DOCTYPE html>${html}`)
})

// Individual tag page
app.get('/tag/:tag', async (c) => {
  const tag = c.req.param('tag')
  const projects = await c.env.PROJECTS.list()
  const matchingProjects = []
  for (const key of projects.keys) {
    const data = await c.env.PROJECTS.get(key.name)
    if (data) {
      const parsed = JSON.parse(data)
      if (
        parsed.visible !== false &&
        parsed.tags &&
        parsed.tags.includes(tag)
      ) {
        matchingProjects.push({ slug: key.name, ...parsed })
      }
    }
  }
  const isLoggedIn = getCookie(c, 'session') === 'loggedin'
  const html = render(
    <Layout title={`${tag} - utilityroom.club`} isLoggedIn={isLoggedIn}>
      <h2>projects tagged with [{tag}]</h2>
      <div id="projects">
        {matchingProjects.map((project) => (
          <div className="project" key={project.slug}>
            <h2>
              <a href={`/project/${project.slug}`}>{project.slug}</a>
            </h2>
          </div>
        ))}
      </div>
    </Layout>,
  )
  return c.html(`<!DOCTYPE html>${html}`)
})

export default app
