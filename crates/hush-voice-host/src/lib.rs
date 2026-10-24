//! Private process transport; it neither opens a server nor accepts paths from document content.
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex, mpsc},
    time::Duration,
};
type Reply = mpsc::Sender<Result<Vec<u8>, String>>;
struct Inner {
    input: Mutex<ChildStdin>,
    status: Mutex<Value>,
    pending: Mutex<Option<(String, Reply)>>,
}
pub struct VoiceHost {
    inner: Arc<Inner>,
    child: Mutex<Child>,
}
impl VoiceHost {
    pub fn launch(binary: &Path, config: &Path, voice: &Path) -> Result<Self, String> {
        if ![binary, config, voice]
            .iter()
            .all(|p| p.is_absolute() && p.is_file())
        {
            return Err("Local narration needs an installed worker and voice pack.".into());
        }
        let mut command = Command::new(binary);
        command
            .args([config, voice])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .map_err(|_| "The local voice could not be started.".to_string())?;
        let output = child.stdout.take().unwrap();
        let input = child.stdin.take().unwrap();
        let inner = Arc::new(Inner {
            input: Mutex::new(input),
            status: Mutex::new(
                json!({"available":false,"engine":"Pocket TTS","reason":"The local voice is warming up."}),
            ),
            pending: Mutex::new(None),
        });
        let shared = inner.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = Vec::new();
                match (&mut reader)
                    .take(10 * 1024 * 1024 + 1)
                    .read_until(b'\n', &mut line)
                {
                    Ok(0) | Err(_) => break,
                    _ => {}
                }
                if line.len() > 10 * 1024 * 1024 {
                    break;
                }
                match serde_json::from_slice::<Value>(&line) {
                    Ok(event) => match event["type"].as_str() {
                        Some("ready") if event["protocol"] == 1 => {
                            *shared.status.lock().unwrap() = json!({"available":true,"engine":"Pocket TTS","reason":"The local neural voice is ready.","loadMs":event["loadMs"],"engineKey":event["engineKey"]});
                        }
                        Some("fatal") => {
                            *shared.status.lock().unwrap() = json!({"available":false,"engine":"Pocket TTS","reason":event["error"]});
                            break;
                        }
                        Some("audio") | Some("error") => {
                            let mut pending = shared.pending.lock().unwrap();
                            if pending
                                .as_ref()
                                .is_some_and(|(id, _)| Some(id.as_str()) == event["id"].as_str())
                            {
                                let (_, reply) = pending.take().unwrap();
                                let result = if event["type"] == "error" {
                                    Err(event["error"]
                                        .as_str()
                                        .unwrap_or("The voice could not read this passage.")
                                        .to_owned())
                                } else {
                                    decode_wave(event["wav"].as_str().unwrap_or(""))
                                };
                                let _ = reply.send(result);
                            }
                        }
                        _ => {}
                    },
                    Err(_) => break,
                }
            }
            let mut status = shared.status.lock().unwrap();
            if status["available"] == true || status["reason"] == "The local voice is warming up." {
                status["reason"] = "The local voice stopped. Hush will try reconnecting.".into();
            }
            status["available"] = false.into();
            drop(status);
            if let Some((_, reply)) = shared.pending.lock().unwrap().take() {
                let _ = reply.send(Err(
                    "The voice stopped. Retry when the local voice reconnects.".into(),
                ));
            }
        });
        Ok(Self {
            inner,
            child: Mutex::new(child),
        })
    }
    pub fn status(&self) -> Value {
        self.inner.status.lock().unwrap().clone()
    }
    pub fn is_running(&self) -> bool {
        self.child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok())
            .is_some_and(|exit| exit.is_none())
    }
    fn send(&self, value: Value) -> Result<(), String> {
        let mut input = self.inner.input.lock().unwrap();
        writeln!(input, "{value}")
            .and_then(|_| input.flush())
            .map_err(|_| "The voice connection closed.".into())
    }
    pub fn cancel(&self, id: &str) {
        let mut pending = self.inner.pending.lock().unwrap();
        if pending.as_ref().is_some_and(|(active, _)| active == id) {
            if let Some((_, reply)) = pending.take() {
                let _ = reply.send(Err("Narration cancelled.".into()));
            }
        }
        drop(pending);
        let _ = self.send(json!({"type":"cancel","id":id}));
    }
    pub fn synthesize(&self, id: String, text: String) -> Result<Vec<u8>, String> {
        if id.is_empty() || id.len() > 80 || text.trim().is_empty() || text.chars().count() > 1200 {
            return Err("Choose a passage up to 1,200 characters.".into());
        }
        if self.status()["available"] != true {
            return Err("The local voice is not ready yet.".into());
        }
        let (tx, rx) = mpsc::channel();
        let sent = {
            let mut pending = self.inner.pending.lock().unwrap();
            if let Some((old, reply)) = pending.take() {
                let _ = self.send(json!({"type":"cancel","id":old}));
                let _ = reply.send(Err(
                    "A newer narration request replaced this passage.".into()
                ));
            }
            *pending = Some((id.clone(), tx));
            self.send(json!({"type":"synthesize","id":id,"text":text}))
        };
        if let Err(error) = sent {
            self.cancel(&id);
            return Err(error);
        }
        match rx.recv_timeout(Duration::from_secs(60)) {
            Ok(result) => result,
            Err(_) => {
                self.cancel(&id);
                Err("The local voice took too long. Retry this passage.".into())
            }
        }
    }
}
/// A bounded restart policy. Book text is never replayed implicitly after a worker crash.
pub struct VoiceSupervisor {
    paths: [std::path::PathBuf; 3],
    session: Mutex<(Arc<VoiceHost>, u8, std::time::Instant)>,
}
impl VoiceSupervisor {
    pub fn launch(binary: &Path, config: &Path, voice: &Path) -> Result<Self, String> {
        let host = Arc::new(VoiceHost::launch(binary, config, voice)?);
        Ok(Self {
            paths: [binary.to_owned(), config.to_owned(), voice.to_owned()],
            session: Mutex::new((host, 0, std::time::Instant::now())),
        })
    }
    fn host(&self) -> Arc<VoiceHost> {
        let mut session = self.session.lock().unwrap();
        if !session.0.is_running() && session.1 < 2 && session.2.elapsed() >= Duration::from_secs(1)
        {
            session.1 += 1;
            session.2 = std::time::Instant::now();
            if let Ok(host) = VoiceHost::launch(&self.paths[0], &self.paths[1], &self.paths[2]) {
                session.0 = Arc::new(host);
            }
        }
        session.0.clone()
    }
    pub fn status(&self) -> Value {
        let host = self.host();
        let mut status = host.status();
        if !host.is_running() {
            status["available"] = false.into();
            status["reason"]="The local voice stopped. Check the installed voice pack and restart Hush if reconnection fails.".into();
        }
        status
    }
    pub fn synthesize(&self, id: String, text: String) -> Result<Vec<u8>, String> {
        self.host().synthesize(id, text)
    }
    pub fn cancel(&self, id: &str) {
        self.host().cancel(id);
    }
}
impl Drop for VoiceHost {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
fn decode_wave(encoded: &str) -> Result<Vec<u8>, String> {
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "The voice returned invalid audio.")?;
    if bytes.len() < 44
        || bytes.len() > 5_000_000
        || &bytes[..4] != b"RIFF"
        || &bytes[8..12] != b"WAVE"
    {
        return Err("The voice returned invalid audio.".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_audio() {
        assert!(decode_wave(&STANDARD.encode(b"not a wave")).is_err());
    }
    #[test]
    #[ignore = "requires the real worker and verified voice pack"]
    fn actual_worker_reconnect_after_process_exit() {
        let binary = std::env::var("HUSH_VOICE_WORKER").unwrap();
        let host = VoiceSupervisor::launch(
            Path::new(&binary),
            Path::new(&std::env::var("HUSH_VOICE_CONFIG").unwrap()),
            Path::new(&std::env::var("HUSH_VOICE_EMBEDDING").unwrap()),
        )
        .unwrap();
        let wait = |host: &VoiceSupervisor| {
            for _ in 0..600 {
                if host.status()["available"] == true {
                    return;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            panic!("The real neural worker did not become ready.");
        };
        wait(&host);
        let identity = host.status()["engineKey"].clone();
        {
            let session = host.host();
            let mut child = session.child.lock().unwrap();
            child.kill().unwrap();
            child.wait().unwrap();
        }
        std::thread::sleep(Duration::from_millis(1100));
        wait(&host);
        assert_eq!(host.status()["engineKey"], identity);
        assert!(
            host.synthesize("after-restart".into(), "A quiet return to the page.".into())
                .unwrap()
                .len()
                > 24000
        );
    }
    #[test]
    #[ignore = "requires the real worker and verified voice pack"]
    fn actual_worker_round_trip() {
        let binary = std::env::var("HUSH_VOICE_WORKER")
            .expect("Configure the real local voice worker before this integration check.");
        let host = VoiceHost::launch(
            Path::new(&binary),
            Path::new(&std::env::var("HUSH_VOICE_CONFIG").unwrap()),
            Path::new(&std::env::var("HUSH_VOICE_EMBEDDING").unwrap()),
        )
        .unwrap();
        for _ in 0..200 {
            if host.status()["available"] == true {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let bytes = host
            .synthesize(
                "integration-job".into(),
                "A little space for the next chapter.".into(),
            )
            .unwrap();
        assert!(bytes.len() > 24000);
        assert_eq!(&bytes[..4], b"RIFF");
        assert!(
            host.status()["engineKey"]
                .as_str()
                .is_some_and(|key| key.starts_with("pocket-") && key.len() == 71)
        );
    }
}
