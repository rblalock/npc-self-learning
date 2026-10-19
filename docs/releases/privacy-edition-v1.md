# Public distribution — privacy edition 1

The downloads published on 19 October 2026 remove local account paths, archive ownership metadata, and internal editorial files. The library remains version 0.3.0. Each archive includes a `PRIVACY-EDITION.txt` notice; use its current checksum when verifying a download.

The transformation changes packaging and provenance hashes. It does not change the numerical observations, protocols, seeds, learned decisions, rewards, or reported statistical results. Archived Wasm instruction sections are byte-identical to the original build; only diagnostic path strings were replaced with same-length generic build paths. The native library also uses a portable runtime library name and a new local ad-hoc signature.

The [transformation record](../../publication/privacy-edition-v1.json) maps original content hashes to this edition's hashes. References between source snapshots, experiment records, replay pages, and packages were updated together. Original experiment dates refer to the measurements; the privacy-edition checks are recorded separately.

The [edition verification](privacy-edition-v1.validation.json) records clean installation, native-library loading, archive checksums, exact reconstruction of 69,120 change-detection fights and 259,584 conservative-development transitions, and byte-identical regeneration of the latest replay.

The included check rejects personal home paths, private working files, account ownership in archives, credential patterns, and personal commit emails:

```sh
npm run check:privacy
```

This is an automated publication check, not a guarantee that every possible secret can be detected. Reusable libraries, synthetic research data, and intentional public author attribution remain part of the distribution.
