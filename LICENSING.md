# Brali licensing guide

This document explains the intended licensing boundaries for contributors, researchers, developers, and potential commercial partners. It is an operational guide, not a replacement for the repository's legal license text and not legal advice.

## Current legal state

The root `LICENSE` is currently the authoritative license for original material in this repository: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0).

In practical terms, the current public license allows non-commercial sharing and adaptation when its attribution and share-alike conditions are followed. Commercial use requires separate written permission.

The Brali and Brali LifeOS names, logos, visual identity, and other brand identifiers are not licensed for reuse by the content license. Third-party material remains subject to its own terms.

## Data and editorial content

The Growth Library, protocol feeds, taxonomy, evidence metadata, editorial material, APIs, and other original knowledge assets are currently covered by the root license unless a file contains a more specific notice.

For downstream use, preserve at least:

- attribution to **Dzmitryi Kharlanau** as creator and **Brali** as the project identity where attribution is required;
- the canonical Brali URL or record identifier;
- the applicable license notice;
- evidence status and review metadata where supplied;
- an indication when the material has been changed or translated.

Compact form: `Brali — Dzmitryi Kharlanau — <canonical Brali URL>`. Research and dataset users should use `CITATION.cff` and pin a versioned release when reproducibility matters. See `ATTRIBUTION.md` for operational attribution guidance.

Do not remove uncertainty metadata in a way that makes a `pending-review` or `restricted` record appear reviewed.

## Software and build scripts

This repository also contains software such as build, validation, publishing, and MCP scripts. Creative Commons itself recommends software-specific licenses rather than CC licenses for software.

No licensing split is made by this guide alone. Until an explicit file-level or directory-level software license is added, the root repository license remains the operative notice for original repository material.

A future legal cleanup should consider a clear split such as:

- a software-specific license for reusable site/build code;
- a content/data license for the Growth Library and machine-readable datasets;
- separate trademark terms for Brali branding;
- separate commercial agreements for paid use.

That future split should be reviewed before it is made effective, because changing public licensing has legal and ecosystem consequences.

## Commercial use

The public license is intentionally not a blanket commercial grant. Separate permission or a commercial agreement is required for uses such as:

- embedding Brali datasets in a paid product or subscription;
- commercial RAG, recommendation, assistant, or agent products that use Brali material;
- commercial model-training use of Brali material;
- paid redistribution or licensing of Brali collections;
- white-label or embedded Brali knowledge experiences;
- hosted API or MCP access sold as part of a commercial service.

A commercial agreement can define scope, permitted datasets, update rights, attribution, redistribution, service levels, branding rights, and fees without changing the public non-commercial license for everyone else.

See the public partnership overview at `https://brali-lifeos.github.io/partners/`.

## Research and non-commercial use

Research, education, prototypes, personal projects, and other non-commercial uses can use the public material under the conditions of the root license. When publishing results or derivative datasets, keep provenance and evidence metadata whenever reasonably possible and use the preferred citation identity where appropriate.

## AI and agent use

The same licensing boundary applies to AI use. The fact that data is machine-readable or accessible through API/MCP does not create an additional license grant.

For non-commercial agent and research use, the preferred interface is the versioned API or Trusted Protocol Feed plus evidence metadata. Agent outputs should preserve canonical Brali identity/URL, evidence state, and `Brali — Dzmitryi Kharlanau` attribution when the interface permits citations or source labels.

Technical integration guidance is published at `https://brali-lifeos.github.io/for-ai/` and `https://brali-lifeos.github.io/for-ai/quickstart/`.

## Future licensing decision to review

The current ShareAlike requirement protects openness of adaptations but can also add integration friction for mixed datasets and downstream products. Before a larger partner or developer ecosystem is launched, review whether the data layer should remain CC BY-NC-SA 4.0 or move prospectively to a simpler non-commercial data/content license such as CC BY-NC 4.0.

This is a product and legal trade-off, not a formatting change. Do not silently change the root license as part of routine content work.
