
# SMART BETON DASHBOARD
# COMPLETE MASTER BUILD PROMPT FOR OPENAI CODEX
# Windows Desktop Application — Full Product Implementation

You are acting as an autonomous senior software engineering team consisting of:

- Principal Software Architect
- Senior Tauri 2 / Rust Developer
- Senior React / TypeScript Developer
- Senior Windows Desktop Engineer
- Senior SQLite Database Engineer
- Application Security Engineer
- Senior UI/UX Designer
- Design Systems Engineer
- QA and Test Automation Engineer
- Windows Release and Packaging Engineer

YOUR MISSION:

Design, implement, test, build, and deliver a complete, professional Windows desktop application named:

"Smart Beton Dashboard"

Persian name:
"داشبورد اسمارت بتن"

The application must be a real, usable Windows desktop application.

It must NOT be:
- A website pretending to be a desktop app
- A static dashboard
- A Figma-style prototype
- A collection of disconnected mockups
- A landing page
- A frontend without working data persistence
- A project containing mostly TODO placeholders

The final application must have actual functionality, persistent storage, native Windows integrations, proper error handling, both light and dark themes, and the ability to produce a Windows EXE installer.

Work directly in the current project directory.

Do not stop at planning.

Implement the application.

============================================================
SECTION 1 — PRODUCT IDENTITY
============================================================

Application name:
Smart Beton Dashboard

Persian display name:
داشبورد اسمارت بتن

Internal project name:
smart-beton-dashboard

Suggested bundle identifier:
com.smartbeton.dashboard

Application type:
Personal internal Windows developer productivity dashboard.

Primary platform:
Windows 11 x64

Secondary supported platform:
Windows 10 x64 where compatible.

Primary user:
A developer working at Smart Beton.

Smart Beton builds software, control panels, monitoring dashboards, and automation systems for concrete production factories.

The user develops and maintains multiple software projects.

Primary development tools:

- Visual Studio Code
- Claude Code
- OpenAI Codex
- Antigravity
- Windows Terminal
- Git
- Web browsers

The user also works with:

- Local software repositories
- Remote servers
- SSH connections
- RDP connections
- AnyDesk
- Website administration panels
- Database endpoints
- Development environments
- API endpoints
- Project documentation
- Notes and personal ideas
- Website usernames and passwords
- Server credentials
- Reusable development commands

Most projects are located inside a main Windows folder named:

Smart Beton

This folder may contain nested projects, repositories, monorepos, and other directories.

The actual path is unknown.

The application must let the user choose the folder through a native directory picker.

Never hardcode an assumed project directory.

The application is for personal use within a company.

It is NOT intended to manage factory production directly.

Do not implement industrial PLC control, machinery control, or production commands.

Do not connect to company infrastructure without explicit user action.

The application must operate locally by default.

No mandatory accounts.
No mandatory cloud backend.
No mandatory internet connection for core functionality.
No telemetry by default.
No analytics data sent to external servers.

============================================================
SECTION 2 — NON-NEGOTIABLE SUCCESS CRITERIA
============================================================

The finished application must:

1. Launch as a native Windows desktop application.

2. Closely match the supplied dashboard reference image.

3. Support a complete monochrome light theme.

4. Support a complete monochrome dark theme.

5. Display the original Smart Beton company logo.

6. Support Persian and English.

7. Correctly handle RTL and LTR content.

8. Contain all nine application sections.

9. Store ordinary application data persistently in SQLite.

10. Discover and organize development projects.

11. Launch supported development tools in project directories.

12. Provide complete personal note-taking functionality.

13. Support note categories, tags, search, and project linking.

14. Provide a secure credential vault.

15. Support website logins, AnyDesk credentials, server credentials, and secure notes.

16. Provide a server and connection directory.

17. Support personal task management.

18. Support project working sessions and continuation notes.

19. Support reusable terminal commands.

20. Support configurable manual automations.

21. Provide global search and a command palette.

22. Support Windows system tray and keyboard shortcuts.

23. Include application settings and appropriate backup facilities.

24. Include meaningful automated tests.

25. Build into a Windows executable and NSIS Setup EXE.

26. Include clear developer and security documentation.

27. Work with real persistent data rather than fabricated dashboard statistics.

28. Handle errors and missing external tools gracefully.

29. Follow Windows desktop interaction conventions.

30. Remain modular and maintainable.

Every visible interactive control must either perform its advertised action or be explicitly disabled with a clear explanation.

Do not create decorative buttons that appear functional but do nothing.

============================================================
SECTION 3 — DESIGN REFERENCE FILES
============================================================

Two image files are provided in:

design/references/dashboard-reference.png
design/references/smart-beton-logo.png

Inspect BOTH files before implementing the visual design.

The dashboard-reference.png image is the PRIMARY UI DESIGN REFERENCE.

The smart-beton-logo.png image is the official company branding reference.

If the files are not present, search the project workspace for the provided image assets.

If they still cannot be located:

- Continue implementing the application.
- Preserve the design requirements below.
- Use a clearly identified temporary branding placeholder.
- Document that final visual verification requires the supplied files.
- Never invent a replacement company logo.

IMPORTANT DESIGN RULE:

The dashboard must look extremely close to the supplied iDraft-style reference image.

Use the image as a visual layout and styling reference.

Do not embed the screenshot as a static background to fake the UI.

Recreate the interface with actual React components and CSS.

All displayed data must remain interactive.

The visual reference takes priority over generic dashboard templates.

============================================================
SECTION 4 — EXACT VISUAL DESIGN DIRECTION
============================================================

Design language:

- Monochrome
- Minimal
- Soft glass
- Bento grid
- Premium desktop dashboard
- Rounded cards
- Subtle shadows
- Gentle translucency
- Neutral grayscale
- High-quality typography
- Carefully controlled spacing

The supplied screenshot contains:

- A large rounded application container
- A soft gray abstract background
- A floating white left sidebar
- A top header with a greeting
- A black rounded statistics card
- White and translucent analytics cards
- Smooth line charts
- Circular progress visualization
- Compact personal task cards
- Floating contextual menus
- Small pill-shaped controls
- Recent project cards
- Soft borders
- Large rounded corners
- Balanced negative space

Reproduce these characteristics faithfully.

Do not turn this into a typical rectangular enterprise admin dashboard.

Do not add unnecessary bright colors.

Do not use blue gradients, purple gradients, neon accents, or colorful charts.

Do not use random stock illustrations.

The application should feel like an elegant desktop productivity tool, not a factory SCADA interface.

============================================================
SECTION 5 — BRANDING AND MONOCHROME RULES
============================================================

The supplied Smart Beton logo contains:

- Deep navy blue
- Red
- Concrete gray

Use the actual supplied logo asset.

The original logo must remain in its authentic colors.

The rest of the UI should be almost entirely monochrome.

Use:

- Black
- White
- Charcoal
- Warm or neutral gray
- Neutral borders
- Grayscale charts

Brand blue and red must NOT become general-purpose UI accent colors.

The original colorful logo is the primary allowed exception.

If a status requires a warning or danger treatment, prioritize accessible icons and descriptive text.

A restrained red warning can be used where genuinely necessary for safety, but do not introduce decorative color.

Create an appropriate simplified application icon derived from the supplied brand symbol.

Do not distort the logo.

Do not replace the company logo with a generic icon.

Do not invent brand typography.

Use the original logo in:

- Application branding
- About screen
- Onboarding
- Windows executable icon where appropriate
- Installer branding

If the original logo includes transparent regions, handle them correctly.

============================================================
SECTION 6 — LIGHT THEME
============================================================

Light mode should be the DEFAULT because it most closely matches the reference screenshot.

Suggested design tokens:

--bg-main: #EAEAEA
--bg-canvas: #F0F0F0
--bg-sidebar: #FFFFFF
--bg-card: #FFFFFF
--bg-card-soft: #F5F5F5
--bg-card-dark: #242424
--bg-hover: #EBEBEB
--text-primary: #202020
--text-secondary: #737373
--text-muted: #9A9A9A
--border: #E2E2E2
--border-strong: #D3D3D3
--button-primary: #242424
--button-primary-text: #FFFFFF

Use these as starting points, not immutable constants.

Refine the values against the provided screenshot.

The light theme should contain:

- Soft light-gray main background
- White floating sidebar
- Black primary statistics card
- White task cards
- Light translucent analytics cards
- Dark text
- Neutral gray charts
- Black pill-shaped primary buttons

Use subtle shadows.

Avoid heavy black shadows.

============================================================
SECTION 7 — DARK THEME
============================================================

Create a fully designed dark equivalent.

Do not simply apply CSS invert().

Suggested tokens:

--bg-main: #101012
--bg-canvas: #151517
--bg-sidebar: #1A1A1D
--bg-card: #242427
--bg-card-soft: #2B2B2F
--bg-card-highlight: #E8E8E8
--bg-hover: #313135
--text-primary: #F5F5F5
--text-secondary: #AAAAAA
--text-muted: #858585
--border: #303034
--border-strong: #414146
--button-primary: #F2F2F2
--button-primary-text: #171717

The dark theme should preserve the same layout, proportions, hierarchy, and spacing.

Use inverted contrast strategically.

For example:

In light mode, the main statistics card is nearly black.

In dark mode, it can become a light-gray highlighted card with dark text.

The purpose is to preserve the strong visual contrast of the original screenshot.

Support theme options:

- Light
- Dark
- Follow Windows

Persist the selection.

Avoid visible flashes of the wrong theme during startup.

============================================================
SECTION 8 — TYPOGRAPHY AND LAYOUT
============================================================

Use:

Persian:
Vazirmatn

English:
Inter or Manrope

Code, paths, IPs, ports, terminal commands:
JetBrains Mono or a suitable monospace fallback

Bundle fonts appropriately if licensing permits.

Do not depend on remote font-loading services.

Design baseline:

1440 x 900 desktop window.

Support smaller windows gracefully.

Suggested minimum window size:
1000 x 680

Layout:

- Left sidebar
- Main dashboard content
- Header across the main workspace
- Spacious but efficient Bento grid
- Floating cards
- Rounded outer container

IMPORTANT:

The supplied screenshot has the sidebar on the LEFT.

Keep the sidebar on the left even when Persian is selected to preserve the intended visual design.

Persian text inside components must render RTL.

English identifiers, technical values, source code, paths, URLs, and IP addresses must render LTR.

Do not allow Unicode bidi behavior to corrupt technical strings.

Use proper language and direction attributes.

Avoid unnecessary horizontal scrolling.

Use scrollable content regions.

Make the sidebar collapsible.

============================================================
SECTION 9 — COMPONENT DESIGN SYSTEM
============================================================

Create reusable components.

Required components include:

AppShell
AppSidebar
SidebarSection
SidebarNavItem
Topbar
WindowControls
GlobalSearchTrigger
ThemeToggle
LanguageSwitcher
UserMenu
BentoGrid
MetricCard
SummaryCard
ChartCard
ProjectCard
TaskCard
NoteCard
CredentialCard
ServerCard
SectionHeader
FilterToolbar
SearchInput
EmptyState
LoadingSkeleton
StatusIndicator
ConfirmDialog
FormDialog
ContextMenu
DropdownMenu
CommandPalette
ToastNotification
QuickCaptureDialog
MarkdownEditor
CategorySelector
TagSelector
ProjectSelector
CredentialRevealField
SafeCopyButton
WorkingSessionPanel
AutomationActionEditor
SettingsPanel

Use consistent:

- Border radius
- Shadows
- Internal spacing
- Typography
- Focus states
- Hover states
- Button sizes
- Form field heights
- Tooltip styling
- Modal positioning
- Card padding

Suggested values:

Outer container radius: 36–42px
Major cards: 24–28px
Small cards: 16–20px
Buttons: pill or 12–16px radius
Standard spacing scale: 4px increments

Use CSS variables for design tokens.

Avoid repeating random hardcoded colors throughout components.

Respect reduced-motion accessibility settings.

Ensure adequate contrast for text.

============================================================
SECTION 10 — MAIN NAVIGATION
============================================================

The application contains NINE main sections:

1. Dashboard
2. Projects
3. Notes
4. Secure Vault
5. Servers & Connections
6. My Tasks
7. Automations
8. Developer Tools & Commands
9. Settings

Persian labels:

1. داشبورد
2. پروژه‌ها
3. یادداشت‌ها
4. خزانه امن
5. سرورها و اتصالات
6. کارهای من
7. اتوماسیون
8. ابزارها و دستورات
9. تنظیمات

Group sidebar entries thoughtfully.

Suggested grouping:

WORKSPACE
- Dashboard
- Projects
- Notes
- My Tasks

INFRASTRUCTURE
- Secure Vault
- Servers & Connections

PRODUCTIVITY
- Automations
- Developer Tools & Commands

SYSTEM
- Settings

The sidebar should visually resemble the reference image.

Use restrained section labels.

The active item should be a dark rounded pill in light mode.

Use an appropriate reversed/high-contrast active state in dark mode.

Include company branding at the top.

Settings should be positioned near the bottom when space permits.

If the window height is limited, keep navigation scrollable without clipping.

============================================================
SECTION 11 — DASHBOARD HOME PAGE
============================================================

THIS PAGE MUST BE THE CLOSEST MATCH TO THE REFERENCE IMAGE.

Reproduce the reference layout with REAL Smart Beton functionality.

TOP HEADER:

- Greeting
- Configurable display name
- Current date
- Create button
- Search button
- Notification button
- Profile/settings control

Do not use the person's name appearing in the sample screenshot.

The greeting should be generic until the user enters a preferred display name.

Example:
"سلام، خوش اومدی!"

TOP BENTO ROW:

CARD 1 — OVERALL INFORMATION

A prominent black card in light mode.

Show real counts:

- Total projects
- Active projects
- Open tasks
- Completed tasks
- Registered servers

Use large typography.

Use compact internal metric tiles.

Show a small completion indicator when meaningful.

Do not invent statistics.

CARD 2 — WEEKLY PROGRESS

A monochrome line chart.

Show actual task activity for the current week.

Potential series:

- Tasks completed
- Tasks created

Use a clearly labeled legend.

Use meaningful dates.

Use real database queries.

If insufficient history exists, show an elegant empty state.

Do not fabricate chart data.

CARD 3 — MONTHLY PROGRESS

A circular progress chart inspired by the reference.

Display:

- Monthly task completion
- Completed versus planned tasks

Calculate percentages only when the denominator is meaningful.

Handle zero values correctly.

SECOND BENTO ROW:

CARD 4 — MONTH GOALS

A larger goals/checklist card.

Support:

- Create goal
- Edit goal
- Complete goal
- Remove goal
- Due date
- Project association

Goals can be implemented as an appropriately distinguished type of task.

CARD 5 — TASKS IN PROCESS

Show compact floating task cards.

Each card should include:

- Title
- Project
- Priority
- Due date
- Completion action
- Context menu

Support pinning relevant tasks.

Include an Add Task card matching the dotted-outline reference design.

BOTTOM ROW:

RECENT PROJECTS

Show a horizontal or responsive grid of recent project cards.

Use darker project cards similar to the reference.

Each card should show:

- Project name
- Short description
- Current status
- Last opened date
- Relevant next action

Provide quick launch actions.

OTHER DASHBOARD ELEMENTS:

- Pinned notes
- Recent ideas
- Quick actions
- Recently used workflows

Do not overcrowd the initial viewport.

Additional widgets can be lower on the page or user-configurable.

Allow the user to reorder or hide optional widgets if feasible.

Implement real loading, empty and error states.

============================================================
SECTION 12 — PROJECT MANAGEMENT
============================================================

Create a complete project management module.

The user chooses one or more local project roots.

During onboarding, ask for the Smart Beton directory.

Use a native Windows directory picker.

Never infer the root folder path.

Store project root configuration locally.

PROJECT DISCOVERY:

Implement a safe scanner.

Recognize common development projects using:

.git
package.json
pnpm-workspace.yaml
Cargo.toml
pyproject.toml
requirements.txt
go.mod
composer.json
.sln
.csproj
pom.xml
build.gradle
Dockerfile
compose.yaml
docker-compose.yml

Support:

- Nested projects
- Git repositories
- Monorepos
- Projects without Git
- Manual project creation
- Multiple project roots
- Project grouping
- Project archiving
- Project favorites

Excluded directories should include:

node_modules
.git/objects
dist
build
target
.venv
venv
.next
coverage
.cache
Other configurable exclusions

Do not recursively follow symlinks outside approved roots.

Bound scan depth and resource usage.

Do not open or read sensitive files such as .env merely to identify projects.

Show discovered projects in a review screen before importing.

Allow user corrections.

PROJECT LIST:

Support:

- Grid view
- List view
- Search
- Sorting
- Favorite filter
- Active/archive filter
- Technology tags
- Recent projects
- Manual project addition

PROJECT MODEL:

id
name
description
local_path
project_root_id
parent_project_id
status
preferred_editor
technology_tags
is_favorite
is_archived
created_at
updated_at
last_opened_at

Support stable IDs rather than using paths as database primary keys.

PROJECT DETAIL PAGE:

Build these subtabs:

1. Overview
2. Notes
3. Tasks
4. Servers
5. Credentials
6. Commands
7. Activity

Also include project bookmarks and workflow shortcuts in the overview.

OVERVIEW:

- Name
- Description
- Path
- Technologies
- Repository information
- Favorite status
- Last session
- Next action
- Related notes
- Related tasks
- Associated servers

PROJECT ACTIONS:

Open Folder
Open in VS Code
Open Claude Code
Open Codex
Open Antigravity
Open Terminal
Copy Path
Open Project Website
Start Session
End Session

Allow configuring the preferred editor for each project.

Tool launch behavior must use installed and verified commands.

Do not assume all tools support the same CLI syntax.

CLAUDE CODE:

Detect a valid installed CLI.

Launch inside a terminal with the correct project working directory.

CODEX:

Detect a valid Codex CLI.

Launch in the selected project working directory.

ANTIGRAVITY:

Support detecting its executable where practical.

Provide manual executable-path configuration.

Do not invent unsupported CLI arguments.

VS CODE:

Support the official executable and verified command-line integration.

PROJECT WORKSPACE PROFILES:

Allow saving a workspace profile for each project.

Examples:

Development
Debugging
Deployment Preparation

A profile can contain approved actions such as:

- Open project folder
- Launch editor
- Launch terminal
- Open documentation URL
- Display project notes
- Display tasks

Do not run deployment commands automatically.

============================================================
SECTION 13 — PERSONAL NOTES SYSTEM
============================================================

Implement a complete notes module.

Notes are one of the most important features.

The user wants to store:

- Personal ideas
- Development notes
- Troubleshooting instructions
- Technical explanations
- Project documentation
- Reusable code snippets
- Research notes
- Meeting notes
- Important non-sensitive information
- Project decisions
- Personal reminders
- Checklists
- Links and references

NOTES UI:

Use a professional three-pane layout.

Pane 1:
Categories and filters

Pane 2:
Note list

Pane 3:
Note editor

Allow resizing panes if practical.

The editor should get the most space.

NOTES FEATURES:

- Create note
- Edit note
- Autosave
- Manual save feedback
- Delete note
- Trash
- Restore note
- Archive
- Pin
- Favorite
- Duplicate
- Copy content
- Markdown editor
- Markdown preview
- Checklist support
- Code blocks
- Syntax highlighting
- Headings
- Lists
- Hyperlinks
- Tags
- Categories
- Related project
- Search
- Sort by date
- Filter by category
- Filter by tag
- Filter by project

Use a reliable Markdown editor.

CodeMirror 6 is a good candidate.

Avoid bloated rich-text systems that make Markdown persistence unreliable.

Store Markdown as text in SQLite.

Render Markdown safely.

Sanitize rendered content.

Do not allow arbitrary script execution from Markdown.

CATEGORY SYSTEM:

Support custom categories.

Suggested initial categories:

Personal
Ideas
Development
Smart Beton
Projects
Tutorials
Important
Troubleshooting
Reference
Miscellaneous

Persian display labels should be provided.

Allow:

- Create category
- Rename category
- Delete category
- Reassign notes
- Optional nested categories

TAGS:

Notes can have multiple tags.

Use a normalized many-to-many relationship.

QUICK CAPTURE:

Implement a globally accessible quick-note dialog.

The user should be able to:

1. Press a configured shortcut.
2. Type a note or idea.
3. Optionally select a project/category.
4. Save.
5. Return to the previous application.

Avoid interrupting the current workflow.

IDEA INBOX:

Provide a special filter for uncategorized ideas.

The user can quickly capture ideas and organize them later.

NOTE TEMPLATES:

Provide simple templates:

- Blank Note
- Idea
- Bug Investigation
- Technical Documentation
- Meeting Note
- Project Decision
- Checklist

PROJECT LINKING:

Allow selecting related projects.

From the project detail page, show associated notes.

From a note, allow opening the associated project.

NOTE TO TASK:

Support converting a note or selected note content into a task.

If an advanced selection conversion is difficult, implement a reliable whole-note-to-task action.

IMPORTANT SECURITY RULE:

Ordinary notes must NOT be presented as a safe place for passwords, API keys, private keys, or sensitive credentials.

Provide an easy Create Secure Note action that opens the Secure Vault.

============================================================
SECTION 14 — SECURE VAULT
============================================================

Implement a dedicated Secure Vault.

This is a critical feature.

The user needs to manage authorized credentials for:

- Websites
- Company panels
- AnyDesk
- SSH
- Servers
- Databases
- APIs
- Development services

SECURE VAULT ITEM TYPES:

1. Website Login
2. AnyDesk Credential
3. Server Credential
4. Database Credential
5. API Token
6. Secure Note
7. Custom Credential

WEBSITE LOGIN:

display_name
website_url
username
secret_reference
category_id
tags
project_links
description

ANYDESK CREDENTIAL:

display_name
device_alias
anydesk_address
secret_reference
category_id
project_links
description

SERVER CREDENTIAL:

display_name
hostname
port
username
authentication_type
secret_reference
ssh_key_reference
project_links

DATABASE CREDENTIAL:

display_name
database_type
hostname
port
database_name
username
secret_reference
project_links

API TOKEN:

display_name
service_name
account_label
secret_reference
expiry_date
project_links

SECURE NOTE:

title
encrypted_body
category_id
project_links
created_at
updated_at

VAULT UI:

Create a clean card/list-based interface matching the monochrome design system.

Support:

- Add
- Edit
- Delete
- Categorize
- Search non-secret metadata
- Filter
- Favorite
- Link to project
- Copy username
- Copy password
- Reveal password
- Hide password
- Copy AnyDesk ID
- Open related URL
- View linked server

Passwords must remain masked by default.

Do not automatically reveal secrets when opening an item.

Do not automatically paste passwords into another program.

Do not expose stored secrets to automated AI features.

SECURITY ARCHITECTURE:

Use a native Windows credential backend for individual credentials.

A vetted Windows Credential Manager integration is preferred.

Use opaque credential references in SQLite.

For secure freeform notes, use vetted Windows DPAPI user-scoped encryption or a properly designed authenticated encrypted storage mechanism.

Do not create custom cryptographic algorithms.

Do not store sensitive fields in plaintext SQLite columns.

Do not index decrypted secret content.

Do not put secrets in browser localStorage.

Do not put secrets in configuration JSON.

Do not include secrets in console logs.

Do not expose secrets in error traces.

Do not include secrets in crash reports.

Do not put secrets in command-line arguments.

Avoid sending secrets to the frontend unless explicitly needed for a user-triggered reveal or copy action.

Clear sensitive frontend form state after use.

Use minimal Tauri IPC permissions.

Use parameterized database queries.

Use a clear credential-store interface with Windows-specific implementation.

A mock backend may exist ONLY for tests.

Never use mock or plaintext fallback storage in production.

VAULT LOCK:

Support an automatic interface lock option.

Explain that Windows user-scoped credential protection relies on the Windows account security boundary.

Do not claim that a cosmetic PIN provides independent cryptographic protection.

If stronger master-password protection is introduced, use a properly designed encrypted vault with established cryptographic libraries.

CLIPBOARD:

Support copy-to-clipboard for authorized user actions.

Offer an optional sensitive clipboard timeout.

Only clear a copied value if the clipboard still contains that same value.

Never overwrite newer unrelated clipboard contents.

Do not claim clipboard history can always be erased.

BACKUP:

Document that Windows DPAPI-protected data can be tied to the Windows user context.

A regular SQLite backup is not sufficient to guarantee secret recovery on another machine.

Implement safe non-secret metadata backups.

If portable vault backup is implemented:

- Use established authenticated encryption.
- Require a strong user-provided passphrase.
- Use an appropriate memory-hard KDF such as Argon2id.
- Generate salts and nonces securely.
- Verify authenticity before importing.
- Never export plaintext by default.
- Test the entire recovery workflow.

If a safe portable secret-backup implementation cannot be completed, disable that option and document the limitation.

Never silently downgrade to insecure storage.

============================================================
SECTION 15 — SERVERS AND CONNECTIONS
============================================================

Build a server and remote-connection directory.

This module stores connection metadata.

Credentials remain in the Secure Vault.

SUPPORTED CONNECTION TYPES:

SSH
RDP
AnyDesk
Web Panel
Database
Local Development Service

SERVER FIELDS:

id
display_name
hostname_or_ip
port
connection_type
username
environment
description
website_url
credential_reference
created_at
updated_at

Support many-to-many project associations.

ENVIRONMENTS:

Local
Development
Testing
Staging
Production

SERVER UI:

- Searchable list
- Server cards
- Project filters
- Environment filters
- Connection type filters
- Add/edit/delete
- Copy address
- Copy username
- Open associated panel
- Open related project
- View related credential reference
- View connection instructions

SSH:

Use the installed Windows OpenSSH client.

Build process arguments safely.

Preserve normal SSH host key verification.

Never disable host key verification automatically.

Do not store server passwords in SSH commands.

RDP:

Support launching the Windows Remote Desktop client using safely validated connection parameters.

ANYDESK:

Support opening the installed AnyDesk application.

Support copying the authorized device address.

Only use documented or user-verified invocation arguments.

Never pass a stored password to AnyDesk through command-line arguments.

Do not implement hidden or unattended remote access.

WEB PANELS:

Open validated HTTP/HTTPS URLs in the default browser.

DATABASE ENDPOINTS:

Store connection metadata.

Allow launching a configured external database client where supported.

HEALTH CHECK:

Provide optional user-triggered connection checks where appropriate.

Avoid aggressive automatic polling.

Never run unapproved commands on production infrastructure.

============================================================
SECTION 16 — PERSONAL TASK MANAGEMENT
============================================================

Implement a personal task manager.

The purpose is to help the user remember and continue work.

It is not a multi-user company project management system.

TASK FIELDS:

id
title
description
status
priority
due_date
completed_at
project_id
created_at
updated_at
deleted_at

Support tags and linked notes.

TASK STATUSES:

Inbox
Todo
In Progress
Blocked
Done

PRIORITIES:

Low
Normal
High
Urgent

VIEWS:

- All Tasks
- Today
- Upcoming
- Overdue
- In Progress
- Completed
- By Project
- Kanban Board

FEATURES:

- Create
- Edit
- Delete
- Complete
- Reopen
- Set priority
- Set due date
- Set related project
- Add notes
- Add subtasks or checklist items
- Filter
- Search
- Sort
- Drag between Kanban columns

Implement task cards similar to the reference screenshot.

Support compact dashboard task cards.

Add task creation directly from project details.

REMINDERS:

Support reminders while the application is running.

Use native Windows notifications where appropriate and permitted.

When the app starts, show overdue reminders.

Do not claim reminders will execute while the application is closed unless a separately implemented and tested background scheduling mechanism exists.

============================================================
SECTION 17 — PROJECT WORKING SESSIONS
============================================================

Create a context-aware session system.

The goal is to remember where the user stopped working.

START SESSION:

When the user starts a project session:

- Record project
- Record start time
- Show previous session summary
- Show next pending action
- Show relevant tasks
- Offer project launch actions

END SESSION:

Ask:

1. What did you complete?
2. What is unfinished?
3. Are there unresolved problems?
4. What should you do next time?

Save the session.

Display the last session information when reopening a project.

Create a dashboard card:

"Continue Where You Left Off"

This should be one of the main productivity features.

Do not secretly inspect user activity.

Do not record keystrokes.

Do not capture screens.

Do not monitor unrelated windows.

Session data should be created or updated through explicit user interaction.

============================================================
SECTION 18 — DEVELOPER TOOLS
============================================================

Implement a Developer Tools section.

Support the tools the user actually uses:

- VS Code
- Claude Code
- Codex
- Antigravity
- Windows Terminal
- Git

Provide a configurable tool registry.

TOOL FIELDS:

id
name
type
executable_path
launch_mode
supported_arguments
is_enabled
is_detected
created_at
updated_at

FEATURES:

- Detect installed tools
- Configure executable path
- Set preferred editor
- Launch tool
- Launch tool inside selected project context
- Configure preferred terminal
- Show installation/detection status
- Revalidate paths

Use verified command-line interfaces.

Do not invent launch arguments.

Allow custom tools to be added.

Do not automatically grant arbitrary custom tools unrestricted filesystem or shell access.

For custom executable paths, show the selected executable and require explicit user approval.

============================================================
SECTION 19 — COMMAND LIBRARY
============================================================

Build a reusable command library.

The user should be able to save useful commands.

EXAMPLES:

git status
git branch
git log
npm run dev
npm run build
cargo check

These are examples, not commands to run automatically.

COMMAND FIELDS:

id
name
description
executable
argument_template
working_directory
project_id
category_id
risk_level
created_at
updated_at

FEATURES:

- Add command
- Edit command
- Delete
- Favorite
- Categorize
- Search
- Copy
- Preview
- Execute with approval
- Show execution result

COMMAND SAFETY:

Separate executable and arguments.

Use Rust process APIs with argument arrays.

Never construct untrusted shell commands by string concatenation.

Validate working directories.

Avoid unrestricted shell execution exposed to the frontend.

Classify commands:

Read Only
Development
Sensitive

Require confirmation before sensitive commands.

Show the exact destination and command before execution.

Do not automatically run production deployment commands.

Do not automatically execute scripts discovered in project directories.

Do not inject passwords into command-line arguments.

============================================================
SECTION 20 — AUTOMATION BUILDER
============================================================

Create a personal automation module.

The user should be able to configure repeated actions.

Do not require programming for common workflows.

AUTOMATION FIELDS:

id
name
description
trigger_type
enabled
created_at
updated_at

Store ordered automation actions separately.

INITIAL ACTION TYPES:

Open Folder
Open URL
Open Application
Open Terminal
Open Project
Show Notes
Create Note
Create Task
Launch Approved Command
Start Working Session
End Working Session

INITIAL TRIGGERS:

Manual
Keyboard Shortcut

OPTIONAL ADVANCED TRIGGER:

Scheduled, if a reliable and tested scheduler is implemented.

Use declarative structured action definitions.

Do not use eval().

Do not allow arbitrary JavaScript supplied by automation records.

AUTOMATION EDITOR:

- Name field
- Description
- Action list
- Add action
- Remove action
- Reorder actions
- Configure parameters
- Save
- Preview
- Run
- Show result

AUTOMATION EXECUTION:

Display progress.

Provide clear errors.

Allow cancellation where practical.

Require explicit approval for dangerous operations.

Avoid silent background execution.

SAMPLE TEMPLATES:

Start Development
Open Project Workspace
Start Debugging
Finish Working Session

Do not execute sample templates until the user configures them.

============================================================
SECTION 21 — GLOBAL COMMAND PALETTE
============================================================

Implement a quick global command palette.

Suggested default shortcut:

Ctrl + Alt + Space

Make the shortcut configurable.

Detect registration failure and allow selecting another shortcut.

When triggered:

- Show a compact floating search window
- Focus the input
- Allow immediate typing
- Allow Escape to close

COMMAND PALETTE CAPABILITIES:

- Search projects
- Search ordinary notes
- Search tasks
- Search servers
- Search non-secret credential metadata
- Search commands
- Open application sections
- Launch configured developer tools
- Open project
- Capture note
- Capture idea
- Create task
- Run approved automation
- Start working session

Support arrow-key navigation and Enter.

Display clear result types with icons.

Never show password values, API tokens, or secure-note bodies in search results.

Make the palette fast and keyboard-first.

============================================================
SECTION 22 — GLOBAL SEARCH
============================================================

Implement unified local search.

Search across:

Projects
Notes
Tasks
Servers
Commands
Bookmarks
Credential metadata

Use SQLite FTS5 for ordinary searchable text where appropriate.

Support:

- Exact matches
- Partial matches
- Filter by type
- Filter by project
- Recent results
- Keyboard navigation

Do not index decrypted secrets.

Do not send search queries to external services.

The search interface must use real data.

============================================================
SECTION 23 — SETTINGS
============================================================

Implement a complete settings module.

GENERAL:

- Display name
- Language
- Theme
- Startup behavior
- Minimize-to-tray preference
- Notifications
- Date/time formatting

APPEARANCE:

- Light
- Dark
- System
- Interface density
- Motion preference

PROJECTS:

- Root directories
- Exclusion patterns
- Scan settings
- Default editor
- Default terminal

DEVELOPER TOOLS:

- VS Code executable
- Claude Code CLI
- Codex CLI
- Antigravity executable
- Custom tools

SHORTCUTS:

- Command palette
- Quick note
- Capture idea
- Open dashboard

SECURITY:

- Credential backend status
- Vault lock preference
- Clipboard timeout
- Security warnings
- Clear sensitive temporary state

DATA:

- Database location
- Non-secret export
- Backup
- Restore
- Migration status
- Data deletion

ABOUT:

- Smart Beton logo
- Application name
- Version
- Build details
- Licenses
- Security information

All settings must persist.

============================================================
SECTION 24 — WINDOWS DESKTOP INTEGRATION
============================================================

Implement Windows-native behavior.

FEATURES:

- Native application window
- Custom application icon
- Resizable window
- Minimize
- Maximize/restore
- Close
- System tray
- Single-instance behavior
- Open dashboard from tray
- Optional minimize to tray
- Configurable global shortcuts
- Native folder picker
- Native file dialogs where needed
- Open URLs in default browser
- Launch verified executables
- Windows notifications
- Local application-data directory

WINDOW DESIGN:

The application should visually resemble the rounded floating container in the reference screenshot.

Use an accessible custom title bar if needed.

All window controls must function.

Support dragging the window.

Support resizing.

Do not sacrifice basic Windows interactions for visual appearance.

If truly transparent or blurred native window surfaces introduce instability or platform-specific issues, reproduce the glass effect with CSS instead.

Prefer stability over fragile visual tricks.

Do not add unnecessary native privileges.

============================================================
SECTION 25 — DATABASE ARCHITECTURE
============================================================

Use SQLite.

Use a maintained Rust SQLite library such as rusqlite.

Enable foreign keys.

Use migrations.

Store application data in the proper per-user application data directory.

Do not place the writable production database inside the installed executable directory.

Use parameterized queries.

Implement appropriate indexes.

Suggested tables:

app_settings
project_roots
projects
project_repositories
project_bookmarks
project_tool_preferences
project_workspace_profiles
note_categories
notes
tags
note_tag_assignments
vault_categories
vault_items
vault_project_links
servers
server_project_links
tasks
task_tag_assignments
task_note_links
task_checklist_items
goals
commands
command_categories
automations
automation_actions
working_sessions
recent_activity
tool_configurations
schema_migrations

Adjust names and relationships if the schema can be improved.

DATA REQUIREMENTS:

- Stable primary keys
- Created timestamps
- Updated timestamps
- Foreign keys
- Consistent soft-delete behavior where appropriate
- Explicit cascade rules
- Transactional updates
- Migration tests
- Query indexes
- Reliable filtering
- No secret plaintext columns

Use many-to-many tables where an item belongs to multiple projects.

Deleting a project record must NEVER delete source code files from disk.

Deleting a server record must NEVER delete a remote server.

Deleting a tool configuration must NEVER uninstall an application.

============================================================
SECTION 26 — APPLICATION SECURITY
============================================================

This application handles potentially sensitive company information.

Design defensively.

SECURITY REQUIREMENTS:

- Local-first architecture
- No mandatory cloud
- No telemetry by default
- No secrets in logs
- No plaintext password storage
- No automatic uploading of source code
- No unauthorized server connections
- No hidden remote-access features
- No automatic production commands
- No unrestricted shell API exposed to the frontend
- Minimal Tauri capabilities
- Narrow file access
- User-approved project roots
- Validated external executable paths
- Safe URL handling
- Safe process argument handling
- Markdown sanitization
- SQL parameterization
- Protected credential storage
- Appropriate data backups
- Safe migration handling
- Clear danger confirmations

Use Windows Credential Manager or vetted secure APIs for passwords.

Use Windows DPAPI or an established cryptographic system for secure-note content.

Do not implement homemade encryption.

Prevent secrets from being accidentally displayed in:

- Dashboard previews
- Search results
- Notifications
- Activity history
- Debug output
- Terminal output logs controlled by SmartDesk
- Error reports

Avoid collecting more sensitive data than required.

Document the threat model and limitations.

Do not claim that a local application is automatically secure merely because it is offline.

Do not implement AI features that automatically read and transmit company files or stored credentials.

Any future cloud integration must require explicit opt-in and appropriate authorization.

============================================================
SECTION 27 — TECHNICAL STACK
============================================================

Use this preferred stack.

DESKTOP:

Tauri 2.x

FRONTEND:

React
TypeScript
Vite

STYLING:

Tailwind CSS
CSS variables
shadcn/ui where appropriate
Radix primitives
Lucide React

ROUTING:

React Router

STATE:

TanStack Query
Zustand for lightweight UI state

FORMS:

React Hook Form
Zod

CHARTS:

Recharts or another lightweight maintained charting library

NOTES EDITOR:

CodeMirror 6
Markdown renderer with sanitization

LANGUAGE:

i18next or a similarly maintained solution

BACKEND:

Rust
Tauri commands
Typed models
Structured error handling

DATABASE:

SQLite
rusqlite
Versioned migrations
FTS5

SECURITY:

Windows credential backend
Windows user-scoped encryption where required
Tauri permission isolation

TESTING:

Vitest
React Testing Library
Rust unit tests
Integration tests
Playwright for appropriate frontend visual and end-to-end tests

Use maintained stable packages.

Check versions and compatibility before installing them.

Do not blindly select incompatible versions.

Commit package lockfiles.

Avoid unnecessary dependencies.

Do not use Electron.

Do not introduce a separate HTTP backend merely to connect React to Rust.

Use Tauri IPC.

Do not use Python unless there is a clearly justified and documented requirement.

============================================================
SECTION 28 — BACKEND STRUCTURE
============================================================

Use an organized Rust backend.

Suggested structure:

src-tauri/
  src/
    main.rs
    lib.rs

    commands/
      mod.rs
      projects.rs
      notes.rs
      vault.rs
      servers.rs
      tasks.rs
      tools.rs
      commands.rs
      automations.rs
      search.rs
      settings.rs
      sessions.rs

    database/
      mod.rs
      connection.rs
      migrations.rs
      repositories/

    models/
      mod.rs

    services/
      project_discovery.rs
      project_launcher.rs
      note_service.rs
      vault_service.rs
      server_service.rs
      task_service.rs
      automation_service.rs
      command_service.rs
      search_service.rs
      session_service.rs

    security/
      credential_store.rs
      secure_notes.rs
      validation.rs

    platform/
      windows.rs

    errors/
      mod.rs

  capabilities/
  icons/
  migrations/
  tauri.conf.json
  Cargo.toml

Use clear separation between:

- IPC handlers
- Business logic
- Database access
- Windows APIs
- Credential handling

No giant monolithic Rust file.

Use typed command responses.

Convert backend errors into understandable frontend errors without exposing sensitive contents.

============================================================
SECTION 29 — FRONTEND STRUCTURE
============================================================

Suggested structure:

src/
  app/
    App.tsx
    router.tsx
    providers.tsx

  components/
    layout/
    dashboard/
    ui/
    shared/

  features/
    dashboard/
    projects/
    notes/
    vault/
    servers/
    tasks/
    automations/
    developer-tools/
    settings/
    search/
    sessions/

  hooks/

  services/
    tauri/
    queries/

  stores/

  types/

  lib/

  locales/
    fa/
    en/

  styles/
    tokens.css
    globals.css
    themes.css

  assets/

Use feature-oriented organization.

Create typed frontend-to-backend interfaces.

Use predictable routing.

Use reusable forms.

Use loading skeletons.

Use proper error boundaries.

Use useful empty states.

Use optimistic updates only where rollback is safe.

Avoid unnecessary global state.

============================================================
SECTION 30 — FIRST-RUN ONBOARDING
============================================================

Create a polished first-run experience.

STEP 1:

Welcome to Smart Beton Dashboard.

Show company logo.

Explain the main purpose.

STEP 2:

Choose language:

Persian
English

STEP 3:

Choose appearance:

Light
Dark
System

STEP 4:

Choose Smart Beton projects directory.

Use native folder picker.

STEP 5:

Scan the selected directory.

Show discovered project candidates.

Allow selection and correction.

STEP 6:

Detect development tools.

Show:

VS Code
Claude Code
Codex
Antigravity
Windows Terminal

Allow manual paths.

STEP 7:

Explain:

- Ordinary Notes
- Secure Vault
- Local storage
- Credential protection

STEP 8:

Finish setup and open Dashboard.

Do not require real passwords during onboarding.

Do not require login or account registration.

Onboarding should not run again after successful completion unless explicitly reset.

============================================================
SECTION 31 — DATA BACKUP AND RECOVERY
============================================================

Implement a reliable backup strategy.

For ordinary data:

- Export non-secret data
- Backup SQLite
- Restore SQLite
- Validate backup format
- Validate schema version
- Make a safety backup before restoration
- Handle migration errors

Do not overwrite active data without explicit confirmation.

Use atomic or transactionally safe operations where practical.

Never assume copying SQLite's main file during active writes creates a complete backup.

Use SQLite's supported backup mechanisms or a safe equivalent.

Credential backups must follow the Secure Vault security requirements.

Do not silently include plaintext passwords in an ordinary export.

Document recovery limitations clearly.

============================================================
SECTION 32 — ACTIVITY AND HISTORY
============================================================

Create a lightweight local activity history.

Track useful explicit actions such as:

- Project opened
- Working session started
- Working session completed
- Task completed
- Note created
- Automation executed

Do not record secret values.

Do not log sensitive clipboard contents.

Do not record user keystrokes.

Do not monitor unrelated applications.

Activity tracking should be local, understandable, and configurable.

Use activity data to populate real recent-project lists.

============================================================
SECTION 33 — NOTIFICATIONS
============================================================

Implement appropriate notifications.

Examples:

- Task due
- Task overdue
- Automation completed
- Automation failed
- Backup completed
- Backup failed

Respect Windows notifications settings.

Do not show credentials or private note bodies in notifications.

Notifications should be unobtrusive.

Allow enabling or disabling relevant categories.

============================================================
SECTION 34 — RESPONSIVENESS
============================================================

This is a desktop-first application.

Primary target:
1440x900 and larger.

Support smaller window sizes.

At reduced widths:

- Collapse optional dashboard columns
- Allow sidebar collapse
- Stack cards
- Preserve readable text
- Keep controls accessible
- Avoid clipped modal windows

Do not attempt to design a mobile app.

Do not spend time creating mobile-specific navigation.

The Windows desktop experience takes priority.

============================================================
SECTION 35 — ACCESSIBILITY AND UX QUALITY
============================================================

Implement:

- Semantic elements
- Keyboard navigation
- Visible focus states
- Form labels
- Tooltips where useful
- Accessible dialogs
- Descriptive errors
- Sufficient text contrast
- Reduced motion support
- Reliable tab order
- Proper Persian text rendering
- Proper LTR technical fields
- Clear destructive-action confirmations

Avoid tiny unreadable text.

The provided reference screenshot is visually compact, but functional readability is more important than reproducing illegible labels.

Aim for WCAG AA contrast where practical.

============================================================
SECTION 36 — PERFORMANCE
============================================================

The application should feel fast.

Optimize:

- Startup
- Dashboard data loading
- Project discovery
- Note search
- Task filtering
- Project switching
- Command palette responsiveness

Avoid reading entire large repositories into memory.

Bound filesystem scanning.

Run expensive filesystem operations off the main UI thread.

Use cancellation where appropriate.

Avoid unnecessary repeated database queries.

Use appropriate SQLite indexes.

Prevent infinite rendering loops.

Do not load all note bodies when only summaries are needed.

Use pagination or virtualization for large collections where useful.

Avoid unnecessary React rerenders.

============================================================
SECTION 37 — APPLICATION ICONS AND ASSETS
============================================================

Use the original Smart Beton logo file.

Generate Windows application icon assets from the company symbol.

Prepare appropriate icon formats and sizes.

Use an ICO file for Windows packaging.

Avoid stretching or distorting the logo.

Add an app splash/loading state if needed.

Use neutral monochrome backgrounds.

Do not use random third-party brand imagery.

Respect font and asset licenses.

Do not embed external images unless necessary.

============================================================
SECTION 38 — WINDOWS EXE AND INSTALLER
============================================================

The FINAL DELIVERY TARGET is a Windows desktop executable.

Use Tauri 2 build tooling.

Create:

1. Windows application executable
2. NSIS Setup EXE installer

Also support MSI packaging where the Windows build environment permits it.

Configure:

Application product name:
Smart Beton Dashboard

Publisher:
Smart Beton, if company branding use is authorized.

Executable name:
smart-beton-dashboard

Bundle identifier:
com.smartbeton.dashboard

Application icon:
Derived from the supplied Smart Beton logo.

VERSION:

Start at:
1.0.0

Use semantic versioning.

BUILD COMMAND:

npm run tauri build

Provide development command:

npm run tauri dev

Configure production build assets correctly.

No development server should be required when running the installed application.

The built desktop application must load bundled frontend assets.

Use WebView2 on Windows as required by Tauri.

DOCUMENT THE WINDOWS PREREQUISITES:

- Node.js
- Rust stable MSVC toolchain
- Microsoft C++ Build Tools
- Desktop development with C++
- WebView2 runtime
- Required installer tooling

For NSIS, use the Tauri-supported installer configuration.

For MSI, use the documented Windows-only build requirements.

Do not claim cross-platform MSI builds work.

Do not invent output filenames.

At the end, report actual output paths.

Typical paths:

src-tauri/target/release/
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/

Configure an appropriate WebView2 installation strategy.

Prefer the standard installer behavior unless offline deployment is specifically required.

Do not automatically enable self-updating.

Updates are a separate feature requiring a trusted release and signing strategy.

Create Start Menu shortcuts through the installer.

Desktop shortcuts may be configurable through installer options where supported.

Ensure proper uninstall behavior.

Application user data should not be casually destroyed by an uninstall.

Do not claim an unsigned EXE will avoid Microsoft SmartScreen warnings.

Document code signing as a release consideration.

============================================================
SECTION 39 — TESTING
============================================================

Create meaningful automated tests.

FRONTEND TESTS:

- Navigation
- Dashboard rendering
- Theme switching
- Language switching
- RTL/LTR handling
- Project list
- Project filters
- Note creation
- Note editing
- Autosave
- Note categories
- Note tags
- Note deletion/restore
- Task creation
- Task completion
- Task filters
- Form validation
- Search
- Dialog behavior

BACKEND TESTS:

- Database initialization
- Migrations
- Foreign keys
- Project scanner
- Exclusion patterns
- Project import
- Note persistence
- Note filtering
- Task persistence
- Search
- Session persistence
- Settings
- Automation validation
- Executable path validation

SECURITY TESTS:

- Passwords are not stored as plaintext in SQLite
- Credentials are not searchable through ordinary FTS
- Secure note bodies are encrypted at rest
- Failure of secure credential backend never triggers plaintext fallback
- Secret values are not logged
- Invalid executable paths are rejected
- Invalid process arguments are handled safely
- Production-sensitive commands require confirmation
- Invalid URL schemes are rejected
- Safe backup behavior
- Migration rollback or recovery behavior

Use synthetic test credentials only.

Never test against real Smart Beton servers without authorization.

VISUAL TESTING:

Use the reference screenshot.

Create visual comparison checkpoints.

Where practical, capture app screenshots and compare:

- Layout
- Sidebar proportions
- Header positioning
- Card geometry
- Card spacing
- Rounded corners
- Shadows
- Typography
- Monochrome palette
- Chart styling

Implement frontend screenshot tests where practical.

Do not claim exact pixel-level similarity if visual comparison was not performed.

WINDOWS INTEGRATION TESTS:

Verify, when running on Windows:

- Native startup
- Window controls
- System tray
- Global shortcuts
- Native folder picker
- External tool launch
- Windows credential backend
- Installer startup
- Installer uninstall behavior

If not running on Windows, document these as unverified rather than pretending they passed.

============================================================
SECTION 40 — QUALITY CONTROL
============================================================

The UI must be polished and consistent.

Check for:

- Misaligned cards
- Text overflow
- Broken RTL alignment
- Incorrect icons
- Inconsistent border radius
- Placeholder content
- Nonfunctional buttons
- Duplicate navigation
- Inconsistent spacing
- Broken loading states
- Empty pages
- Console errors
- Unhandled async errors
- TypeScript errors
- Rust compile errors

Do not leave a feature marked complete unless it is usable.

No fake dashboard statistics.

No fake server connections.

No fake vault encryption.

No fake installer output.

No claim of test success unless tests were executed successfully.

============================================================
SECTION 41 — REQUIRED DOCUMENTATION
============================================================

Create:

README.md
ARCHITECTURE.md
DEVELOPMENT.md
DESIGN_SYSTEM.md
DATABASE.md
SECURITY.md
WINDOWS_BUILD.md
USER_GUIDE_FA.md
ROADMAP.md
CHANGELOG.md

README:

- Project overview
- Technology stack
- Setup
- Development
- Build
- Test
- Main modules

ARCHITECTURE:

- Frontend/backend separation
- Tauri IPC
- Database
- Security boundaries
- Windows integrations

DESIGN_SYSTEM:

- Reference-image requirements
- Colors
- Typography
- Themes
- Spacing
- Radius
- Components
- Logo usage

DATABASE:

- Schema
- Relationships
- Migrations
- Backup

SECURITY:

- Threat model
- Credential storage
- Encryption
- Clipboard limitations
- Windows user scope
- Safe command execution
- Sensitive-data handling
- Backup limitations

WINDOWS_BUILD:

- Prerequisites
- Development mode
- Build
- NSIS installer
- MSI installer
- Troubleshooting
- Code signing considerations

USER_GUIDE_FA:

Write the user guide in Persian.

Explain how to:

- Add project directories
- Open projects
- Create notes
- Categorize notes
- Save authorized credentials
- Add servers
- Add tasks
- Create automations
- Use the command palette
- Change themes
- Backup data

ROADMAP:

Document enhancements beyond the implemented application.

============================================================
SECTION 42 — IMPLEMENTATION ORDER
============================================================

Work in controlled milestones.

MILESTONE 1 — PROJECT FOUNDATION

- Inspect workspace
- Create project
- Configure Tauri
- Configure React
- Configure TypeScript
- Configure Tailwind
- Configure i18n
- Configure testing
- Set up source structure

MILESTONE 2 — VISUAL FOUNDATION

- Inspect reference image
- Inspect company logo
- Create design tokens
- Build app shell
- Build left sidebar
- Build top header
- Build Bento layout
- Build Light theme
- Build Dark theme
- Build global components

MILESTONE 3 — DATABASE FOUNDATION

- Set up SQLite
- Add migrations
- Create repositories
- Configure application data path
- Create typed backend commands

MILESTONE 4 — DASHBOARD

- Real counts
- Overview cards
- Weekly chart
- Monthly chart
- Goals
- Current tasks
- Recent projects

MILESTONE 5 — PROJECTS

- Directory picker
- Project scanner
- Project import
- Project CRUD
- Project detail pages
- Project tool preferences
- Tool launching

MILESTONE 6 — NOTES

- Categories
- Tags
- Markdown editor
- Autosave
- CRUD
- Search
- Trash
- Quick capture
- Project linking

MILESTONE 7 — TASKS AND SESSIONS

- Tasks
- Kanban
- Goals
- Reminders
- Working sessions
- Continue working

MILESTONE 8 — SECURE VAULT

- Native credential backend
- Secure notes
- Vault CRUD
- Categories
- Credential references
- Reveal/copy
- Security tests

MILESTONE 9 — SERVERS

- Server CRUD
- Project linking
- SSH
- RDP
- AnyDesk launch
- Web panels
- Connection validation

MILESTONE 10 — PRODUCTIVITY TOOLS

- Developer tool registry
- Command library
- Automation builder
- Workflow execution
- Command palette
- System tray

MILESTONE 11 — SETTINGS AND BACKUP

- All settings
- Backup
- Restore
- Import/export
- Localization polishing

MILESTONE 12 — FINAL POLISH

- Visual comparison
- Accessibility
- Performance
- Error handling
- Tests
- Build
- Windows packaging
- Documentation

At each milestone, run relevant checks and fix problems before moving forward.

Maintain an implementation status checklist.

Do not create a beautiful frontend and postpone all backend functionality indefinitely.

============================================================
SECTION 43 — DEFINITION OF DONE
============================================================

The project is considered complete only when:

[ ] The application launches.
[ ] Both themes work.
[ ] The UI strongly resembles the reference screenshot.
[ ] The company logo is correctly displayed.
[ ] All nine sections exist.
[ ] Navigation works.
[ ] No fake buttons remain.
[ ] SQLite persistence works.
[ ] Project discovery works.
[ ] Projects can be opened in supported tools.
[ ] Notes can be created, edited, searched, categorized, and deleted.
[ ] Notes support project associations.
[ ] Quick capture works.
[ ] Tasks can be managed.
[ ] Working sessions persist.
[ ] Secure Vault uses protected credential storage.
[ ] Website credentials can be managed safely.
[ ] AnyDesk entries can be managed safely.
[ ] Server credentials can be managed safely.
[ ] Server connection metadata can be managed.
[ ] Commands can be saved and executed safely.
[ ] Manual automations work.
[ ] Global search works.
[ ] The command palette works.
[ ] Settings persist.
[ ] Windows tray integration works.
[ ] The application can start offline.
[ ] Tests pass.
[ ] Documentation exists.
[ ] A Windows EXE can be built.
[ ] An NSIS installer can be generated on Windows.
[ ] Important limitations are documented.

If an item cannot be completed, do not silently mark it as complete.

Explain exactly what is missing and why.

============================================================
SECTION 44 — WORKING RULES FOR CODEX
============================================================

You are authorized to create and edit project files in the current workspace.

You may install legitimate project dependencies required for the build.

Do not access unrelated personal directories.

Do not modify real company source repositories.

Do not connect to production systems.

Do not read real .env secrets.

Do not access or export existing credentials.

Do not execute destructive commands outside the project workspace.

Do not delete unrelated files.

Before modifying an existing project, inspect its structure.

If this is a new empty folder, initialize the application.

Maintain small, clear modules.

Write real implementations.

Use comments for non-obvious behavior.

Use secure defaults.

Avoid overengineering.

Prefer simple reliable solutions to fragile complexity.

Use current official documentation when verifying tool behavior and build configuration.

Avoid deprecated APIs.

Do not repeatedly ask the user for design preferences already specified.

The requirements in this prompt are the product decisions.

When a small unspecified detail remains, make a sensible professional choice and document it.

If a genuinely blocking requirement is missing, report the blocker precisely.

Do not falsely claim success.

============================================================
SECTION 45 — CONTINUITY AND CHECKPOINTS
============================================================

This is a substantial software project.

Create and maintain:

IMPLEMENTATION_STATUS.md

Track:

- Milestones
- Completed features
- Work in progress
- Remaining features
- Build results
- Test results
- Known issues
- Next implementation steps

Use this file to preserve progress between coding sessions.

At the end of each implementation milestone:

1. Save changes.
2. Run applicable checks.
3. Update the status file.
4. Continue to the next milestone where execution time and environment permit.

Do not stop after only generating a roadmap.

Do not create dozens of placeholder files without implementing the application.

If execution limits interrupt the work, leave the repository in a runnable state whenever possible and document the exact next action.

Do not mark the overall product complete until the Definition of Done is satisfied.

============================================================
SECTION 46 — FINAL EXPECTED DELIVERY
============================================================

At the end of implementation provide:

1. Project source code
2. Working desktop application
3. Implemented React interface
4. Rust backend
5. SQLite database migrations
6. Functional feature modules
7. Light and dark themes
8. Smart Beton branding
9. Windows integration
10. Automated tests
11. Documentation
12. Windows build instructions
13. Executable and installer if successfully built

Final report should include:

APPLICATION:
Name and version

IMPLEMENTED:
Completed features

PARTIAL:
Partially implemented features

PENDING:
Any remaining features

TESTS:
Commands executed and actual results

BUILD:
Actual build status

OUTPUT:
Exact generated file paths

SECURITY:
Known limitations

RUN:
Exact commands to start development mode

INSTALL:
How to install the Windows release

NEXT STEPS:
Remaining tasks, if any

============================================================
SECTION 47 — FINAL PRODUCT EXPERIENCE
============================================================

Imagine the user arriving at work.

They launch Smart Beton Dashboard.

The application opens into a beautiful monochrome dashboard matching the supplied reference.

The original Smart Beton logo appears in the sidebar.

The user sees:

- Recent projects
- Tasks in progress
- Weekly activity
- Monthly progress
- Personal goals
- Important shortcuts

They select a project.

The application shows the last working session, related notes, tasks, servers, commands, and credentials.

They click Open in VS Code.

The correct project opens.

They launch Claude Code or Codex in the project directory.

During development, they have an idea.

They press the Quick Capture shortcut.

They write the idea and save it.

Later, they need the login for a company panel.

They open Secure Vault, find the authorized credential, and explicitly copy the password.

They need to connect to a server.

They open Servers & Connections, select the associated project server, and launch their configured connection tool.

At the end of the day, they save their session summary.

The next morning, the application remembers the project context and displays the next action.

Everything is local, organized, secure by design, and fast.

THIS IS THE EXPERIENCE YOU MUST BUILD.

============================================================
SECTION 48 — DESIGN ACCEPTANCE REQUIREMENT
============================================================

The original reference screenshot is not optional inspiration.

It is a primary implementation requirement.

Before considering the UI complete:

Compare the implemented dashboard against:

design/references/dashboard-reference.png

Specifically compare:

1. Overall composition
2. Left sidebar placement
3. Header
4. Card proportions
5. Large dark statistics card
6. Weekly progress card
7. Circular progress card
8. Goal checklist card
9. Floating task cards
10. Recent project cards
11. Soft grayscale background
12. Rounded corners
13. Shadows
14. Typography
15. Spacing
16. Monochrome visual balance

The end result must be clearly recognizable as the same design direction.

Not simply another dashboard with similar colors.

For internal pages, extend the same design system consistently.

The Notes, Projects, Vault, Servers, and Settings pages must feel like they belong to the exact same application.

============================================================
SECTION 49 — START IMPLEMENTATION
============================================================

Begin immediately.

FIRST ACTIONS:

1. Inspect the current working directory.
2. Locate the two design reference files.
3. Verify the available development environment.
4. Confirm suitable stable dependencies.
5. Initialize the Tauri 2 + React + TypeScript application.
6. Create the project architecture.
7. Set up the monochrome design system.
8. Implement the reference-matched app shell and dashboard.
9. Continue through all implementation milestones.
10. Run tests and builds.
11. Fix identified issues.
12. Generate Windows release artifacts when supported.
13. Report actual results.

Do not merely explain how you would build it.

CREATE THE APPLICATION.

PROJECT:
SMART BETON DASHBOARD

DESIGN:
REFERENCE-MATCHED MONOCHROME BENTO DASHBOARD

PLATFORM:
WINDOWS DESKTOP

STACK:
TAURI 2 + REACT + TYPESCRIPT + RUST + SQLITE

LANGUAGES:
PERSIAN + ENGLISH

THEMES:
LIGHT + DARK

RELEASE TARGET:
WINDOWS EXE + NSIS SETUP EXE

START NOW.
