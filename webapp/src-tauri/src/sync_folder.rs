//! The folder the desktop app syncs through — iCloud Drive, Dropbox, any
//! folder the user picks.
//!
//! The webview never gets a filesystem scope for it. The path is chosen with a
//! native dialog, remembered here, and the page can only list, read and write
//! files named `<id>.khazana-sync` directly inside it. A compromised page could
//! not use these commands to read anything else on the disk.
//!
//! Everything written is already encrypted by the page (lib/syncFile.ts).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

const CONFIG_FILE: &str = "sync-folder";
const EXT: &str = ".khazana-sync";
/** Far larger than any vault; a bigger file is not one of ours. */
const MAX_FILE_BYTES: u64 = 200 * 1024 * 1024;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncFileInfo {
    pub name: String,
    pub modified_ms: i64,
}

/// `<letters, digits, dashes>.khazana-sync` and nothing else — no separators,
/// no `..`, no hidden files.
pub fn valid_name(name: &str) -> bool {
    match name.strip_suffix(EXT) {
        Some(stem) => !stem.is_empty() && stem.len() <= 64 && stem.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
        None => false,
    }
}

fn config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(CONFIG_FILE))
}

fn folder<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let raw = fs::read_to_string(config_path(app)?).map_err(|_| "no_folder".to_string())?;
    let p = PathBuf::from(raw.trim());
    if !p.is_dir() {
        return Err("folder_missing".into());
    }
    Ok(p)
}

pub fn list_in(dir: &Path) -> Result<Vec<SyncFileInfo>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !valid_name(&name) {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        if !meta.is_file() {
            continue;
        }
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        out.push(SyncFileInfo { name, modified_ms });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn read_in(dir: &Path, name: &str) -> Result<String, String> {
    if !valid_name(name) {
        return Err("bad_name".into());
    }
    let path = dir.join(name);
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_FILE_BYTES {
        return Err("too_large".into());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

/// Written to a temporary name and renamed, so a sync service never uploads —
/// and another device never reads — half a file.
pub fn write_in(dir: &Path, name: &str, contents: &str) -> Result<(), String> {
    if !valid_name(name) {
        return Err("bad_name".into());
    }
    let tmp = dir.join(format!(".{name}.tmp"));
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(name)).map_err(|e| e.to_string())
}

/// Opens a folder picker and remembers the choice. Returns the folder's name for display, or None if cancelled.
#[tauri::command]
pub async fn sync_pick_folder<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    fs::write(config_path(&app)?, path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// The remembered folder, or None.
#[tauri::command]
pub fn sync_folder_path<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    folder(&app).ok().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn sync_forget_folder<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    match fs::remove_file(config_path(&app)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
pub fn sync_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<SyncFileInfo>, String> {
    list_in(&folder(&app)?)
}

#[tauri::command]
pub fn sync_read<R: Runtime>(app: AppHandle<R>, name: String) -> Result<String, String> {
    read_in(&folder(&app)?, &name)
}

#[tauri::command]
pub fn sync_write<R: Runtime>(app: AppHandle<R>, name: String, contents: String) -> Result<(), String> {
    write_in(&folder(&app)?, &name, &contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("khazana-sync-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn names_are_confined_to_sync_files_in_the_folder() {
        assert!(valid_name("3f2a-91bc.khazana-sync"));
        for bad in ["../x.khazana-sync", "a/b.khazana-sync", ".hidden.khazana-sync", "x.json", ".khazana-sync", "a b.khazana-sync"] {
            assert!(!valid_name(bad), "{bad}");
        }
        assert!(!valid_name(&format!("{}.khazana-sync", "a".repeat(65))));
    }

    #[test]
    fn writes_atomically_and_lists_only_sync_files() {
        let d = tmpdir("rw");
        write_in(&d, "dev-1.khazana-sync", "{\"a\":1}").unwrap();
        fs::write(d.join("notes.txt"), "not ours").unwrap();
        fs::create_dir(d.join("dir.khazana-sync")).unwrap();
        let names: Vec<_> = list_in(&d).unwrap().into_iter().map(|f| f.name).collect();
        assert_eq!(names, ["dev-1.khazana-sync"]);
        assert_eq!(read_in(&d, "dev-1.khazana-sync").unwrap(), "{\"a\":1}");
        assert!(!d.join(".dev-1.khazana-sync.tmp").exists());
        assert_eq!(read_in(&d, "../etc.khazana-sync"), Err("bad_name".into()));
        assert_eq!(write_in(&d, "notes.txt", "x"), Err("bad_name".into()));
        fs::remove_dir_all(&d).unwrap();
    }
}
