use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;
const LIMIT: usize = 10 * 1024 * 1024 + 1024;
#[derive(Default)]
pub struct RecoveryStore {
    pub generation: u64,
    revision: u64,
    protected: bool,
}
pub type RecoveryState = Mutex<RecoveryStore>;
fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recovery.json"))
}
fn validate_snapshot(value: &serde_json::Value) -> Result<(), String> {
    let object = value.as_object().ok_or("Recovery must be an object")?;
    let required = [
        "formatVersion",
        "generation",
        "revision",
        "savedPath",
        "workspace",
    ];
    if object.len() != required.len() || required.iter().any(|key| !object.contains_key(*key)) {
        return Err("Unknown or missing recovery fields".into());
    }
    let mut metadata = value.clone();
    metadata.as_object_mut().unwrap().remove("workspace");
    if metadata.to_string().len() > 1024 || value["workspace"].to_string().len() > 10 * 1024 * 1024
    {
        return Err("Recovery metadata/workspace exceeds size limit".into());
    }
    if value["formatVersion"] != 1 {
        return Err("Unsupported recovery format".into());
    }
    for field in ["generation", "revision"] {
        let n = value[field].as_u64().ok_or("Invalid recovery counter")?;
        if n > 9007199254740991 {
            return Err("Recovery counter exhausted".into());
        }
    }
    if !value["savedPath"].is_null()
        && (!value["savedPath"].is_string() || value["savedPath"].as_str().unwrap().len() > 800)
    {
        return Err("Invalid recovery path".into());
    }
    crate::validate(&value["workspace"].to_string())
}
impl RecoveryStore {
    fn read(&mut self, path: &Path) -> serde_json::Value {
        if !path.exists() {
            return serde_json::json!({"status":"missing","generation":self.generation});
        }
        self.protected = true;
        let result = (|| {
            if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > LIMIT as u64 {
                return Err("Recovery exceeds size limit".to_string());
            }
            let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
            let value: serde_json::Value =
                serde_json::from_str(&data).map_err(|e| e.to_string())?;
            validate_snapshot(&value)?;
            Ok(value)
        })();
        match result {
            Ok(value) => {
                serde_json::json!({"status":"valid","snapshot":value,"generation":self.generation})
            }
            Err(reason) => {
                serde_json::json!({"status":"corrupt","reason":reason,"generation":self.generation})
            }
        }
    }
    fn begin(&mut self, replace_existing: bool) -> Result<u64, String> {
        if self.protected && !replace_existing {
            return Err("Existing recovery requires explicit Restore/Discard".into());
        }
        self.generation = self
            .generation
            .checked_add(1)
            .ok_or("Recovery generation exhausted")?;
        self.revision = 0;
        self.protected = false;
        Ok(self.generation)
    }
    fn write(
        &mut self,
        path: &Path,
        generation: u64,
        revision: u64,
        saved_path: Option<String>,
        data: String,
    ) -> Result<(), String> {
        if self.protected {
            return Err("Preserved recovery requires explicit decision".into());
        }
        if generation != self.generation || revision <= self.revision {
            return Err("Stale recovery snapshot ignored".into());
        }
        crate::validate(&data)?;
        let value = serde_json::json!({"formatVersion":1,"generation":generation,"revision":revision,"savedPath":saved_path,"workspace":serde_json::from_str::<serde_json::Value>(&data).map_err(|e|e.to_string())?});
        validate_snapshot(&value)?;
        let serialized = value.to_string();
        if serialized.len() > LIMIT {
            return Err("Recovery exceeds 10MiB workspace +1KiB metadata limit".into());
        }
        let directory = path.parent().ok_or("Invalid recovery directory")?;
        std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
        let mut temp = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
        temp.write_all(serialized.as_bytes())
            .map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(path).map_err(|e| e.to_string())?;
        self.revision = revision;
        Ok(())
    }
    fn clear(&mut self, path: &Path, generation: u64) -> Result<(), String> {
        if generation != self.generation {
            return Err("Stale recovery clear ignored".into());
        }
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        self.protected = false;
        self.begin(true)?;
        Ok(())
    }
}
#[tauri::command]
pub fn recovery_read(
    app: tauri::AppHandle,
    state: tauri::State<RecoveryState>,
) -> Result<serde_json::Value, String> {
    let path = path(&app)?;
    Ok(state.lock().map_err(|e| e.to_string())?.read(&path))
}
#[tauri::command]
pub fn recovery_begin(
    state: tauri::State<RecoveryState>,
    replace_existing: bool,
) -> Result<u64, String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .begin(replace_existing)
}
#[tauri::command]
pub fn recovery_write(
    app: tauri::AppHandle,
    state: tauri::State<RecoveryState>,
    generation: u64,
    revision: u64,
    saved_path: Option<String>,
    data: String,
) -> Result<(), String> {
    state.lock().map_err(|e| e.to_string())?.write(
        &path(&app)?,
        generation,
        revision,
        saved_path,
        data,
    )
}
#[tauri::command]
pub fn recovery_clear(
    app: tauri::AppHandle,
    state: tauri::State<RecoveryState>,
    generation: u64,
) -> Result<(), String> {
    state
        .lock()
        .map_err(|e| e.to_string())?
        .clear(&path(&app)?, generation)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recovery_rejects_late_generations_and_preserves_corrupt_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("recovery.json");
        let mut store = RecoveryStore::default();
        let first = store.begin(false).unwrap();
        let data = include_str!("../../examples/demo.olw.json");
        store.write(&path, first, 2, None, data.into()).unwrap();
        let previous = std::fs::read(&path).unwrap();
        assert!(store.write(&path, first, 1, None, data.into()).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), previous);
        let newer = store.begin(false).unwrap();
        assert!(store.write(&path, first, 3, None, data.into()).is_err());
        assert!(store.clear(&path, first).is_err());
        store.write(&path, newer, 1, None, data.into()).unwrap();
        std::fs::write(&path, b"{broken").unwrap();
        assert_eq!(store.read(&path)["status"], "corrupt");
        assert!(store.begin(false).is_err());
        assert!(store.write(&path, newer, 2, None, data.into()).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"{broken");
        store.clear(&path, newer).unwrap();
        assert!(!path.exists());
    }
}
