//! A second, deliberately synthetic host. No arena, renderer, network or game engine.
use tactical_air_core::{Config, Engine, Role};
fn main() {
    let config = Config { seed: 19, roles: vec![Role { id: "guard".into(), actions: vec!["patrol".into(), "wait".into()] }], contexts: vec!["courtyard".into()], learning_rate: 0.22, exploration: 0.16, temperature: 0.3, decay: 0.025, max_update: 0.16 };
    let mut policy = Engine::new(config.clone()).unwrap();
    let allowed = vec!["patrol".into(), "wait".into()];
    for round in 0..80 {
        let decision = policy.choose("guard", "courtyard", &allowed, false).unwrap();
        // The HOST measures the outcome. This toy changes the successful action.
        // A real game would execute the action and measure legitimate observations.
        let successful_action = if round < 40 { "patrol" } else { "wait" };
        let reward = if decision.action == successful_action { 0.8 } else { -0.4 };
        policy.feedback(decision.decision_id, reward, true).unwrap();
        policy.commit().unwrap();
    }
    let snapshot = policy.snapshot().unwrap();
    let mut restored = Engine::new(config).unwrap();
    restored.restore(snapshot).unwrap();
    let next = policy.choose("guard", "courtyard", &allowed, false).unwrap();
    let replay = restored.choose("guard", "courtyard", &allowed, false).unwrap();
    assert_eq!(next.action, replay.action);
    assert_eq!(next.decision_id, replay.decision_id);
    println!("{}", serde_json::to_string_pretty(&restored.inspect()).unwrap());
}
