// The shapes of the SDMS documents in internal-5, as the Item template and its rules store them.
// Fields are optional because 10+ years of items (many migrated from Mantis) don't all carry them.

/** fieldtec-web's header on every document. */
export interface SystemHeader {
  systemType?: string;
  templateId?: string;
  summaryName?: string;
  summaryDescription?: string;
  keyIds?: string[];
  versionId?: string;
  previousVersionId?: string;
  currentVersion?: boolean;
  deleted?: boolean;
  /** When this version was saved (the latest version's date on a current document). */
  createdDate?: string;
  /** Who saved this version. */
  createdBy?: string;
  /** When the document was first created. */
  documentCreatedDate?: string;
  documentCreatedBy?: string;
  serverUpdatedDate?: string;
}

export interface Doc {
  documentId: string;
  systemHeader?: SystemHeader;
  appTags?: string[];
  [field: string]: unknown;
}

/**
 * A link to another document as `sc-related-document` stores it: the id, the name, and the
 * "related fields" the template copies from the linked document (only those it has).
 */
export interface Ref {
  documentId: string;
  name: string;
  email?: string;
  indexNum?: number;
  isGlobalDefaultBool?: boolean;
  disableItemBool?: boolean;
  projectRel?: Ref[] | null;
  /** Set by the server on people links: whether they are a Reporter on the item's project. */
  isReporter?: boolean;
  /** People links that record when (createdByRel, updatedByRel). */
  date?: string;
  [field: string]: unknown;
}

/** How a project chooses its lookup values (status, type, …): set per lookup on the project. */
export type ProjectConfig = 'Global Default' | 'Project Specific' | 'Combined';

export const LOOKUP_KINDS = ['type', 'severity', 'priority', 'reproducibility', 'category', 'status', 'resolution', 'tag'] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

export interface Project extends Doc {
  inactiveBool?: boolean;
  indexNum?: number;
  configType?: ProjectConfig | '';
  configSeverity?: ProjectConfig | '';
  configPriority?: ProjectConfig | '';
  configReproducibility?: ProjectConfig | '';
  configCategory?: ProjectConfig | '';
  configStatus?: ProjectConfig | '';
  configResolution?: ProjectConfig | '';
  configTag?: ProjectConfig | '';
  operationalKeyRel?: Ref[];
  reporterKeyRel?: Ref[];
}

/** A lookup value: a status, type, severity, priority, reproducibility, category, resolution or tag. */
export interface LookupDoc extends Doc {
  indexNum?: number;
  /** Statuses: the swatch colour (e.g. "#bde5f2"). */
  color?: string;
  isGlobalDefaultBool?: boolean;
  /** Statuses: a closing status (Closed) that locks the item. */
  disableItemBool?: boolean;
  inactiveBool?: boolean;
  projectRel?: Ref[];
}

/** A note on an item (sc-note-comment). `detail` is markdown. */
export interface Note {
  dataId: string;
  detail: string;
  createdDate: string;
  createdBy?: { documentId: string; name: string };
  thumbsUp?: number;
  thumbsDown?: number;
  /** Replies (older items have them; the template has voting switched off). */
  comments?: Note[];
  [field: string]: unknown;
}

export type RelationshipType = 'Related' | 'Parent' | 'Child';

/** A link to another item, stored on both items (Parent on one is Child on the other). */
export interface Relationship {
  documentId: string;
  name?: string;
  itemId?: string;
  relationshipType?: RelationshipType;
  /** Migrated from Mantis and not matched to an item yet. */
  mantisIssueIdForMatch?: string;
}

/** An attached file (a fileReference); served at /api/getFile/<fileNo>. */
export interface Attachment {
  fileNo: string;
  fileName?: string;
  fileType?: string;
  basePath?: string;
  [field: string]: unknown;
}

/** One entry of the history migrated from Mantis (historyOldRel). */
export interface OldHistoryEntry {
  createdDate: string;
  user?: { name?: string; documentId?: string; email?: string };
  type?: { id?: number; name?: string };
  message?: string;
  change?: string;
  file?: { id?: number; filename?: string };
}

/** An SDMS item (bug, feature, change request, …): the Item template's fields. */
export interface Item extends Doc {
  /** The counter number the server assigns on create ("31492"). */
  itemRef?: string;
  /** itemRef padded to 7 digits ("0031492"); the server sets it. */
  itemId?: string;
  documentIdAlias?: string;
  summary?: string;
  projectRel?: Ref[];
  typeRel?: Ref[];
  severityRel?: Ref[];
  priorityRel?: Ref[];
  reproducibilityRel?: Ref[];
  categoryRel?: Ref[];
  tagsRel?: Ref[];
  statusRel?: Ref[];
  resolutionRel?: Ref[];
  reporterRel?: Ref[];
  assigneeRel?: Ref[];
  feedbackRel?: Ref[];
  monitoringRel?: Ref[];
  exampleLink?: string;
  environmentText?: string;
  browserVersion?: string;
  coreVersion?: string;
  componentVersion?: string;
  description?: string;
  reproduction?: string;
  additionalInformation?: string;
  documentationMD?: string;
  fileAttachArr?: Attachment[];
  relationshipsRel?: Relationship[];
  /** The AI-written snapshot of the item (read-only here). */
  summaryDescription?: string;
  progressNote?: string;
  /** "Disable AI override": the progress note was written by a person. */
  userProgressNoteBool?: boolean;
  /** "Pending Snapshot Update": content changed since the snapshot was written. */
  pendingNewSummaryDescriptionBool?: boolean | null;
  notesCommentsArr?: Note[];
  createdByRel?: Ref[];
  createdDate?: string;
  updatedByRel?: Ref[];
  updatedDate?: string;
  historyOldRel?: OldHistoryEntry[];
}

/** A Formbird account, as /api/loggedUser returns it. */
export interface Account extends Doc {
  email?: string;
  inactiveBool?: boolean;
  /** Applications the account may use (SDMS is one). */
  appRel?: Ref[];
  /** The SDMS projects the person works on, with their role on each ("Developer", "Reporter"). */
  sdmsProjectRel?: (Ref & { type?: string })[];
  /** Saved filters kept on the account before user configurations existed. */
  sdmsSavedFilters?: SavedFilter[];
}

/** A saved All Items filter: its name and the filter fields that were set. */
export interface SavedFilter {
  name: string;
  [field: string]: unknown;
}

/** A person's SDMS settings: email preferences and saved filters (vtn sdms.userConfiguration). */
export interface UserConfiguration extends Doc {
  accountRel?: Ref[];
  sdmsSavedFilters?: SavedFilter[];
  allowEmailBool?: boolean;
  [field: string]: unknown;
}

/** An email the server queued (vtn system.emailMessage); My View lists the SDMS ones sent to you. */
export interface EmailMessage extends Doc {
  to?: string[] | string;
  subject?: string;
  message?: string;
  status?: string;
  firstCreatedDate?: string;
}
