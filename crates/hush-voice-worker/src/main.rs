//! A single local neural model, private stdin/stdout transport, bounded sentence jobs.
use anyhow::{Context, Result, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use pocket_runtime::{
    config::Config,
    model::{LoadOptions, TtsModel},
};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    io::{self, BufRead, Read, Write},
    path::Path,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum Request {
    Synthesize { id: String, text: String },
    Cancel { id: String },
}
struct Job {
    id: String,
    text: String,
    stop: Arc<AtomicBool>,
}
#[derive(Default)]
struct Control {
    pending: Option<Job>,
    active: Option<(String, Arc<AtomicBool>)>,
    closed: bool,
}
type Shared = Arc<(Mutex<Control>, Condvar)>;
fn emit(value: serde_json::Value) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{value}");
    let _ = out.flush();
}
fn local(path: &str) -> Result<()> {
    if !Path::new(path).is_absolute() || !Path::new(path).is_file() {
        bail!("The voice pack requires an existing absolute local file.")
    }
    Ok(())
}
fn resolve_pack_file(base: &Path, path: &str) -> Result<String> {
    let value = Path::new(path);
    if !value.is_absolute()
        && value.components().any(|part| {
            !matches!(
                part,
                std::path::Component::Normal(_) | std::path::Component::CurDir
            )
        })
    {
        bail!("A voice pack path cannot leave its directory.");
    }
    let full = if value.is_absolute() {
        value.to_path_buf()
    } else {
        base.join(value)
    };
    let full = full
        .canonicalize()
        .context("The voice pack is incomplete")?;
    let path = full
        .to_str()
        .context("The voice pack path is not valid Unicode")?;
    local(path)?;
    Ok(path.to_owned())
}
fn valid(id: &str, text: &str) -> bool {
    !id.is_empty() && id.len() <= 80 && !text.trim().is_empty() && text.chars().count() <= 1200
}
fn wav(pcm: &[f32], rate: u32) -> Vec<u8> {
    let size = (pcm.len() * 2) as u32;
    let mut out = Vec::with_capacity(size as usize + 44);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(size + 36).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * 2).to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&size.to_le_bytes());
    for sample in pcm {
        out.extend_from_slice(&((sample.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
    }
    out
}
fn read_requests(shared: Shared) {
    // Read at most 16 KiB per message, including malformed input. Never buffer a book.
    let mut input = io::stdin().lock();
    loop {
        let mut line = Vec::new();
        let read = (&mut input).take(16_385).read_until(b'\n', &mut line);
        match read {
            Ok(0) | Err(_) => break,
            _ => {}
        }
        if line.len() > 16_384 {
            emit(json!({"type":"fatal","error":"Voice request exceeds the protocol limit."}));
            break;
        }
        let request = match serde_json::from_slice::<Request>(&line) {
            Ok(value) => value,
            Err(_) => {
                emit(json!({"type":"error","id":"","error":"Invalid voice request."}));
                continue;
            }
        };
        let (lock, wake) = &*shared;
        let mut state = lock.lock().unwrap();
        match request {
            Request::Synthesize { id, text } => {
                if !valid(&id, &text) {
                    emit(
                        json!({"type":"error","id":id,"error":"Choose a non-empty passage up to 1,200 characters."}),
                    );
                    continue;
                }
                if let Some((_, stop)) = &state.active {
                    stop.store(true, Ordering::Relaxed);
                }
                state.pending = Some(Job {
                    id,
                    text,
                    stop: Arc::new(AtomicBool::new(false)),
                });
                wake.notify_one();
            }
            Request::Cancel { id } => {
                if let Some((active, stop)) = &state.active {
                    if active == &id {
                        stop.store(true, Ordering::Relaxed);
                    }
                }
                if state.pending.as_ref().is_some_and(|job| job.id == id) {
                    state.pending = None;
                }
            }
        }
    }
    let (lock, wake) = &*shared;
    let mut state = lock.lock().unwrap();
    state.closed = true;
    state.pending = None;
    if let Some((_, stop)) = &state.active {
        stop.store(true, Ordering::Relaxed);
    }
    wake.notify_one();
}
fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 3 {
        bail!("Usage: hush-voice-worker /absolute/config.yaml /absolute/voice.safetensors")
    }
    local(&args[1])?;
    local(&args[2])?;
    let (mut config, origin) = Config::load(None, Some(&args[1]))?;
    let base = Path::new(&args[1])
        .parent()
        .context("The voice pack has no directory")?;
    for path in [
        &mut config.weights_path,
        &mut config.weights_path_without_voice_cloning,
        &mut config.flow_lm.weights_path,
        &mut config.mimi.weights_path,
    ]
    .into_iter()
    .flatten()
    {
        *path = resolve_pack_file(base, path)?;
    }
    config.flow_lm.lookup_table.tokenizer_path =
        resolve_pack_file(base, &config.flow_lm.lookup_table.tokenizer_path)?;
    // No fallback to a network model and no voice-cloning input surface.
    config.weights_path_without_voice_cloning = None;
    let mut identity = Sha256::new();
    identity.update(b"hush-pocket-a922b912-protocol1-pcm16-v2");
    let mut files = vec![
        args[1].clone(),
        args[2].clone(),
        config.flow_lm.lookup_table.tokenizer_path.clone(),
    ];
    files.extend(
        [
            &config.weights_path,
            &config.flow_lm.weights_path,
            &config.mimi.weights_path,
        ]
        .into_iter()
        .flatten()
        .cloned(),
    );
    let mut buffer = [0u8; 65536];
    for path in files {
        let mut file = std::fs::File::open(path)?;
        loop {
            let count = file.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            identity.update(&buffer[..count]);
        }
    }
    let engine_key = format!("pocket-{:x}", identity.finalize());
    let started = Instant::now();
    let model = TtsModel::<xn::Unquantized<f32, xn::CpuDevice>>::load(
        config,
        origin,
        &LoadOptions::default(),
    )
    .context("The neural model could not be loaded")?;
    let voice = model
        .get_state_for_audio_prompt(&args[2], false)
        .context("The voice embedding could not be loaded")?;
    emit(
        json!({"type":"ready","protocol":1,"sampleRate":model.sample_rate(),"loadMs":started.elapsed().as_millis(),"engine":"Pocket TTS / English 2026-04 / Alba","engineKey":engine_key}),
    );
    let shared: Shared = Arc::new((Mutex::new(Control::default()), Condvar::new()));
    let reader = shared.clone();
    std::thread::spawn(move || read_requests(reader));
    loop {
        let (lock, wake) = &*shared;
        let mut state = lock.lock().unwrap();
        while state.pending.is_none() && !state.closed {
            state = wake.wait(state).unwrap();
        }
        if state.closed {
            break;
        }
        let job = state.pending.take().unwrap();
        state.active = Some((job.id.clone(), job.stop.clone()));
        drop(state);
        let started = Instant::now();
        let mut first = None;
        let mut pcm = Vec::new();
        let result =
            model.generate_audio_stream(&voice, &job.text, 50, None, &job.stop, &mut |chunk| {
                if job.stop.load(Ordering::Relaxed) {
                    bail!("Cancelled")
                }
                if first.is_none() {
                    first = Some(started.elapsed().as_millis());
                }
                if pcm.len() + chunk.len() > model.sample_rate() * 90 {
                    bail!("The generated passage exceeded the 90-second audio budget.")
                }
                pcm.extend_from_slice(chunk);
                Ok(())
            });
        if !job.stop.load(Ordering::Relaxed) {
            match result {
                Ok(()) if !pcm.is_empty() => emit(
                    json!({"type":"audio","id":job.id,"wav":STANDARD.encode(wav(&pcm,model.sample_rate() as u32)),"firstChunkMs":first,"generationMs":started.elapsed().as_millis(),"durationMs":pcm.len()*1000/model.sample_rate()}),
                ),
                Ok(()) => emit(
                    json!({"type":"error","id":job.id,"error":"The voice generated no audio. Retry this passage."}),
                ),
                Err(error) => emit(json!({"type":"error","id":job.id,"error":error.to_string()})),
            }
        }
        lock.lock().unwrap().active = None;
    }
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        emit(json!({"type":"fatal","error":format!("{error:#}")}));
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn valid_jobs_are_bounded() {
        assert!(valid("id", "A sentence."));
        assert!(!valid("id", &"a".repeat(1201)));
        assert!(!valid("id", "  "));
    }
    #[test]
    fn wave_has_correct_length_and_clamps() {
        let bytes = wav(&[0.0, 2.0, -2.0], 24000);
        assert_eq!(&bytes[..4], b"RIFF");
        assert_eq!(bytes.len(), 50);
        assert_eq!(i16::from_le_bytes([bytes[46], bytes[47]]), 32767);
    }
}
