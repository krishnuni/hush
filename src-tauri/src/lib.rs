use hush_core::LibraryStore;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

struct StoreState(Arc<Mutex<LibraryStore>>);
#[cfg(desktop)]
struct VoiceState(Option<Arc<hush_voice_host::VoiceSupervisor>>);
async fn with_store<T: Send + 'static>(
    state: &State<'_, StoreState>,
    operation: impl FnOnce(&mut LibraryStore) -> std::result::Result<T, hush_core::StoreError>
    + Send
    + 'static,
) -> Result<T, String> {
    let store = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = store
            .lock()
            .map_err(|_| "Library storage is unavailable.".to_owned())?;
        operation(&mut store).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn library_list(state: State<'_, StoreState>) -> Result<Vec<Value>, String> {
    with_store(&state, |store| store.list()).await
}
#[tauri::command]
async fn library_import_begin(
    state: State<'_, StoreState>,
    entry: Value,
) -> Result<String, String> {
    with_store(&state, move |store| store.begin_import(entry)).await
}
#[tauri::command]
async fn library_import_chunk(
    state: State<'_, StoreState>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err("Document transfers require a binary body.".into());
    };
    if body.is_empty() || body.len() > hush_core::TRANSFER_CHUNK_BYTES {
        return Err("Invalid document transfer chunk.".into());
    }
    let id = request
        .headers()
        .get("x-hush-id")
        .and_then(|v| v.to_str().ok())
        .ok_or("Missing document transfer identifier.")?
        .to_owned();
    let offset = request
        .headers()
        .get("x-hush-offset")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .ok_or("Missing document transfer offset.")?;
    let bytes = body.clone();
    with_store(&state, move |store| {
        store.append_import(&id, offset, &bytes)
    })
    .await
}
#[tauri::command]
async fn library_import_finish(state: State<'_, StoreState>, id: String) -> Result<(), String> {
    with_store(&state, move |store| store.finish_import(&id)).await
}
#[tauri::command]
async fn library_import_abort(state: State<'_, StoreState>, id: String) -> Result<(), String> {
    with_store(&state, move |store| store.abort_import(&id)).await
}
#[tauri::command]
async fn library_update(state: State<'_, StoreState>, entry: Value) -> Result<(), String> {
    with_store(&state, move |store| store.update(entry)).await
}
#[tauri::command]
async fn library_remove(state: State<'_, StoreState>, id: String) -> Result<(), String> {
    with_store(&state, move |store| store.remove(&id)).await
}
#[tauri::command]
async fn document_size(state: State<'_, StoreState>, id: String) -> Result<u64, String> {
    with_store(&state, move |store| store.document_size(&id)).await
}
#[tauri::command]
async fn document_read_range(
    state: State<'_, StoreState>,
    id: String,
    offset: u64,
    length: usize,
) -> Result<tauri::ipc::Response, String> {
    with_store(&state, move |store| store.read_range(&id, offset, length))
        .await
        .map(tauri::ipc::Response::new)
}
#[tauri::command]
async fn preferences_read(state: State<'_, StoreState>) -> Result<Value, String> {
    with_store(&state, |store| store.preferences()).await
}
#[tauri::command]
async fn preferences_write(state: State<'_, StoreState>, preferences: Value) -> Result<(), String> {
    with_store(&state, move |store| store.save_preferences(preferences)).await
}

#[cfg(desktop)]
#[tauri::command]
fn narration_status(state: State<'_, VoiceState>) -> Value {
    state.0.as_ref().map(|host|host.status()).unwrap_or_else(||json!({"available":false,"engine":"Pocket TTS","reason":"Install a local voice pack to listen. This development build needs the worker and pack paths configured at launch."}))
}
#[cfg(mobile)]
#[tauri::command]
fn narration_status() -> Value {
    json!({"available":false,"engine":"Pocket TTS","reason":"Local neural narration is not yet available on mobile."})
}
#[cfg(desktop)]
#[tauri::command]
async fn narration_synthesize(
    state: State<'_, VoiceState>,
    text: String,
    job_id: String,
) -> Result<tauri::ipc::Response, String> {
    let host = state.0.clone().ok_or("The local voice is not installed.")?;
    tauri::async_runtime::spawn_blocking(move || host.synthesize(job_id, text))
        .await
        .map_err(|e| e.to_string())?
        .map(tauri::ipc::Response::new)
}
#[cfg(mobile)]
#[tauri::command]
async fn narration_synthesize(
    text: String,
    job_id: String,
) -> Result<tauri::ipc::Response, String> {
    let _ = (text, job_id);
    Err("Mobile neural narration is not available.".into())
}
#[cfg(desktop)]
#[tauri::command]
fn narration_cancel(state: State<'_, VoiceState>, job_id: String) {
    if let Some(host) = &state.0 {
        host.cancel(&job_id);
    }
}
#[cfg(mobile)]
#[tauri::command]
fn narration_cancel(job_id: String) {
    let _ = job_id;
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(StoreState(Arc::new(Mutex::new(LibraryStore::open(root)?))));
            #[cfg(desktop)]
            {
                let mut paths = (
                    std::env::var_os("HUSH_VOICE_WORKER"),
                    std::env::var_os("HUSH_VOICE_CONFIG"),
                    std::env::var_os("HUSH_VOICE_EMBEDDING"),
                );
                if paths.0.is_none() && paths.1.is_none() && paths.2.is_none() {
                    if let Ok(resources) = app.path().resource_dir() {
                        let binary = resources.join("worker").join(if cfg!(windows) {
                            "hush-voice-worker.exe"
                        } else {
                            "hush-voice-worker"
                        });
                        let config = resources.join("voice/config.yaml");
                        let embedding = resources.join("voice/alba.safetensors");
                        if binary.is_file() && config.is_file() && embedding.is_file() {
                            paths = (
                                Some(binary.into_os_string()),
                                Some(config.into_os_string()),
                                Some(embedding.into_os_string()),
                            );
                        }
                    }
                }
                let voice = if let (Some(binary), Some(config), Some(embedding)) = paths {
                    hush_voice_host::VoiceSupervisor::launch(
                        std::path::Path::new(&binary),
                        std::path::Path::new(&config),
                        std::path::Path::new(&embedding),
                    )
                    .ok()
                    .map(Arc::new)
                } else {
                    None
                };
                app.manage(VoiceState(voice));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library_list,
            library_import_begin,
            library_import_chunk,
            library_import_finish,
            library_import_abort,
            library_update,
            library_remove,
            document_size,
            document_read_range,
            preferences_read,
            preferences_write,
            narration_status,
            narration_synthesize,
            narration_cancel
        ])
        .run(tauri::generate_context!())
        .expect("Hush could not initialise its application data or desktop window");
}
