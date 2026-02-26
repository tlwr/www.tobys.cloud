/* eslint-disable jsx-a11y/control-has-associated-label */

/** @jsx h */

import { Hono, Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { csrf } from 'hono/csrf'
import {
  getSignedCookie,
  setSignedCookie,
  deleteCookie,
  getCookie,
} from 'hono/cookie'
import { marked } from 'marked'
import render from 'preact-render-to-string'
import { ComponentChildren } from 'preact'
import bcrypt from 'bcryptjs'
import { UserSchema } from './schemas/user'
import { ProjectSchema } from './schemas/project'

type Bindings = {
  PROJECTS: KVNamespace
  USERS: KVNamespace
  ASSETS: R2Bucket
  SESSION_SECRET: string
  NODE_ENV: string
}

function getSessionSecret(c: Context<{ Bindings: Bindings }>): string {
  const secret = c.env.SESSION_SECRET
  if (!secret && c.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production')
  }
  return secret || 'dev-session-secret-12345'
}

async function getIsLoggedIn(
  c: Context<{ Bindings: Bindings }>,
): Promise<boolean> {
  const sessionSecret = getSessionSecret(c)
  const username = await getSignedCookie(c, sessionSecret, 'username')

  // signed cookie is not valid
  if (username === false) return false
  return !!username
}

function getTheme(c: Context<{ Bindings: Bindings }>): 'light' | 'dark' {
  const theme = getCookie(c, 'theme')
  return theme === 'dark' ? 'dark' : 'light'
}

// Helper to authenticate and set session cookie
async function loginUser(
  c: Context<{ Bindings: Bindings }>,
  username: string,
  password: string,
): Promise<boolean> {
  const userData = await c.env.USERS.get(username)
  if (!userData) return false

  const userParse = UserSchema.safeParse(JSON.parse(userData))
  if (!userParse.success) {
    console.error('Invalid user data in KV:', userParse.error)
    return false
  }

  const { hashedPassword } = userParse.data
  const result = await bcrypt.compare(password, hashedPassword)

  if (!result) {
    return false
  }

  const sessionSecret = getSessionSecret(c)
  const options = {
    httpOnly: true,
    secure: false,
    sameSite: 'strict' as const,
    maxAge: 86400,
  }

  await Promise.all([
    setSignedCookie(c, 'username', username, sessionSecret, options),
    setSignedCookie(
      c,
      'loggedInAt',
      Date.now().toString(),
      sessionSecret,
      options,
    ),
  ])

  return true
}

const authMiddleware = async (
  c: Context<{ Bindings: Bindings }>,
  next: Next,
) => {
  const isLoggedIn = await getIsLoggedIn(c)
  if (isLoggedIn) {
    await next()
  } else {
    return c.redirect('/login')
  }
}

function Layout({
  title,
  children,
  isLoggedIn,
  currentPage,
  theme,
}: {
  title: string
  children: ComponentChildren
  isLoggedIn?: boolean
  currentPage?: string
  theme?: 'light' | 'dark'
}) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <script src="https://unpkg.com/htmx.org@1.9.12" />
        <style>
          {`
          @import url('https://fonts.cdnfonts.com/css/din-1451-std');
          :root {
            --bg-color: ${theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            --text-color: ${theme === 'dark' ? '#f0f0f0' : '#333333'};
            --link-color: ${theme === 'dark' ? '#4dabf7' : '#007bff'};
            --link-hover-color: ${theme === 'dark' ? '#6bb6ff' : '#0056b3'};
            --border-color: ${theme === 'dark' ? '#555555' : '#dddddd'};
            --border-light: ${theme === 'dark' ? '#666666' : '#cccccc'};
            --table-header-bg: ${theme === 'dark' ? '#2a2a2a' : '#f4f4f4'};
            --button-bg: ${theme === 'dark' ? '#4dabf7' : '#007bff'};
            --button-hover-bg: ${theme === 'dark' ? '#6bb6ff' : '#0056b3'};
            --button-text: ${theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            --input-bg: ${theme === 'dark' ? '#333333' : '#ffffff'};
          }
          body { font-family: 'DIN 1451 Std', sans-serif; max-width: 800px; margin: 0 auto; padding: 10px; background-color: var(--bg-color); color: var(--text-color); }
          h1 { color: var(--text-color); text-transform: uppercase; }
          .project { margin: 10px 0; padding: 10px; border: 1px solid var(--border-color); border-radius: 1px; background-color: var(--bg-color); }
          a { text-decoration: none; color: var(--link-color); }
          a:hover { text-decoration: underline; color: var(--link-hover-color); }
          nav { margin-bottom: 10px; text-transform: uppercase; }
          .content { line-height: 1.6; }
          .content h1, .content h2, .content h3 { color: var(--text-color); margin-top: 10px; text-transform: uppercase; }
          .content ul { padding-left: 10px; }
          .content li { margin: 5px 0; }
          .content img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
          form { margin: 10px 0; padding: 10px; border: 1px solid var(--border-color); border-radius: 1px; background-color: var(--bg-color); }
          .login-form { max-width: 300px; margin: 10px auto; }
          label { display: block; margin: 10px 0; font-weight: bold; color: var(--text-color); }
          input { width: 100%; padding: 5px; border: 1px solid var(--border-light); border-radius: 1px; box-sizing: border-box; background-color: var(--input-bg); color: var(--text-color); }
          button { width: 100%; padding: 10px; background: var(--button-bg); color: var(--button-text); border: none; border-radius: 1px; cursor: pointer; margin-top: 10px; }
          button:hover { background: var(--button-hover-bg); }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid var(--border-color); padding: 5px; text-align: left; color: var(--text-color); }
          th { background: var(--table-header-bg); }
          textarea { width: 100%; padding: 5px; border: 1px solid var(--border-light); border-radius: 1px; font-family: 'DIN 1451 Std', sans-serif; box-sizing: border-box; background-color: var(--input-bg); color: var(--text-color); }
        `}
        </style>
        <script>
          {`
          (function() {
            const themes = {
              light: {
                '--bg-color': '#ffffff',
                '--text-color': '#333333',
                '--link-color': '#007bff',
                '--link-hover-color': '#0056b3',
                '--border-color': '#dddddd',
                '--border-light': '#cccccc',
                '--table-header-bg': '#f4f4f4',
                '--button-bg': '#007bff',
                '--button-hover-bg': '#0056b3',
                '--button-text': '#ffffff',
                '--input-bg': '#ffffff'
              },
              dark: {
                '--bg-color': '#1a1a1a',
                '--text-color': '#f0f0f0',
                '--link-color': '#4dabf7',
                '--link-hover-color': '#6bb6ff',
                '--border-color': '#555555',
                '--border-light': '#666666',
                '--table-header-bg': '#2a2a2a',
                '--button-bg': '#4dabf7',
                '--button-hover-bg': '#6bb6ff',
                '--button-text': '#1a1a1a',
                '--input-bg': '#333333'
              }
            };

            function getCookie(name) {
              const value = '; ' + document.cookie;
              const parts = value.split('; ' + name + '=');
              if (parts.length === 2) return parts.pop().split(';').shift();
              return null;
            }

            function setCookie(name, value, days) {
              const expires = new Date();
              expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
              document.cookie = name + '=' + value + ';expires=' + expires.toUTCString() + ';path=/;samesite=strict';
            }

            function getTheme() {
              const theme = getCookie('theme');
              if (theme) return theme;
              if (!window.matchMedia) return 'light';
              if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
              } else {
                return 'light';
              }
            }

            function setTheme(theme) {
              setCookie('theme', theme, 365);
              applyTheme(theme);
            }

            function applyTheme(theme) {
              const root = document.documentElement;
              const vars = themes[theme];
              Object.keys(vars).forEach(key => {
                root.style.setProperty(key, vars[key]);
              });
              const toggle = document.getElementById('theme-toggle');
              if (toggle) {
                toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
                toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme');
              }
            }

            // Initialize theme
            const currentTheme = getTheme();
            applyTheme(currentTheme);

            // Handle toggle
            document.addEventListener('DOMContentLoaded', function() {
              const toggle = document.getElementById('theme-toggle');
              if (toggle) {
                toggle.addEventListener('click', function() {
                  const newTheme = getCookie('theme') === 'dark' ? 'light' : 'dark';
                  setTheme(newTheme);
                });
              }
            });
          })();
          `}
        </script>
      </head>
      <body>
        <header
          style={{
            textAlign: 'left',
            marginBottom: '10px',
            paddingBottom: '10px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <h1 style={{ margin: '0', fontSize: '24px' }}>
            <a
              href="/"
              style={{ textDecoration: 'none', color: 'var(--text-color)' }}
            >
              utilityroom.club
            </a>
          </h1>
        </header>
        <nav
          style={{
            textAlign: 'left',
            borderBottom: '1px solid var(--border-color)',
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
          )}{' '}
          |{' '}
          <button
            id="theme-toggle"
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '0',
              margin: '0',
              width: 'auto',
            }}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
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
  theme: 'light',
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())
app.use('*', logger())

app.use('*', async (c, next) => {
  const middleware = csrf({
    origin:
      c.env.NODE_ENV === 'production'
        ? 'https://utilityroom.club'
        : ['http://localhost:8787', 'http://localhost'],
  })

  return middleware(c, next)
})

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

  const isLoggedIn = await getIsLoggedIn(c)
  const theme = getTheme(c)
  const html = render(
    <Layout
      title="utilityroom.club"
      isLoggedIn={isLoggedIn}
      currentPage="projects"
      theme={theme}
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
  project.slug = slug
  const isLoggedIn = await getIsLoggedIn(c)
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
  project.slug = slug
  const isLoggedIn = await getIsLoggedIn(c)
  const theme = getTheme(c)
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
      theme={theme}
    >
      {/* eslint-disable-next-line react/no-danger */}
      <div className="content" dangerouslySetInnerHTML={{ __html: content }} />
    </Layout>,
  )
  return c.html(html)
})

app.get('/login', async (c) => {
  const isLoggedIn = await getIsLoggedIn(c)
  const theme = getTheme(c)

  if (isLoggedIn) {
    return c.redirect('/admin')
  }

  const html = render(
    <Layout
      title="Login - utilityroom.club"
      isLoggedIn={isLoggedIn}
      theme={theme}
    >
      <form
        id="login-form"
        className="login-form"
        method="post"
        action="/login"
      >
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
    if (await loginUser(c, username, password)) {
      return c.redirect('/')
    }
  }
  return c.text('Invalid credentials', 401)
})

app.get('/logout', (c) => {
  deleteCookie(c, 'username')
  deleteCookie(c, 'loggedInAt')
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
  const theme = getTheme(c)

  const html = render(
    <Layout
      title="admin - utilityroom.club"
      isLoggedIn
      currentPage="admin"
      theme={theme}
    >
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

app.get('/admin/edit/:slug', authMiddleware, async (c) => {
  const slug = c.req.param('slug')
  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.notFound()
  }

  const projectParse = ProjectSchema.safeParse(JSON.parse(data))
  if (!projectParse.success) {
    console.error('Invalid project data in KV:', projectParse.error)
    return c.text('Invalid project data', 500)
  }
  const project = projectParse.data
  const theme = getTheme(c)

  const html = render(
    <Layout title={`edit ${slug} - utilityroom.club`} isLoggedIn theme={theme}>
      <h2>Edit {slug}</h2>
      <form id="project-edit-form" method="post" action={`/admin/edit/${slug}`}>
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

      <h3>Images</h3>
      <div
        id="upload-form"
        hx-get={`/admin/project/${slug}/image-upload-form`}
        hx-trigger="load"
      />

      <div
        id="images-table"
        hx-get={`/admin/project/${slug}/images-table`}
        hx-trigger="load, imageUploaded"
      />
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

  const projectParse = ProjectSchema.safeParse(JSON.parse(data))
  if (!projectParse.success) {
    console.error('Invalid project data in KV:', projectParse.error)
    return c.text('Invalid project data', 500)
  }
  const existingProject = projectParse.data

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

  const updatedProject = {
    content,
    createdAt: existingProject.createdAt,
    tags,
    visible,
    images: existingProject.images,
  }

  await c.env.PROJECTS.put(slug, JSON.stringify(updatedProject))

  return c.redirect(`/project/${slug}`)
})

app.post('/admin/edit/:slug/image-upload', authMiddleware, async (c) => {
  const slug = c.req.param('slug')
  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.notFound()
  }

  const projectParse = ProjectSchema.safeParse(JSON.parse(data))
  if (!projectParse.success) {
    console.error('Invalid project data in KV:', projectParse.error)
    return c.html('<tr><td colspan="3">Error: Invalid project data</td></tr>')
  }
  const project = projectParse.data

  const formData = await c.req.formData()
  const imageFile = formData.get('image') as File

  if (!imageFile || !(imageFile instanceof File)) {
    return c.html('<tr><td colspan="3">Error: No image file provided</td></tr>')
  }

  // Compute SHA256 hash
  const imageArrayBuffer = await imageFile.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', imageArrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const imageHash = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Store in R2
  await c.env.ASSETS.put(imageHash, imageArrayBuffer, {
    httpMetadata: {
      contentType: imageFile.type,
    },
  })

  // Update project images - ensure uniqueness
  const updatedImages = Array.from(new Set([...project.images, imageHash]))
  const updatedProject = { ...project, images: updatedImages }
  await c.env.PROJECTS.put(slug, JSON.stringify(updatedProject))

  // Return the upload form with success message - table will be reloaded via HTMX event
  const html = render(
    <div>
      <div style={{ color: 'green', marginBottom: '10px' }}>
        ✓ Image uploaded successfully!
      </div>
      <form
        id="image-upload-form"
        hx-post={`/admin/edit/${slug}/image-upload`}
        hx-trigger="submit"
        hx-on-htmx-after-request="if(event.detail.successful) htmx.trigger('#images-table', 'imageUploaded')"
        encType="multipart/form-data"
        style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
      >
        <input
          type="file"
          name="image"
          accept="image/*"
          required
          aria-label="Select image file"
        />
        <button type="submit" style={{ marginTop: 0 }}>
          Upload Image
        </button>
      </form>
    </div>,
  )

  return c.html(`<!DOCTYPE html>${html}`)
})

app.get('/admin/project/:slug/images-table', authMiddleware, async (c) => {
  const slug = c.req.param('slug')
  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.html('<p>Error: Project not found</p>')
  }

  const projectParse = ProjectSchema.safeParse(JSON.parse(data))
  if (!projectParse.success) {
    console.error('Invalid project data in KV:', projectParse.error)
    return c.html('<p>Error: Invalid project data</p>')
  }
  const project = projectParse.data

  const html = render(
    <table style={{ maxWidth: '100%' }}>
      <thead>
        <tr>
          <th>Preview</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {project.images.map((imageHash) => (
          <tr key={imageHash}>
            <td>
              <a href={`/asset/${imageHash}`} target="_blank" rel="noreferrer">
                <img
                  src={`/asset/${imageHash}`}
                  alt="preview"
                  style={{ maxWidth: '100px', maxHeight: '100px' }}
                />
              </a>
            </td>
            <td>
              <span
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: `<button type="button" onclick="navigator.clipboard.writeText('${new URL(c.req.url).origin}/asset/${imageHash}'); this.innerText = '✓'; setTimeout(() => { this.innerText = '📋'; }, 2000);" title="Copy image URL to clipboard" aria-label="Copy image URL" style="font-size: 16px; padding: 4px 8px; cursor: pointer; width: auto; background-color: transparent; border: 2px solid blue; color: blue;">📋</button>
                  <button type="button" hx-delete="/admin/edit/${slug}/image/${imageHash}" hx-confirm="Are you sure you want to delete this image?" hx-target="#images-table" hx-swap="outerHTML" title="Delete image" aria-label="Delete image" style="font-size: 16px; padding: 4px 8px; cursor: pointer; margin-left: 8px; width: auto; background-color: transparent; border: 2px solid red; color: red;">🗑️</button>`,
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>,
  )

  return c.html(`<!DOCTYPE html>${html}`)
})

app.get('/admin/project/:slug/image-upload-form', authMiddleware, async (c) => {
  const slug = c.req.param('slug')

  const html = render(
    <form
      id="image-upload-form"
      hx-post={`/admin/edit/${slug}/image-upload`}
      hx-trigger="submit"
      hx-on-htmx-after-request="if(event.detail.successful) htmx.trigger('#images-table', 'imageUploaded')"
      encType="multipart/form-data"
      style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
    >
      <input
        type="file"
        name="image"
        accept="image/*"
        required
        aria-label="Select image file"
      />
      <button type="submit" style={{ marginTop: 0 }}>
        Upload Image
      </button>
    </form>,
  )

  return c.html(`<!DOCTYPE html>${html}`)
})

app.delete('/admin/edit/:slug/image/:imageHash', authMiddleware, async (c) => {
  const slug = c.req.param('slug')
  const imageHash = c.req.param('imageHash')

  const data = await c.env.PROJECTS.get(slug)

  if (!data) {
    return c.text('Project not found', 404)
  }

  const projectParse = ProjectSchema.safeParse(JSON.parse(data))
  if (!projectParse.success) {
    console.error('Invalid project data in KV:', projectParse.error)
    return c.text('Invalid project data', 500)
  }
  const project = projectParse.data

  // Check if image hash exists in project
  if (!project.images.includes(imageHash)) {
    return c.text('Image hash not found in project', 404)
  }

  // Remove image from R2 bucket
  await c.env.ASSETS.delete(imageHash)

  // Remove image hash from project images array
  const updatedImages = project.images.filter((hash) => hash !== imageHash)
  const updatedProject = { ...project, images: updatedImages }
  await c.env.PROJECTS.put(slug, JSON.stringify(updatedProject))

  // Return updated images table HTML
  const html = render(
    <table style={{ maxWidth: '100%' }}>
      <thead>
        <tr>
          <th>Preview</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {updatedImages.map((imgHash) => (
          <tr key={imgHash}>
            <td>
              <a href={`/asset/${imgHash}`} target="_blank" rel="noreferrer">
                <img
                  src={`/asset/${imgHash}`}
                  alt="preview"
                  style={{ maxWidth: '100px', maxHeight: '100px' }}
                />
              </a>
            </td>
            <td>
              <span
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{
                  __html: `<button type="button" onclick="navigator.clipboard.writeText('${new URL(c.req.url).origin}/asset/${imgHash}'); this.innerText = '✓'; setTimeout(() => { this.innerText = '📋'; }, 2000);" title="Copy image URL to clipboard" aria-label="Copy image URL" style="font-size: 16px; padding: 4px 8px; cursor: pointer; width: auto; background-color: transparent; border: 2px solid blue; color: blue;">📋</button>
                <button type="button" hx-delete="/admin/edit/${slug}/image/${imgHash}" hx-confirm="Are you sure you want to delete this image?" hx-target="#images-table" hx-swap="outerHTML" title="Delete image" aria-label="Delete image" style="font-size: 16px; padding: 4px 8px; cursor: pointer; margin-left: 8px; width: auto; background-color: transparent; border: 2px solid red; color: red;">🗑️</button>`,
                }}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>,
  )

  return c.html(`<!DOCTYPE html>${html}`)
})

app.get('/asset/:hash', async (c) => {
  const hash = c.req.param('hash')
  const object = await c.env.ASSETS.get(hash)

  if (!object) {
    return c.notFound()
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)

  return c.body(object.body, {
    headers,
  })
})

app.get('/admin/new', authMiddleware, async (c) => {
  const theme = getTheme(c)
  const html = render(
    <Layout title="new project - utilityroom.club" isLoggedIn theme={theme}>
      <h2>new project</h2>
      <form id="project-new-form" method="post" action="/admin/new">
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
  const images: string[] = []

  const createdAt = new Date().toISOString()
  const newProject = { content, createdAt, tags, visible, images }
  await c.env.PROJECTS.put(slug, JSON.stringify(newProject))

  return c.redirect(`/project/${slug}`)
})

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
  const isLoggedIn = await getIsLoggedIn(c)
  const theme = getTheme(c)
  const html = render(
    <Layout
      title="tags - utilityroom.club"
      isLoggedIn={isLoggedIn}
      currentPage="tags"
      theme={theme}
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
  const isLoggedIn = await getIsLoggedIn(c)
  const theme = getTheme(c)
  const html = render(
    <Layout
      title={`${tag} - utilityroom.club`}
      isLoggedIn={isLoggedIn}
      theme={theme}
    >
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

app.get('/ready', (c) => c.text('OK'))

export default app
