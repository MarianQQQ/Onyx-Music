#[cfg(test)]
mod tests {
    use crate::innertube::models::Track;
    use crate::innertube::queue::QueueManager;

    #[test]
    fn test_queue_shuffle_and_navigation() {
        let q = QueueManager::new();
        let tracks = vec![
            Track {
                id: "1".into(),
                title: "Track 1".into(),
                artist: "Artist 1".into(),
                artist_id: None,
                album: None,
                duration_seconds: 100,
                thumbnail_url: None,
                views: None,
            },
            Track {
                id: "2".into(),
                title: "Track 2".into(),
                artist: "Artist 2".into(),
                artist_id: None,
                album: None,
                duration_seconds: 200,
                thumbnail_url: None,
                views: None,
            },
            Track {
                id: "3".into(),
                title: "Track 3".into(),
                artist: "Artist 3".into(),
                artist_id: None,
                album: None,
                duration_seconds: 300,
                thumbnail_url: None,
                views: None,
            },
        ];

        q.set_queue(tracks, 0);
        assert_eq!(q.get_tracks().len(), 3);
        assert_eq!(q.current_track().unwrap().id, "1");

        let next = q.next_track().unwrap();
        assert_eq!(next.id, "2");

        q.shuffle();
        assert!(q.is_shuffled());
    }
}
