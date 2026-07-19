import type { Provider } from '../base/provider.js';
import type { ProviderManifest } from '../base/manifest.js';
import { CURRENT_MANIFEST_VERSION, NO_CAPABILITIES } from '../base/manifest.js';
import { manifestOnlyProvider } from '../registry/provider-registry.js';

/**
 * Marketplace catalog entries for providers on the roadmap. Pure data — no
 * implementation exists until one lands, at which point the entry here is
 * replaced by a real `register(createXProvider(deps))`.
 */
function comingSoon(entry: Omit<ProviderManifest, 'availability' | 'capabilities' | 'manifestVersion' | 'providerVersion' | 'auth'>): Provider {
	return manifestOnlyProvider({
		...entry,
		manifestVersion: CURRENT_MANIFEST_VERSION,
		providerVersion: '0.0.0',
		availability: 'coming_soon',
		capabilities: NO_CAPABILITIES,
		auth: { type: 'none' },
	});
}

export const COMING_SOON_PROVIDERS: Provider[] = [
	comingSoon({ id: 'gitlab', displayName: 'GitLab', category: 'code', iconKey: 'gitlab', brandColor: '#FC6D26', summary: 'Index repositories from GitLab groups and projects.' }),
	comingSoon({ id: 'bitbucket', displayName: 'Bitbucket', category: 'code', iconKey: 'bitbucket', brandColor: '#0052CC', summary: 'Index repositories from Bitbucket workspaces.' }),
	comingSoon({ id: 'azuredevops', displayName: 'Azure DevOps', category: 'code', iconKey: 'azuredevops', brandColor: '#0078D4', summary: 'Index Azure DevOps repositories and work items.' }),
	comingSoon({ id: 'teams', displayName: 'Microsoft Teams', category: 'chat', iconKey: 'teams', brandColor: '#6264A7', summary: 'Ingest conversations from Teams channels.' }),
	comingSoon({ id: 'discord', displayName: 'Discord', category: 'chat', iconKey: 'discord', brandColor: '#5865F2', summary: 'Ingest conversations from Discord servers.' }),
	comingSoon({ id: 'googledrive', displayName: 'Google Drive', category: 'storage', iconKey: 'googledrive', brandColor: '#1A73E8', summary: 'Index documents from shared drives and folders.' }),
	comingSoon({ id: 'onedrive', displayName: 'OneDrive', category: 'storage', iconKey: 'onedrive', brandColor: '#0078D4', summary: 'Index documents from OneDrive and SharePoint libraries.' }),
	comingSoon({ id: 'sharepoint', displayName: 'SharePoint', category: 'docs', iconKey: 'sharepoint', brandColor: '#036C70', summary: 'Index SharePoint sites, pages, and document libraries.' }),
	comingSoon({ id: 'confluence', displayName: 'Confluence', category: 'docs', iconKey: 'confluence', brandColor: '#172B4D', summary: 'Index Confluence spaces and pages.' }),
	comingSoon({ id: 'notion', displayName: 'Notion', category: 'docs', iconKey: 'notion', brandColor: '#191919', summary: 'Index Notion workspaces and databases.' }),
	comingSoon({ id: 'jira', displayName: 'Jira', category: 'tickets', iconKey: 'jira', brandColor: '#0052CC', summary: 'Index Jira projects, issues, and comments.' }),
	comingSoon({ id: 'linear', displayName: 'Linear', category: 'tickets', iconKey: 'linear', brandColor: '#5E6AD2', summary: 'Index Linear teams, issues, and project docs.' }),
	comingSoon({ id: 'zendesk', displayName: 'Zendesk', category: 'tickets', iconKey: 'zendesk', brandColor: '#03363D', summary: 'Index Zendesk tickets and help-center articles.' }),
	comingSoon({ id: 'salesforce', displayName: 'Salesforce', category: 'crm', iconKey: 'salesforce', brandColor: '#00A1E0', summary: 'Index Salesforce objects and knowledge articles.' }),
	comingSoon({ id: 'hubspot', displayName: 'HubSpot', category: 'crm', iconKey: 'hubspot', brandColor: '#FF7A59', summary: 'Index HubSpot CRM records and notes.' }),
];
