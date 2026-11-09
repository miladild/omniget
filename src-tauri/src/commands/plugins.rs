use std::sync::Arc;

use omniget_plugin_sdk::{PluginHost, PluginManifest, RegistryEntry};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::plugin_host::PluginHostImpl;
use crate::plugin_loader::{PluginLoadError, PluginManager};

fn emit_plugins_changed(app: &tauri::AppHandle) {
    let _ = app.emit("plugins-changed", ());
}

fn build_plugin_host(
    app: &tauri::AppHandle,
    plugins_dir: std::path::PathBuf,
) -> Arc<dyn PluginHost> {
    Arc::new(PluginHostImpl::new(app.clone(), plugins_dir))
}

#[derive(Debug, Serialize)]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub enabled: bool,
    pub loaded: bool,
    pub icon: Option<String>,
    pub nav: Vec<PluginNavInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub load_error: Option<PluginLoadError>,
}

#[derive(Debug, Serialize)]
pub struct PluginNavInfo {
    pub route: String,
    pub label: std::collections::HashMap<String, String>,
    pub icon_svg: Option<String>,
    pub group: String,
    pub order: u32,
}

#[tauri::command]
pub fn list_plugins(
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
) -> Result<Vec<PluginInfo>, String> {
    let manager = state.blocking_read();
    let installed = manager.installed_plugins();

    let infos: Vec<PluginInfo> = installed
        .iter()
        .map(|entry| {
            let loaded = manager.get(&entry.id);
            match loaded {
                Some(lp) => PluginInfo {
                    id: entry.id.clone(),
                    name: lp.manifest.name.clone(),
                    version: lp.manifest.version.clone(),
                    description: lp.manifest.description.clone(),
                    author: lp.manifest.author.clone(),
                    enabled: entry.enabled,
                    loaded: true,
                    icon: lp.manifest.icon.clone(),
                    nav: lp
                        .manifest
                        .nav
                        .iter()
                        .map(|n| PluginNavInfo {
                            route: n.route.clone(),
                            label: n.label.clone(),
                            icon_svg: n.icon_svg.clone(),
                            group: match n.group {
                                omniget_plugin_sdk::NavGroup::Primary => "primary".into(),
                                omniget_plugin_sdk::NavGroup::Secondary => "secondary".into(),
                            },
                            order: n.order,
                        })
                        .collect(),
                    load_error: None,
                },
                None => {
                    let load_error = manager.load_error(&entry.id).cloned();
                    let manifest_path = manager.plugins_dir().join(&entry.id).join("plugin.json");
                    let manifest: Option<omniget_plugin_sdk::PluginManifest> =
                        std::fs::read_to_string(&manifest_path)
                            .ok()
                            .and_then(|s| serde_json::from_str(&s).ok());
                    match manifest {
                        Some(m) => PluginInfo {
                            id: entry.id.clone(),
                            name: m.name,
                            version: m.version,
                            description: m.description,
                            author: m.author,
                            enabled: entry.enabled,
                            loaded: false,
                            icon: m.icon,
                            nav: m
                                .nav
                                .iter()
                                .map(|n| PluginNavInfo {
                                    route: n.route.clone(),
                                    label: n.label.clone(),
                                    icon_svg: n.icon_svg.clone(),
                                    group: match n.group {
                                        omniget_plugin_sdk::NavGroup::Primary => "primary".into(),
                                        omniget_plugin_sdk::NavGroup::Secondary => {
                                            "secondary".into()
                                        }
                                    },
                                    order: n.order,
                                })
                                .collect(),
                            load_error,
                        },
                        None => PluginInfo {
                            id: entry.id.clone(),
                            name: entry.id.clone(),
                            version: entry.version.clone(),
                            description: String::new(),
                            author: String::new(),
                            enabled: entry.enabled,
                            loaded: false,
                            icon: None,
                            nav: Vec::new(),
                            load_error,
                        },
                    }
                }
            }
        })
        .collect();

    Ok(infos)
}

#[tauri::command]
pub fn get_plugin_frontend_path(
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
    plugin_id: String,
) -> Result<String, String> {
    let manager = state.blocking_read();
    let frontend_dir = manager
        .plugin_dir(&plugin_id)
        .map_err(|e| e.to_string())?
        .join("frontend");
    if !frontend_dir.exists() {
        return Err(format!("Plugin '{}' has no frontend", plugin_id));
    }
    Ok(frontend_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn set_plugin_enabled(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
    plugin_id: String,
    enabled: bool,
) -> Result<(), String> {
    {
        let mut manager = state.blocking_write();
        manager
            .set_enabled(&plugin_id, enabled)
            .map_err(|e| e.to_string())?;
        if enabled && !manager.is_loaded(&plugin_id) {
            let plugins_dir = manager.plugins_dir().to_path_buf();
            let host = build_plugin_host(&app, plugins_dir);
            let _ = manager.load_one(&plugin_id, host);
        }
    }
    emit_plugins_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn uninstall_plugin(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
    plugin_id: String,
) -> Result<(), String> {
    {
        let mut manager = state.blocking_write();
        manager.unregister(&plugin_id).map_err(|e| e.to_string())?;
    }
    emit_plugins_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn get_loaded_plugin_manifests(
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
) -> Result<Vec<PluginManifest>, String> {
    let manager = state.blocking_read();
    Ok(manager.loaded_manifests().into_iter().cloned().collect())
}

#[tauri::command]
pub fn get_plugin_i18n(
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
    plugin_id: String,
    locale: String,
) -> Result<serde_json::Value, String> {
    let manager = state.blocking_read();
    let i18n_dir = manager
        .plugin_dir(&plugin_id)
        .map_err(|e| e.to_string())?
        .join("i18n");
    let locale_file = i18n_dir.join(format!("{}.json", locale));
    if !locale_file.exists() {
        let fallback = i18n_dir.join("en.json");
        if !fallback.exists() {
            return Ok(serde_json::json!({}));
        }
        let content = std::fs::read_to_string(&fallback).map_err(|e| e.to_string())?;
        return serde_json::from_str(&content).map_err(|e| e.to_string());
    }
    let content = std::fs::read_to_string(&locale_file).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn plugin_command(
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
    plugin_id: String,
    command: String,
    args: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let manager = state.read().await;
    manager
        .handle_command(&plugin_id, &command, args)
        .await
        .map_err(|e| {
            // Issue #193: a loaded but outdated plugin DLL answers "Unknown
            // command"/"Command X not found" when the (newer) frontend calls a
            // command it predates. Raw, that reads like an app bug; rewrite it
            // into an actionable update hint. ERR_PLUGIN_OUTDATED is matched by
            // error-translate.ts on the frontend.
            let lower = e.to_lowercase();
            let unknown_command = lower.contains("unknown command")
                || (lower.contains("command") && lower.contains("not found"));
            if unknown_command && !lower.contains("not loaded") {
                format!(
                    "ERR_PLUGIN_OUTDATED: The installed '{}' plugin is outdated and doesn't support '{}'. Update it in the Marketplace, then restart OmniGet. ({})",
                    plugin_id, command, e
                )
            } else {
                e
            }
        })
}

const REGISTRY_URLS: &[&str] = &[
    "https://raw.githubusercontent.com/OpenSelena/omniget-plugins/main/plugins.json",
    "https://cdn.jsdelivr.net/gh/OpenSelena/omniget-plugins@main/plugins.json",
];

#[derive(Debug, Serialize)]
pub struct MarketplaceEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub repo: String,
    pub homepage: Option<String>,
    pub tags: Vec<String>,
    pub official: bool,
    pub capabilities: Vec<String>,
    pub installed: bool,
    pub installed_version: Option<String>,
}

#[tauri::command]
pub async fn fetch_marketplace_registry(
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
) -> Result<Vec<MarketplaceEntry>, String> {
    let client = crate::core::http_client::apply_global_proxy(
        reqwest::Client::builder()
            .user_agent("OmniGet")
            .timeout(std::time::Duration::from_secs(15)),
    )
    .build()
    .map_err(|e| e.to_string())?;

    #[derive(Deserialize)]
    struct RegistryFile {
        plugins: Vec<RegistryEntry>,
    }

    let mut registry: Option<RegistryFile> = None;
    let mut last_err = String::from("Failed to fetch registry");

    for url in REGISTRY_URLS {
        let body = match client.get(*url).send().await {
            Ok(resp) => match resp.error_for_status() {
                Ok(resp) => match resp.text().await {
                    Ok(body) => body,
                    Err(e) => {
                        last_err = format!("Failed to read registry: {}", e);
                        tracing::warn!("registry fetch via {} failed: {}", url, last_err);
                        continue;
                    }
                },
                Err(e) => {
                    last_err = format!("Registry request failed: {}", e);
                    tracing::warn!("registry fetch via {} failed: {}", url, last_err);
                    continue;
                }
            },
            Err(e) => {
                last_err = format!("Failed to fetch registry: {}", e);
                tracing::warn!("registry fetch via {} failed: {}", url, last_err);
                continue;
            }
        };

        match serde_json::from_str::<RegistryFile>(&body) {
            Ok(parsed) => {
                registry = Some(parsed);
                break;
            }
            Err(e) => {
                last_err = format!("Invalid registry: {}", e);
                tracing::warn!("registry fetch via {} failed: {}", url, last_err);
            }
        }
    }

    let registry = registry.ok_or(last_err)?;

    let installed = {
        let manager = state.read().await;
        manager.installed_plugins().to_vec()
    };

    let entries = registry
        .plugins
        .into_iter()
        .map(|entry| {
            let inst = installed.iter().find(|i| i.id == entry.id);
            MarketplaceEntry {
                id: entry.id,
                name: entry.name,
                description: entry.description,
                author: entry.author,
                repo: entry.repo,
                homepage: entry.homepage,
                tags: entry.tags,
                official: entry.official,
                capabilities: entry.capabilities,
                installed: inst.is_some(),
                installed_version: inst.map(|i| i.version.clone()),
            }
        })
        .collect();

    Ok(entries)
}

fn platform_artifact_suffix() -> &'static str {
    if cfg!(target_os = "windows") && cfg!(target_arch = "x86_64") {
        "windows-x86_64"
    } else if cfg!(target_os = "linux") && cfg!(target_arch = "x86_64") {
        "linux-x86_64"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        "macos-aarch64"
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        "macos-x86_64"
    } else {
        "unknown"
    }
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    digest: Option<String>,
}

const PLUGIN_ALLOWLIST_JSON: &str = include_str!("../../plugin-allowlist.json");

#[derive(Debug, Deserialize)]
struct PluginAllowlist {
    pins: Vec<PluginPin>,
}

#[derive(Debug, Clone, Deserialize)]
struct PluginPin {
    id: String,
    repo: String,
    tag: String,
    sha256: std::collections::BTreeMap<String, String>,
}

fn plugin_allowlist() -> Result<PluginAllowlist, String> {
    serde_json::from_str(PLUGIN_ALLOWLIST_JSON)
        .map_err(|e| format!("Plugin allowlist is invalid: {e}"))
}

fn validate_plugin_repo(repo: &str) -> Result<(), String> {
    let mut parts = repo.split('/');
    let owner = parts.next().unwrap_or("");
    let name = parts.next().unwrap_or("");
    let extra = parts.next();
    let piece_ok = |part: &str| {
        !part.is_empty()
            && !part.starts_with('.')
            && part
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    };
    if extra.is_none() && piece_ok(owner) && piece_ok(name) {
        Ok(())
    } else {
        Err(format!("Refusing plugin repo '{repo}'"))
    }
}

fn validate_plugin_tag(tag: &str) -> Result<(), String> {
    let ok = !tag.is_empty()
        && tag.len() <= 64
        && tag
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'));
    if ok {
        Ok(())
    } else {
        Err(format!("Refusing plugin release tag '{tag}'"))
    }
}

fn normalized_sha256(value: &str) -> Option<String> {
    let hex = value.trim().trim_start_matches("sha256:").to_ascii_lowercase();
    (hex.len() == 64 && hex.chars().all(|c| c.is_ascii_hexdigit())).then_some(hex)
}

fn require_plugin_pin(plugin_id: &str, repo: &str) -> Result<PluginPin, String> {
    validate_plugin_repo(repo)?;
    let list = plugin_allowlist()?;
    list.pins
        .into_iter()
        .find(|pin| pin.id == plugin_id && pin.repo == repo)
        .ok_or_else(|| {
            format!(
                "Remote plugin install is disabled for '{plugin_id}'. This fork only installs a plugin when its repo, release tag, and zip sha256 are pinned in src-tauri/plugin-allowlist.json."
            )
        })
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(bytes))
}

pub async fn install_plugin_zip_from_repo(
    state: &Arc<tokio::sync::RwLock<PluginManager>>,
    plugin_id: String,
    repo: String,
) -> Result<String, String> {
    let suffix = platform_artifact_suffix();
    if suffix == "unknown" {
        return Err("Unsupported platform".to_string());
    }

    let pin = require_plugin_pin(&plugin_id, &repo)?;
    validate_plugin_tag(&pin.tag)?;
    let expected = pin
        .sha256
        .get(suffix)
        .and_then(|value| normalized_sha256(value))
        .ok_or_else(|| format!("Plugin '{plugin_id}' has no sha256 pin for {suffix}"))?;

    let client = crate::core::http_client::apply_global_proxy(
        reqwest::Client::builder()
            .user_agent("OmniGet")
            .timeout(std::time::Duration::from_secs(60))
            .connect_timeout(std::time::Duration::from_secs(15)),
    )
    .build()
    .map_err(|e| e.to_string())?;

    let api_url = format!(
        "https://api.github.com/repos/{}/releases/tags/{}",
        pin.repo, pin.tag
    );
    let release: GitHubRelease = client
        .get(&api_url)
        .header(
            reqwest::header::ACCEPT,
            "application/vnd.github+json",
        )
        .send()
        .await
        .map_err(|e| format!("NetworkUnreachable|Failed to fetch release: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid release response: {}", e))?;

    let asset = release
        .assets
        .iter()
        .find(|a| a.name.contains(suffix) && a.name.ends_with(".zip"))
        .ok_or_else(|| format!("No artifact found for {}", suffix))?;

    let digest = asset
        .digest
        .as_deref()
        .and_then(normalized_sha256)
        .ok_or_else(|| {
            format!(
                "{} has no sha256 digest from GitHub; download discarded",
                asset.name
            )
        })?;
    if digest != expected {
        return Err(format!(
            "Pinned sha256 for {} does not match the GitHub release digest; download discarded",
            asset.name
        ));
    }

    if !asset.browser_download_url.starts_with("https://") {
        return Err(format!(
            "{} has a non-https download URL; download discarded",
            asset.name
        ));
    }

    let zip_bytes = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .map_err(|e| format!("NetworkUnreachable|Failed to download: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("NetworkUnreachable|Failed to read download: {}", e))?;

    let actual = sha256_hex(&zip_bytes);
    if actual != expected {
        return Err(format!(
            "Plugin zip hash does not match the pin — expected {expected}, got {actual}. Download discarded."
        ));
    }

    let plugin_dir = {
        let manager = state.read().await;
        manager.plugin_dir(&plugin_id).map_err(|e| e.to_string())?
    };
    std::fs::create_dir_all(&plugin_dir).map_err(|e| e.to_string())?;

    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("Invalid ZIP: {}", e))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let mangled = file.mangled_name();
        let outpath = plugin_dir.join(&mangled);
        if !outpath.starts_with(&plugin_dir) {
            return Err("Malicious zip path traversal detected".to_string());
        }
        if file.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            if outpath.exists() {
                let old = outpath.with_extension("old");
                let _ = std::fs::remove_file(&old);
                let _ = std::fs::rename(&outpath, &old);
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    let version = release.tag_name.trim_start_matches('v').to_string();

    let mut manager = state.write().await;
    manager
        .register_installed(omniget_plugin_sdk::InstalledPlugin {
            id: plugin_id.clone(),
            version: version.clone(),
            installed_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            enabled: true,
            repo: Some(repo),
            source_release: Some(release.tag_name),
        })
        .map_err(|e| e.to_string())?;

    Ok(version)
}

#[tauri::command]
pub async fn install_plugin_from_registry(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
    plugin_id: String,
    repo: String,
) -> Result<String, String> {
    let version =
        install_plugin_zip_from_repo(&state.inner().clone(), plugin_id.clone(), repo).await?;
    {
        let mut manager = state.write().await;
        if !manager.is_loaded(&plugin_id) {
            let plugins_dir = manager.plugins_dir().to_path_buf();
            let host = build_plugin_host(&app, plugins_dir);
            let _ = manager.load_one(&plugin_id, host);
        }
    }
    emit_plugins_changed(&app);
    Ok(version)
}

#[derive(Debug, Serialize)]
pub struct PluginUpdateInfo {
    pub id: String,
    pub installed_version: String,
    pub latest_version: String,
    pub repo: String,
    pub has_update: bool,
}

#[tauri::command]
pub async fn check_plugin_updates(
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
) -> Result<Vec<PluginUpdateInfo>, String> {
    let installed = {
        let manager = state.read().await;
        manager.installed_plugins().to_vec()
    };

    let allow = plugin_allowlist()?;
    let mut updates = Vec::new();

    for plugin in &installed {
        let Some(pin) = allow.pins.iter().find(|pin| pin.id == plugin.id) else {
            continue;
        };

        let latest = pin.tag.trim_start_matches('v').to_string();
        let has_update = latest != plugin.version;

        updates.push(PluginUpdateInfo {
            id: plugin.id.clone(),
            installed_version: plugin.version.clone(),
            latest_version: latest,
            repo: pin.repo.clone(),
            has_update,
        });
    }

    Ok(updates)
}

#[tauri::command]
pub async fn update_plugin(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<tokio::sync::RwLock<PluginManager>>>,
    plugin_id: String,
    repo: String,
) -> Result<String, String> {
    install_plugin_from_registry(app, state, plugin_id, repo).await
}

#[cfg(test)]
mod tests {
    use super::{normalized_sha256, plugin_allowlist, require_plugin_pin, validate_plugin_repo, validate_plugin_tag};

    #[test]
    fn allowlist_starts_with_no_remote_plugins() {
        let list = plugin_allowlist().expect("allowlist json");
        assert!(list.pins.is_empty());
    }

    #[test]
    fn repo_must_be_a_single_owner_and_name() {
        assert!(validate_plugin_repo("OpenSelena/omniget-plugins").is_ok());
        assert!(validate_plugin_repo("https://evil.example/x").is_err());
        assert!(validate_plugin_repo("../etc").is_err());
        assert!(validate_plugin_repo("a/b/c").is_err());
        assert!(validate_plugin_repo(".hidden/name").is_err());
    }

    #[test]
    fn tag_rejects_path_characters() {
        assert!(validate_plugin_tag("v1.2.3").is_ok());
        assert!(validate_plugin_tag("release-1.37.0").is_ok());
        assert!(validate_plugin_tag("../v1").is_err());
        assert!(validate_plugin_tag("v1/latest").is_err());
    }

    #[test]
    fn unpinned_plugin_is_refused_before_any_download() {
        let err = require_plugin_pin("courses", "OpenSelena/omniget-courses").unwrap_err();
        assert!(err.contains("disabled"));
    }

    #[test]
    fn sha256_accepts_a_github_digest_prefix() {
        let hex = "ab".repeat(32);
        assert_eq!(normalized_sha256(&format!("sha256:{hex}")).as_deref(), Some(hex.as_str()));
        assert!(normalized_sha256("dead").is_none());
    }
}
