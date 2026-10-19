//! A small contextual bandit, independent of any game or engine.
//!
//! Hosts supply contexts, legal action masks and observed rewards. Feedback is
//! accumulated until an explicit encounter commit. Nothing in this crate reads
//! game state or knows which action counters which opponent.
//!
//! JSON is an integration boundary, not a per-frame API. A snapshot is validated
//! data, not an authenticated save: an attacker with save-file access can forge
//! plausible learning history. Never use it as an authoritative multiplayer save.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

pub const VERSION: u32 = 1;
pub const MAX_CELLS: usize = 4096;
pub const MAX_PENDING: usize = 1024;
pub const MAX_DECISIONS_PER_ENCOUNTER: usize = 4096;
pub const MAX_REQUEST_BYTES: usize = 2 * 1024 * 1024;
/// Counters cross a JSON/JavaScript boundary without losing integer bits.
pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_ENCOUNTERS: u64 = 1_000_000_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub seed: u64,
    pub roles: Vec<Role>,
    pub contexts: Vec<String>,
    pub learning_rate: f64,
    pub exploration: f64,
    pub temperature: f64,
    pub decay: f64,
    pub max_update: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Role {
    pub id: String,
    pub actions: Vec<String>,
}

impl Config {
    pub fn validate(&self) -> Result<(), Error> {
        require(
            self.seed <= MAX_SAFE_INTEGER,
            "seed must be a JavaScript-safe nonnegative integer",
        )?;
        require((1..=32).contains(&self.roles.len()), "expected 1..32 roles")?;
        require(
            (1..=64).contains(&self.contexts.len()),
            "expected 1..64 contexts",
        )?;
        unique_identifiers(self.contexts.iter().map(String::as_str), "context")?;
        unique_identifiers(self.roles.iter().map(|r| r.id.as_str()), "role")?;
        let mut cells = 0;
        for role in &self.roles {
            require(
                (1..=32).contains(&role.actions.len()),
                "expected 1..32 actions per role",
            )?;
            unique_identifiers(role.actions.iter().map(String::as_str), "action")?;
            cells += role.actions.len() * self.contexts.len();
        }
        require(cells <= MAX_CELLS, "configuration exceeds 4096 cells")?;
        bounded(self.learning_rate, 0.0, 1.0, "learning_rate")?;
        require(self.learning_rate > 0.0, "learning_rate must be positive")?;
        bounded(self.exploration, 0.0, 1.0, "exploration")?;
        bounded(self.temperature, 0.01, 10.0, "temperature")?;
        bounded(self.decay, 0.0, 1.0, "decay")?;
        bounded(self.max_update, 0.0, 2.0, "max_update")?;
        require(self.max_update > 0.0, "max_update must be positive")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error(String);

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for Error {}

fn require(condition: bool, message: &str) -> Result<(), Error> {
    if condition {
        Ok(())
    } else {
        Err(Error(message.into()))
    }
}

fn bounded(value: f64, min: f64, max: f64, name: &str) -> Result<(), Error> {
    require(
        value.is_finite() && (min..=max).contains(&value),
        &format!("{name} must be finite and in [{min},{max}]"),
    )
}

fn unique_identifiers<'a>(values: impl Iterator<Item = &'a str>, kind: &str) -> Result<(), Error> {
    let mut seen = BTreeSet::new();
    for value in values {
        require(
            !value.is_empty()
                && value.len() <= 64
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'),
            &format!("{kind} identifiers must contain 1..64 ASCII letters, digits, '_' or '-'"),
        )?;
        require(seen.insert(value), &format!("duplicate {kind} identifier"))?;
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Cell {
    pub role: String,
    pub context: String,
    pub action: String,
    pub score: f64,
    pub samples: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub version: u32,
    pub config: Config,
    pub encounter: u64,
    pub next_decision_id: u64,
    /// Hex preserves RNG bits through JSON.parse/stringify in browser hosts.
    pub rng_state: String,
    pub cells: Vec<Cell>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ActionProbability {
    pub action: String,
    pub probability: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Decision {
    pub decision_id: u64,
    pub action: String,
    pub probabilities: Vec<ActionProbability>,
    pub baseline: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct InspectedCell {
    #[serde(flatten)]
    pub cell: Cell,
    pub probability: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Inspection {
    pub version: u32,
    pub encounter: u64,
    pub pending: usize,
    pub queued: usize,
    pub cells: Vec<InspectedCell>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
enum Request {
    Choose {
        role: String,
        context: String,
        allowed: Vec<String>,
        #[serde(default)]
        baseline: bool,
    },
    Feedback {
        decision_id: u64,
        reward: f64,
        observed: bool,
    },
    Commit {},
    Inspect {},
    Snapshot {},
    Restore {
        snapshot: Snapshot,
    },
    Age {
        steps: u32,
    },
}

#[derive(Debug, Clone)]
struct Pending {
    cell: usize,
    baseline: bool,
}

#[derive(Debug, Clone, Default)]
struct Evidence {
    sum: f64,
    count: usize,
}

#[derive(Debug, Clone)]
pub struct Engine {
    config: Config,
    cells: Vec<Cell>,
    // A group is contiguous and ordered exactly like the configuration.
    groups: BTreeMap<(String, String), std::ops::Range<usize>>,
    rng_state: u64,
    encounter: u64,
    next_decision_id: u64,
    issued: usize,
    pending: BTreeMap<u64, Pending>,
    evidence: Vec<Evidence>,
    queued: usize,
}

impl Engine {
    pub fn new(config: Config) -> Result<Self, Error> {
        config.validate()?;
        let mut cells = Vec::new();
        let mut groups = BTreeMap::new();
        for role in &config.roles {
            for context in &config.contexts {
                let start = cells.len();
                for action in &role.actions {
                    cells.push(Cell {
                        role: role.id.clone(),
                        context: context.clone(),
                        action: action.clone(),
                        score: 0.0,
                        samples: 0,
                    });
                }
                groups.insert((role.id.clone(), context.clone()), start..cells.len());
            }
        }
        let evidence = vec![Evidence::default(); cells.len()];
        Ok(Self {
            rng_state: config.seed,
            config,
            cells,
            groups,
            encounter: 0,
            next_decision_id: 1,
            issued: 0,
            pending: BTreeMap::new(),
            evidence,
            queued: 0,
        })
    }

    pub fn config(&self) -> &Config {
        &self.config
    }

    /// Every request returns one JSON envelope. Invalid requests do not mutate state.
    pub fn request(&mut self, request_json: &str) -> String {
        let result = if request_json.len() > MAX_REQUEST_BYTES {
            Err(Error("request exceeds 2 MiB".into()))
        } else {
            serde_json::from_str::<Request>(request_json)
                .map_err(|e| Error(format!("invalid request: {e}")))
                .and_then(|request| self.execute(request))
        };
        match result {
            Ok(data) => json!({"ok": true, "data": data}).to_string(),
            Err(error) => json!({"ok": false, "error": error.to_string()}).to_string(),
        }
    }

    fn execute(&mut self, request: Request) -> Result<Value, Error> {
        match request {
            Request::Choose {
                role,
                context,
                allowed,
                baseline,
            } => Ok(json!(self.choose(&role, &context, &allowed, baseline)?)),
            Request::Feedback {
                decision_id,
                reward,
                observed,
            } => Ok(json!({"accepted": self.feedback(decision_id, reward, observed)?})),
            Request::Commit {} => Ok(json!(self.commit()?)),
            Request::Inspect {} => Ok(json!(self.inspect())),
            Request::Snapshot {} => Ok(json!(self.snapshot()?)),
            Request::Restore { snapshot } => Ok(json!(self.restore(snapshot)?)),
            Request::Age { steps } => Ok(json!(self.age(steps)?)),
        }
    }

    pub fn choose(
        &mut self,
        role: &str,
        context: &str,
        allowed: &[String],
        baseline: bool,
    ) -> Result<Decision, Error> {
        require(
            self.encounter < MAX_ENCOUNTERS,
            "encounter counter exhausted",
        )?;
        require(
            self.pending.len() < MAX_PENDING,
            "pending decision limit reached",
        )?;
        require(
            self.issued < MAX_DECISIONS_PER_ENCOUNTER,
            "encounter decision limit reached; commit required",
        )?;
        require(
            self.next_decision_id < MAX_SAFE_INTEGER,
            "decision counter exhausted",
        )?;
        let range = self
            .groups
            .get(&(role.to_owned(), context.to_owned()))
            .ok_or_else(|| Error("unknown role or context".into()))?
            .clone();
        require(
            !allowed.is_empty() && allowed.len() <= range.len(),
            "allowed mask must be a nonempty subset of the role's actions",
        )?;
        unique_identifiers(allowed.iter().map(String::as_str), "allowed action")?;
        let allowed: BTreeSet<&str> = allowed.iter().map(String::as_str).collect();
        let indices: Vec<usize> = range
            .filter(|i| allowed.contains(self.cells[*i].action.as_str()))
            .collect();
        require(
            indices.len() == allowed.len(),
            "allowed mask contains an unknown action",
        )?;
        let probabilities = self.probabilities(&indices, baseline);
        let draw = self.random_unit();
        let mut cumulative = 0.0;
        let mut selected = *indices.last().expect("nonempty validated mask");
        for (index, probability) in indices.iter().zip(&probabilities) {
            cumulative += probability;
            if draw < cumulative {
                selected = *index;
                break;
            }
        }
        let decision_id = self.next_decision_id;
        self.next_decision_id += 1;
        self.issued += 1;
        self.pending.insert(
            decision_id,
            Pending {
                cell: selected,
                baseline,
            },
        );
        Ok(Decision {
            decision_id,
            action: self.cells[selected].action.clone(),
            baseline,
            probabilities: indices
                .iter()
                .zip(probabilities)
                .map(|(i, probability)| ActionProbability {
                    action: self.cells[*i].action.clone(),
                    probability,
                })
                .collect(),
        })
    }

    /// Returns true only for observed adaptive evidence. All valid feedback is consumed once.
    pub fn feedback(
        &mut self,
        decision_id: u64,
        reward: f64,
        observed: bool,
    ) -> Result<bool, Error> {
        bounded(reward, -1.0, 1.0, "reward")?;
        let pending = self
            .pending
            .remove(&decision_id)
            .ok_or_else(|| Error("unknown, stale or already consumed decision".into()))?;
        if pending.baseline || !observed {
            return Ok(false);
        }
        let evidence = &mut self.evidence[pending.cell];
        evidence.sum += reward;
        evidence.count += 1;
        self.queued += 1;
        Ok(true)
    }

    /// Commit once per encounter. No observed adaptive evidence means frozen policy.
    /// With evidence, every score decays; observed cells also approach their mean reward.
    /// The *combined* change, including decay, is bounded by max_update.
    pub fn commit(&mut self) -> Result<Inspection, Error> {
        require(
            self.encounter < MAX_ENCOUNTERS,
            "encounter counter exhausted",
        )?;
        if self.queued > 0 {
            for (cell, evidence) in self.cells.iter_mut().zip(&self.evidence) {
                let decayed = cell.score * (1.0 - self.config.decay);
                let candidate = if evidence.count > 0 {
                    let mean = evidence.sum / evidence.count as f64;
                    decayed + self.config.learning_rate * (mean - decayed)
                } else {
                    decayed
                };
                let change =
                    (candidate - cell.score).clamp(-self.config.max_update, self.config.max_update);
                cell.score = (cell.score + change).clamp(-1.0, 1.0);
                cell.samples += evidence.count as u64;
            }
        }
        self.encounter += 1;
        self.pending.clear();
        self.evidence.fill(Evidence::default());
        self.queued = 0;
        self.issued = 0;
        Ok(self.inspect())
    }

    /// Explicit host-driven forgetting at a clean boundary; never fabricates samples.
    pub fn age(&mut self, steps: u32) -> Result<Inspection, Error> {
        require(
            self.clean_boundary(),
            "age requires a clean encounter boundary",
        )?;
        require((1..=100).contains(&steps), "age steps must be in 1..100")?;
        for _ in 0..steps {
            for cell in &mut self.cells {
                let change = (-cell.score * self.config.decay)
                    .clamp(-self.config.max_update, self.config.max_update);
                cell.score += change;
            }
        }
        Ok(self.inspect())
    }

    pub fn inspect(&self) -> Inspection {
        let mut probabilities = vec![0.0; self.cells.len()];
        for range in self.groups.values() {
            let indices: Vec<_> = range.clone().collect();
            for (index, probability) in indices.iter().zip(self.probabilities(&indices, false)) {
                probabilities[*index] = probability;
            }
        }
        Inspection {
            version: VERSION,
            encounter: self.encounter,
            pending: self.pending.len(),
            queued: self.queued,
            cells: self
                .cells
                .iter()
                .cloned()
                .zip(probabilities)
                .map(|(cell, probability)| InspectedCell { cell, probability })
                .collect(),
        }
    }

    pub fn snapshot(&self) -> Result<Snapshot, Error> {
        require(
            self.clean_boundary(),
            "snapshot requires a clean encounter boundary; commit first",
        )?;
        Ok(Snapshot {
            version: VERSION,
            config: self.config.clone(),
            encounter: self.encounter,
            next_decision_id: self.next_decision_id,
            rng_state: format!("{:016x}", self.rng_state),
            cells: self.cells.clone(),
        })
    }

    /// Restore atomically. The current instance's decision-ID high-water mark never
    /// rewinds, so old asynchronous feedback cannot attach to a newly issued decision.
    /// A fresh engine with matching config reproduces the snapshot's IDs and RNG.
    pub fn restore(&mut self, snapshot: Snapshot) -> Result<Inspection, Error> {
        require(
            self.clean_boundary(),
            "restore requires a clean encounter boundary; commit first",
        )?;
        require(snapshot.version == VERSION, "unsupported snapshot version")?;
        snapshot.config.validate()?;
        require(
            snapshot.config == self.config,
            "snapshot configuration does not match engine",
        )?;
        require(
            snapshot.encounter <= MAX_ENCOUNTERS,
            "snapshot encounter counter out of bounds",
        )?;
        require(
            (1..=MAX_SAFE_INTEGER).contains(&snapshot.next_decision_id),
            "snapshot decision counter out of bounds",
        )?;
        require(
            snapshot.rng_state.len() == 16
                && snapshot
                    .rng_state
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
            "snapshot RNG state must be 16 lowercase hexadecimal digits",
        )?;
        let rng_state = u64::from_str_radix(&snapshot.rng_state, 16)
            .map_err(|_| Error("invalid snapshot RNG state".into()))?;
        require(
            snapshot.cells.len() == self.cells.len(),
            "snapshot cell count mismatch",
        )?;
        let mut total_samples: u64 = 0;
        for (cell, expected) in snapshot.cells.iter().zip(&self.cells) {
            require(
                cell.role == expected.role
                    && cell.context == expected.context
                    && cell.action == expected.action,
                "snapshot cells must match configured identities and ordering",
            )?;
            bounded(cell.score, -1.0, 1.0, "snapshot score")?;
            require(
                cell.samples <= MAX_SAFE_INTEGER,
                "snapshot sample counter out of bounds",
            )?;
            require(
                cell.samples > 0 || cell.score == 0.0,
                "unobserved snapshot cell must have zero score",
            )?;
            total_samples = total_samples
                .checked_add(cell.samples)
                .ok_or_else(|| Error("snapshot sample total overflow".into()))?;
        }
        require(
            total_samples < snapshot.next_decision_id,
            "snapshot samples exceed issued decisions",
        )?;
        require(
            total_samples <= snapshot.encounter * MAX_DECISIONS_PER_ENCOUNTER as u64,
            "snapshot samples exceed encounter evidence bound",
        )?;
        // All potentially failing validation precedes mutation.
        self.cells = snapshot.cells;
        self.rng_state = rng_state;
        self.encounter = snapshot.encounter;
        self.next_decision_id = self.next_decision_id.max(snapshot.next_decision_id);
        Ok(self.inspect())
    }

    fn clean_boundary(&self) -> bool {
        self.issued == 0 && self.pending.is_empty() && self.queued == 0
    }

    fn probabilities(&self, indices: &[usize], baseline: bool) -> Vec<f64> {
        let uniform = 1.0 / indices.len() as f64;
        if baseline {
            return vec![uniform; indices.len()];
        }
        let max = indices
            .iter()
            .map(|i| self.cells[*i].score)
            .fold(f64::NEG_INFINITY, f64::max);
        let weights: Vec<_> = indices
            .iter()
            .map(|i| ((self.cells[*i].score - max) / self.config.temperature).exp())
            .collect();
        let total: f64 = weights.iter().sum();
        weights
            .into_iter()
            .map(|w| {
                (1.0 - self.config.exploration) * w / total + self.config.exploration * uniform
            })
            .collect()
    }

    fn random_unit(&mut self) -> f64 {
        // SplitMix64; deterministic, not cryptographic. All seeds, including zero,
        // are valid. Taking 53 bits produces a value strictly below 1.
        self.rng_state = self.rng_state.wrapping_add(0x9e3779b97f4a7c15);
        let mut z = self.rng_state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d049bb133111eb);
        z ^= z >> 31;
        ((z >> 11) as f64) * (1.0 / 9_007_199_254_740_992.0)
    }
}
