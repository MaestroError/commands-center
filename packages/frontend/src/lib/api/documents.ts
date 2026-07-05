import { requestJson } from "./client";

import {
  createDocumentFolderInputSchema,
  createDocumentInputSchema,
  documentListResponseSchema,
  documentReadResponseSchema,
  documentTreeResponseSchema,
  saveDocumentContentInputSchema,
  saveDocumentContentResponseSchema,
  updateDocumentMetadataInputSchema,
  type CreateDocumentInput,
  type CreateDocumentFolderInput,
  type DocumentListItem,
  type DocumentListResponse,
  type DocumentReadResponse,
  type DocumentTreeResponse,
  type SaveDocumentContentInput,
  type SaveDocumentContentResponse,
  type UpdateDocumentMetadataInput,
} from "@cc/shared/schemas";

export async function getDocumentTree(): Promise<DocumentTreeResponse> {
  return requestJson<DocumentTreeResponse>("/api/documents/tree", documentTreeResponseSchema);
}

export async function getDocumentContent(path: string): Promise<DocumentReadResponse> {
  const params = new URLSearchParams();
  params.set("path", path);

  return requestJson<DocumentReadResponse>(
    `/api/documents/file?${params.toString()}`,
    documentReadResponseSchema,
  );
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentListResponse> {
  return requestJson<DocumentListResponse>("/api/documents", documentListResponseSchema, {
    method: "POST",
    body: createDocumentInputSchema.parse(input),
  });
}

export async function createDocumentFolder(input: CreateDocumentFolderInput): Promise<void> {
  await requestJson(
    "/api/documents/folders",
    { parse: (v: unknown) => v },
    {
      method: "POST",
      body: createDocumentFolderInputSchema.parse(input),
    },
  );
}

export async function updateDocumentMetadata(
  input: UpdateDocumentMetadataInput,
): Promise<DocumentListItem> {
  return requestJson<DocumentListItem>(
    "/api/documents/metadata",
    documentListResponseSchema.shape.documents.element,
    {
      method: "PATCH",
      body: updateDocumentMetadataInputSchema.parse(input),
    },
  );
}

export async function saveDocumentContent(
  input: SaveDocumentContentInput,
): Promise<SaveDocumentContentResponse> {
  return requestJson<SaveDocumentContentResponse>(
    "/api/documents/content",
    saveDocumentContentResponseSchema,
    {
      method: "PUT",
      body: saveDocumentContentInputSchema.parse(input),
    },
  );
}
