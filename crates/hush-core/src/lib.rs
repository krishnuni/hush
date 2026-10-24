//! Durable, platform-independent library storage. No webview, audio device or mobile SDK required.
mod imports;
pub use imports::TRANSFER_CHUNK_BYTES;
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

pub const MAX_DOCUMENT_BYTES: usize = 50 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("Local storage error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Library database error: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("Invalid library metadata: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Invalid(String),
}
pub type Result<T> = std::result::Result<T, StoreError>;

pub struct LibraryStore {
    database: Connection,
    root: PathBuf,
    _guard: fs::File,
}

impl LibraryStore {
    pub fn open(root: impl AsRef<Path>) -> Result<Self> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(root.join("originals"))?;
        let guard = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("library.lock"))?;
        guard.try_lock().map_err(|_| {
            StoreError::Invalid("This library is already open in another Hush window.".into())
        })?;
        let database = Connection::open(root.join("library.sqlite3"))?;
        let version: i64 = database.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > 2 {
            return Err(StoreError::Invalid(
                "This library was created by a newer Hush version. Update Hush to open it.".into(),
            ));
        }
        database.pragma_update(None, "journal_mode", "WAL")?;
        database.pragma_update(None, "foreign_keys", "ON")?;
        database.execute_batch("BEGIN; CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY, hash TEXT NOT NULL, metadata TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS books_hash ON books(hash); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version = 2; COMMIT;")?;
        database.busy_timeout(std::time::Duration::from_secs(3))?;
        database.pragma_update(None, "synchronous", "FULL")?;
        database.execute_batch("CREATE TABLE IF NOT EXISTS import_jobs(id TEXT PRIMARY KEY, metadata TEXT NOT NULL, received INTEGER NOT NULL, state TEXT NOT NULL);")?;
        let mut store = Self {
            database,
            root,
            _guard: guard,
        };
        store.recover_imports()?;
        Ok(store)
    }
    fn id_path(&self, id: &str) -> Result<PathBuf> {
        let id = Uuid::parse_str(id)
            .map_err(|_| StoreError::Invalid("Invalid book identifier.".into()))?;
        Ok(self.root.join("originals").join(format!("{id}.bin")))
    }
    pub fn list(&self) -> Result<Vec<Value>> {
        let mut query = self
            .database
            .prepare("SELECT metadata FROM books ORDER BY rowid DESC")?;
        let rows = query.query_map([], |row| row.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }
    pub fn get(&self, id: &str) -> Result<Value> {
        self.id_path(id)?;
        let raw: Option<String> = self
            .database
            .query_row("SELECT metadata FROM books WHERE id=?1", [id], |row| {
                row.get(0)
            })
            .optional()?;
        raw.map(|raw| serde_json::from_str(&raw).map_err(StoreError::from))
            .unwrap_or_else(|| {
                Err(StoreError::Invalid(
                    "This book is no longer in the library.".into(),
                ))
            })
    }
    pub fn import(&mut self, mut entry: Value, bytes: &[u8]) -> Result<()> {
        if bytes.is_empty() || bytes.len() > MAX_DOCUMENT_BYTES {
            return Err(StoreError::Invalid(
                "Choose a document between 1 byte and 50 MiB.".into(),
            ));
        }
        entry["hash"] = format!("{:x}", Sha256::digest(bytes)).into();
        entry["byteSize"] = json!(bytes.len());
        let id = self.begin_import(entry)?;
        let result = (|| {
            for (index, chunk) in bytes.chunks(TRANSFER_CHUNK_BYTES).enumerate() {
                self.append_import(&id, (index * TRANSFER_CHUNK_BYTES) as u64, chunk)?;
            }
            self.finish_import(&id)
        })();
        if result.is_err() {
            let _ = self.abort_import(&id);
        }
        result
    }
    pub fn update(&mut self, mut entry: Value) -> Result<()> {
        let id = entry
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| StoreError::Invalid("Missing book identifier.".into()))?
            .to_owned();
        let previous = self.get(&id)?;
        for field in ["id", "hash", "format", "byteSize", "filename", "addedAt"] {
            entry[field] = previous[field].clone();
        }
        validate_metadata(&entry)?;
        self.database.execute(
            "UPDATE books SET metadata=?1 WHERE id=?2",
            params![serde_json::to_string(&entry)?, id],
        )?;
        Ok(())
    }
    pub fn read(&self, id: &str) -> Result<Vec<u8>> {
        self.get(id)?;
        Ok(fs::read(self.id_path(id)?)?)
    }
    pub fn remove(&mut self, id: &str) -> Result<()> {
        let path = self.id_path(id)?;
        self.get(id)?;
        self.database
            .execute("DELETE FROM books WHERE id=?1", [id])?;
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.into()),
        }
    }
    pub fn preferences(&self) -> Result<Value> {
        let raw: Option<String> = self
            .database
            .query_row(
                "SELECT value FROM settings WHERE key='preferences'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        Ok(raw.map(|raw| serde_json::from_str(&raw)).transpose()?.unwrap_or_else(|| json!({"theme":"warm","font":"serif","fontSize":21,"lineHeight":1.65,"contentWidth":680,"margin":48})))
    }
    pub fn save_preferences(&mut self, preferences: Value) -> Result<()> {
        if !preferences.is_object() || serde_json::to_vec(&preferences)?.len() > 4096 {
            return Err(StoreError::Invalid("Invalid reading preferences.".into()));
        }
        self.database.execute("INSERT INTO settings(key,value) VALUES('preferences',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [serde_json::to_string(&preferences)?])?;
        Ok(())
    }
}

fn validate_metadata(entry: &Value) -> Result<()> {
    if !entry.is_object() || serde_json::to_vec(entry)?.len() > 2 * 1024 * 1024 {
        return Err(StoreError::Invalid(
            "Book metadata is too large or invalid.".into(),
        ));
    }
    for field in ["title", "author", "filename"] {
        if !entry
            .get(field)
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty() && value.len() <= 4096)
        {
            return Err(StoreError::Invalid(format!(
                "Book {field} is missing or too long."
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn entry() -> Value {
        json!({"id":Uuid::new_v4().to_string(),"title":"Quiet","author":"Hush","filename":"quiet.pdf","format":"pdf","bookmarks":[],"status":"new","addedAt":1})
    }
    const PDF: &[u8] = b"%PDF-1.7\noriginal fixture";
    #[test]
    fn durable_state_survives_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(directory.path()).unwrap();
        let mut book = entry();
        let id = book["id"].as_str().unwrap().to_owned();
        store.import(book.clone(), PDF).unwrap();
        book["locator"] = json!({"kind":"pdf","page":12,"y":41.5,"progress":0.4});
        book["bookmarks"] = json!([{"id":"mark","locator":book["locator"]}]);
        store.update(book).unwrap();
        drop(store);
        let reopened = LibraryStore::open(directory.path()).unwrap();
        assert_eq!(reopened.get(&id).unwrap()["locator"]["page"], 12);
        assert_eq!(reopened.read(&id).unwrap(), PDF);
        assert_eq!(
            reopened.get(&id).unwrap()["bookmarks"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn duplicate_bytes_do_not_create_second_original() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(directory.path()).unwrap();
        store.import(entry(), PDF).unwrap();
        assert!(store.import(entry(), PDF).is_err());
        assert_eq!(store.list().unwrap().len(), 1);
        assert_eq!(
            fs::read_dir(directory.path().join("originals"))
                .unwrap()
                .count(),
            1
        );
    }
    #[test]
    fn identifiers_cannot_escape_storage_root() {
        let directory = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(directory.path()).unwrap();
        assert!(store.read("../../private").is_err());
        assert!(store.get("/etc/passwd").is_err());
    }
    #[test]
    fn immutable_file_identity_cannot_be_changed_by_metadata_update() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(directory.path()).unwrap();
        let mut book = entry();
        let id = book["id"].as_str().unwrap().to_owned();
        store.import(book.clone(), PDF).unwrap();
        book["hash"] = json!("wrong");
        book["format"] = json!("epub");
        book["title"] = json!("New title");
        store.update(book).unwrap();
        let saved = store.get(&id).unwrap();
        assert_eq!(saved["format"], "pdf");
        assert_ne!(saved["hash"], "wrong");
        assert_eq!(saved["title"], "New title");
    }
    #[test]
    fn remove_only_deletes_managed_copy() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("user-original.pdf");
        fs::write(&source, PDF).unwrap();
        let mut store = LibraryStore::open(directory.path().join("app")).unwrap();
        let book = entry();
        let id = book["id"].as_str().unwrap().to_owned();
        store.import(book, PDF).unwrap();
        store.remove(&id).unwrap();
        assert!(source.exists());
        assert!(store.list().unwrap().is_empty());
    }
    #[test]
    fn invalid_signature_never_commits_a_file_or_record() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(directory.path()).unwrap();
        assert!(store.import(entry(), b"not pdf").is_err());
        assert!(store.list().unwrap().is_empty());
        assert_eq!(
            fs::read_dir(directory.path().join("originals"))
                .unwrap()
                .count(),
            0
        );
    }
    #[test]
    fn preferences_survive_restart() {
        let directory = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(directory.path()).unwrap();
        store
            .save_preferences(json!({"theme":"night","fontSize":25}))
            .unwrap();
        drop(store);
        let store = LibraryStore::open(directory.path()).unwrap();
        assert_eq!(store.preferences().unwrap()["theme"], "night");
    }
}
