// Fixed ids and names from internal-5 that the SDMS templates and rules refer to.

/** The Item template ("New Item"): every item is created from it. */
export const ITEM_TEMPLATE_ID = '376eb771-043c-4139-b651-1712d7e36cab';
/** The SDMS application: accounts with it in appRel can be reporters and assignees. */
export const SDMS_APP_ID = 'db625088-19bf-4eb6-9783-5f0f11c5aede';
/** The account type of an SDMS administrator (an active accountAccess with it can see every project). */
export const SDMS_ADMIN_ACCOUNT_TYPE_ID = 'ed281036-a5e1-46db-bee9-712cfc0d769e';
/** The template of a person's SDMS settings (sdms.userConfiguration). */
export const USER_CONFIGURATION_TEMPLATE_ID = 'a838b895-34aa-4822-ade1-12e9401c2002';
export const USER_CONFIGURATION_VTN = 'sdms.userConfiguration';
export const EMAIL_MESSAGE_VTN = 'system.emailMessage';
/** The system account scheduled jobs save as. */
export const SYSTEM_ADMIN_ID = 'a49055c0-18d6-11e7-b7e5-b7036f585587';

/** Statuses an item is finished in: the "open" lists leave them out. */
export const DONE_STATUSES = ['Closed', 'Resolved'];

/** My View's board shows statuses with an indexNum in this range (Open 15 … Released awaiting test 50). */
export const BOARD_STATUS_RANGE = { from: 10, to: 59 } as const;

/** At most this many items can be linked or unlinked at once (the server rule's limit). */
export const MAX_RELATIONSHIP_BATCH = 10;

/** The localStorage key of the last project picked, shared with Formbird's own SDMS forms. */
export const LAST_PROJECT_KEY = 'sdmsProjectRel';
/** The localStorage key of the last saved filter loaded on All Items, shared with Formbird's form. */
export const LAST_SAVED_FILTER_KEY = 'sdmsSavedFilter';

/** Field labels, as the Item template names them (used in history and messages). */
export const FIELD_LABELS: Record<string, string> = {
  projectRel: 'Project',
  typeRel: 'Type',
  severityRel: 'Severity',
  priorityRel: 'Priority',
  reproducibilityRel: 'Reproducibility',
  categoryRel: 'Category',
  tagsRel: 'Tags',
  summary: 'Summary',
  assigneeRel: 'Assignee',
  reporterRel: 'Reporter',
  statusRel: 'Status',
  resolutionRel: 'Resolution',
  feedbackRel: 'Feedback Requested',
  monitoringRel: 'Monitored By',
  exampleLink: 'Example Link',
  environmentText: 'Environment',
  browserVersion: 'Browser Version',
  coreVersion: 'Core Version',
  componentVersion: 'Component Version',
  description: 'Description',
  reproduction: 'Steps to Reproduce',
  additionalInformation: 'Additional Information',
  fileAttachArr: 'Attach Files',
  relatedItemsRel: 'Related items',
  relationshipsRel: 'Related items',
  notesCommentsArr: 'Notes',
  progressNote: 'Progress Note',
  summaryDescription: 'Summary description',
  documentationMD: 'Documentation',
};

/** Item fields that link to a lookup, and the lookup they use. */
export const LOOKUP_FIELDS = {
  typeRel: 'type',
  severityRel: 'severity',
  priorityRel: 'priority',
  reproducibilityRel: 'reproducibility',
  categoryRel: 'category',
  statusRel: 'status',
  resolutionRel: 'resolution',
  tagsRel: 'tag',
} as const;
export type LookupField = keyof typeof LOOKUP_FIELDS;

/** Item fields that link to people. */
export const PEOPLE_FIELDS = ['reporterRel', 'assigneeRel', 'feedbackRel', 'monitoringRel'] as const;
export type PeopleField = (typeof PEOPLE_FIELDS)[number];

/**
 * What each link field copies from the linked document (the template's `relatedFields`), so links
 * saved here look like the ones Formbird's form saves.
 */
export const REF_FIELDS: Record<string, string[]> = {
  projectRel: [],
  typeRel: ['projectRel', 'isGlobalDefaultBool'],
  severityRel: ['projectRel', 'isGlobalDefaultBool', 'indexNum'],
  priorityRel: ['projectRel', 'isGlobalDefaultBool', 'indexNum'],
  reproducibilityRel: ['projectRel', 'isGlobalDefaultBool'],
  categoryRel: ['projectRel', 'isGlobalDefaultBool'],
  tagsRel: ['projectRel', 'isGlobalDefaultBool'],
  statusRel: ['projectRel', 'isGlobalDefaultBool', 'disableItemBool', 'indexNum'],
  resolutionRel: ['projectRel', 'isGlobalDefaultBool'],
  reporterRel: ['email'],
  assigneeRel: ['email'],
  feedbackRel: ['email'],
  monitoringRel: ['email'],
};

/** The item types' icons and colours on the board (from My View's board rule). */
export const TYPE_STYLE: Record<string, { icon: string; color: string }> = {
  Bug: { icon: 'bug', color: '#e53935' },
  Feature: { icon: 'lightbulb', color: '#6395EE' },
  'Change Request': { icon: 'construction', color: '#FF8C00' },
  Release: { icon: 'package', color: '#43A047' },
  Documentation: { icon: 'file-text', color: '#7B1FA2' },
  Security: { icon: 'shield', color: '#D32F2F' },
  Suggestion: { icon: 'lightbulb', color: '#0097A7' },
};
