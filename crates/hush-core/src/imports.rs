use super::*;
use std::io::{Read, Seek, SeekFrom};

pub const TRANSFER_CHUNK_BYTES: usize = 1024 * 1024;

impl LibraryStore {
    fn pending_path(&self, id: &str) -> Result<PathBuf> {
        Ok(self.id_path(id)?.with_extension("pending"))
    }
    pub fn begin_import(&mut self, entry: Value) -> Result<String> {
        validate_metadata(&entry)?;
        let id = entry["id"]
            .as_str()
            .ok_or_else(|| StoreError::Invalid("Missing book identifier.".into()))?;
        let canonical = Uuid::parse_str(id)
            .map_err(|_| StoreError::Invalid("Invalid book identifier.".into()))?
            .to_string();
        if canonical != id {
            return Err(StoreError::Invalid("Invalid book identifier.".into()));
        }
        let size = entry["byteSize"].as_u64().unwrap_or(0);
        let hash = entry["hash"].as_str().unwrap_or("");
        if size == 0
            || size > MAX_DOCUMENT_BYTES as u64
            || hash.len() != 64
            || !hash.bytes().all(|c| c.is_ascii_hexdigit())
            || !matches!(entry["format"].as_str(), Some("epub" | "pdf"))
        {
            return Err(StoreError::Invalid(
                "Invalid document size, hash or format.".into(),
            ));
        }
        if self.database.query_row(
            "SELECT EXISTS(SELECT 1 FROM books WHERE hash=?1)",
            [hash],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(StoreError::Invalid(
                "This document is already in the library.".into(),
            ));
        }
        if self.database.query_row("SELECT EXISTS(SELECT 1 FROM books WHERE id=?1 UNION SELECT 1 FROM import_jobs WHERE id=?1)",[id],|r|r.get::<_,bool>(0))?||self.id_path(id)?.exists(){return Err(StoreError::Invalid("This book identifier is already in use.".into()));}
        let active: i64 = self
            .database
            .query_row("SELECT COUNT(*) FROM import_jobs", [], |r| r.get(0))?;
        if active >= 8 {
            return Err(StoreError::Invalid(
                "Finish the current imports before adding more books.".into(),
            ));
        }
        self.database.execute(
            "INSERT INTO import_jobs(id,metadata,received,state) VALUES(?1,?2,0,'uploading')",
            params![id, serde_json::to_string(&entry)?],
        )?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(self.pending_path(id)?)
        {
            Ok(_) => Ok(id.to_owned()),
            Err(error) => {
                let _ = self
                    .database
                    .execute("DELETE FROM import_jobs WHERE id=?1", [id]);
                Err(error.into())
            }
        }
    }
    pub fn append_import(&mut self, id: &str, offset: u64, bytes: &[u8]) -> Result<()> {
        self.id_path(id)?;
        if bytes.is_empty() || bytes.len() > TRANSFER_CHUNK_BYTES {
            return Err(StoreError::Invalid(
                "Invalid document transfer chunk.".into(),
            ));
        }
        let (raw, received, state): (String, u64, String) = self.database.query_row(
            "SELECT metadata,received,state FROM import_jobs WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let entry: Value = serde_json::from_str(&raw)?;
        let expected = entry["byteSize"].as_u64().unwrap_or(0);
        if state != "uploading"
            || received != offset
            || offset
                .checked_add(bytes.len() as u64)
                .is_none_or(|end| end > expected)
        {
            return Err(StoreError::Invalid(
                "The document transfer is out of order or exceeds its size.".into(),
            ));
        }
        let mut file = OpenOptions::new()
            .append(true)
            .open(self.pending_path(id)?)?;
        if file.metadata()?.len() != offset {
            return Err(StoreError::Invalid(
                "The interrupted document transfer must be restarted.".into(),
            ));
        }
        file.write_all(bytes)?;
        self.database.execute(
            "UPDATE import_jobs SET received=?1 WHERE id=?2",
            params![offset + bytes.len() as u64, id],
        )?;
        Ok(())
    }
    fn verify_original(&self, path: &Path, entry: &Value) -> Result<()> {
        let mut file = std::fs::File::open(path)?;
        let size = file.metadata()?.len();
        if size == 0
            || size != entry["byteSize"].as_u64().unwrap_or(0)
            || size > MAX_DOCUMENT_BYTES as u64
        {
            return Err(StoreError::Invalid(
                "The imported document is incomplete.".into(),
            ));
        }
        let mut hash = Sha256::new();
        let mut block = [0u8; 65536];
        let mut first = true;
        loop {
            let length = file.read(&mut block)?;
            if length == 0 {
                break;
            }
            if first {
                first = false;
                let supported = match entry["format"].as_str() {
                    Some("pdf") => block[..length].starts_with(b"%PDF-"),
                    Some("epub") => block[..length].starts_with(b"PK"),
                    _ => false,
                };
                if !supported {
                    return Err(StoreError::Invalid(
                        "The document signature does not match its format.".into(),
                    ));
                }
            }
            hash.update(&block[..length]);
        }
        if format!("{:x}", hash.finalize()) != entry["hash"].as_str().unwrap_or("") {
            return Err(StoreError::Invalid(
                "The document checksum does not match. Import the original again.".into(),
            ));
        }
        Ok(())
    }
    pub fn finish_import(&mut self, id: &str) -> Result<()> {
        let (raw, received, state): (String, u64, String) = self.database.query_row(
            "SELECT metadata,received,state FROM import_jobs WHERE id=?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let entry: Value = serde_json::from_str(&raw)?;
        let final_path = self.id_path(id)?;
        let pending = self.pending_path(id)?;
        if state == "uploading" {
            if received != entry["byteSize"].as_u64().unwrap_or(0) {
                return Err(StoreError::Invalid(
                    "The document transfer is incomplete.".into(),
                ));
            }
            self.verify_original(&pending, &entry)?;
            OpenOptions::new().write(true).open(&pending)?.sync_all()?;
            self.database
                .execute("UPDATE import_jobs SET state='ready' WHERE id=?1", [id])?;
        }
        if final_path.exists() {
            self.verify_original(&final_path, &entry)?;
        } else {
            self.verify_original(&pending, &entry)?;
            fs::rename(&pending, &final_path)?;
        }
        #[cfg(unix)]
        std::fs::File::open(self.root.join("originals"))?.sync_all()?;
        let tx = self.database.transaction()?;
        tx.execute(
            "INSERT INTO books(id,hash,metadata) VALUES(?1,?2,?3)",
            params![id, entry["hash"].as_str(), raw],
        )?;
        tx.execute("DELETE FROM import_jobs WHERE id=?1", [id])?;
        tx.commit()?;
        Ok(())
    }
    pub fn abort_import(&mut self, id: &str) -> Result<()> {
        let path = self.id_path(id)?;
        let tracked: bool = self.database.query_row(
            "SELECT EXISTS(SELECT 1 FROM import_jobs WHERE id=?1)",
            [id],
            |r| r.get(0),
        )?;
        if !tracked {
            return Ok(());
        }
        let committed: bool = self.database.query_row(
            "SELECT EXISTS(SELECT 1 FROM books WHERE id=?1)",
            [id],
            |r| r.get(0),
        )?;
        let _ = fs::remove_file(self.pending_path(id)?);
        if !committed {
            let _ = fs::remove_file(path);
        }
        self.database
            .execute("DELETE FROM import_jobs WHERE id=?1", [id])?;
        Ok(())
    }
    pub(super) fn recover_imports(&mut self) -> Result<()> {
        let jobs: Vec<(String, String)> = {
            let mut q = self.database.prepare("SELECT id,state FROM import_jobs")?;
            q.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<std::result::Result<_, _>>()?
        };
        for (id, state) in jobs {
            if state == "ready" && self.finish_import(&id).is_ok() {
                continue;
            }
            self.abort_import(&id)?;
        }
        // Only UUID-named managed copies are eligible; source files are never scanned.
        for item in fs::read_dir(self.root.join("originals"))? {
            let item = item?;
            let path = item.path();
            if !matches!(
                path.extension().and_then(|s| s.to_str()),
                Some("bin" | "pending")
            ) {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if Uuid::parse_str(id).is_err() {
                continue;
            }
            let tracked:bool=self.database.query_row("SELECT EXISTS(SELECT 1 FROM books WHERE id=?1 UNION SELECT 1 FROM import_jobs WHERE id=?1)",[id],|r|r.get(0))?;
            if !tracked {
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    }
    pub fn document_size(&self, id: &str) -> Result<u64> {
        self.get(id)?;
        let length = fs::metadata(self.id_path(id)?)?.len();
        if length > MAX_DOCUMENT_BYTES as u64 {
            return Err(StoreError::Invalid(
                "The saved document exceeds its size limit.".into(),
            ));
        }
        Ok(length)
    }
    pub fn read_range(&self, id: &str, offset: u64, length: usize) -> Result<Vec<u8>> {
        if length > TRANSFER_CHUNK_BYTES {
            return Err(StoreError::Invalid(
                "The requested document range is too large.".into(),
            ));
        }
        let size = self.document_size(id)?;
        if offset > size {
            return Err(StoreError::Invalid(
                "The requested document range is outside the file.".into(),
            ));
        }
        let mut file = std::fs::File::open(self.id_path(id)?)?;
        file.seek(SeekFrom::Start(offset))?;
        let mut data = vec![0; length.min((size - offset) as usize)];
        file.read_exact(&mut data)?;
        Ok(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn metadata(bytes: &[u8]) -> Value {
        json!({"id":Uuid::new_v4().to_string(),"title":"Original","author":"Hush","filename":"book.pdf","format":"pdf","byteSize":bytes.len(),"hash":format!("{:x}",Sha256::digest(bytes)),"bookmarks":[],"addedAt":1})
    }
    #[test]
    fn rejects_reordered_and_corrupt_chunks() {
        let root = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(root.path()).unwrap();
        let data = b"%PDF-1.7\nprivate fixture";
        let id = store.begin_import(metadata(data)).unwrap();
        assert!(store.append_import(&id, 1, data).is_err());
        store
            .append_import(&id, 0, b"%PDF-1.7\nchanged fixture")
            .unwrap();
        assert!(store.finish_import(&id).is_err());
        store.abort_import(&id).unwrap();
        assert!(store.list().unwrap().is_empty());
    }
    #[test]
    fn rolls_back_incomplete_upload_after_restart() {
        let root = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(root.path()).unwrap();
        let id = store
            .begin_import(metadata(b"%PDF-1.7\nfull original"))
            .unwrap();
        store.append_import(&id, 0, b"%PDF-").unwrap();
        drop(store);
        let store = LibraryStore::open(root.path()).unwrap();
        assert!(store.list().unwrap().is_empty());
        assert!(!store.pending_path(&id).unwrap().exists());
    }
    #[test]
    fn completes_verified_import_after_crash_between_rename_and_commit() {
        let root = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(root.path()).unwrap();
        let bytes = b"%PDF-1.7\noriginal";
        let id = store.begin_import(metadata(bytes)).unwrap();
        store.append_import(&id, 0, bytes).unwrap();
        store
            .database
            .execute("UPDATE import_jobs SET state='ready' WHERE id=?1", [&id])
            .unwrap();
        fs::rename(
            store.pending_path(&id).unwrap(),
            store.id_path(&id).unwrap(),
        )
        .unwrap();
        drop(store);
        let store = LibraryStore::open(root.path()).unwrap();
        assert_eq!(store.read(&id).unwrap(), bytes);
        assert_eq!(store.list().unwrap().len(), 1);
    }
    #[test]
    fn prevents_concurrent_recovery_of_live_uploads() {
        let root = tempfile::tempdir().unwrap();
        let store = LibraryStore::open(root.path()).unwrap();
        assert!(LibraryStore::open(root.path()).is_err());
        drop(store);
        assert!(LibraryStore::open(root.path()).is_ok());
    }
    #[test]
    fn range_reads_are_exact_and_bounded() {
        let root = tempfile::tempdir().unwrap();
        let mut store = LibraryStore::open(root.path()).unwrap();
        let bytes = b"%PDF-1.7\noriginal";
        let entry = metadata(bytes);
        let id = entry["id"].as_str().unwrap().to_owned();
        store.import(entry, bytes).unwrap();
        assert_eq!(store.read_range(&id, 5, 4).unwrap(), &bytes[5..9]);
        assert!(store.read_range(&id, 0, TRANSFER_CHUNK_BYTES + 1).is_err());
        assert!(store.read_range(&id, 999, 1).is_err());
    }
}
