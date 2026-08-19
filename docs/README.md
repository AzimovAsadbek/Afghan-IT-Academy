# Documentation

| Area                                               | Contents                                               |
| -------------------------------------------------- | ------------------------------------------------------ |
| [product/](product/)                               | What the platform is, who it serves, the learning loop |
| [architecture/](architecture/)                     | System shape, module boundaries, decision records      |
| [architecture/decisions/](architecture/decisions/) | ADRs — one file per real architectural decision        |
| [database/](database/)                             | Schema strategy, migrations, planned domain tables     |
| [api/](api/)                                       | Conventions, error contract, versioning                |
| [security/](security/)                             | Baseline controls, threat notes, review checklist      |
| [infrastructure/](infrastructure/)                 | Local setup, containers, CI, deployment                |
| [ux/](ux/)                                         | Multilingual and RTL design rules, accessibility       |
| [roadmap/](roadmap/)                               | Milestones and their definitions of done               |
| business/, ai/, mobile/                            | Reserved; populated when that work begins              |

## Writing rules

- A document exists because someone needs it, not to fill a folder.
- Record _why_, not _what_. The code already says what.
- An ADR is written when a decision is expensive to reverse. Not for library picks.
