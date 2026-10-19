//! Controlled algorithm experiment, not a game simulation or fun benchmark.
//! The environment supplies noisy rewards; the learner never receives its rule.
//! Run: cargo run --release -p tactical-air-core --example learning_benchmark -- 64

use serde_json::{json, Value};
use tactical_air_core::{Config, Engine, Role};

const ENCOUNTERS: usize = 600;

fn config(seed: u64) -> Config {
    Config {
        seed,
        roles: vec![Role {
            id: "agent".into(),
            actions: vec!["choice_a".into(), "choice_b".into()],
        }],
        contexts: vec!["context_a".into(), "context_b".into()],
        learning_rate: 0.22,
        exploration: 0.16,
        temperature: 0.3,
        decay: 0.025,
        max_update: 0.16,
    }
}

fn environment_noise(seed: u64, encounter: usize) -> f64 {
    // Counter-based external randomness, independent of action sampling. Both
    // policies face the same exogenous draw in each paired seed/encounter.
    let mut x = seed
        .wrapping_mul(0xd1342543de82ef95)
        .wrapping_add((encounter as u64).wrapping_mul(0x9e3779b97f4a7c15));
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    ((x ^ (x >> 31)) >> 11) as f64 / 9_007_199_254_740_992.0
}

fn run(seed: u64, scenario: &str, baseline: bool) -> Vec<f64> {
    let mut engine = Engine::new(config(seed)).expect("valid benchmark config");
    let allowed = vec!["choice_a".into(), "choice_b".into()];
    (0..ENCOUNTERS)
        .map(|encounter| {
            let context = if encounter % 2 == 0 {
                "context_a"
            } else {
                "context_b"
            };
            let reversal =
                scenario == "reversed" || (scenario == "counterplay_switch" && encounter >= 300);
            let preferred = if (context == "context_a") != reversal {
                "choice_a"
            } else {
                "choice_b"
            };
            let decision = engine
                .choose("agent", context, &allowed, baseline)
                .expect("valid decision");
            let probability = if decision.action == preferred {
                0.8
            } else {
                0.2
            };
            let won = environment_noise(seed, encounter) < probability;
            engine
                .feedback(decision.decision_id, if won { 1.0 } else { -1.0 }, true)
                .unwrap();
            engine.commit().unwrap();
            f64::from(won)
        })
        .collect()
}

fn mean(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len() as f64
}

fn main() {
    let seeds: usize = std::env::args()
        .nth(1)
        .map(|n| n.parse().expect("seed count must be an integer"))
        .unwrap_or(64);
    assert!((1..=1024).contains(&seeds), "seed count must be in 1..1024");
    let mut scenarios = Vec::new();
    for scenario in ["stationary", "reversed", "counterplay_switch"] {
        let trials: Vec<_> = (1..=seeds)
            .map(|seed| {
                (
                    run(seed as u64, scenario, false),
                    run(seed as u64, scenario, true),
                )
            })
            .collect();
        let windows = if scenario == "counterplay_switch" {
            vec![
                ("before_switch", 200..300),
                ("immediately_after_switch", 300..330),
                ("settled_after_switch", 500..600),
            ]
        } else {
            vec![("settled", 500..600)]
        };
        let windows: Vec<Value> = windows.into_iter().map(|(name, range)| {
            let adaptive: Vec<_> = trials.iter().map(|(a, _)| mean(&a[range.clone()])).collect();
            let baseline: Vec<_> = trials.iter().map(|(_, b)| mean(&b[range.clone()])).collect();
            let differences: Vec<_> = adaptive.iter().zip(&baseline).map(|(a, b)| a - b).collect();
            let improvement = mean(&differences);
            let sample_sd = if seeds > 1 { (differences.iter().map(|d| (d - improvement).powi(2)).sum::<f64>() / (seeds - 1) as f64).sqrt() } else { 0.0 };
            json!({"window": name, "start_inclusive": range.start, "end_exclusive": range.end,
                "adaptive_success_rate": mean(&adaptive), "baseline_success_rate": mean(&baseline),
                "paired_difference": improvement, "between_seed_difference_sd": sample_sd,
                "seeds_with_negative_difference": differences.iter().filter(|d| **d < 0.0).count(),
                "per_seed": (0..seeds).map(|i| json!({"seed": i + 1, "adaptive": adaptive[i], "baseline": baseline[i]})).collect::<Vec<_>>()})
        }).collect();
        scenarios.push(json!({"scenario": scenario, "windows": windows}));
    }
    println!("{}", serde_json::to_string_pretty(&json!({
        "schema": 1, "kind": "controlled-contextual-bandit-experiment", "seed_count": seeds,
        "encounters_per_policy": ENCOUNTERS, "config_example": config(1),
        "environment": "Two alternating contexts; preferred action succeeds with probability 0.8, other action 0.2. Reward is +1/-1. Counterplay reverses rewards at encounter 300. Learners receive only the observed reward.",
        "scope": "Paired synthetic stochastic rewards validate learning and counterplay response. This does not measure real combat, game enjoyment, performance, statistical confidence or multiplayer security.",
        "scenarios": scenarios
    })).unwrap());
}
