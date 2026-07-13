import { z } from "zod";

import { documentScopeSchema } from "./documents.js";

export const artifactTypeSchema = z.enum(["url", "file", "document"]);

// A public download link for an artifact. Keyed by artifactId only — sharing is
// independent of whether the artifact was produced in a chat or a task run.
export const artifactShareLinkSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  lastUsedAt: z.string().datetime().nullable(),
  downloadCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

// The canonical conversation-anchored artifact (any type). Both chat and
// task-run sessions are conversations, so this is the single artifact shape
// everywhere in the app.
export const artifactSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  type: artifactTypeSchema,
  // "url": absolute URL. "file": workspace-relative path. "document": path
  // relative to the Documents/ module (relative to the owner's private
  // Documents/ when `documentScope` is "private").
  link: z.string().min(1),
  // Scope of a "document" artifact. "private" for a document in a specialist's
  // private workspace (with `documentOwnerSlug` set to the owning specialist's
  // slug), otherwise "global"/absent for the shared Documents module and
  // non-document artifacts.
  documentScope: documentScopeSchema.optional(),
  documentOwnerSlug: z.string().min(1).nullable().optional(),
  fileManagerPath: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  shareLinks: z.array(artifactShareLinkSchema).default([]),
});

export const artifactListResponseSchema = z.object({
  artifacts: z.array(artifactSchema),
});

// A file-type artifact enriched with on-disk metadata, used by the sharing UI
// and public download endpoint.
export const registeredArtifactSchema = artifactSchema.extend({
  type: z.literal("file"),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  storageKey: z.string().min(1).nullable(),
});

export const registeredArtifactListResponseSchema = z.object({
  artifacts: z.array(registeredArtifactSchema),
});

// Input for the MCP tools that register an artifact against the current
// session's conversation (chat) — the conversation is resolved server-side.
export const addArtifactInputSchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    type: artifactTypeSchema,
    link: z.string().trim().min(1),
  })
  .superRefine((value, ctx) => {
    if (value.type === "url" && !isValidUrl(value.link)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A url artifact requires a valid absolute URL as its link.",
        path: ["link"],
      });
    }
  });

export const createArtifactShareLinkInputSchema = z.object({
  expiresInMinutes: z.number().int().min(0).max(10080).optional(),
});

export const createArtifactShareLinkResponseSchema = z.object({
  shareId: z.string().min(1),
  url: z.string().url(),
  displayUrl: z.string().url(),
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime().nullable(),
});

export const revokeArtifactShareLinkResponseSchema = z.object({
  revoked: z.literal(true),
});

export const artifactSharingPreferencesSchema = z.object({
  // Setting key/field name preserved for backward compatibility with the
  // persisted setting; it governs all artifact share links now, not just task
  // artifacts.
  taskArtifactSignedUrlExpiresInMinutes: z.number().int().min(0).max(10080),
});

export const updateArtifactSharingPreferencesInputSchema = artifactSharingPreferencesSchema;

function isValidUrl(value: string): boolean {
  return z.string().url().safeParse(value).success;
}

export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type ArtifactShareLink = z.infer<typeof artifactShareLinkSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactListResponse = z.infer<typeof artifactListResponseSchema>;
export type RegisteredArtifact = z.infer<typeof registeredArtifactSchema>;
export type RegisteredArtifactListResponse = z.infer<typeof registeredArtifactListResponseSchema>;
export type AddArtifactInput = z.input<typeof addArtifactInputSchema>;
export type CreateArtifactShareLinkInput = z.input<typeof createArtifactShareLinkInputSchema>;
export type CreateArtifactShareLinkResponse = z.infer<typeof createArtifactShareLinkResponseSchema>;
export type ArtifactSharingPreferences = z.infer<typeof artifactSharingPreferencesSchema>;
export type UpdateArtifactSharingPreferencesInput = z.input<
  typeof updateArtifactSharingPreferencesInputSchema
>;
