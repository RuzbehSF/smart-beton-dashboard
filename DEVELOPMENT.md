# Development

Use `npm ci` then `npm run tauri dev` from a Visual C++ developer environment with Rust on PATH. `npm run build` checks TypeScript and builds the frontend; `npm test` runs domain and mocked UI tests. `cargo test --release --manifest-path src-tauri/Cargo.toml` runs backend tests, including synthetic Windows Credential Manager tests that require account access. No real credentials or company servers are used in tests.

Do not treat the mocked UI tests as proof of desktop integration. The installer, database CRUD, folder picker, external process launch, vault and automation flows require further end-to-end verification.
