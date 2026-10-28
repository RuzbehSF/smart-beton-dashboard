# Windows build

Install Node.js, Rust stable with the `x86_64-pc-windows-msvc` target, Visual Studio Build Tools with Desktop development with C++ and a Windows SDK, and the WebView2 runtime. From a Visual Studio x64 developer command prompt, ensure Cargo is on PATH, then run `npm ci`, `npm test`, `cargo test --release --manifest-path src-tauri/Cargo.toml`, and `npm run tauri build`.

The default bundle target is NSIS. Tauri reports exact output paths after a successful build. Building may download NSIS tooling. Tests that access Credential Manager need an interactive Windows account and can fail with access denied inside a restricted sandbox. Test only with synthetic credentials.

The executable and installer are unsigned; Windows SmartScreen may warn. Code signing, installer install/uninstall testing, MSI packaging and update infrastructure have not been completed. Uninstall should not be assumed to remove or back up user data; verify behavior before distributing.
