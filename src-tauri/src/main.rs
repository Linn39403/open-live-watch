#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::collections::HashSet;
fn validate(data: &str) -> Result<(), String> {
    let v: serde_json::Value = serde_json::from_str(data).map_err(|e| e.to_string())?;
    let schema: serde_json::Value =
        serde_json::from_str(include_str!("../../schemas/workspace.schema.json"))
            .map_err(|e| e.to_string())?;
    let validator = jsonschema::validator_for(&schema).map_err(|e| e.to_string())?;
    validator.validate(&v).map_err(|e| e.to_string())?;
    if v["schemaVersion"] != 1 || !v["name"].is_string() {
        return Err("Unsupported or malformed workspace".into());
    }
    let screens = v["screens"].as_array().ok_or("Missing screens")?;
    if screens.is_empty() {
        return Err("At least one screen required".into());
    }
    let mut ids = HashSet::new();
    let mut screen_ids = HashSet::new();
    let mut source_ids = HashSet::new();
    for source in v["sources"].as_array().ok_or("Missing sources")? {
        if !source_ids.insert(source["id"].as_str().ok_or("Missing source ID")?) {
            return Err("Duplicate source ID".into());
        }
    }
    for screen in screens {
        if !screen_ids.insert(screen["id"].as_str().ok_or("Missing screen ID")?) {
            return Err("Duplicate screen ID".into());
        }
        for widget in screen["widgets"].as_array().ok_or("Missing widgets")? {
            let id = widget["id"].as_str().ok_or("Missing widget ID")?;
            if !ids.insert(id) {
                return Err("Duplicate widget ID".into());
            }
            if let Some(binding) = widget.get("binding") {
                if !source_ids.contains(
                    binding["sourceId"]
                        .as_str()
                        .ok_or("Missing binding source")?,
                ) {
                    return Err("Unknown binding source".into());
                }
            }
            let min = widget["settings"]["min"].as_f64().unwrap_or(0.);
            let max = widget["settings"]["max"].as_f64().unwrap_or(100.);
            if max <= min {
                return Err("Invalid range".into());
            }
            for key in ["x", "y", "width", "height", "rotation"] {
                let n = widget["rect"][key].as_f64().ok_or("Invalid geometry")?;
                if !n.is_finite() || ((key == "width" || key == "height") && n <= 0.) {
                    return Err("Invalid geometry".into());
                }
            }
        }
    }
    Ok(())
}
#[tauri::command]
fn load_workspace(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 10 * 1024 * 1024 {
        return Err("Workspace exceeds 10 MB limit".into());
    }
    let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    validate(&data)?;
    Ok(data)
}
#[tauri::command]
fn save_workspace(path: String, data: String) -> Result<(), String> {
    if data.len() > 10 * 1024 * 1024 {
        return Err("Workspace exceeds 10 MB limit".into());
    }
    validate(&data)?;
    use std::io::Write;
    let destination = std::path::Path::new(&path);
    let directory = destination
        .parent()
        .ok_or("Missing destination directory")?;
    let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
    temp.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(destination).map_err(|e| e.to_string())?;
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![load_workspace, save_workspace])
        .run(tauri::generate_context!())
        .expect("desktop application failed");
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn workspace_validation() {
        assert!(validate(include_str!("../../examples/demo.olw.json")).is_ok());
        assert!(validate("{\"schemaVersion\":2}").is_err());
        assert!(validate("{}").is_err());
    }
    #[test]
    fn invalid_save_preserves_previous_file_and_valid_save_replaces_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("Motor Ω.olw.json");
        let original = include_str!("../../examples/demo.olw.json");
        std::fs::write(&path, original).unwrap();
        assert!(save_workspace(path.to_string_lossy().to_string(), "{}".into()).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), original);
        let mut changed: serde_json::Value = serde_json::from_str(original).unwrap();
        changed["name"] = "Updated motor".into();
        save_workspace(path.to_string_lossy().to_string(), changed.to_string()).unwrap();
        assert!(load_workspace(path.to_string_lossy().to_string())
            .unwrap()
            .contains("Updated motor"));
    }
    #[test]
    fn colors_roundtrip_and_invalid_color_save_preserves_workspace() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory
            .path()
            .join("colored.olw.json")
            .to_string_lossy()
            .to_string();
        let mut workspace: serde_json::Value =
            serde_json::from_str(include_str!("../../examples/demo.olw.json")).unwrap();
        workspace["screens"][0]["widgets"][0]["settings"]["color"] = "#327fbd".into();
        workspace["screens"][0]["widgets"][0]["settings"]["needleColor"] = "#F27C20".into();
        save_workspace(path.clone(), workspace.to_string()).unwrap();
        let saved = load_workspace(path.clone()).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&saved).unwrap(),
            workspace
        );
        for invalid in [
            "green",
            "#fff",
            "#12345678",
            "url(https://example.com)",
            "#ffffff\n",
        ] {
            for field in ["color", "needleColor"] {
                let mut bad = workspace.clone();
                bad["screens"][0]["widgets"][0]["settings"][field] = invalid.into();
                assert!(save_workspace(path.clone(), bad.to_string()).is_err());
                assert_eq!(load_workspace(path.clone()).unwrap(), saved);
            }
        }
    }
}
