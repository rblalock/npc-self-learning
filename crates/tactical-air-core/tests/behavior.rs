use serde_json::{json, Value};
use tactical_air_core::{Config, Engine, Role, Snapshot, MAX_DECISIONS_PER_ENCOUNTER, MAX_PENDING};

fn config(seed: u64) -> Config {
    Config {
        seed,
        roles: vec![Role {
            id: "agent".into(),
            actions: strings(&["alpha", "beta"]),
        }],
        contexts: strings(&["open", "cover"]),
        learning_rate: 0.22,
        exploration: 0.16,
        temperature: 0.3,
        decay: 0.025,
        max_update: 0.16,
    }
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|v| (*v).into()).collect()
}

fn score(engine: &Engine, context: &str, action: &str) -> (f64, u64, f64) {
    let cell = engine
        .inspect()
        .cells
        .into_iter()
        .find(|c| c.cell.context == context && c.cell.action == action)
        .unwrap();
    (cell.cell.score, cell.cell.samples, cell.probability)
}

fn train(engine: &mut Engine, context: &str, winner: &str, encounters: usize) -> f64 {
    let mut wins = 0;
    for _ in 0..encounters {
        let decision = engine
            .choose("agent", context, &strings(&["alpha", "beta"]), false)
            .unwrap();
        let won = decision.action == winner;
        wins += usize::from(won);
        engine
            .feedback(decision.decision_id, if won { 1.0 } else { -1.0 }, true)
            .unwrap();
        engine.commit().unwrap();
    }
    wins as f64 / encounters as f64
}

#[test]
fn rewards_and_reversed_rewards_drive_preferences_without_a_counter_table() {
    let mut first = Engine::new(config(42)).unwrap();
    let mut reversed = Engine::new(config(42)).unwrap();
    assert!(train(&mut first, "open", "alpha", 250) > 0.75);
    assert!(train(&mut reversed, "open", "beta", 250) > 0.75);
    assert!(score(&first, "open", "alpha").2 > 0.8);
    assert!(score(&reversed, "open", "beta").2 > 0.8);
    assert!(score(&first, "open", "beta").0 < 0.0);
    assert!(score(&reversed, "open", "alpha").0 < 0.0);
}

#[test]
fn an_established_preference_changes_when_counterplay_changes_outcomes() {
    let mut engine = Engine::new(config(3)).unwrap();
    train(&mut engine, "open", "alpha", 200);
    let before = score(&engine, "open", "alpha").2;
    assert!(before > 0.8);
    assert!(train(&mut engine, "open", "beta", 180) > 0.65);
    assert!(score(&engine, "open", "beta").2 > 0.8);
    assert!(score(&engine, "open", "alpha").2 < before - 0.5);
}

#[test]
fn contexts_learn_conflicting_rewards_independently() {
    let mut engine = Engine::new(config(19)).unwrap();
    for _ in 0..200 {
        train(&mut engine, "open", "alpha", 1);
        train(&mut engine, "cover", "beta", 1);
    }
    assert!(score(&engine, "open", "alpha").2 > 0.8);
    assert!(score(&engine, "cover", "beta").2 > 0.8);
}

#[test]
fn masks_always_win_over_learned_preferences_and_invalid_masks_do_not_advance_rng() {
    let mut engine = Engine::new(config(7)).unwrap();
    train(&mut engine, "open", "alpha", 150);
    for _ in 0..100 {
        let decision = engine
            .choose("agent", "open", &strings(&["beta"]), false)
            .unwrap();
        assert_eq!(decision.action, "beta");
        assert_eq!(decision.probabilities.len(), 1);
        assert_eq!(decision.probabilities[0].probability, 1.0);
        engine.feedback(decision.decision_id, 0.0, false).unwrap();
    }
    engine.commit().unwrap();
    let snapshot = engine.snapshot().unwrap();
    for mask in [vec![], strings(&["alpha", "alpha"]), strings(&["typo"])] {
        assert!(engine.choose("agent", "open", &mask, false).is_err());
        assert_eq!(engine.snapshot().unwrap(), snapshot);
    }
    assert!(engine
        .choose("unknown", "open", &strings(&["alpha"]), false)
        .is_err());
    assert!(engine
        .choose("agent", "unknown", &strings(&["alpha"]), false)
        .is_err());
    assert_eq!(engine.snapshot().unwrap(), snapshot);
}

#[test]
fn mask_input_order_cannot_change_seeded_choice() {
    let mut a = Engine::new(config(8)).unwrap();
    let mut b = Engine::new(config(8)).unwrap();
    for _ in 0..100 {
        let da = a
            .choose("agent", "open", &strings(&["alpha", "beta"]), false)
            .unwrap();
        let db = b
            .choose("agent", "open", &strings(&["beta", "alpha"]), false)
            .unwrap();
        assert_eq!(da, db);
    }
}

#[test]
fn baseline_and_unobserved_feedback_never_train_or_decay_memory() {
    let mut engine = Engine::new(config(11)).unwrap();
    train(&mut engine, "open", "alpha", 120);
    let cells = engine.inspect().cells;
    for baseline in [true, false] {
        for _ in 0..20 {
            let decision = engine
                .choose("agent", "open", &strings(&["alpha", "beta"]), baseline)
                .unwrap();
            if baseline {
                assert!(decision.probabilities.iter().all(|p| p.probability == 0.5));
            }
            assert!(!engine
                .feedback(decision.decision_id, -1.0, baseline)
                .unwrap());
        }
        assert_eq!(engine.inspect().queued, 0);
        engine.commit().unwrap();
        assert_eq!(engine.inspect().cells, cells);
    }
    engine.commit().unwrap();
    assert_eq!(engine.inspect().cells, cells);
}

#[test]
fn feedback_is_queued_consumed_once_and_cannot_cross_encounters() {
    let mut engine = Engine::new(config(42)).unwrap();
    let decision = engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    let unresolved = engine
        .choose("agent", "open", &strings(&["beta"]), false)
        .unwrap();
    assert!(engine.feedback(decision.decision_id, 0.7, true).unwrap());
    assert_eq!(engine.inspect().queued, 1);
    assert_eq!(score(&engine, "open", "alpha").0, 0.0);
    assert_eq!(score(&engine, "open", "alpha").1, 0);
    assert!(engine.feedback(decision.decision_id, 1.0, true).is_err());
    engine.commit().unwrap();
    assert_eq!(engine.inspect().pending, 0);
    assert_eq!(engine.inspect().queued, 0);
    assert_eq!(score(&engine, "open", "alpha").1, 1);
    assert!(score(&engine, "open", "alpha").0 > 0.0);
    assert!(engine.feedback(unresolved.decision_id, 1.0, true).is_err());
    assert!(engine.feedback(decision.decision_id, 1.0, true).is_err());
    let next = engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    assert!(next.decision_id > unresolved.decision_id);
}

#[test]
fn invalid_rewards_do_not_consume_valid_pending_feedback() {
    let mut engine = Engine::new(config(0)).unwrap();
    let decision = engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    for reward in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -1.0001, 1.0001] {
        assert!(engine.feedback(decision.decision_id, reward, true).is_err());
        assert_eq!(engine.inspect().pending, 1);
        assert_eq!(engine.inspect().queued, 0);
    }
    assert!(engine.feedback(decision.decision_id, -1.0, true).unwrap());
}

#[test]
fn encounters_aggregate_mean_rewards_and_do_not_amplify_update_by_sample_count() {
    let mut one = Engine::new(config(5)).unwrap();
    let mut many = Engine::new(config(5)).unwrap();
    let decision = one
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    one.feedback(decision.decision_id, 0.5, true).unwrap();
    one.commit().unwrap();
    for _ in 0..100 {
        for reward in [0.0, 1.0] {
            let decision = many
                .choose("agent", "open", &strings(&["alpha"]), false)
                .unwrap();
            many.feedback(decision.decision_id, reward, true).unwrap();
        }
    }
    many.commit().unwrap();
    assert_eq!(
        score(&one, "open", "alpha").0,
        score(&many, "open", "alpha").0
    );
    assert_eq!(score(&one, "open", "alpha").1, 1);
    assert_eq!(score(&many, "open", "alpha").1, 200);
}

#[test]
fn total_score_change_including_decay_is_bounded_per_commit() {
    let mut cfg = config(123);
    cfg.learning_rate = 1.0;
    cfg.decay = 0.9;
    cfg.max_update = 0.07;
    let mut engine = Engine::new(cfg.clone()).unwrap();
    for index in 0..300 {
        let before = engine.inspect();
        let decision = engine
            .choose(
                "agent",
                "open",
                &strings(&[if index % 2 == 0 { "alpha" } else { "beta" }]),
                false,
            )
            .unwrap();
        engine
            .feedback(
                decision.decision_id,
                if index % 3 == 0 { -1.0 } else { 1.0 },
                true,
            )
            .unwrap();
        let after = engine.commit().unwrap();
        for (old, new) in before.cells.iter().zip(&after.cells) {
            assert!((new.cell.score - old.cell.score).abs() <= cfg.max_update + 1e-12);
            assert!((-1.0..=1.0).contains(&new.cell.score));
        }
    }
}

#[test]
fn pending_and_per_encounter_work_have_hard_limits() {
    let mut engine = Engine::new(config(1)).unwrap();
    for _ in 0..MAX_PENDING {
        engine
            .choose("agent", "open", &strings(&["alpha"]), false)
            .unwrap();
    }
    assert!(engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .is_err());
    engine.commit().unwrap();
    for _ in 0..MAX_DECISIONS_PER_ENCOUNTER {
        let decision = engine
            .choose("agent", "open", &strings(&["alpha"]), false)
            .unwrap();
        engine.feedback(decision.decision_id, 1.0, true).unwrap();
    }
    assert_eq!(engine.inspect().queued, MAX_DECISIONS_PER_ENCOUNTER);
    assert!(engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .is_err());
    engine.commit().unwrap();
    assert_eq!(
        score(&engine, "open", "alpha").1,
        MAX_DECISIONS_PER_ENCOUNTER as u64
    );
    assert_eq!(
        score(&engine, "open", "alpha").0,
        engine.config().max_update
    );
    assert!(engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .is_ok());
}

#[test]
fn snapshots_require_a_clean_boundary_even_after_unobserved_feedback() {
    let mut engine = Engine::new(config(2)).unwrap();
    let original = engine.snapshot().unwrap();
    let decision = engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    assert!(engine.snapshot().is_err());
    assert!(engine.restore(original.clone()).is_err());
    engine.feedback(decision.decision_id, 0.0, false).unwrap();
    assert!(engine.snapshot().is_err());
    assert!(engine.restore(original).is_err());
    engine.commit().unwrap();
    assert!(engine.snapshot().is_ok());
}

#[test]
fn snapshot_json_roundtrip_reproduces_seeded_decisions_and_learning() {
    let cfg = config(9_007_199_254_740_990);
    let mut original = Engine::new(cfg.clone()).unwrap();
    train(&mut original, "open", "beta", 83);
    let serialized = serde_json::to_string(&original.snapshot().unwrap()).unwrap();
    let snapshot: Snapshot = serde_json::from_str(&serialized).unwrap();
    assert_eq!(snapshot.rng_state.len(), 16);
    let mut replay = Engine::new(cfg).unwrap();
    replay.restore(snapshot).unwrap();
    for index in 0..100 {
        let a = original
            .choose("agent", "open", &strings(&["alpha", "beta"]), false)
            .unwrap();
        let b = replay
            .choose("agent", "open", &strings(&["alpha", "beta"]), false)
            .unwrap();
        assert_eq!(a, b);
        let reward = if index % 3 == 0 { -0.75 } else { 0.5 };
        original.feedback(a.decision_id, reward, true).unwrap();
        replay.feedback(b.decision_id, reward, true).unwrap();
        assert_eq!(original.commit().unwrap(), replay.commit().unwrap());
    }
    assert_eq!(original.snapshot().unwrap(), replay.snapshot().unwrap());
}

#[test]
fn restoring_an_old_snapshot_never_reuses_live_instance_decision_ids() {
    let mut engine = Engine::new(config(0)).unwrap();
    let snapshot = engine.snapshot().unwrap();
    let stale = engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    engine.commit().unwrap();
    engine.restore(snapshot).unwrap();
    let fresh = engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    assert!(fresh.decision_id > stale.decision_id);
    assert!(engine.feedback(stale.decision_id, 1.0, true).is_err());
    assert_eq!(engine.inspect().pending, 1);
    assert!(engine.feedback(fresh.decision_id, 0.1, true).unwrap());
}

#[test]
fn hostile_snapshots_are_rejected_atomically() {
    let mut engine = Engine::new(config(17)).unwrap();
    train(&mut engine, "open", "alpha", 25);
    let valid = engine.snapshot().unwrap();
    let mut cases = Vec::new();
    let mut add = |mutate: fn(&mut Snapshot)| {
        let mut bad = valid.clone();
        mutate(&mut bad);
        cases.push(bad);
    };
    add(|s| s.version = 2);
    add(|s| s.config.exploration = -1.0);
    add(|s| s.config.seed += 1);
    add(|s| s.config.roles[0].actions[0] = "unknown".into());
    add(|s| s.encounter = u64::MAX);
    add(|s| s.encounter = 0);
    add(|s| s.next_decision_id = 0);
    add(|s| s.next_decision_id = 1);
    add(|s| s.next_decision_id = u64::MAX);
    add(|s| s.rng_state = "zzzzzzzzzzzzzzzz".into());
    add(|s| {
        s.cells.pop();
    });
    add(|s| s.cells.swap(0, 1));
    add(|s| s.cells[0].action = "unknown".into());
    add(|s| s.cells[0].score = f64::NAN);
    add(|s| s.cells[0].score = 1.00001);
    add(|s| s.cells[0].samples = u64::MAX);
    add(|s| {
        s.cells[2].samples = 0;
        s.cells[2].score = 0.1;
    });
    for bad in cases {
        assert!(engine.restore(bad).is_err());
        assert_eq!(engine.snapshot().unwrap(), valid);
    }
}

#[test]
fn config_validation_rejects_ambiguous_and_unbounded_inputs() {
    let mut cases = Vec::new();
    let mut add = |mutate: fn(&mut Config)| {
        let mut bad = config(1);
        mutate(&mut bad);
        cases.push(bad);
    };
    add(|c| c.seed = u64::MAX);
    add(|c| c.roles.clear());
    add(|c| c.contexts.clear());
    add(|c| c.contexts.push(c.contexts[0].clone()));
    add(|c| c.roles.push(c.roles[0].clone()));
    add(|c| c.roles[0].actions.push("alpha".into()));
    add(|c| c.roles[0].actions.clear());
    add(|c| c.roles[0].id = "x".repeat(65));
    add(|c| c.contexts[0] = "../../world".into());
    add(|c| c.learning_rate = 0.0);
    add(|c| c.temperature = 0.0);
    add(|c| c.exploration = f64::NAN);
    add(|c| c.decay = f64::INFINITY);
    add(|c| c.max_update = 0.0);
    for bad in cases {
        assert!(Engine::new(bad).is_err());
    }
}

#[test]
fn json_protocol_roundtrips_and_rejects_unknown_fields_without_mutation() {
    let mut engine = Engine::new(config(42)).unwrap();
    let initial: Value = serde_json::from_str(&engine.request(r#"{"op":"snapshot"}"#)).unwrap();
    for request in [
        r#"{"op":"choose","role":"agent","context":"open","allowed":["alpha"],"hacked":true}"#,
        r#"{"op":"feedback","decision_id":1,"reward":1e400,"observed":true}"#,
        r#"{"op":"inspect","extra":0}"#,
        "null",
        "{}",
        "{",
    ] {
        let response: Value = serde_json::from_str(&engine.request(request)).unwrap();
        assert_eq!(response["ok"], false, "{response}");
        let after: Value = serde_json::from_str(&engine.request(r#"{"op":"snapshot"}"#)).unwrap();
        assert_eq!(after, initial);
    }
    let choose: Value = serde_json::from_str(
        &engine.request(r#"{"op":"choose","role":"agent","context":"open","allowed":["alpha"]}"#),
    )
    .unwrap();
    assert_eq!(choose["ok"], true);
    let id = choose["data"]["decision_id"].as_u64().unwrap();
    let feedback: Value = serde_json::from_str(&engine.request(
        &json!({"op":"feedback","decision_id":id,"reward":0.75,"observed":true}).to_string(),
    ))
    .unwrap();
    assert_eq!(feedback["data"]["accepted"], true);
    let commit: Value = serde_json::from_str(&engine.request(r#"{"op":"commit"}"#)).unwrap();
    assert_eq!(commit["data"]["cells"][0]["samples"], 1);
    let snap: Value = serde_json::from_str(&engine.request(r#"{"op":"snapshot"}"#)).unwrap();
    let restore: Value = serde_json::from_str(
        &engine.request(&json!({"op":"restore","snapshot":snap["data"]}).to_string()),
    )
    .unwrap();
    assert_eq!(restore["data"], commit["data"]);
}

#[test]
fn probabilities_are_normalized_with_a_nonzero_exploration_floor() {
    let mut cfg = config(29);
    cfg.temperature = 0.01;
    cfg.roles[0].actions = (0..32).map(|n| format!("option_{n}")).collect();
    let actions = cfg.roles[0].actions.clone();
    let mut engine = Engine::new(cfg.clone()).unwrap();
    for _ in 0..20 {
        for action in &actions {
            let d = engine
                .choose("agent", "open", std::slice::from_ref(action), false)
                .unwrap();
            engine
                .feedback(
                    d.decision_id,
                    if action == "option_17" { 1.0 } else { -1.0 },
                    true,
                )
                .unwrap();
        }
        engine.commit().unwrap();
    }
    let decision = engine.choose("agent", "open", &actions, false).unwrap();
    let sum: f64 = decision.probabilities.iter().map(|p| p.probability).sum();
    assert!((sum - 1.0).abs() < 1e-12);
    assert!(decision
        .probabilities
        .iter()
        .all(|p| p.probability.is_finite() && p.probability >= cfg.exploration / 32.0));
}

#[test]
fn browser_snapshot_json_preserves_adversarial_score_bits_exactly() {
    // Actual arena scores that drifted by one ULP through the default JSON
    // parser. Exact persistence matters even when the next action is unchanged.
    for expected in [0.23907277890153822_f64, 0.07139542915444637_f64] {
        let mut original = Engine::new(config(42)).unwrap();
        let decision = original
            .choose("agent", "open", &strings(&["alpha"]), false)
            .unwrap();
        original.feedback(decision.decision_id, 1.0, true).unwrap();
        original.commit().unwrap();
        let mut fixture = original.snapshot().unwrap();
        fixture.cells[0].score = expected;
        original.restore(fixture).unwrap();

        let saved: Value = serde_json::from_str(&original.request(r#"{"op":"snapshot"}"#)).unwrap();
        assert_eq!(saved["ok"], true);
        let request = json!({"op": "restore", "snapshot": saved["data"]}).to_string();
        let mut restored = Engine::new(config(42)).unwrap();
        let response: Value = serde_json::from_str(&restored.request(&request)).unwrap();
        assert_eq!(response["ok"], true);
        assert_eq!(
            restored.snapshot().unwrap().cells[0].score.to_bits(),
            expected.to_bits(),
            "snapshot parse/stringify/restore must preserve every score bit"
        );
        assert_eq!(restored.inspect(), original.inspect());
    }
}

#[test]
fn explicit_aging_forgets_without_new_evidence_or_rng_changes() {
    let mut engine = Engine::new(config(42)).unwrap();
    train(&mut engine, "open", "alpha", 30);
    let before = engine.snapshot().unwrap();
    let after = engine.age(3).unwrap();
    assert_eq!(after.encounter, before.encounter);
    let saved = engine.snapshot().unwrap();
    assert_eq!(saved.rng_state, before.rng_state);
    assert_eq!(saved.next_decision_id, before.next_decision_id);
    for (old, new) in before.cells.iter().zip(&saved.cells) {
        assert_eq!(old.samples, new.samples);
        assert!(new.score.abs() <= old.score.abs());
        assert!((new.score - old.score * 0.975_f64.powi(3)).abs() < 1e-12);
    }
    let immutable = engine.snapshot().unwrap();
    assert!(engine.age(0).is_err());
    assert!(engine.age(101).is_err());
    assert_eq!(engine.snapshot().unwrap(), immutable);
    engine
        .choose("agent", "open", &strings(&["alpha"]), false)
        .unwrap();
    let before_pending = engine.inspect();
    assert!(engine.age(1).is_err());
    assert_eq!(engine.inspect(), before_pending);
}
