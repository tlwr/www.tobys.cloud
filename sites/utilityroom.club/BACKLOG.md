# Backlog

This document tracks tasks, features, and bugs for the project. Tasks are prioritized and categorized for better organization.

## Priority

High-priority tasks that should be addressed next:

- [x] Add image upload to project admin edit page
- [ ] Enhance input validation across forms
- [ ] Zod schemas and validation for KV objects

Low-priority tasks:

- [ ] Implement rate limiting for login endpoint (using Cloudflare native rules)
- [ ] Add audit logging for security events

## Features

New features and enhancements to add.

### Image upload

Once we have created a project, we will have an almost empty body (just title)
and a slug. The project is not yet visible.

We need to add content, and for the content to be engaging, we need images.

We can use R2 for storing images (eg we upload to server, persist the image in
the bucket (content addressed eg sha256 hash of the image), and add the image
to the KV object of the project.

We can use HTMX to make the image upload form interactive, and to render a
table of uploaded images (ie the images associated with the project). The table of images should have

1. a small img for preview
2. a link to the image in a new tab, for double checking
3. a button that copies the img src URL (ie in R2 bucket), to aid in writing up projects

### Multi-User Support

- Add support for multiple admin users (schema ready; need user creation/deletion endpoints)

### UI Improvements

- Improve mobile responsiveness
- Enhance error messaging for users

### API Enhancements

- Implement pagination for project lists (not needed right now because low volume of projects)
- Add search and filtering capabilities

## Bugs

Known issues that need fixing.

### Authentication Issues

- [x] Fix edge case with session validation (enhanced with Zod and error handling)
- [x] Implement signed cookies
- Improve error handling for expired sessions

### Performance Issues

- Optimize project loading for large datasets
- Improve image loading and caching

### Compatibility Issues

- Fix browser-specific rendering issues
- Ensure compatibility with older browsers

## Completed

Tasks that have been finished (move here when done).

- [x] Implement signed session cookies with security flags
- [x] Add CSRF protection
- [x] Refactor login logic into helper functions
- [x] Implement Zod schema validation for user data in KV
- [x] Integrate build step into test suite to prevent stale code bugs
- [x] Fix esbuild path resolution for robustness across different working directories
- [x] Implement manual cookie verification fallback for test environments with URL encoding issues
- [x] Add comprehensive test helpers for authentication and request options
- [x] Set up wrangler deployment
- [x] Implement image uploads feature
- [x] Use DIN 1451 font
