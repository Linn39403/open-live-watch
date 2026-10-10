#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::collections::HashSet;
mod recording;
mod recovery;
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
    let mut variable_count = 0;
    for source in v["sources"].as_array().ok_or("Missing sources")? {
        if !source_ids.insert(source["id"].as_str().ok_or("Missing source ID")?) {
            return Err("Duplicate source ID".into());
        }
        if source["provider"] == "offline" {
            let variables = source["variables"]
                .as_array()
                .ok_or("Offline source requires variables")?;
            let mut names = HashSet::new();
            for variable in variables {
                variable_count += 1;
                if !names.insert(variable["id"].as_str().ok_or("Missing variable ID")?) {
                    return Err("Duplicate variable".into());
                }
                let min = variable["min"].as_f64().ok_or("Missing range")?;
                let max = variable["max"].as_f64().ok_or("Missing range")?;
                if max <= min {
                    return Err("Invalid variable range".into());
                }
                if variable["type"] == "number" {
                    let initial = variable["initial"]
                        .as_f64()
                        .ok_or("Invalid numeric initial")?;
                    if initial < min || initial > max || variable["waveform"] == "toggle" {
                        return Err("Invalid numeric waveform/value".into());
                    }
                } else if !variable["initial"].is_boolean()
                    || !(variable["waveform"] == "constant" || variable["waveform"] == "toggle")
                {
                    return Err("Invalid boolean waveform/value".into());
                }
                if variable["waveform"] != "constant" && variable["writable"] == true {
                    return Err("Waveform cannot be writable".into());
                }
            }
        } else if source.get("variables").is_some() {
            return Err("Variables require offline provider".into());
        }
        if source["provider"] == "mock" && source["id"] == "mock-motor" {
            variable_count += 4;
        }
    }
    if variable_count > 128 {
        return Err("Catalog exceeds 128 variables".into());
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
            if widget["settings"]["graph"]["mode"] == "xy"
                && widget["settings"]["graph"].get("x").is_none()
            {
                return Err("XY graph requires X binding".into());
            }
            let series = widget["settings"]["graph"]["series"].as_array();
            let mut series_ids = std::collections::HashSet::new();
            for item in series.into_iter().flatten() {
                let id = item["id"].as_str().ok_or("Missing graph series ID")?;
                if id == "primary" || !series_ids.insert(id) {
                    return Err("Duplicate graph series ID".into());
                }
            }
            for binding in [widget.get("binding"), widget["settings"]["graph"].get("x")]
                .into_iter()
                .flatten()
                .chain(
                    series
                        .into_iter()
                        .flatten()
                        .filter_map(|s| s.get("binding")),
                )
            {
                let source = v["sources"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|s| s["id"] == binding["sourceId"])
                    .ok_or("Unknown binding source")?;
                let supported = source["provider"] == "offline"
                    || (source["provider"] == "mock" && source["id"] == "mock-motor");
                if supported {
                    let (is_bool, writable) = if source["provider"] == "offline" {
                        let variable = source["variables"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .find(|x| x["id"] == binding["symbolPath"])
                            .ok_or("Unknown variable binding")?;
                        (variable["type"] == "boolean", variable["writable"] == true)
                    } else {
                        let path = binding["symbolPath"]
                            .as_str()
                            .ok_or("Invalid symbol path")?;
                        if ![
                            "motor.speed",
                            "motor.setpoint",
                            "motor.temperature",
                            "motor.enabled",
                        ]
                        .contains(&path)
                        {
                            return Err("Unknown motor variable".into());
                        }
                        (
                            path == "motor.enabled",
                            ["motor.setpoint", "motor.enabled"].contains(&path),
                        )
                    };
                    let kind = widget["kind"].as_str().unwrap();
                    if is_bool != ["led", "switch", "button"].contains(&kind) {
                        return Err("Incompatible binding type".into());
                    }
                    if is_bool
                        && (binding["gain"].as_f64() != Some(1.)
                            || binding["offset"].as_f64() != Some(0.))
                    {
                        return Err("Boolean mapping must be identity".into());
                    }
                    if binding["writable"] == true && !writable {
                        return Err("Binding cannot grant write permission".into());
                    }
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
        .manage(recovery::RecoveryState::default())
        .manage(recording::RecordingState::default())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                window.app_handle().exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            recovery::recovery_read,
            recovery::recovery_begin,
            recovery::recovery_write,
            recovery::recovery_clear,
            recording::start_recording,
            recording::append_recording,
            recording::finish_recording,
            close_app
        ])
        .run(tauri::generate_context!())
        .expect("desktop application failed");
}
#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}
#[cfg(test)]
mod tests {
    use super::*;
    fn configured_workspace() -> serde_json::Value {
        let mut w: serde_json::Value =
            serde_json::from_str(include_str!("../../examples/demo.olw.json")).unwrap();
        w["sources"] = serde_json::json!([{ "id":"lab","provider":"offline","path":"inline","variables":[
            {"id":"wave","type":"number","units":"V","initial":5,"min":0,"max":10,"writable":false,"waveform":"sine","periodMs":1000},
            {"id":"manual","type":"number","units":"V","initial":2,"min":0,"max":10,"writable":true,"waveform":"constant","periodMs":1000},
            {"id":"enabled","type":"boolean","units":"","initial":false,"min":0,"max":1,"writable":true,"waveform":"constant","periodMs":1000}
        ]}]);
        let mut widget = w["screens"][0]["widgets"][0].clone();
        widget["kind"] = "graph".into();
        widget["binding"]["sourceId"] = "lab".into();
        widget["binding"]["symbolPath"] = "wave".into();
        widget["settings"]["graph"] = serde_json::json!({"mode":"xy","capacity":200,"windowMs":10000,"autoY":false,"x":{"sourceId":"lab","symbolPath":"manual","gain":2,"offset":1,"units":"V","periodMs":100,"writable":false}});
        w["screens"][0]["widgets"] = serde_json::json!([widget]);
        w
    }
    #[test]
    fn offline_sources_graph_roundtrip_and_semantic_rejections() {
        let workspace = configured_workspace();
        assert!(validate(&workspace.to_string()).is_ok());
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("offline.olw.json");
        save_workspace(path.to_string_lossy().to_string(), workspace.to_string()).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                &load_workspace(path.to_string_lossy().to_string()).unwrap()
            )
            .unwrap(),
            workspace
        );
        for case in 0..10 {
            let mut bad = workspace.clone();
            match case {
                0 => bad["sources"][0]["variables"][0]["initial"] = true.into(),
                1 => bad["sources"][0]["variables"][0]["writable"] = true.into(),
                2 => bad["sources"][0]["variables"][0]["waveform"] = "toggle".into(),
                3 => bad["sources"][0]["variables"][0]["periodMs"] = 0.into(),
                4 => bad["sources"][0]["variables"][0]["max"] = serde_json::json!(1e308),
                5 => bad["sources"][0]["variables"][1]["id"] = "wave".into(),
                6 => bad["screens"][0]["widgets"][0]["binding"]["symbolPath"] = "missing".into(),
                7 => bad["screens"][0]["widgets"][0]["binding"]["writable"] = true.into(),
                8 => {
                    bad["screens"][0]["widgets"][0]["settings"]["graph"]["x"]["symbolPath"] =
                        "enabled".into()
                }
                _ => {
                    bad["screens"][0]["widgets"][0]["settings"]["graph"]["x"]["sourceId"] =
                        "missing".into()
                }
            }
            assert!(validate(&bad.to_string()).is_err(), "case {case}");
            assert!(save_workspace(path.to_string_lossy().to_string(), bad.to_string()).is_err());
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&std::fs::read_to_string(&path).unwrap())
                    .unwrap(),
                workspace
            );
        }
    }
    #[test]
    fn graph_series_native_roundtrip_and_rejections() {
        let mut workspace = configured_workspace();
        let binding = workspace["screens"][0]["widgets"][0]["binding"].clone();
        workspace["screens"][0]["widgets"][0]["settings"]["graph"]["series"] = serde_json::json!([{"id":"second","name":"Other voltage","color":"#327fbd","visible":true,"binding":binding}]);
        let dir = tempfile::tempdir().unwrap();
        let path = dir
            .path()
            .join("series.olw.json")
            .to_string_lossy()
            .to_string();
        save_workspace(path.clone(), workspace.to_string()).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&load_workspace(path.clone()).unwrap())
                .unwrap(),
            workspace
        );
        for case in 0..5 {
            let mut bad = workspace.clone();
            let series = &mut bad["screens"][0]["widgets"][0]["settings"]["graph"]["series"];
            match case {
                0 => {
                    let item = series[0].clone();
                    series.as_array_mut().unwrap().push(item);
                }
                1 => series[0]["id"] = "primary".into(),
                2 => series[0]["binding"]["symbolPath"] = "missing".into(),
                3 => series[0]["binding"]["symbolPath"] = "enabled".into(),
                _ => {
                    let item = series[0].clone();
                    *series = serde_json::Value::Array(
                        (0..8)
                            .map(|i| {
                                let mut v = item.clone();
                                v["id"] = format!("s{i}").into();
                                v
                            })
                            .collect(),
                    );
                }
            }
            assert!(
                save_workspace(path.clone(), bad.to_string()).is_err(),
                "case {case}"
            );
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&load_workspace(path.clone()).unwrap())
                    .unwrap(),
                workspace
            );
        }
    }
    #[test]
    fn legacy_catalog_binding_type_access_and_boolean_identity() {
        let original: serde_json::Value =
            serde_json::from_str(include_str!("../../examples/demo.olw.json")).unwrap();
        for case in 0..4 {
            let mut bad = original.clone();
            match case {
                0 => bad["screens"][0]["widgets"][0]["binding"]["symbolPath"] = "missing".into(),
                1 => {
                    bad["screens"][0]["widgets"][0]["binding"]["symbolPath"] =
                        "motor.enabled".into()
                }
                2 => bad["screens"][0]["widgets"][0]["binding"]["writable"] = true.into(),
                _ => bad["screens"][0]["widgets"][2]["binding"]["gain"] = 2.into(),
            }
            assert!(validate(&bad.to_string()).is_err());
        }
    }
    #[test]
    fn workspace_validation() {
        assert!(validate(include_str!("../../examples/demo.olw.json")).is_ok());
        assert!(validate("{\"schemaVersion\":2}").is_err());
        assert!(validate("{}").is_err());
    }
    #[test]
    fn editor_and_graph_options_roundtrip_and_reject_invalid_fields() {
        let mut workspace: serde_json::Value =
            serde_json::from_str(include_str!("../../examples/demo.olw.json")).unwrap();
        let widget = &mut workspace["screens"][0]["widgets"][0];
        widget["locked"] = true.into();
        widget["groupId"] = "engineering-group".into();
        widget["kind"] = "graph".into();
        widget["settings"]["graph"] =
            serde_json::json!({"mode":"time","capacity":200,"windowMs":10000,"traceMode":"points"});
        assert!(validate(&workspace.to_string()).is_ok());
        workspace["screens"][0]["widgets"][0]["settings"]["graph"]["traceMode"] = "line".into();
        assert!(validate(&workspace.to_string()).is_ok());
        for (field, value) in [
            ("locked", serde_json::json!("true")),
            ("groupId", serde_json::json!("")),
        ] {
            let mut bad = workspace.clone();
            bad["screens"][0]["widgets"][0][field] = value;
            assert!(validate(&bad.to_string()).is_err());
        }
        workspace["screens"][0]["widgets"][0]["settings"]["graph"]["traceMode"] = "script".into();
        assert!(validate(&workspace.to_string()).is_err());
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
    #[test]
    fn blank_project_and_unbound_widget_roundtrip_without_sources() {
        let mut workspace: serde_json::Value =
            serde_json::from_str(include_str!("../../examples/demo.olw.json")).unwrap();
        workspace["sources"] = serde_json::json!([]);
        workspace["screens"][0]["widgets"] = serde_json::json!([]);
        let directory = tempfile::tempdir().unwrap();
        let path = directory
            .path()
            .join("Blank Ω.olw.json")
            .to_string_lossy()
            .to_string();
        save_workspace(path.clone(), workspace.to_string()).unwrap();
        let mut unbound =
            serde_json::from_str::<serde_json::Value>(include_str!("../../examples/demo.olw.json"))
                .unwrap()["screens"][0]["widgets"][0]
                .clone();
        unbound.as_object_mut().unwrap().remove("binding");
        workspace["screens"][0]["widgets"] = serde_json::json!([unbound]);
        save_workspace(path.clone(), workspace.to_string()).unwrap();
        let reopened: serde_json::Value =
            serde_json::from_str(&load_workspace(path).unwrap()).unwrap();
        assert_eq!(reopened["sources"], serde_json::json!([]));
        assert!(reopened["screens"][0]["widgets"][0]
            .get("binding")
            .is_none());
    }
}
