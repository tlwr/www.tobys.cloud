# utilityroom.club

A curated showcase of exceptional craftsmanship in building utility systems.

## Development

### Prerequisites
- Node.js 18+
- npm
- Cloudflare account (for deployment)

### Setup
```bash
npm install
```

### Commands
- `npm run dev`: Start local development server with Wrangler
- `npm run build`: Build for production
- `npm run lint`: Run ESLint (Airbnb config + Prettier)
- `npm run lint:fix`: Auto-fix linting issues
- `npm run typecheck`: Run TypeScript type checking
- `npm run format`: Format code with Prettier
- `npm test`: Run tests with Vitest

### CI
GitHub Actions runs lint, typecheck, build, and tests on changes to `sites/utilityroom.club/**`.

## Style Guide

This document outlines the aesthetic choices and design guidelines for utilityroom.club to maintain consistency across the site.

### Typography

- **Primary Font**: Berkeley Mono
  - A monospace typeface that conveys precision and technical expertise
  - Variants: Regular (400), Bold (700), Bold Italic (700 italic)
  - Fallback: `monospace`
- **Font Usage**:
  - Body text: Berkeley Mono Regular
  - Headings: Berkeley Mono Bold (inherited from body)
  - Code/textareas: Berkeley Mono (explicitly set)
- **Line Height**: 1.6 for readable content
- **Text Color**: #333 (dark gray)
- **Link Color**: #007bff (bootstrap blue)
- **Link Hover**: #0056b3 (darker blue)

### Layout

- **Max Width**: 800px (centered)
- **Margins/Padding**: 20px standard spacing
- **Border Radius**: 5px for cards/forms
- **Border**: 1px solid #ddd
- **Table Styling**: Collapse borders, light gray header background (#f4f4f4)

### Colors

- **Background**: White (default)
- **Text**: #333
- **Links**: #007bff
- **Borders**: #ddd (light gray)
- **Form Elements**: #ccc borders, 3px radius
- **Buttons**: #007bff background, white text
- **Button Hover**: #0056b3

### Components

- **Header**: Centered h1 with site name, subtle bottom border
- **Projects**: Simple bordered divs with h2 titles
- **Forms**: Consistent padding and styling
- **Tables**: Standard layout with striped headers
- **Navigation**: Back links with ← symbol

### Content Structure

- **Project Pages**: Title (h1 from markdown), tags (if present), content
- **Tags**: Kebab-case identifiers (e.g., "heat-pump", "hvac")
- **Markdown Rendering**: Standard with image centering and list styling

### Responsive Design

- **Viewport**: Mobile-first with width=device-width
- **Images**: Max 100% width, auto height
- **Tables**: Responsive with horizontal scroll if needed

### Development Notes

- **Tech Stack**: Hono, Preact, Cloudflare Workers
- **Styling**: Inline CSS for simplicity
- **Assets**: Static files in /public directory
- **Font Loading**: @font-face with WOFF2/WOFF fallbacks

## Code Style and Consistency

### Code Formatting
- **Linter**: ESLint with Airbnb rules, extended for TypeScript and Preact
- **Formatter**: Prettier with single quotes, no semicolons
- **TypeScript**: Strict mode enabled
- **Imports**: Group by external libraries, then internal, sorted alphabetically
- **JSX**: Use Preact JSX transform (`/** @jsx h */`), style props as objects
- **Naming**: Kebab-case for URLs/tags, camelCase for code, PascalCase for components

### HTML/CSS Consistency
- **Inline Styles**: Use object notation (e.g., `style={{ margin: '10px' }}`)
- **Classes**: Use `className` (Preact), avoid inline if reusable
- **Semantic HTML**: Proper headings, labels, forms
- **Accessibility**: Label associations, alt text for images
- **Responsive**: Max-width containers, mobile-first

### Text and Content Consistency
- **Casing**: Sentence case for titles/headings, consistent throughout
- **Punctuation**: Oxford comma in lists, em/en dashes appropriately
- **Links**: Descriptive text, avoid "click here"
- **Markdown**: Standard formatting, code blocks for technical terms
- **Tone**: Professional, technical, concise
- **Tags**: Kebab-case, lowercase, descriptive (e.g., "heat-pump" not "HeatPump")

### File Organization
- **Structure**: Flat in `src/`, components inline in index.tsx
- **Naming**: Descriptive, lowercase with hyphens for files
- **Comments**: JSDoc for functions, inline for complex logic

### Commit Messages
- **Format**: "type: description" (e.g., "fix: update lint config")
- **Types**: feat, fix, docs, style, refactor, test, chore