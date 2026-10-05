# Vendored shapes

Published SHACL shapes, copied verbatim from the projects that
maintain them, which Solid Memo validates its data against **in
addition to** its own shapes, which are on their own pod,
https://pod.solid-memo.com/shapes/ (see `docs/validation.md`). These
are published with the site at `/vendor/`, so the app can fetch them at
runtime, the same way it fetches its shapes from their pod.

These files are not ours: never edit or reformat them. To update one,
replace it with the upstream file byte for byte, then update its entry
in `manifest.json` (source, commit and sha256). A test checks every
file against the manifest.

| Profile | Files | Upstream | Licence |
|---|---|---|---|
| DCAT-AP 3.0.1 | `dcat-ap/3.0.1/dcat-ap-SHACL.ttl` | [SEMICeu/DCAT-AP](https://github.com/SEMICeu/DCAT-AP), `releases/3.0.1/shacl/` | CC BY 4.0 (`dcat-ap/LICENSE`), © European Union, SEMIC |
| SKOS | `skohub/skos.shacl.ttl`, `skohub/skos.bestPractice.shacl.ttl` | [skohub-io/skohub-shapes](https://github.com/skohub-io/skohub-shapes) | Apache-2.0 (`skohub/LICENSE`) |

The SkoHub shapes include SPARQL-based constraints. The browser's
SHACL engine (rdf-validate-shacl) supports SHACL Core only, so Solid
Memo drops those constraints when it loads the files. The CI
cross-check (`scripts/shacl_crosscheck.py`, pySHACL) runs them in full.
