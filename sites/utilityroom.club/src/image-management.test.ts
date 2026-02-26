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

describe('Image Management', () => {
  describe('Image Upload Endpoint (POST /admin/edit/:slug/image-upload)', () => {
    describe('Successful Uploads', () => {
      it('valid image upload - PNG file, verify hash generation, R2 storage, KV update', async () => {
        // Create a simple PNG file (1x1 transparent pixel)
        const pngData = new Uint8Array([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a, // PNG signature
          0x00,
          0x00,
          0x00,
          0x0d, // IHDR chunk length
          0x49,
          0x48,
          0x44,
          0x52, // IHDR
          0x00,
          0x00,
          0x00,
          0x01, // width: 1
          0x00,
          0x00,
          0x00,
          0x01, // height: 1
          0x08,
          0x06,
          0x00,
          0x00,
          0x00, // bit depth: 8, color type: 6 (RGBA), compression: 0, filter: 0, interlace: 0
          0x1f,
          0xf3,
          0xff,
          0x61, // CRC
          0x00,
          0x00,
          0x00,
          0x0a, // IDAT chunk length
          0x49,
          0x44,
          0x41,
          0x54, // IDAT
          0x78,
          0x9c,
          0x62,
          0x60,
          0x60,
          0x00,
          0x00,
          0x00,
          0x04,
          0x00,
          0x01, // compressed data
          0x27,
          0x8b,
          0x8d,
          0x8b, // CRC
          0x00,
          0x00,
          0x00,
          0x00, // IEND chunk length
          0x49,
          0x45,
          0x4e,
          0x44, // IEND
          0xae,
          0x42,
          0x60,
          0x82, // CRC
        ])

        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        const response = await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        expect(response.status).toBe(200)
        const html = await response.text()
        expect(html).toContain('✓ Image uploaded successfully')

        // Verify the image was added to the project
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        expect(Array.isArray(projectData.images)).toBe(true)
        expect(projectData.images.length).toBeGreaterThan(0)
        expect(typeof projectData.images[0]).toBe('string')
      })

      it('image deduplication - upload same image twice, verify no duplicates in array', async () => {
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
          0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62,
          0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, 0x27, 0x8b, 0x8d,
          0x8b, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
          0x60, 0x82,
        ])

        // First upload
        const formData1 = new FormData()
        formData1.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData1 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Second upload (same image)
        const formData2 = new FormData()
        formData2.append(
          'image',
          new File([pngData], 'test2.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData2 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Verify only one instance in array
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        const uniqueHashes = new Set(projectData.images)
        expect(uniqueHashes.size).toBe(projectData.images.length)
      })

      it('multiple image uploads - verify all appear in project', async () => {
        // Upload first image
        const pngData1 = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData1 = new FormData()
        formData1.append(
          'image',
          new File([pngData1], 'test1.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData1 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Upload second image
        const pngData2 = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ]) // Different width
        const formData2 = new FormData()
        formData2.append(
          'image',
          new File([pngData2], 'test2.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData2 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Verify both images are in the project
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        expect(projectData.images.length).toBeGreaterThanOrEqual(2)
      })
    })

    describe('Authentication & Authorization', () => {
      it('authentication required - reject unauthenticated requests', async () => {
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        const response = await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            redirect: 'manual',
          },
        )

        expect(response.status).toBe(403)
      })
    })

    describe('Integration', () => {
      it('R2 object creation - verify file stored with correct hash key', async () => {
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Verify file exists in R2
        const r2 = await mf.getR2Bucket('ASSETS')
        const objects = await r2.list()
        expect(objects.objects.length).toBeGreaterThan(0)

        // Verify object has SHA256 hash as key
        const hashKey = objects.objects[0].key
        expect(hashKey).toMatch(/^[a-f0-9]{64}$/) // SHA256 hash format
      })

      it('KV project update - verify images array updated correctly', async () => {
        const initialProjectResponse = await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation',
          await getAuthenticatedHeaders(mf),
        )
        const initialHtml = await initialProjectResponse.text()
        const initialImageCount = (initialHtml.match(/<tr key="/g) || []).length

        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Verify project was updated
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        expect(Array.isArray(projectData.images)).toBe(true)
        expect(projectData.images.length).toBeGreaterThan(initialImageCount)
      })
    })
  })

  describe('Image Delete Endpoint (DELETE /admin/edit/:slug/image/:imageHash)', () => {
    describe('Successful Deletions', () => {
      it('valid image deletion - remove existing image, verify R2 deletion and KV update', async () => {
        // First upload an image
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Get the image hash from the project
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        const imageHash = projectData.images[projectData.images.length - 1]

        // Delete the image
        const deleteResponse = await mf.dispatchFetch(
          `http://localhost/admin/edit/residential-heat-pump-installation/image/${imageHash}`,
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        expect(deleteResponse.status).toBe(200)
        const html = await deleteResponse.text()
        expect(html).toContain('<!DOCTYPE html>')
        expect(html).toContain('<table')
        expect(html).toContain('Preview')

        // Verify image was removed from project
        const updatedProject = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const updatedProjectData = JSON.parse(updatedProject!)
        expect(updatedProjectData.images).not.toContain(imageHash)

        // Verify image was deleted from R2
        const r2 = await mf.getR2Bucket('ASSETS')
        const objectAfter = await r2.get(imageHash)
        expect(objectAfter).toBeNull()
      })

      it('remove from images array - verify hash removed from project images array', async () => {
        // Upload two images first
        const pngData1 = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const pngData2 = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])

        const formData1 = new FormData()
        formData1.append(
          'image',
          new File([pngData1], 'test1.png', { type: 'image/png' }),
        )
        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData1 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        const formData2 = new FormData()
        formData2.append(
          'image',
          new File([pngData2], 'test2.png', { type: 'image/png' }),
        )
        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData2 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Get project data with two images
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        let project = await projectsKV.get('residential-heat-pump-installation')
        let projectData = JSON.parse(project!)
        expect(projectData.images.length).toBeGreaterThanOrEqual(2)

        const imageHashToDelete = projectData.images[0]

        // Delete one image
        await mf.dispatchFetch(
          `http://localhost/admin/edit/residential-heat-pump-installation/image/${imageHashToDelete}`,
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Verify only one image remains and the deleted one is gone
        project = await projectsKV.get('residential-heat-pump-installation')
        projectData = JSON.parse(project!)
        expect(projectData.images).not.toContain(imageHashToDelete)
        expect(projectData.images.length).toBeGreaterThanOrEqual(1)
      })

      it('table HTML response - verify updated table returned without deleted image', async () => {
        // Upload an image first
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Get the image hash
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        const imageHash = projectData.images[projectData.images.length - 1]

        // Delete the image
        const deleteResponse = await mf.dispatchFetch(
          `http://localhost/admin/edit/residential-heat-pump-installation/image/${imageHash}`,
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        expect(deleteResponse.status).toBe(200)
        const html = await deleteResponse.text()

        // Verify HTML contains table structure
        expect(html).toContain('<table')
        expect(html).toContain('<thead>')
        expect(html).toContain('<tbody>')
        expect(html).toContain('<th>Preview</th>')
        expect(html).toContain('<th>Actions</th>')

        // Verify deleted image is not in the HTML
        expect(html).not.toContain(`imageHash="${imageHash}"`)
      })
    })

    describe('Validation & Errors', () => {
      it('invalid image hash - handle non-existent hash gracefully', async () => {
        const response = await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image/nonexistenthash12345678901234567890123456789012',
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        expect(response.status).toBe(404)
      })

      it('invalid project slug - reject non-existent project', async () => {
        const response = await mf.dispatchFetch(
          'http://localhost/admin/edit/non-existent-project/image/somehash12345678901234567890123456789012',
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        expect(response.status).toBe(404)
        const text = await response.text()
        expect(text).toBe('Project not found')
      })

      it('image not in project - reject hash that exists but not in project images array', async () => {
        // Upload an image to get a valid hash
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Get the hash
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        const validHash = projectData.images[0]

        // Try to delete from a different project
        const response = await mf.dispatchFetch(
          `http://localhost/admin/edit/commercial-hvac-retrofit/image/${validHash}`,
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        expect(response.status).toBe(404)
        const text = await response.text()
        expect(text).toBe('Image hash not found in project')
      })

      it('authentication required - reject unauthenticated requests', async () => {
        const response = await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image/somehash12345678901234567890123456789012',
          {
            method: 'DELETE',
            redirect: 'manual',
          },
        )

        expect(response.status).toBe(403)
      })
    })

    describe('Integration', () => {
      it('R2 object deletion - verify file removed from storage', async () => {
        // Upload an image first
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const formData = new FormData()
        formData.append(
          'image',
          new File([pngData], 'test.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Get the hash
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        const project = await projectsKV.get(
          'residential-heat-pump-installation',
        )
        const projectData = JSON.parse(project!)
        const imageHash = projectData.images[projectData.images.length - 1]

        // Verify file exists in R2 before deletion
        const r2 = await mf.getR2Bucket('ASSETS')
        const objectBefore = await r2.get(imageHash)
        expect(objectBefore).toBeDefined()

        // Delete the image
        await mf.dispatchFetch(
          `http://localhost/admin/edit/residential-heat-pump-installation/image/${imageHash}`,
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Verify file is gone from R2
        const objectAfter = await r2.get(imageHash)
        expect(objectAfter).toBeNull()
      })

      it('KV project update - verify images array updated correctly', async () => {
        // Upload two images
        const pngData1 = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])
        const pngData2 = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
        ])

        const formData1 = new FormData()
        formData1.append(
          'image',
          new File([pngData1], 'test1.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData1 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        const formData2 = new FormData()
        formData2.append(
          'image',
          new File([pngData2], 'test2.png', { type: 'image/png' }),
        )

        await mf.dispatchFetch(
          'http://localhost/admin/edit/residential-heat-pump-installation/image-upload',
          {
            method: 'POST',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: formData2 as any,
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Get initial state
        const projectsKV = await mf.getKVNamespace('PROJECTS')
        let project = await projectsKV.get('residential-heat-pump-installation')
        let projectData = JSON.parse(project!)
        const initialImageCount = projectData.images.length
        const imageToDelete = projectData.images[0]

        // Delete one image
        await mf.dispatchFetch(
          `http://localhost/admin/edit/residential-heat-pump-installation/image/${imageToDelete}`,
          {
            method: 'DELETE',
            ...(await getAuthenticatedHeaders(mf)),
          },
        )

        // Verify project was updated correctly
        project = await projectsKV.get('residential-heat-pump-installation')
        projectData = JSON.parse(project!)
        expect(projectData.images.length).toBe(initialImageCount - 1)
        expect(projectData.images).not.toContain(imageToDelete)
        expect(Array.isArray(projectData.images)).toBe(true)
      })
    })
  })
})
