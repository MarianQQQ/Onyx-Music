use rand::seq::SliceRandom;
use rand::thread_rng;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::RwLock;

use super::models::Track;

pub struct QueueManager {
    tracks: RwLock<Vec<Track>>,
    current_index: AtomicUsize,
    is_shuffled: AtomicBool,
    original_tracks: RwLock<Vec<Track>>,
}

impl QueueManager {
    pub fn new() -> Self {
        Self {
            tracks: RwLock::new(Vec::new()),
            current_index: AtomicUsize::new(0),
            is_shuffled: AtomicBool::new(false),
            original_tracks: RwLock::new(Vec::new()),
        }
    }

    pub fn set_queue(&self, tracks: Vec<Track>, start_index: usize) {
        let mut original = self.original_tracks.write().unwrap();
        *original = tracks.clone();

        let mut current_tracks = self.tracks.write().unwrap();
        *current_tracks = tracks;

        self.current_index.store(start_index, Ordering::SeqCst);
        self.is_shuffled.store(false, Ordering::SeqCst);
    }

    pub fn append_tracks(&self, new_tracks: Vec<Track>) {
        let mut original = self.original_tracks.write().unwrap();
        original.extend(new_tracks.clone());

        let mut current_tracks = self.tracks.write().unwrap();
        current_tracks.extend(new_tracks);
    }

    pub fn shuffle(&self) {
        let is_shuffled = self.is_shuffled.load(Ordering::SeqCst);
        let next_shuffled = !is_shuffled;
        self.is_shuffled.store(next_shuffled, Ordering::SeqCst);

        let mut tracks = self.tracks.write().unwrap();
        if tracks.is_empty() {
            return;
        }

        let curr_idx = self.current_index.load(Ordering::SeqCst);
        let current_track = tracks.get(curr_idx).cloned();

        if !next_shuffled {
            // Restore original order without swapping
            let original = self.original_tracks.read().unwrap();
            *tracks = original.clone();
            if let Some(track) = current_track {
                if let Some(pos) = tracks.iter().position(|t| t.id == track.id) {
                    self.current_index.store(pos, Ordering::SeqCst);
                }
            }
        } else {
            // Apply Fisher-Yates shuffle across the entire list
            let mut rng = thread_rng();
            tracks.shuffle(&mut rng);
            if let Some(track) = current_track {
                if let Some(pos) = tracks.iter().position(|t| t.id == track.id) {
                    tracks.swap(0, pos);
                    self.current_index.store(0, Ordering::SeqCst);
                }
            }
        }
    }

    pub fn current_track(&self) -> Option<Track> {
        let tracks = self.tracks.read().unwrap();
        let idx = self.current_index.load(Ordering::SeqCst);
        tracks.get(idx).cloned()
    }

    pub fn next_track(&self) -> Option<Track> {
        let tracks = self.tracks.read().unwrap();
        if tracks.is_empty() {
            return None;
        }

        let curr_idx = self.current_index.load(Ordering::SeqCst);
        if curr_idx + 1 < tracks.len() {
            let next_idx = curr_idx + 1;
            self.current_index.store(next_idx, Ordering::SeqCst);
            tracks.get(next_idx).cloned()
        } else {
            // Loop back to beginning
            self.current_index.store(0, Ordering::SeqCst);
            tracks.first().cloned()
        }
    }

    pub fn previous_track(&self) -> Option<Track> {
        let tracks = self.tracks.read().unwrap();
        if tracks.is_empty() {
            return None;
        }

        let curr_idx = self.current_index.load(Ordering::SeqCst);
        if curr_idx > 0 {
            let prev_idx = curr_idx - 1;
            self.current_index.store(prev_idx, Ordering::SeqCst);
            tracks.get(prev_idx).cloned()
        } else {
            tracks.first().cloned()
        }
    }

    pub fn get_tracks(&self) -> Vec<Track> {
        self.tracks.read().unwrap().clone()
    }

    pub fn get_current_index(&self) -> usize {
        self.current_index.load(Ordering::SeqCst)
    }

    pub fn play_at(&self, index: usize) -> Option<Track> {
        let tracks = self.tracks.read().unwrap();
        if index < tracks.len() {
            self.current_index.store(index, Ordering::SeqCst);
            tracks.get(index).cloned()
        } else {
            None
        }
    }

    pub fn clear(&self) {
        let mut tracks = self.tracks.write().unwrap();
        tracks.clear();
        let mut original = self.original_tracks.write().unwrap();
        original.clear();
        self.current_index.store(0, Ordering::SeqCst);
        self.is_shuffled.store(false, Ordering::SeqCst);
    }

    pub fn remove_at(&self, index: usize) -> Option<Track> {
        let mut tracks = self.tracks.write().unwrap();
        if index < tracks.len() {
            let removed = tracks.remove(index);
            let mut original = self.original_tracks.write().unwrap();
            if let Some(pos) = original.iter().position(|t| t.id == removed.id) {
                original.remove(pos);
            }
            let cur = self.current_index.load(Ordering::SeqCst);
            if index < cur && cur > 0 {
                self.current_index.store(cur - 1, Ordering::SeqCst);
            }
            Some(removed)
        } else {
            None
        }
    }

    pub fn is_shuffled(&self) -> bool {
        self.is_shuffled.load(Ordering::SeqCst)
    }
}
