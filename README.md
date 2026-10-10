# Open Live Watch

An independently designed, open-source embedded dashboard and runtime inspection tool inspired by the workflows of Micrium µC/Probe.

**Status: research and implementation specification. The desktop application and firmware have not been implemented.** This repository contains original vector assets, example data, schemas, and an actionable handoff for a coding agent. Repository visibility is private at the owner's request; the original material is MIT licensed.

## Start here

1. Read [the research report](docs/01-research.md) and [feature matrix](docs/02-feature-matrix.md).
2. Follow [product requirements](docs/03-product-requirements.md), [architecture](docs/04-architecture.md), and [data contracts](docs/05-data-contracts.md).
3. Implement milestones in [the backlog](docs/09-backlog.md), using [the validation plan](docs/08-validation.md).
4. Use the original assets described in [the vector design system](docs/07-vector-assets.md).
5. Begin the next agent session with [the implementation prompt](docs/10-agent-handoff.md).

Additional references: [target firmware and protocol](docs/06-target-protocol.md), [sources and unresolved questions](docs/11-sources-and-gaps.md), and [local observation log](docs/12-observation-log.md).

Validation scope and limitations: [package verification](docs/13-package-verification.md).

## Deliverables

- Evidence-tagged analysis of Professional 4.8.2.0 and installed V4.8 manuals.
- MVP and later feature requirements with acceptance criteria.
- Windows-first, portable desktop architecture proposal.
- Versioned workspace schema, mock symbols, sample dashboard, and typed API contract.
- Original SVG icons, instruments, industrial symbols, and dashboard concept.
- Reproducible asset generator and repository validation script.

The original program's manuals, screenshots, executables, libraries, artwork, example projects, and firmware are not distributed here. Product names identify references and imply no affiliation. No binary disassembly or proprietary source extraction was performed. Legacy project/protocol compatibility is not claimed.

## Validate the specification package

Run `python tools/validate.py` from the repository root. Run `python tools/generate_assets.py` to regenerate the original vector assets. These scripts use only Python's standard library. View `assets/preview.html` in a browser for the asset gallery.

## License

Original repository content is licensed under [MIT](LICENSE). External dependencies and device definition files retain their respective licenses; audit them before incorporation. See [asset provenance](assets/PROVENANCE.md).
