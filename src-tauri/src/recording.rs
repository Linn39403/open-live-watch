use std::{
    collections::{HashMap, HashSet},
    fs::{File, OpenOptions},
    io::Write,
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
const FILE_LIMIT: u64 = 256 * 1024 * 1024;
const HEADER:&str="csv_text_encoding,protocol_version,epoch,catalog_revision,sequence,elapsed_simulation_ms,host_received_at_utc,source_id,symbol_path,type,value,units,quality,reason\r\n";
struct Symbol {
    source: String,
    path: String,
    kind: String,
    units: String,
    min: f64,
    max: f64,
}
pub struct Recording {
    id: u64,
    file: File,
    epoch: u64,
    catalog_revision: u64,
    catalog: HashMap<String, Symbol>,
    sequence: u64,
    time: u64,
    bytes: u64,
    rows: u64,
    failed: bool,
}
pub type RecordingState = Arc<Mutex<Option<Recording>>>;
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
fn pair(source: &str, path: &str) -> String {
    serde_json::json!([source, path]).to_string()
}
fn csv_whitespace(c: char) -> bool {
    matches!(c,'\u{0009}'..='\u{000d}'|'\u{0020}'|'\u{00a0}'|'\u{1680}'|'\u{2000}'..='\u{200a}'|'\u{2028}'|'\u{2029}'|'\u{202f}'|'\u{205f}'|'\u{3000}'|'\u{feff}')
}
fn cell(value: &str) -> String {
    let first = value.trim_start_matches(csv_whitespace).chars().next();
    let safe = if value.starts_with('\'') || first.is_some_and(|c| "=+-@".contains(c)) {
        format!("'{value}")
    } else {
        value.into()
    };
    format!("\"{}\"", safe.replace('"', "\"\""))
}
fn valid_utc(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 24
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || b[19] != b'.'
        || b[23] != b'Z'
    {
        return false;
    }
    if b.iter()
        .enumerate()
        .any(|(i, c)| ![4, 7, 10, 13, 16, 19, 23].contains(&i) && !c.is_ascii_digit())
    {
        return false;
    }
    let n = |a: usize, z: usize| s[a..z].parse::<u32>().unwrap();
    let year = n(0, 4);
    let month = n(5, 7);
    let day = n(8, 10);
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 0,
    };
    day >= 1 && day <= days && n(11, 13) < 24 && n(14, 16) < 60 && n(17, 19) < 60
}
fn catalog(workspace: &serde_json::Value) -> Result<HashMap<String, Symbol>, String> {
    let mut result = HashMap::new();
    for source in workspace["sources"].as_array().ok_or("Missing sources")? {
        let id = source["id"].as_str().ok_or("Invalid source ID")?;
        if source["provider"] == "offline" {
            for variable in source["variables"].as_array().ok_or("Missing variables")? {
                let path = variable["id"].as_str().unwrap();
                result.insert(
                    pair(id, path),
                    Symbol {
                        source: id.into(),
                        path: path.into(),
                        kind: variable["type"].as_str().unwrap().into(),
                        units: variable["units"].as_str().unwrap().into(),
                        min: variable["min"].as_f64().unwrap(),
                        max: variable["max"].as_f64().unwrap(),
                    },
                );
            }
        } else if source["provider"] == "mock" && id == "mock-motor" {
            for (path, kind, units, min, max) in [
                ("motor.speed", "number", "rpm", 0., 3000.),
                ("motor.setpoint", "number", "rpm", 0., 3000.),
                ("motor.temperature", "number", "°C", 0., 200.),
                ("motor.enabled", "boolean", "", 0., 1.),
            ] {
                result.insert(
                    pair(id, path),
                    Symbol {
                        source: id.into(),
                        path: path.into(),
                        kind: kind.into(),
                        units: units.into(),
                        min,
                        max,
                    },
                );
            }
        }
    }
    if result.is_empty() || result.len() > 128 {
        return Err("Recording requires 1–128 supported variables".into());
    }
    Ok(result)
}
impl Recording {
    fn start(
        path: &Path,
        epoch: u64,
        catalog_revision: u64,
        workspace: &str,
    ) -> Result<Self, String> {
        crate::validate(workspace)?;
        if epoch > 9007199254740991 || catalog_revision == 0 || catalog_revision > 9007199254740991
        {
            return Err("Invalid recording session identity".into());
        }
        let catalog = catalog(&serde_json::from_str(workspace).map_err(|e| e.to_string())?)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|e| format!("Choose a new file; recording never overwrites: {e}"))?;
        file.write_all(HEADER.as_bytes())
            .map_err(|e| e.to_string())?;
        Ok(Self {
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
            file,
            epoch,
            catalog_revision,
            catalog,
            sequence: 0,
            time: 0,
            bytes: HEADER.len() as u64,
            rows: 0,
            failed: false,
        })
    }
    fn append(
        &mut self,
        id: u64,
        epoch: u64,
        catalog_revision: u64,
        frames: &str,
    ) -> Result<(), String> {
        if id != self.id
            || epoch != self.epoch
            || catalog_revision != self.catalog_revision
            || self.failed
        {
            return Err("Stale or failed recording session".into());
        }
        if frames.len() > 128 * 1024 {
            return Err("Recording chunk exceeds128KiB".into());
        }
        let values: serde_json::Value = serde_json::from_str(frames).map_err(|e| e.to_string())?;
        let frames = values
            .as_array()
            .ok_or("Recording frames must be an array")?;
        if frames.is_empty() {
            return Err("Empty recording chunk".into());
        }
        let mut text = String::new();
        let mut sequence = self.sequence;
        let mut time = self.time;
        let mut row_count = 0;
        for frame in frames {
            let keys = frame.as_object().ok_or("Invalid log frame")?;
            if keys.len() != 4
                || !["sequence", "timeMs", "hostReceivedAtUtc", "samples"]
                    .iter()
                    .all(|k| keys.contains_key(*k))
            {
                return Err("Unknown log frame fields".into());
            }
            let next_sequence = frame["sequence"].as_u64().ok_or("Invalid sequence")?;
            let next_time = frame["timeMs"].as_u64().ok_or("Invalid simulation time")?;
            if next_sequence <= sequence
                || next_time <= time
                || next_sequence > 9007199254740991
                || next_time > 9007199254740991
            {
                return Err("Replayed/reversed recording frame".into());
            }
            let host = frame["hostReceivedAtUtc"]
                .as_str()
                .ok_or("Continuous recording requires host receipt UTC")?;
            if !valid_utc(host) {
                return Err("Invalid host receipt UTC".into());
            }
            let samples = frame["samples"].as_array().ok_or("Missing log samples")?;
            if samples.len() != self.catalog.len() {
                return Err("Incomplete recording catalog frame".into());
            }
            let mut seen = HashSet::new();
            for sample in samples {
                let object = sample.as_object().ok_or("Invalid log sample")?;
                if object.keys().any(|k| {
                    ![
                        "sourceId",
                        "symbolPath",
                        "type",
                        "value",
                        "quality",
                        "reason",
                    ]
                    .contains(&k.as_str())
                }) {
                    return Err("Unknown log sample field".into());
                }
                let source = sample["sourceId"].as_str().ok_or("Invalid source")?;
                let path = sample["symbolPath"].as_str().ok_or("Invalid variable")?;
                let key = pair(source, path);
                if !seen.insert(key.clone()) {
                    return Err("Duplicate log sample".into());
                }
                let symbol = self.catalog.get(&key).ok_or("Unknown recording variable")?;
                if sample["type"] != symbol.kind {
                    return Err("Recording sample type mismatch".into());
                }
                let quality = sample["quality"].as_str().ok_or("Invalid quality")?;
                if ![
                    "good",
                    "stale",
                    "unresolved",
                    "unsupported",
                    "transport-error",
                    "decode-error",
                ]
                .contains(&quality)
                {
                    return Err("Unknown recording quality".into());
                }
                let value = &sample["value"];
                if quality == "good" {
                    if symbol.kind == "boolean" {
                        if !value.is_boolean() {
                            return Err("Invalid boolean log value".into());
                        }
                    } else {
                        let n = value.as_f64().ok_or("Invalid numeric log value")?;
                        if !n.is_finite() || n < symbol.min || n > symbol.max {
                            return Err("Numeric log value outside catalog range".into());
                        }
                    }
                } else if !value.is_null() {
                    return Err("Bad quality requires null log value".into());
                }
                let reason = if sample.get("reason").is_some() {
                    sample["reason"].as_str().ok_or("Invalid log reason")?
                } else {
                    ""
                };
                if reason.len() > 1024 {
                    return Err("Log reason too long".into());
                }
                let numeric = if value.is_null() {
                    String::new()
                } else {
                    value.to_string()
                };
                let prefix = format!(
                    "\"spreadsheet-safe-v1\",1,{},{},{next_sequence},{next_time},",
                    self.epoch, self.catalog_revision
                );
                text.push_str(&prefix);
                text.push_str(
                    &[
                        cell(host),
                        cell(&symbol.source),
                        cell(&symbol.path),
                        cell(&symbol.kind),
                        numeric,
                        cell(&symbol.units),
                        cell(quality),
                        cell(reason),
                    ]
                    .join(","),
                );
                text.push_str("\r\n");
                row_count += 1;
                if row_count > 256 {
                    return Err("Recording chunk exceeds256rows".into());
                }
            }
            sequence = next_sequence;
            time = next_time;
        }
        if text.len() > 128 * 1024 {
            return Err("Serialized CSV chunk exceeds 128KiB".into());
        }
        if self.bytes + text.len() as u64 > FILE_LIMIT {
            self.failed = true;
            return Err("Development recording reached256MiB file limit; partial recording".into());
        }
        if let Err(e) = self.file.write_all(text.as_bytes()) {
            self.failed = true;
            return Err(format!(
                "Recording write failed; partial file, no retry: {e}"
            ));
        }
        self.sequence = sequence;
        self.time = time;
        self.bytes += text.len() as u64;
        self.rows += row_count;
        Ok(())
    }
    fn finish(mut self) -> Result<(), String> {
        self.file.flush().map_err(|e| e.to_string())?;
        self.file.sync_all().map_err(|e| e.to_string())?;
        if self.failed {
            return Err("Recording closed with partial data".into());
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn start_recording(
    state: tauri::State<'_, RecordingState>,
    path: String,
    epoch: u64,
    catalog_revision: u64,
    workspace: String,
) -> Result<u64, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Err("Stop the existing recording first".into());
        }
        let recording = Recording::start(Path::new(&path), epoch, catalog_revision, &workspace)?;
        let id = recording.id;
        *guard = Some(recording);
        Ok(id)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn append_recording(
    state: tauri::State<'_, RecordingState>,
    id: u64,
    epoch: u64,
    catalog_revision: u64,
    frames: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .lock()
            .map_err(|e| e.to_string())?
            .as_mut()
            .ok_or("Recording is stopped")?
            .append(id, epoch, catalog_revision, &frames)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn finish_recording(
    state: tauri::State<'_, RecordingState>,
    id: u64,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if guard.as_ref().is_none_or(|r| r.id != id) {
            return Err("Unknown recording handle".into());
        }
        guard.take().unwrap().finish()
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn frame(seq: u64) -> serde_json::Value {
        serde_json::json!({"sequence":seq,"timeMs":seq*50,"hostReceivedAtUtc":"2026-10-10T08:00:00.000Z","samples":[
 {"sourceId":"mock-motor","symbolPath":"motor.speed","type":"number","value":-0.0,"quality":"good"},
 {"sourceId":"mock-motor","symbolPath":"motor.setpoint","type":"number","value":25.0,"quality":"good"},
 {"sourceId":"mock-motor","symbolPath":"motor.temperature","type":"number","value":30.0,"quality":"good"},
 {"sourceId":"mock-motor","symbolPath":"motor.enabled","type":"boolean","value":null,"quality":"unresolved","reason":"=unknown,\"日本語\"\nnext"}]})
    }
    #[test]
    fn safe_csv_and_real_utc() {
        assert_eq!(cell("'hello"), "\"''hello\"");
        assert_eq!(cell("\t'hello"), "\"\t'hello\"");
        assert_eq!(cell("\u{0085}=x"), "\"\u{0085}=x\"");
        assert_eq!(cell("\u{feff}=x"), "\"'\u{feff}=x\"");
        assert!(valid_utc("2024-02-29T23:59:59.999Z"));
        for invalid in ["TZ", "2026-02-29T08:00:00.000Z", "2026-01-01T25:00:00.000Z"] {
            assert!(!valid_utc(invalid));
        }
    }
    #[test]
    fn validates_chunk_before_append_and_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("log.csv");
        let workspace = include_str!("../../examples/demo.olw.json");
        let mut r = Recording::start(&path, 7, 2, workspace).unwrap();
        let id = r.id;
        assert!(Recording::start(&path, 7, 2, workspace).is_err());
        let header = std::fs::read(&path).unwrap();
        let good = frame(1);
        let mut bad = frame(2);
        bad["samples"][0]["value"] = 9000.into();
        assert!(r
            .append(id, 7, 2, &serde_json::json!([good, bad]).to_string())
            .is_err());
        assert_eq!(std::fs::read(&path).unwrap(), header);
        assert!(r
            .append(id, 8, 2, &serde_json::json!([frame(1)]).to_string())
            .is_err());
        r.append(id, 7, 2, &serde_json::json!([frame(1)]).to_string())
            .unwrap();
        assert!(r
            .append(id, 7, 2, &serde_json::json!([frame(1)]).to_string())
            .is_err());
        r.finish().unwrap();
        let text = std::fs::read_to_string(path).unwrap();
        assert!(text.contains("csv_text_encoding"));
        assert!(text.contains("\"spreadsheet-safe-v1\",1,7,2,1,50"));
        assert!(text.contains("'=unknown"));
    }
    #[test]
    fn two_offline_sources_roundtrip_qualified_values_and_metadata() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("two-sources.csv");
        let mut workspace: serde_json::Value =
            serde_json::from_str(include_str!("../../examples/demo.olw.json")).unwrap();
        workspace["screens"][0]["widgets"] = serde_json::json!([]);
        workspace["sources"] = serde_json::json!([
          {"id":"lab:a","provider":"offline","path":"inline","variables":[{"id":"shared","type":"number","units":"@日本語,\"V\"","initial":-1.23456789012345,"min":-100,"max":100,"writable":true,"waveform":"constant","periodMs":1000}]},
          {"id":"lab","provider":"offline","path":"inline","variables":[{"id":"shared","type":"boolean","units":"","initial":false,"min":0,"max":1,"writable":true,"waveform":"constant","periodMs":1000}]}]);
        let mut recording = Recording::start(&path, 9, 3, &workspace.to_string()).unwrap();
        let batch = serde_json::json!([{"sequence":1,"timeMs":50,"hostReceivedAtUtc":"2026-10-10T08:00:00.000Z","samples":[
          {"sourceId":"lab:a","symbolPath":"shared","type":"number","value":-1.23456789012345,"quality":"good"},
          {"sourceId":"lab","symbolPath":"shared","type":"boolean","value":null,"quality":"unresolved","reason":"\t=unknown\n日本語"}]},
          {"sequence":2,"timeMs":100,"hostReceivedAtUtc":"2026-10-10T08:00:00.050Z","samples":[
          {"sourceId":"lab:a","symbolPath":"shared","type":"number","value":-2.5,"quality":"good"},
          {"sourceId":"lab","symbolPath":"shared","type":"boolean","value":true,"quality":"good"}]}]);
        recording
            .append(recording.id, 9, 3, &batch.to_string())
            .unwrap();
        recording.finish().unwrap();
        let text = std::fs::read_to_string(path).unwrap();
        assert!(text.contains("-1.23456789012345"));
        assert!(text.contains("\"'@日本語,\"\"V\"\"\""));
        assert!(text.contains("\"lab:a\",\"shared\",\"number\""));
        assert!(text.contains("\"lab\",\"shared\",\"boolean\",true"));
        assert!(text.contains("'\t=unknown\n日本語"));
    }
    #[test]
    fn file_cap_stops_without_writing_unaccepted_frame() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cap.csv");
        let mut r =
            Recording::start(&path, 7, 2, include_str!("../../examples/demo.olw.json")).unwrap();
        r.bytes = FILE_LIMIT;
        let before = std::fs::read(&path).unwrap();
        assert!(r
            .append(r.id, 7, 2, &serde_json::json!([frame(1)]).to_string())
            .unwrap_err()
            .contains("256MiB"));
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert!(r.finish().is_err());
    }
}
