# AI Learning Canvas product requirements

This is the current, implementation-facing requirements index for Litter-ally. The [product specification](product-specification.md) remains the full source of product intent. Older Aegis plans and checkpoints record work as it was designed or implemented; they are not current product requirements.

Requirements below describe the target product. They do not claim that the current build already satisfies them. See [README: current boundary](../README.md#current-boundary) for implemented behavior and known deployment limits.

## Product requirements

| ID | Priority | Requirement | Acceptance evidence | Specification |
|---|---|---|---|---|
| PR-01 | P0 | A learner can start from a topic or supplied learning material and receive a coherent, progressive lesson tailored to their stated goal and background. | The tutor establishes a useful starting point, teaches concepts in a sensible sequence, and keeps the plan flexible as the learner responds. | §§3–4, 7–8 |
| PR-02 | P0 | Teaching happens primarily through a persistent, infinite whiteboard where the AI directly draws explanations, equations, diagrams, and annotations. | A lesson develops visual explanations on the shared canvas; drawings support understanding and are not replaced by slides, cards, or dashboard components as the main teaching method. | §§2, 5–6, 11 |
| PR-03 | P0 | The tutor manages lesson continuity, including natural questions, interruptions, digressions, and resuming the planned lesson. | An interruption stops obsolete speech and drawing, answers in context, preserves lesson state, and can return to the lesson without restarting it. | §§4, 8, 15 |
| PR-04 | P0 | Learners can ask questions about the lesson and existing canvas content, request a different explanation, and revisit earlier material. | The tutor uses the relevant canvas region and lesson context when answering, and reuses or extends existing work where appropriate. | §§3–5, 8 |
| PR-05 | P0 | The learner retains control of the shared canvas and their own work. | Learners can navigate and annotate; AI changes respect student-created content, and viewport focus does not repeatedly override learner navigation. | §§2, 5, 15 |
| PR-06 | P0 | Lessons and their whiteboard state can be saved and resumed. | Returning to a lesson restores its drawings and enough context to continue coherently. | §§4, 13, 15 |
| PR-07 | P0 | Voice supports natural teaching and interruption, with text interaction available when voice is unavailable. | Voice and drawing remain coordinated; obsolete audio stops on interruption; text still supports essential learning actions. | §§4, 9, 15–16 |
| PR-08 | P0 | Explanations grounded in supplied materials retain references to the original material and distinguish its claims from added background. | Learners can inspect relevant source locations where supported; the tutor does not invent citations or present uncertain extraction as fact. | §§3–4, 10, 15 |
| PR-09 | P0 | The tutor uses computation or executable interaction when it improves a lesson, and its results remain correct and synchronized with the explanation. | Demonstrations do not invent results or present decorative animation as a real experiment; simpler drawings remain available when reliable interaction is not. | §§2, 7, 15 |
| PR-10 | P0 | Lessons remain usable and recoverable through ordinary interruptions and failures. | Incomplete extraction, voice failure, unsupported actions, and interrupted drawing sequences are communicated or recovered without losing completed learner work. | §§13, 15–16 |
| PR-11 | P1 | The tutor maintains useful spatial and semantic references to previous canvas content. | References such as an earlier diagram or equation resolve to existing content when possible, allowing it to be revisited and extended. | §§5–6, 14 |
| PR-12 | P1 | Supplied material can include the formats and source types supported by the product, with bounded extraction and useful source locations. | Supported imports expose the relevant text, media, and locators; unsupported or uncertain extraction is visible to the learner. | §§3, 10, 16 |
| PR-13 | P1 | The tutor can use interactive drawings, practice, and review when they help learning. | Optional interactions and checks complement the lesson and do not displace teaching as the primary experience. | §§4, 7–8, 16 |
| PR-14 | P2 | Learners can export or share a useful representation of their persistent learning workspace as those capabilities are developed. | An export preserves the relevant drawings, relationships, positions, and lesson metadata, and identifies whether source files are included. | §§13, 16 |

P0–P2 priorities follow the [MVP implementation scope](product-specification.md#16-mvp-implementation-scope). This index condenses that scope; the full specification controls when detail matters.

## Product boundaries

- The product is an AI teacher and teaching canvas, not a generic chatbot, PDF summarizer, slide generator, research-management system, or quiz-first platform.
- Topic-based learning and learning from supplied material are both valid entry points. A source library or concept map may support teaching, but neither replaces the tutor and lesson canvas as the primary experience.
- Drawings are the default visual language. Interactive simulations, visual widgets, source maps, and practice are used when they help explain or reinforce a concept.
- The product should extend the existing LLM-driven drawing capability rather than create a competing component-generation architecture.
- Requirements here do not prescribe a particular model vendor, speech engine, or deployment topology unless the full specification explicitly requires it.

## Acceptance review

Assess acceptance against the product outcomes in [Product Success Criteria](product-specification.md#20-product-success-criteria). Keep implementation status and environment-specific verification in implementation documentation; do not mark a product requirement complete solely because a plan or build completed.
