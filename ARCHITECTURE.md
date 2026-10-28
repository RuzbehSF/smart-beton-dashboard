# Architecture

The React/TypeScript UI invokes explicit Tauri commands implemented in Rust. Ordinary records use SQLite in the app-data directory; migrations run transactionally under an immediate lock. Project discovery is bounded and skips common generated directories and Windows reparse points. Long scans and backup run on blocking workers.

The experimental vault stores metadata and opaque references in SQLite and secret values in Windows Credential Manager via keyring's Windows backend. The view lock is not authentication. This design is not yet fully reviewed or tested end to end; see `SECURITY.md`.

Manual automations store ordered declarative actions, show a preview and recheck the saved definition before each action. They run only after the user confirms. Saved executable commands use a separate executable and argument array; approval does not sandbox an executable. Command output and exit status are held in memory, capped at 64 KiB and shown in the UI. Child processes retaining output handles can delay completion reporting; cancellation is not implemented. See `IMPLEMENTATION_STATUS.md` for omissions.
