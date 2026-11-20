// What the SDMS demo database holds: its people, projects, lookup values and items. build.mjs turns
// this into documents shaped like internal-5's (the Item template's fields and links).
//
// Everything here is made up. In text, `@{key}` becomes an @mention of that person, as Formbird's
// form writes it ([@FirstLast](mailto:…)), and `#{ref}` a link to that item.

export const PASSWORD = 'Sdms1234!';

/** People. `projects` maps a project key to the role on it; `admin` gets an active SDMS Admin access. */
export const PEOPLE = [
  { key: 'hannah', first: 'Hannah', last: 'Cole', title: 'Product Manager', admin: true, projects: { platform: 'Developer', mobile: 'Developer', portal: 'Developer', website: 'Developer' } },
  { key: 'daniel', first: 'Daniel', last: 'Okafor', title: 'Senior Developer', projects: { platform: 'Developer', mobile: 'Developer', website: 'Developer' } },
  { key: 'mei', first: 'Mei', last: 'Lin', title: 'Developer', projects: { platform: 'Developer', portal: 'Developer' } },
  { key: 'ravi', first: 'Ravi', last: 'Patel', title: 'QA Engineer', projects: { platform: 'Developer', mobile: 'Developer', portal: 'Developer' } },
  { key: 'sam', first: 'Sam', last: 'Taylor', title: 'Support Lead', projects: { platform: 'Reporter', mobile: 'Reporter', portal: 'Reporter' } },
  { key: 'emma', first: 'Emma', last: 'Walsh', title: 'Customer Success (one project)', projects: { portal: 'Reporter' } },
];

export const emailOf = (p) => `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';

/**
 * Projects, with how each picks its lookup values (configType…): "Global Default" uses the global
 * values, "Project Specific" the project's own, "Combined" both.
 */
export const PROJECTS = [
  { key: 'platform', name: 'Field Platform', index: 10, config: { configCategory: 'Combined', configTag: 'Combined' } },
  { key: 'mobile', name: 'Field Mobile', index: 20, config: { configCategory: 'Project Specific' } },
  { key: 'portal', name: 'Customer Portal', index: 30, config: { configCategory: 'Combined' } },
  { key: 'website', name: 'Marketing Website', index: 40, inactive: true, config: {} },
];

/** Statuses (indexNum orders them; My View's board shows 10–59). Closed locks the item. */
export const STATUSES = [
  { name: 'New', index: 5, color: '#fcbdbd' },
  { name: 'Open', index: 15, color: '#e3b7eb' },
  { name: 'In Progress', index: 20, color: '#c2dfff' },
  { name: 'Feedback', index: 30, color: '#ffcd85' },
  { name: 'Ready for release', index: 40, color: '#fff494' },
  { name: 'Released awaiting test', index: 50, color: '#d2f5b0' },
  { name: 'Deferred', index: 60, color: '#e0e0e0' },
  { name: 'Resolved', index: 80, color: '#c9ccc4' },
  { name: 'Closed', index: 90, color: '#e8e8e8', locks: true },
];

/** The other lookups. A value with `project` belongs to that project only (not global). */
export const LOOKUPS = {
  type: ['Bug', 'Feature', 'Change Request', 'Documentation', 'Security', 'Suggestion', 'Release'],
  severity: ['Trivial', 'Minor', 'Major', 'Critical', 'Blocker'],
  priority: ['Low', 'Normal', 'High', 'Urgent', 'Immediate'],
  reproducibility: ['Always', 'Sometimes', 'Random', 'Unable to reproduce', 'Not applicable'],
  category: [
    'General', 'User interface', 'Performance',
    { name: 'API', project: 'platform' }, { name: 'Search', project: 'platform' }, { name: 'Rules engine', project: 'platform' },
    { name: 'Offline sync', project: 'mobile' }, { name: 'Camera and files', project: 'mobile' }, { name: 'Maps', project: 'mobile' },
    { name: 'Billing', project: 'portal' }, { name: 'Reports', project: 'portal' },
  ],
  resolution: ['Open', 'Fixed', "Won't fix", 'Duplicate', 'Not a bug', 'Unable to reproduce'],
  tag: ['regression', 'customer-reported', 'quick-win', 'needs-design', 'tech-debt', { name: 'release-blocker', project: 'platform' }],
};

/**
 * Items, newest number last. Fields: ref (its number), project, type, severity, priority, status,
 * reporter, assignee, created / updated (days ago), summary, description, and optionally repro,
 * category, tags, resolution, reproduction, info, env, feedback, monitors, notes ([person, days ago,
 * markdown]), progress (progress note), docs (documentation), links ([ref, relationship from this
 * item]), mantis (migrated history).
 */
export const ITEMS = [
  {
    ref: 1201, project: 'website', type: 'Bug', severity: 'Minor', priority: 'Normal', status: 'Closed', resolution: 'Fixed',
    reporter: 'sam', assignee: 'daniel', created: 410, updated: 380,
    summary: 'Contact form sends twice on slow connections',
    description: 'Customers on mobile data get two confirmation emails. The submit button stays enabled while the request is in flight.',
    reproduction: '1. Throttle the network to "Slow 3G"\n2. Fill in the contact form\n3. Press **Send** twice quickly',
    repro: 'Always', category: 'General', mantis: true,
    notes: [['daniel', 381, 'Button is disabled while sending now, and the server ignores a repeat within 10 s.']],
  },
  {
    ref: 1202, project: 'website', type: 'Change Request', severity: 'Trivial', priority: 'Low', status: 'Closed', resolution: "Won't fix",
    reporter: 'hannah', assignee: 'daniel', created: 400, updated: 300,
    summary: 'Move the pricing table above the fold',
    description: 'Marketing asked for the pricing table to show without scrolling on a 1366×768 screen.',
    notes: [['hannah', 300, 'The website is being replaced next quarter, closing this.']],
  },
  {
    ref: 1203, project: 'platform', type: 'Feature', severity: 'Major', priority: 'High', status: 'Closed', resolution: 'Fixed',
    reporter: 'hannah', assignee: 'mei', created: 220, updated: 150,
    summary: 'Saved searches on the document list',
    description: 'People keep rebuilding the same filters. Let them save a filter under a name and load it again.\n\n- Saved per person\n- Rename and delete\n- Shared between devices',
    category: 'Search', tags: ['customer-reported'], monitors: ['sam'],
    docs: '## Saved searches\n\nOpen **Filters**, set what you need, then **Save as…**. Your saved searches follow you to any device.',
    notes: [['mei', 160, 'Merged. Stored on the user configuration document.'], ['ravi', 151, 'Tested on Chrome, Firefox and Safari. Closing.']],
  },
  {
    ref: 1204, project: 'platform', type: 'Bug', severity: 'Critical', priority: 'Urgent', status: 'Closed', resolution: 'Fixed',
    reporter: 'sam', assignee: 'daniel', created: 200, updated: 190,
    summary: 'Server rules time out on documents with 500+ notes',
    description: 'PreSaveServer takes over 120 s on large documents and the save fails with a generic error.',
    category: 'Rules engine', tags: ['regression', 'customer-reported'], repro: 'Always', env: 'Production, v8.4.2', coreVersion: '8.4.2',
    notes: [['daniel', 195, 'The notes array was deep-cloned once per rule. Cloning once per save fixes it.']],
  },
  {
    ref: 1205, project: 'mobile', type: 'Bug', severity: 'Major', priority: 'High', status: 'Resolved', resolution: 'Fixed',
    reporter: 'sam', assignee: 'daniel', created: 120, updated: 20,
    summary: 'Photos taken offline are lost after the app restarts',
    description: 'If the app is closed before it syncs, photos attached while offline are gone when it reopens.',
    reproduction: '1. Turn on airplane mode\n2. Take two photos on an inspection\n3. Force-close the app\n4. Reopen it',
    category: 'Camera and files', repro: 'Always', env: 'Android 15, Pixel 8', browserVersion: 'App 5.2.0', tags: ['customer-reported'],
    notes: [
      ['daniel', 60, 'Photos were kept in memory until sync. They are written to the app storage straight away now.'],
      ['ravi', 21, 'Verified on Android and iOS. @{sam} can you let the customer know?'],
    ],
    links: [[1219, 'Related']],
  },
  {
    ref: 1206, project: 'portal', type: 'Feature', severity: 'Minor', priority: 'Normal', status: 'Resolved', resolution: 'Fixed',
    reporter: 'emma', assignee: 'mei', created: 95, updated: 12,
    summary: 'Download invoices as PDF',
    description: 'Customers want to download their invoices as PDF from the billing page, one at a time or a whole year.',
    category: 'Billing', tags: ['customer-reported'], monitors: ['hannah'],
    notes: [['mei', 13, 'Done: a PDF per invoice, and a zip for a year.']],
  },
  {
    ref: 1207, project: 'platform', type: 'Release', severity: 'Minor', priority: 'Normal', status: 'Released awaiting test',
    reporter: 'hannah', assignee: 'ravi', created: 30, updated: 2,
    summary: 'Release 8.6.0',
    description: 'Release 8.6.0 to staging. Contents: #{1210}, #{1212}, #{1215}.',
    progress: 'Deployed to staging on Monday. Ravi is running the regression suite.',
    links: [[1210, 'Parent'], [1212, 'Parent'], [1215, 'Parent']],
  },
  {
    ref: 1208, project: 'platform', type: 'Bug', severity: 'Major', priority: 'High', status: 'In Progress',
    reporter: 'sam', assignee: 'daniel', created: 18, updated: 1,
    summary: 'Search results miss documents saved in the last second',
    description: 'A document saved and then searched for straight away doesn\'t appear. Elasticsearch hasn\'t refreshed yet.',
    reproduction: '1. Create a document\n2. Open the list straight away\n3. The new document is missing until you reload',
    category: 'Search', repro: 'Sometimes', tags: ['customer-reported'], monitors: ['hannah', 'mei'],
    notes: [
      ['daniel', 10, 'Options: wait for the refresh on save (slower saves), or re-query the list a second later. Leaning towards the second.'],
      ['hannah', 9, 'Agreed, re-query. @{daniel} please keep the save fast.'],
    ],
    progress: 'Re-query after save is in review. Waiting on Mei for the list component change.',
  },
  {
    ref: 1209, project: 'platform', type: 'Feature', severity: 'Major', priority: 'Normal', status: 'Open',
    reporter: 'hannah', assignee: 'mei', created: 25, updated: 6,
    summary: 'Bulk update from the item list',
    description: 'Select several items and change their status, assignee or priority in one go. Each item still runs its server rules.',
    category: 'User interface', tags: ['needs-design'],
  },
  {
    ref: 1210, project: 'platform', type: 'Bug', severity: 'Minor', priority: 'Normal', status: 'Ready for release',
    reporter: 'ravi', assignee: 'mei', created: 40, updated: 5,
    summary: 'Date picker shows the wrong week start for Australian users',
    description: 'Weeks start on Sunday in the date picker. In Australia they should start on Monday.',
    category: 'User interface', repro: 'Always', tags: ['quick-win'],
    notes: [['mei', 6, 'Week start comes from the locale now.']],
    links: [[1207, 'Child']],
  },
  {
    ref: 1211, project: 'platform', type: 'Security', severity: 'Critical', priority: 'Immediate', status: 'In Progress',
    reporter: 'ravi', assignee: 'daniel', created: 4, updated: 0,
    summary: 'Password reset links stay valid after use',
    description: 'A password reset link can be used again until it expires. It should stop working once used.',
    category: 'API', repro: 'Always', tags: ['release-blocker'], monitors: ['hannah'],
    notes: [['daniel', 1, 'Fix is small: delete the reset document when the password changes. PR up today.']],
  },
  {
    ref: 1212, project: 'platform', type: 'Change Request', severity: 'Minor', priority: 'Normal', status: 'Ready for release',
    reporter: 'sam', assignee: 'daniel', created: 35, updated: 4,
    summary: 'Show who last changed a document on the list',
    description: 'Add an "Updated by" column to the document list, next to "Updated".',
    category: 'User interface', tags: ['quick-win'],
    links: [[1207, 'Child']],
  },
  {
    ref: 1213, project: 'platform', type: 'Bug', severity: 'Trivial', priority: 'Low', status: 'New',
    reporter: 'sam', created: 2, updated: 2,
    summary: 'Typo on the sign-in page: "Pasword"',
    description: 'The password field\'s placeholder reads "Pasword".',
    category: 'User interface', repro: 'Always', tags: ['quick-win'],
  },
  {
    ref: 1214, project: 'platform', type: 'Suggestion', severity: 'Minor', priority: 'Low', status: 'Deferred',
    reporter: 'mei', assignee: 'hannah', created: 150, updated: 70,
    summary: 'Dark mode for the admin screens',
    description: 'The rest of the app has a dark theme; the admin screens are still light only.',
    category: 'User interface', tags: ['needs-design'],
    notes: [['hannah', 70, 'Not this year. Revisit after the admin redesign.']],
  },
  {
    ref: 1215, project: 'platform', type: 'Bug', severity: 'Major', priority: 'High', status: 'Released awaiting test',
    reporter: 'sam', assignee: 'ravi', created: 28, updated: 3,
    summary: 'CSV export cuts off at 10,000 rows',
    description: 'Exporting a large list stops at 10,000 rows without warning.',
    category: 'API', repro: 'Always', tags: ['customer-reported', 'regression'], feedback: ['sam'],
    notes: [['daniel', 8, 'Export pages through the results now.'], ['ravi', 3, '@{sam} can you ask the customer to try on staging?']],
    links: [[1207, 'Child']],
  },
  {
    ref: 1216, project: 'platform', type: 'Documentation', severity: 'Minor', priority: 'Normal', status: 'Open',
    reporter: 'hannah', assignee: 'ravi', created: 14, updated: 7,
    summary: 'Document the server rule limits',
    description: 'Write down the time limit, the number of documents a rule may load, and what happens when it fails.',
    category: 'Rules engine',
  },
  {
    ref: 1217, project: 'platform', type: 'Bug', severity: 'Major', priority: 'Normal', status: 'Feedback',
    reporter: 'sam', assignee: 'daniel', created: 22, updated: 5, feedback: ['sam'],
    summary: 'Some users are signed out every few minutes',
    description: 'Two customers report being signed out several times an hour. Others on the same site are fine.',
    category: 'General', repro: 'Random', tags: ['customer-reported'],
    notes: [['daniel', 5, '@{sam} could you get their browser and whether they use more than one tab? Can\'t reproduce here.']],
  },
  {
    ref: 1218, project: 'mobile', type: 'Feature', severity: 'Major', priority: 'High', status: 'In Progress',
    reporter: 'hannah', assignee: 'daniel', created: 45, updated: 1,
    summary: 'Offline maps for remote sites',
    description: 'Field staff lose the map without signal. Let them download a site\'s map area before they leave.',
    category: 'Maps', tags: ['customer-reported'], monitors: ['sam', 'ravi'],
    progress: 'Tile download and storage done. Working on the "which areas are downloaded" screen.',
    links: [[1220, 'Parent']],
  },
  {
    ref: 1219, project: 'mobile', type: 'Bug', severity: 'Critical', priority: 'Urgent', status: 'Open',
    reporter: 'sam', assignee: 'daniel', created: 6, updated: 3,
    summary: 'Sync stops after a document fails to save',
    description: 'When one queued document is refused by the server, nothing after it syncs. The queue should skip it and report it.',
    category: 'Offline sync', repro: 'Always', env: 'iOS 19, iPhone 15', browserVersion: 'App 5.3.1', tags: ['regression', 'customer-reported'], monitors: ['hannah'],
    links: [[1205, 'Related']],
  },
  {
    ref: 1220, project: 'mobile', type: 'Change Request', severity: 'Minor', priority: 'Normal', status: 'Open',
    reporter: 'ravi', assignee: 'ravi', created: 40, updated: 15,
    summary: 'Show download progress for offline maps',
    description: 'A progress bar and the size left while a map area downloads.',
    category: 'Maps',
    links: [[1218, 'Child']],
  },
  {
    ref: 1221, project: 'mobile', type: 'Bug', severity: 'Minor', priority: 'Low', status: 'New',
    reporter: 'ravi', created: 1, updated: 1,
    summary: 'Camera opens rotated on some tablets',
    description: 'On a Galaxy Tab S9 in landscape, the camera preview is rotated 90°.',
    category: 'Camera and files', repro: 'Always', env: 'Android 14, Galaxy Tab S9',
  },
  {
    ref: 1222, project: 'mobile', type: 'Suggestion', severity: 'Trivial', priority: 'Low', status: 'Deferred',
    reporter: 'sam', assignee: 'hannah', created: 90, updated: 50,
    summary: 'Vibrate when a scan succeeds',
    description: 'A short vibration when a barcode is read, so people don\'t have to look at the screen.',
    category: 'Camera and files',
  },
  {
    ref: 1223, project: 'mobile', type: 'Bug', severity: 'Major', priority: 'High', status: 'Closed', resolution: 'Duplicate',
    reporter: 'sam', assignee: 'daniel', created: 125, updated: 118,
    summary: 'Attachments missing after reinstall',
    description: 'Same as #{1205}.',
    category: 'Camera and files',
    notes: [['daniel', 118, 'Duplicate of #{1205}, following up there.']],
    links: [[1205, 'Related']],
  },
  {
    ref: 1224, project: 'portal', type: 'Bug', severity: 'Major', priority: 'High', status: 'Open',
    reporter: 'emma', assignee: 'mei', created: 9, updated: 2,
    summary: 'Usage report totals don\'t match the invoice',
    description: 'The monthly usage report shows 412 active users; the invoice for the same month charges for 418.',
    category: 'Reports', repro: 'Always', tags: ['customer-reported'], monitors: ['hannah', 'sam'],
    notes: [
      ['mei', 4, 'The report counts users active at month end; billing counts anyone active during the month. Which one is right?'],
      ['hannah', 2, 'Billing is right. The report should match it. @{emma} FYI.'],
    ],
  },
  {
    ref: 1225, project: 'portal', type: 'Feature', severity: 'Minor', priority: 'Normal', status: 'Feedback',
    reporter: 'emma', assignee: 'hannah', created: 20, updated: 8, feedback: ['emma'],
    summary: 'Let customers add their own billing contacts',
    description: 'Today support adds billing contacts by hand. Customers should manage them on the billing page.',
    category: 'Billing', tags: ['needs-design'],
    notes: [['hannah', 8, '@{emma} do customers need more than one billing contact, and should each get every invoice?']],
  },
  {
    ref: 1226, project: 'portal', type: 'Bug', severity: 'Minor', priority: 'Normal', status: 'In Progress',
    reporter: 'ravi', assignee: 'mei', created: 11, updated: 1,
    summary: 'Billing page is slow for customers with 5+ years of invoices',
    description: 'The billing page loads every invoice at once. It takes 8 s for the oldest customers.',
    category: 'Performance', repro: 'Always',
    progress: 'Paging the invoice list, 24 at a time.',
  },
  {
    ref: 1227, project: 'portal', type: 'Change Request', severity: 'Trivial', priority: 'Low', status: 'New',
    reporter: 'emma', created: 3, updated: 3,
    summary: 'Show the account manager\'s name on the dashboard',
    description: 'Customers often ask who their account manager is. Show it on the dashboard with a contact link.',
    category: 'General',
  },
  {
    ref: 1228, project: 'platform', type: 'Bug', severity: 'Minor', priority: 'Normal', status: 'Open',
    reporter: 'sam', created: 8, updated: 8,
    summary: 'Long document names overflow the breadcrumb',
    description: 'Names over ~80 characters push the breadcrumb off the screen on a laptop.',
    category: 'User interface', repro: 'Always',
  },
  {
    ref: 1229, project: 'platform', type: 'Feature', severity: 'Major', priority: 'High', status: 'Open',
    reporter: 'hannah', created: 12, updated: 12,
    summary: 'Audit log export for compliance',
    description: 'Customers in regulated industries need to export who changed what, for a date range, as CSV.',
    category: 'API', tags: ['customer-reported'],
  },
  {
    ref: 1230, project: 'platform', type: 'Bug', severity: 'Major', priority: 'High', status: 'Resolved', resolution: 'Fixed',
    reporter: 'ravi', assignee: 'daniel', created: 50, updated: 25,
    summary: 'Rule errors show a generic "Error updating document"',
    description: 'When a server rule refuses a save, the person sees "Error updating document" instead of the rule\'s message.',
    category: 'Rules engine',
    notes: [['daniel', 25, 'The rule\'s message is passed through now.']],
  },
  {
    ref: 1231, project: 'platform', type: 'Change Request', severity: 'Minor', priority: 'Normal', status: 'Feedback',
    reporter: 'mei', assignee: 'hannah', created: 16, updated: 9, feedback: ['hannah'],
    summary: 'Default the list page size to 50',
    description: 'Most people change it from 25 to 50 straight away.',
    category: 'User interface', tags: ['quick-win'],
    notes: [['mei', 9, '@{hannah} OK to change the default for everyone?']],
  },
  {
    ref: 1232, project: 'platform', type: 'Bug', severity: 'Minor', priority: 'Low', status: 'Open',
    reporter: 'ravi', assignee: 'ravi', created: 30, updated: 18,
    summary: 'Flaky end-to-end test: "upload a large file"',
    description: 'Fails about one run in ten on CI with a timeout.',
    category: 'General', tags: ['tech-debt'],
  },
  {
    ref: 1233, project: 'mobile', type: 'Feature', severity: 'Minor', priority: 'Normal', status: 'Ready for release',
    reporter: 'hannah', assignee: 'daniel', created: 33, updated: 6,
    summary: 'Sign in with a QR code from the web app',
    description: 'Show a QR code in the web app that signs the mobile app in, so people don\'t type passwords on a phone.',
    category: 'General', tags: ['customer-reported'],
  },
  {
    ref: 1234, project: 'portal', type: 'Documentation', severity: 'Trivial', priority: 'Low', status: 'Open',
    reporter: 'emma', assignee: 'mei', created: 26, updated: 19,
    summary: 'Help page for the usage report',
    description: 'Explain what each column of the usage report counts.',
    category: 'Reports',
  },
  {
    ref: 1235, project: 'platform', type: 'Security', severity: 'Major', priority: 'High', status: 'Open',
    reporter: 'ravi', assignee: 'mei', created: 5, updated: 4,
    summary: 'Rate limit sign-in attempts per account',
    description: 'Sign-in is rate limited per IP only. Add a per-account limit with a short lock-out.',
    category: 'API', tags: ['release-blocker'], monitors: ['hannah', 'daniel'],
  },
];
