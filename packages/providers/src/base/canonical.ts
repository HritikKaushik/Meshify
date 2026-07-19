/**
 * The Canonical Resource Model — the one hierarchy every provider maps into:
 *
 *   Account → Workspace → Resource → Connector → Knowledge
 *
 * Account   = the org-level grant target (GitHub org/user, Slack team, M365 tenant)
 * Workspace = the provider's container tier (Slack workspace, SharePoint site,
 *             shared drive). Flat providers (GitHub) collapse it to the account.
 * Resource  = the selectable unit a project attaches (repository, channel, drive)
 * Connector = a project's binding of one resource (`knowledge_connectors`)
 * Knowledge = the normalized items flowing through the Connector Engine
 *
 * The model is a type layer + addressing scheme, not extra tables — except the
 * per-integration resource inventory cache (`integration_resources`).
 */

export type CanonicalAccountKind = 'organization' | 'user' | 'workspace' | 'tenant';

export interface CanonicalAccount {
	provider: string;
	accountId: string;
	displayName: string;
	kind: CanonicalAccountKind;
}

export interface CanonicalWorkspace {
	accountId: string;
	workspaceId: string;
	name: string;
	/** Provider-native tier name: 'workspace', 'site', 'drive', … */
	kind: string;
}

export interface CanonicalResource {
	/** Omitted/equal to accountId for flat providers. */
	workspaceId?: string;
	resourceId: string;
	name: string;
	kind: string;
	private?: boolean;
	metadata?: Record<string, unknown>;
}

export interface SourceRefParts {
	provider: string;
	accountId: string;
	/** Falls back to accountId when the provider has no workspace tier. */
	workspaceId: string;
	resourceId: string;
	itemPath: string;
}

/**
 * Canonical knowledge address:
 * `<provider>/<account>/<workspace>/<resource>/<item-path>`.
 * Legacy refs (bare GitHub file paths, `slack/<team>/<channel>/<key>`) are
 * grandfathered — providers own recognizing them via CitationCapable.
 */
export function buildSourceRef(parts: { provider: string; accountId: string; workspaceId?: string; resourceId: string; itemPath: string }): string {
	const segments = [parts.provider, parts.accountId, parts.workspaceId ?? parts.accountId, parts.resourceId];
	for (const segment of segments) {
		if (!segment || segment.includes('/')) throw new Error(`Invalid sourceRef segment: "${segment}"`);
	}
	return `${segments.join('/')}/${parts.itemPath}`;
}

/** Inverse of {@link buildSourceRef}; undefined when the ref has fewer than 5 segments (legacy refs). */
export function parseSourceRef(sourceRef: string): SourceRefParts | undefined {
	const segments = sourceRef.split('/');
	if (segments.length < 5) return undefined;
	const [provider, accountId, workspaceId, resourceId, ...item] = segments;
	if (!provider || !accountId || !workspaceId || !resourceId || item.length === 0) return undefined;
	return { provider, accountId, workspaceId, resourceId, itemPath: item.join('/') };
}
