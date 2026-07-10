import { z } from 'zod';

// orgId is intentionally NOT accepted from the body — it is taken from the
// authenticated API key (req.auth.orgId) so a caller cannot create a project
// inside another organization.
export const createProjectSchema = z.object({
	name: z.string().min(1).max(200),
	description: z.string().max(2000).optional(),
	llmProfile: z.string().min(1).default('openai-5'),
	embeddingProfile: z.string().min(1).default('text-embedding-3-large'),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;
