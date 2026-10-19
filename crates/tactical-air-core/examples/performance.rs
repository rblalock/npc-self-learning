//! Timing harness only. Rewards are synthetic; this is not effectiveness evidence.
use std::{hint::black_box, time::Instant};
use tactical_air_core::{Config, Engine, Role};
fn main() {
    let config = Config { seed: 19, roles: vec![Role { id: "guard".into(), actions: vec!["patrol".into(), "wait".into()] }], contexts: vec!["courtyard".into()], learning_rate: 0.22, exploration: 0.16, temperature: 0.3, decay: 0.025, max_update: 0.16 };
    let mut policy = Engine::new(config).unwrap();
    let allowed = vec!["patrol".into(), "wait".into()];
    let mut samples = Vec::new();
    for batch in 0..35 {
        let start = Instant::now();
        for i in 0..1000 {
            let d = policy.choose("guard", "courtyard", &allowed, false).unwrap();
            policy.feedback(d.decision_id, if i % 2 == 0 { 0.5 } else { -0.2 }, true).unwrap();
            black_box(policy.commit().unwrap());
        }
        if batch >= 5 { samples.push(start.elapsed().as_secs_f64() * 1e6 / 1000.0); }
    }
    samples.sort_by(f64::total_cmp);
    println!("{}", serde_json::json!({"unit":"microseconds per choose + feedback + commit", "configuration":"1 role, 2 actions, 1 context; direct Rust API; release build", "batches":30,"cycles_per_batch":1000,"warmup_batches":5,"median":samples[15],"p95_batch_mean":samples[28],"min":samples[0],"max":samples[29],"batch_means":samples}));
}
